-- Telegram booking bot: where a booking came from, what the AI heard, where
-- to notify the guest; the bot's dialogue state; webhook de-duplication; and
-- a content-free log of AI calls (model, latency, tokens - never the text).

-- ---------------------------------------------------------------------
-- reservations
-- ---------------------------------------------------------------------
alter table public.reservations
  add column if not exists source text not null default 'web',
  add column if not exists ai_transcript text,
  add column if not exists telegram_chat_id bigint,
  add column if not exists confirmation_notified_at timestamptz,
  add column if not exists reminder_sent_at timestamptz;

alter table public.reservations drop constraint if exists reservations_source_check;
alter table public.reservations
  add constraint reservations_source_check check (source in ('web', 'staff', 'telegram_ai'));

alter table public.reservations drop constraint if exists reservations_ai_transcript_check;
alter table public.reservations
  add constraint reservations_ai_transcript_check check (ai_transcript is null or char_length(ai_transcript) <= 2000);

-- Existing rows: entered by staff when created_by is set, otherwise the
-- public booking form.
update public.reservations set source = 'staff' where created_by is not null and source = 'web';

-- New rows: a booking created with created_by set is a staff booking even
-- when the caller didn't say so - one rule in the database instead of in
-- every route.
create or replace function public.reservations_default_source()
returns trigger
language plpgsql
as $$
begin
  if new.created_by is not null and new.source = 'web' then
    new.source := 'staff';
  end if;
  return new;
end;
$$;

drop trigger if exists reservations_default_source on public.reservations;
create trigger reservations_default_source
  before insert on public.reservations
  for each row execute function public.reservations_default_source();

-- The reminder job's only query: confirmed Telegram bookings not yet
-- reminded, by start.
create index if not exists reservations_reminder_due_idx
  on public.reservations (date, start_time)
  where status = 'confirmed' and telegram_chat_id is not null and reminder_sent_at is null;

-- ---------------------------------------------------------------------
-- Dialogue state, one row per private chat. Route handlers are stateless;
-- a session older than 30 minutes is treated as reset (lib/telegram/session.ts).
-- ---------------------------------------------------------------------
create table if not exists public.telegram_sessions (
  chat_id bigint primary key,
  state text not null default 'idle'
    check (state in ('idle', 'awaiting_consent', 'clarifying', 'awaiting_confirm', 'awaiting_contact', 'choosing_time')),
  draft jsonb not null default '{}'::jsonb,
  clarify_rounds integer not null default 0,
  lang text not null default 'kk' check (lang in ('kk', 'ru')),
  consent_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.telegram_sessions enable row level security;
revoke all on table public.telegram_sessions from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Webhook de-duplication: Telegram re-delivers an update until it gets a
-- 200, so each update_id is claimed once.
-- ---------------------------------------------------------------------
create table if not exists public.telegram_updates (
  update_id bigint primary key,
  received_at timestamptz not null default now()
);

create index if not exists telegram_updates_received_at_idx on public.telegram_updates (received_at);

alter table public.telegram_updates enable row level security;
revoke all on table public.telegram_updates from public, anon, authenticated;

-- True the first time an update_id is seen, false on any re-delivery.
-- Prunes ids older than two days on the way.
create or replace function public.telegram_claim_update(p_update_id bigint)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_claimed boolean;
begin
  insert into public.telegram_updates (update_id) values (p_update_id)
  on conflict (update_id) do nothing;
  v_claimed := found;
  delete from public.telegram_updates where received_at < now() - interval '2 days';
  return v_claimed;
end;
$$;

revoke execute on function public.telegram_claim_update(bigint) from public, anon, authenticated;
grant execute on function public.telegram_claim_update(bigint) to service_role;

-- ---------------------------------------------------------------------
-- One row per AI call - the real numbers for cost and quality, never the
-- message, transcript or any guest data.
-- ---------------------------------------------------------------------
create table if not exists public.ai_requests (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  kind text not null check (kind in ('stt', 'extract')),
  model text not null,
  prompt_version text,
  ok boolean not null,
  error_code text,
  latency_ms integer not null,
  audio_seconds numeric,
  tokens_in integer,
  tokens_out integer,
  reservation_id bigint references public.reservations (id) on delete set null
);

create index if not exists ai_requests_at_idx on public.ai_requests (at desc);

alter table public.ai_requests enable row level security;
revoke all on table public.ai_requests from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Guest data erasure (20261029120300) also clears what the bot stored:
-- the transcript, the chat id, and that chat's dialogue session.
-- ---------------------------------------------------------------------
create or replace function public.erase_guest_data(p_contact text)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_contact text := btrim(coalesce(p_contact, ''));
  v_email text;
  v_phone text;
  v_count integer;
  v_chat_ids bigint[];
begin
  if v_contact = '' then
    return 0;
  end if;

  if position('@' in v_contact) > 0 then
    v_email := lower(v_contact);
  else
    v_phone := public.normalize_phone(v_contact);
    if v_phone is null or char_length(v_phone) <> 11 then
      return 0;
    end if;
  end if;

  with erased as (
    update public.reservations r
    set guest_name = 'Удалено по запросу гостя',
        guest_phone = null,
        guest_email = null,
        guest_user_id = null,
        ai_transcript = null,
        telegram_chat_id = null,
        anonymized_at = now()
    from public.reservations old
    where old.id = r.id
      and r.anonymized_at is null
      and (
        (v_email is not null and lower(btrim(r.guest_email)) = v_email)
        or (v_phone is not null and public.normalize_phone(r.guest_phone) = v_phone)
      )
      and (
        r.status in ('completed', 'cancelled', 'no-show')
        or r.date + r.start_time + make_interval(mins => r.duration_minutes) < (now() at time zone 'utc')
      )
    returning old.telegram_chat_id
  )
  select count(*)::integer, array_agg(distinct telegram_chat_id) filter (where telegram_chat_id is not null)
  into v_count, v_chat_ids
  from erased;

  if v_chat_ids is not null then
    delete from public.telegram_sessions where chat_id = any (v_chat_ids);
  end if;

  return v_count;
end;
$$;

revoke execute on function public.erase_guest_data(text) from public, anon, authenticated;
grant execute on function public.erase_guest_data(text) to service_role;
