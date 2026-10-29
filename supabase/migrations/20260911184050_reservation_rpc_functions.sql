-- RPC functions so "create/edit a reservation with its table assignment" is
-- one atomic transaction, not several separate supabase-js calls that could
-- partially fail (reservation updated, table diff half-applied). Also adds
-- capacity re-validation on a bare party_size change, so the invariant
-- holds even for a direct PostgREST call that bypasses these RPCs - the
-- earlier RLS INSERT-policy gap in this project is exactly the kind of bug
-- this defense-in-depth is meant to catch.

create or replace function public.check_reservation_capacity(p_reservation_id bigint)
returns void
language plpgsql
as $$
declare
  v_party_size integer;
  v_total_capacity integer;
begin
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

create or replace function public.validate_reservation_table_capacity()
returns trigger
language plpgsql
as $$
begin
  perform public.check_reservation_capacity(new.reservation_id);
  return new;
end;
$$;

create or replace function public.recheck_capacity_on_party_size_change()
returns trigger
language plpgsql
as $$
begin
  perform public.check_reservation_capacity(new.id);
  return new;
end;
$$;

drop trigger if exists reservations_recheck_capacity on public.reservations;
create trigger reservations_recheck_capacity
  after update of party_size on public.reservations
  for each row execute function public.recheck_capacity_on_party_size_change();

-- ---------------------------------------------------------------------
-- create_reservation: insert the reservation + its table assignment(s) in
-- one transaction. Used by both the guest self-service flow (single table)
-- and staff-created phone/walk-in bookings (possibly combined tables).
-- ---------------------------------------------------------------------
create or replace function public.create_reservation(
  p_date date,
  p_start_time time,
  p_duration_minutes integer,
  p_guest_user_id uuid,
  p_guest_name text,
  p_guest_phone text,
  p_guest_email text,
  p_party_size integer,
  p_created_by uuid,
  p_table_ids bigint[]
)
returns bigint
language plpgsql
as $$
declare
  v_reservation_id bigint;
  v_table_id bigint;
  v_time_range tstzrange;
begin
  if array_length(p_table_ids, 1) is null or array_length(p_table_ids, 1) = 0 then
    raise exception 'at least one table must be assigned';
  end if;

  insert into public.reservations (
    date, start_time, duration_minutes, guest_user_id, guest_name, guest_phone,
    guest_email, party_size, status, created_by
  ) values (
    p_date, p_start_time, p_duration_minutes, p_guest_user_id, p_guest_name, p_guest_phone,
    p_guest_email, p_party_size, 'pending', p_created_by
  )
  returning id into v_reservation_id;

  v_time_range := tstzrange(
    (p_date + p_start_time) at time zone 'utc',
    (p_date + p_start_time + make_interval(mins => p_duration_minutes)) at time zone 'utc'
  );

  foreach v_table_id in array p_table_ids loop
    insert into public.reservation_tables (reservation_id, table_id, status, time_range)
    values (v_reservation_id, v_table_id, 'pending', v_time_range);
  end loop;

  return v_reservation_id;
end;
$$;

-- ---------------------------------------------------------------------
-- update_reservation: general-purpose edit - any subset of fields (pass
-- null to leave unchanged), plus an optional full table reassignment.
-- Capacity is re-checked at the end regardless of what changed.
-- ---------------------------------------------------------------------
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
  p_table_ids bigint[] default null -- null = leave table assignment unchanged
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
    guest_phone = coalesce(p_guest_phone, guest_phone),
    guest_email = coalesce(p_guest_email, guest_email),
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
