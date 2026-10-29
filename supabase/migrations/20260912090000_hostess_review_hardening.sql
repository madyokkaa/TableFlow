-- Hardening pass from the pre-push self-review of the hostess admin panel:
-- closes the remaining defense-in-depth gaps the reviewer found (status
-- transitions and shrinking a table's capacity had no DB-level backstop,
-- capacity wasn't rechecked on a direct reservation_tables delete, the two
-- RPCs were callable by anon/authenticated even though nothing should call
-- them except the service-role API, and the unused guest reservations INSERT
-- policy let an authenticated guest flood the dashboard with orphan
-- (table-less) reservations).

-- ---------------------------------------------------------------------
-- 1. Status transitions: BEFORE UPDATE trigger mirrors
--    lib/reservations.ts's ALLOWED_STATUS_TRANSITIONS, so a direct PostgREST
--    PATCH (or two racing API PATCHes) can't force an illegal transition -
--    same principle as every other invariant in this schema.
-- ---------------------------------------------------------------------
create or replace function public.validate_reservation_status_transition()
returns trigger
language plpgsql
as $$
begin
  if new.status = old.status then
    return new;
  end if;
  if old.status = 'pending' and new.status in ('confirmed', 'cancelled') then
    return new;
  end if;
  if old.status = 'confirmed' and new.status in ('cancelled', 'no-show', 'completed') then
    return new;
  end if;
  raise exception 'cannot move a reservation from % to %', old.status, new.status;
end;
$$;

drop trigger if exists reservations_validate_status_transition on public.reservations;
create trigger reservations_validate_status_transition
  before update of status on public.reservations
  for each row execute function public.validate_reservation_status_transition();

-- ---------------------------------------------------------------------
-- 2. check_reservation_capacity: lock the reservation row first so two
--    concurrent edits of the same reservation (e.g. one dropping a table,
--    another raising party_size) can't both read a pre-edit snapshot and
--    both pass.
-- ---------------------------------------------------------------------
create or replace function public.check_reservation_capacity(p_reservation_id bigint)
returns void
language plpgsql
as $$
declare
  v_party_size integer;
  v_total_capacity integer;
begin
  perform 1 from public.reservations where id = p_reservation_id for update;

  select party_size into v_party_size from public.reservations where id = p_reservation_id;

  select coalesce(sum(dt.max_capacity), 0) into v_total_capacity
  from public.reservation_tables rt
  join public.dining_tables dt on dt.id = rt.table_id
  where rt.reservation_id = p_reservation_id;

  if v_total_capacity < v_party_size then
    raise exception 'party_size % exceeds combined table capacity %', v_party_size, v_total_capacity;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Shrinking a table's max_capacity below what an active reservation
--    already relies on must be caught too - not just growing party_size.
-- ---------------------------------------------------------------------
create or replace function public.recheck_capacity_on_table_capacity_change()
returns trigger
language plpgsql
as $$
declare
  v_reservation_id bigint;
begin
  for v_reservation_id in
    select rt.reservation_id
    from public.reservation_tables rt
    where rt.table_id = new.id and rt.status in ('pending', 'confirmed')
  loop
    perform public.check_reservation_capacity(v_reservation_id);
  end loop;
  return new;
end;
$$;

drop trigger if exists dining_tables_recheck_capacity on public.dining_tables;
create constraint trigger dining_tables_recheck_capacity
  after update of max_capacity on public.dining_tables
  deferrable initially deferred
  for each row execute function public.recheck_capacity_on_table_capacity_change();

-- ---------------------------------------------------------------------
-- 4. Removing a table from a reservation (directly, not via update_reservation)
--    can also break the capacity invariant - or leave a reservation with zero
--    tables, which check_reservation_capacity already rejects since
--    sum(max_capacity) over zero rows is 0.
-- ---------------------------------------------------------------------
create or replace function public.recheck_capacity_on_table_removal()
returns trigger
language plpgsql
as $$
begin
  perform public.check_reservation_capacity(old.reservation_id);
  return old;
end;
$$;

drop trigger if exists reservation_tables_recheck_on_delete on public.reservation_tables;
create constraint trigger reservation_tables_recheck_on_delete
  after delete on public.reservation_tables
  deferrable initially deferred
  for each row execute function public.recheck_capacity_on_table_removal();

