-- Guest-requested erasure of personal data (POST /api/privacy/erase).
-- Bookings are anonymised, not deleted: the restaurant keeps its
-- statistics (dates, party sizes, statuses), the guest's name and contacts
-- are gone.

-- ---------------------------------------------------------------------
-- An anonymised booking has neither phone nor email, which the original
-- "at least one contact" rule forbids. Keep the rule for every other row
-- and mark the anonymised ones explicitly.
-- ---------------------------------------------------------------------
alter table public.reservations
  add column if not exists anonymized_at timestamptz;

alter table public.reservations drop constraint if exists guest_contact_required;
alter table public.reservations
  add constraint guest_contact_required check (
    coalesce(nullif(btrim(guest_phone), ''), nullif(btrim(guest_email), '')) is not null
    or anonymized_at is not null
  );

-- ---------------------------------------------------------------------
-- Phone normalisation, the same digits rule as formatPhoneInput in
-- lib/phone.ts: keep digits, a leading 8 becomes 7, anything not starting
-- with 7 gets a 7 in front, at most 11 digits. So "+7 (900) 000-00-00",
-- "8 900 000 00 00" and "9000000000" all compare equal.
-- ---------------------------------------------------------------------
create or replace function public.normalize_phone(p_phone text)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when d = '' then null
    else left(
      case
        when d like '8%' then '7' || substr(d, 2)
        when d like '7%' then d
        else '7' || d
      end,
      11
    )
  end
  from (select regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') as d) digits;
$$;

-- ---------------------------------------------------------------------
-- Anonymises the bookings made with this phone or email - only the ones
-- that are already over: closed (completed / cancelled / no-show), or
-- whose time has passed (same UTC wall-clock convention as
-- complete_expired_reservations). A future pending/confirmed booking is
-- left alone: an anonymous request mustn't be able to wipe someone's
-- upcoming table; the guest cancels it first the usual way.
-- Returns how many rows were anonymised; already-anonymised rows don't
-- match again, so a repeated request returns 0.
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
begin
  if v_contact = '' then
    return 0;
  end if;

  if position('@' in v_contact) > 0 then
    v_email := lower(v_contact);
  else
    v_phone := public.normalize_phone(v_contact);
    -- A partial number would match nothing meaningful - require a full one.
    if v_phone is null or char_length(v_phone) <> 11 then
      return 0;
    end if;
  end if;

  update public.reservations r
  set guest_name = 'Удалено по запросу гостя',
      guest_phone = null,
      guest_email = null,
      guest_user_id = null,
      anonymized_at = now()
  where r.anonymized_at is null
    and (
      (v_email is not null and lower(btrim(r.guest_email)) = v_email)
      or (v_phone is not null and public.normalize_phone(r.guest_phone) = v_phone)
    )
    and (
      r.status in ('completed', 'cancelled', 'no-show')
      or r.date + r.start_time + make_interval(mins => r.duration_minutes) < (now() at time zone 'utc')
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.erase_guest_data(text) from public, anon, authenticated;
grant execute on function public.erase_guest_data(text) to service_role;
