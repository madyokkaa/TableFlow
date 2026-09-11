-- Security-review fixes (both the background pr-review-toolkit agent and an
-- automated commit security-review flagged the same core issue):
--
-- The original "guests can create their own bookings" INSERT policy only
-- checked auth.uid() = guest_user_id. It did NOT check status, party_size
-- vs. table capacity, or the slot being in the past - all of that lived
-- only in app/api/bookings/route.ts. Since the anon key is public
-- (NEXT_PUBLIC_*), any signed-in guest could POST straight to PostgREST
-- and bypass the API entirely: self-confirm a booking, or book any party
-- size regardless of capacity. Verified against the live project before
-- this fix (both bypasses succeeded).
--
-- Fix: enforce the real invariants in the database itself (a BEFORE INSERT
-- trigger, since a CHECK constraint can't join to slots/restaurant_tables),
-- and tighten the RLS policy to also require status = 'pending' as a second,
-- independent layer.

-- The empty-string contact info gap: guest_phone = '' / guest_email = ''
-- satisfied "is not null" while carrying no real contact info.
alter table public.bookings drop constraint if exists guest_contact_required;
alter table public.bookings add constraint guest_contact_required
  check (coalesce(nullif(btrim(guest_phone), ''), nullif(btrim(guest_email), '')) is not null);

-- Slot date/time is treated as UTC for this comparison (same as the app
-- layer's toISOString()-based checks) - there is no per-restaurant timezone
-- concept in this schema. A known simplification, not a full timezone
-- feature, since none was in scope.
create or replace function public.validate_booking_insert()
returns trigger
language plpgsql
as $$
declare
  v_capacity integer;
  v_slot_date date;
  v_slot_start time;
begin
  if new.status <> 'pending' then
    raise exception 'new bookings must start as pending';
  end if;

  select rt.capacity, s.date, s.start_time
    into v_capacity, v_slot_date, v_slot_start
  from public.slots s
  join public.restaurant_tables rt on rt.id = s.table_id
  where s.id = new.slot_id;

  if v_capacity is null then
    raise exception 'slot % not found', new.slot_id;
  end if;

  if new.party_size > v_capacity then
    raise exception 'party_size % exceeds table capacity %', new.party_size, v_capacity;
  end if;

  if (v_slot_date + v_slot_start) < (now() at time zone 'utc') then
    raise exception 'cannot book a slot in the past';
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_validate_insert on public.bookings;
create trigger bookings_validate_insert
  before insert on public.bookings
  for each row execute function public.validate_booking_insert();

-- Belt-and-braces alongside the trigger: a direct insert can no longer set
-- an initial status other than 'pending' even if the trigger were ever
-- removed by mistake.
drop policy if exists "guests can create their own bookings" on public.bookings;
create policy "guests can create their own bookings"
  on public.bookings for insert
  with check (auth.uid() = guest_user_id and status = 'pending');