-- ---------------------------------------------------------------------
-- 5. update_reservation: distinguish "field omitted" from "field explicitly
--    cleared" for guest_phone/guest_email. The old signature used NULL for
--    both, so a hostess clearing a guest's phone number silently kept the
--    old value (coalesce(null, guest_phone) = guest_phone). Drop + recreate
--    (not just CREATE OR REPLACE) because adding parameters changes the
--    signature - replacing in place would leave the old 10-arg overload
--    around and make supabase.rpc() calls ambiguous.
-- ---------------------------------------------------------------------
drop function if exists public.update_reservation(bigint, date, time, integer, integer, text, text, text, text, bigint[]);

create or replace function public.update_reservation(
  p_reservation_id bigint,
  p_date date default null,
  p_start_time time default null,
  p_duration_minutes integer default null,
  p_party_size integer default null,
  p_guest_name text default null,
  p_guest_phone text default null,
  p_guest_email text default null,
  p_status text default null,
  p_table_ids bigint[] default null, -- null = leave table assignment unchanged
  p_guest_phone_provided boolean default false,
  p_guest_email_provided boolean default false
)
returns void
language plpgsql
as $$
declare
  v_table_id bigint;
  v_date date;
  v_start_time time;
  v_duration_minutes integer;
  v_status text;
begin
  update public.reservations set
    date = coalesce(p_date, date),
    start_time = coalesce(p_start_time, start_time),
    duration_minutes = coalesce(p_duration_minutes, duration_minutes),
    party_size = coalesce(p_party_size, party_size),
    guest_name = coalesce(p_guest_name, guest_name),
    guest_phone = case when p_guest_phone_provided then p_guest_phone else guest_phone end,
    guest_email = case when p_guest_email_provided then p_guest_email else guest_email end,
    status = coalesce(p_status, status)
  where id = p_reservation_id
  returning date, start_time, duration_minutes, status
  into v_date, v_start_time, v_duration_minutes, v_status;

  if not found then
    raise exception 'reservation % not found', p_reservation_id;
  end if;

  if p_table_ids is not null then
    if array_length(p_table_ids, 1) is null or array_length(p_table_ids, 1) = 0 then
      raise exception 'at least one table must be assigned';
    end if;

    delete from public.reservation_tables
    where reservation_id = p_reservation_id
      and table_id <> all (p_table_ids);

    foreach v_table_id in array p_table_ids loop
      insert into public.reservation_tables (reservation_id, table_id, status, time_range)
      values (
        p_reservation_id, v_table_id, v_status,
        tstzrange(
          (v_date + v_start_time) at time zone 'utc',
          (v_date + v_start_time + make_interval(mins => v_duration_minutes)) at time zone 'utc'
        )
      )
      on conflict (reservation_id, table_id) do nothing;
    end loop;
  end if;

  perform public.check_reservation_capacity(p_reservation_id);
end;
$$;

-- ---------------------------------------------------------------------
-- 6. Neither RPC should ever be called by anything but the service-role API
--    routes. SECURITY INVOKER + RLS already blocks the damage from a direct
--    call today, but that safety depends entirely on the RLS policies never
--    changing - revoke the capability outright so it isn't load-bearing.
-- ---------------------------------------------------------------------
revoke execute on function public.create_reservation(
  date, time, integer, uuid, text, text, text, integer, uuid, bigint[]
) from public, anon, authenticated;

revoke execute on function public.update_reservation(
  bigint, date, time, integer, integer, text, text, text, text, bigint[], boolean, boolean
) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. The guest self-service booking flow always goes through
--    POST /api/reservations (service-role, bypasses RLS entirely). This
--    policy was never exercised by the app and let an authenticated guest
--    INSERT arbitrary table-less reservations directly via PostgREST -
--    reservation_tables has no guest INSERT policy, so nothing ever attached
--    a table to them; they'd just pile up as orphans on the hostess
--    dashboard.
-- ---------------------------------------------------------------------
drop policy if exists "guests can create their own reservations" on public.reservations;

-- ---------------------------------------------------------------------
-- 8. Cap how long a reservation can run - nothing bounded this before, so a
--    duration far in the future could park a table out of rotation
--    indefinitely (the EXCLUDE constraint then blocks every future booking
--    of that table).
-- ---------------------------------------------------------------------
alter table public.reservations drop constraint if exists reservations_duration_minutes_check;
alter table public.reservations
  add constraint reservations_duration_minutes_check check (duration_minutes > 0 and duration_minutes <= 480);
