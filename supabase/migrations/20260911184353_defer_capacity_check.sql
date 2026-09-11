-- Bug found by testing: the AFTER INSERT capacity trigger on
-- reservation_tables fired immediately after EACH row of a multi-table
-- combine, so combining table A (cap 4) + table B (cap 4) for party_size=6
-- failed right after inserting A alone (4 < 6) - it never got to see the
-- combined total (8) before raising. A DEFERRABLE INITIALLY DEFERRED
-- constraint trigger fixes this: it still fires exactly once per row, but
-- execution is postponed to the end of the transaction, by which point every
-- row create_reservation()/update_reservation() are inserting is present.

drop trigger if exists reservation_tables_validate_capacity on public.reservation_tables;

create constraint trigger reservation_tables_validate_capacity
  after insert on public.reservation_tables
  deferrable initially deferred
  for each row execute function public.validate_reservation_table_capacity();

-- Explicit check at the end of the function body too (belt-and-braces, and
-- gives an immediate error inside the RPC call rather than waiting for
-- commit-time deferred-trigger failure, which supabase-js still surfaces
-- correctly but with a less immediately obvious stack).
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

  perform public.check_reservation_capacity(v_reservation_id);

  return v_reservation_id;
end;
$$;
