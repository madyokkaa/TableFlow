-- Append-only journal of who changed what (see lib/audit.ts). It replaces
-- nothing - booking_status_logs was dropped in 20260911183730 and there has
-- been no history of staff actions since.
--
-- Holds identifiers and the names of the fields that changed, never guest
-- names, phones or emails. actor_user_id deliberately has no foreign key:
-- "on delete set null" would be an UPDATE, which this table refuses, and
-- the id alone is not personal data once the account is gone.

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_user_id uuid null,
  actor_role text not null check (actor_role in ('staff', 'guest', 'system')),
  action text not null check (char_length(action) between 1 and 80),
  entity text not null check (char_length(entity) between 1 and 40),
  entity_id text null check (entity_id is null or char_length(entity_id) <= 80),
  details jsonb not null default '{}'::jsonb
);

create index if not exists audit_log_at_idx on public.audit_log (at desc);
create index if not exists audit_log_entity_idx on public.audit_log (entity, entity_id);

-- Service-role only: RLS on with no policies, and no table grants for the
-- client roles either.
alter table public.audit_log enable row level security;
revoke all on table public.audit_log from public, anon, authenticated;

-- Immutable: no row is ever edited or removed, by any role (service_role
-- included). Statement-level for TRUNCATE, row-level for the rest.
create or replace function public.audit_log_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log is append-only: % is not allowed', tg_op;
end;
$$;

drop trigger if exists audit_log_no_update_delete on public.audit_log;
create trigger audit_log_no_update_delete
  before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();

drop trigger if exists audit_log_no_truncate on public.audit_log;
create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.audit_log_immutable();
