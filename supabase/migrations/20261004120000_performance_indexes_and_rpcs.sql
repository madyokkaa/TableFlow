-- Performance: indexes for the filters the app actually uses, and a few
-- server-side functions that replace multi-round-trip work in the API with
-- one call. No behaviour change - each function does exactly what the
-- TypeScript it replaces did.

-- ---------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------

-- The bookings list filters reservations by day and sorts by start time.
create index if not exists reservations_date_start_time_idx
  on public.reservations (date, start_time);
-- Superseded by the composite index above (same leading column).
drop index if exists public.reservations_date_idx;

-- Closing past bookings and the availability check only ever look at the
-- still-active ones.
create index if not exists reservations_active_date_idx
  on public.reservations (date)
  where status in ('pending', 'confirmed');

-- "Which tables are taken right now" is a point-in-time lookup over the
-- active ranges; the EXCLUDE constraint's index leads with table_id, so it
-- can't serve a lookup by time alone.
create index if not exists reservation_tables_active_range_idx
  on public.reservation_tables using gist (time_range)
  where status in ('pending', 'confirmed');

-- ---------------------------------------------------------------------
-- Tables with an active booking covering this instant
-- (replaces reading every active reservation_tables row into the API).
-- ---------------------------------------------------------------------
create or replace function public.tables_reserved_now()
returns setof bigint
language sql
stable
set search_path = public
as $$
  select distinct table_id
  from public.reservation_tables
  where status in ('pending', 'confirmed')
    and time_range @> now();
$$;

revoke execute on function public.tables_reserved_now() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Close out bookings whose time has fully passed, in one statement
-- (replaces select + up to two updates from lib/reservationCleanup.ts).
-- confirmed -> completed, pending -> cancelled, exactly as before. The end
-- time uses the same UTC wall-clock convention as reservation_tables
-- .time_range (date + start_time read as UTC).
-- ---------------------------------------------------------------------
create or replace function public.complete_expired_reservations()
returns void
language sql
set search_path = public
as $$
  update public.reservations
  set status = case status when 'confirmed' then 'completed' else 'cancelled' end
  where status in ('pending', 'confirmed')
    and date <= (now() at time zone 'utc')::date
    and date + start_time + make_interval(mins => duration_minutes) < (now() at time zone 'utc');
$$;

revoke execute on function public.complete_expired_reservations() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- Staff list with emails in one query (replaces one auth lookup per row).
-- Same security-definer pattern as find_auth_user_id_by_email.
-- ---------------------------------------------------------------------
create or replace function public.list_staff_with_email()
returns table (user_id uuid, email text, active boolean, created_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select s.user_id, u.email::text, s.active, s.created_at
  from public.staff s
  left join auth.users u on u.id = s.user_id
  order by s.created_at;
$$;

revoke execute on function public.list_staff_with_email() from public, anon, authenticated;
