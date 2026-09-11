-- Redesign: Hall -> Table -> Reservation, replacing the rigid pre-generated
-- Slot model with free-form date+start_time+duration on the reservation
-- itself, so hostess staff can move a reservation to any table/time and get
-- a real DB-enforced conflict check (not just "does this slot exist").
--
-- Also adds: multiple tables per reservation (combining, for large parties),
-- a manual status override per table (out of service / walk-in occupied),
-- and a 'completed' reservation status.

create extension if not exists "btree_gist";

-- ---------------------------------------------------------------------
-- Drop the slot-based model this replaces
-- ---------------------------------------------------------------------
drop table if exists public.booking_status_logs cascade;
drop table if exists public.bookings cascade;
drop table if exists public.slots cascade;
drop table if exists public.restaurant_tables cascade;

-- ---------------------------------------------------------------------
-- Halls
-- ---------------------------------------------------------------------
create table public.halls (
  id bigint generated always as identity primary key,
  name text not null unique check (char_length(name) between 1 and 120),
  description text check (description is null or char_length(description) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger halls_set_updated_at
  before update on public.halls
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Dining tables
-- ---------------------------------------------------------------------
create table public.dining_tables (
  id bigint generated always as identity primary key,
  hall_id bigint not null references public.halls (id) on delete restrict,
  label text not null check (char_length(label) between 1 and 40),
  shape text not null default 'rectangle' check (shape in ('rectangle', 'round', 'square')),
  min_capacity integer not null check (min_capacity > 0),
  max_capacity integer not null check (max_capacity >= min_capacity),
  pos_x double precision not null default 40,
  pos_y double precision not null default 40,
  is_active boolean not null default true,
  -- Staff-set override for walk-ins / maintenance. Absent (null) means the
  -- table's displayed status is computed from its active reservations.
  manual_status text check (manual_status is null or manual_status in ('occupied', 'out_of_service')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hall_id, label)
);

create index dining_tables_hall_id_idx on public.dining_tables (hall_id);

create trigger dining_tables_set_updated_at
  before update on public.dining_tables
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Reservations
-- ---------------------------------------------------------------------
create table public.reservations (
  id bigint generated always as identity primary key,
  date date not null,
  start_time time not null,
  duration_minutes integer not null default 90 check (duration_minutes > 0),
  guest_user_id uuid references auth.users (id) on delete set null,
  guest_name text not null check (char_length(guest_name) between 1 and 120),
  guest_phone text check (guest_phone is null or char_length(guest_phone) <= 30),
  guest_email text check (guest_email is null or char_length(guest_email) <= 255),
  party_size integer not null check (party_size between 1 and 100),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'cancelled', 'no-show', 'completed')),
  -- Set when a staff member creates/edits this reservation directly (phone,
  -- walk-in). Null for guest self-service bookings.
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guest_contact_required check (coalesce(nullif(btrim(guest_phone), ''), nullif(btrim(guest_email), '')) is not null)
);

create index reservations_date_idx on public.reservations (date);
create index reservations_guest_user_id_idx on public.reservations (guest_user_id);

create trigger reservations_set_updated_at
  before update on public.reservations
  for each row execute function public.set_updated_at();

-- Every reservation must be created as 'pending' (staff confirms it via a
-- separate PATCH) and can't be dated in the past. Same defense-in-depth
-- principle as the old slot model's insert trigger: this fires for every
-- role, including a direct PostgREST call that bypasses the Next.js API.
create or replace function public.validate_reservation_insert()
returns trigger
language plpgsql
as $$
begin
  if new.status <> 'pending' then
    raise exception 'new reservations must start as pending';
  end if;
  if (new.date + new.start_time) < (now() at time zone 'utc') then
    raise exception 'cannot book a reservation in the past';
  end if;
  return new;
end;
$$;

create trigger reservations_validate_insert
  before insert on public.reservations
  for each row execute function public.validate_reservation_insert();

-- ---------------------------------------------------------------------
-- Reservation <-> Table (many-to-many: table combining for large parties)
-- ---------------------------------------------------------------------
create table public.reservation_tables (
  id bigint generated always as identity primary key,
  reservation_id bigint not null references public.reservations (id) on delete cascade,
  table_id bigint not null references public.dining_tables (id) on delete restrict,
  -- Denormalized from the parent reservation (kept in sync by the trigger
  -- below) so a real EXCLUDE constraint can enforce "no two active
  -- reservations overlap on the same table" atomically - a check-then-insert
  -- trigger would have the same TOCTOU race the old slot-based unique index
  -- was specifically built to avoid.
  status text not null,
  time_range tstzrange not null,
  unique (reservation_id, table_id)
);

create index reservation_tables_reservation_id_idx on public.reservation_tables (reservation_id);
create index reservation_tables_table_id_idx on public.reservation_tables (table_id);

alter table public.reservation_tables
  add constraint no_overlapping_active_reservations
  exclude using gist (
    table_id with =,
    time_range with &&
  )
  where (status in ('pending', 'confirmed'));

-- Keeps reservation_tables.status/time_range in sync whenever the parent
-- reservation's timing or status changes (e.g. a PATCH moves it to a new
-- time, or cancels it) - without this, the exclusion constraint above would
-- be checking stale data.
create or replace function public.sync_reservation_tables()
returns trigger
language plpgsql
as $$
begin
  update public.reservation_tables
  set status = new.status,
      time_range = tstzrange(
        (new.date + new.start_time) at time zone 'utc',
        (new.date + new.start_time + make_interval(mins => new.duration_minutes)) at time zone 'utc'
      )
  where reservation_id = new.id;
  return new;
end;
$$;

create trigger reservations_sync_tables
  after update of status, date, start_time, duration_minutes on public.reservations
  for each row execute function public.sync_reservation_tables();

-- party_size must fit within the combined capacity of whatever tables are
-- assigned - checked after each row is added, using every table assigned so
-- far in the same transaction (the API inserts all reservation_tables rows
-- for a reservation before that transaction commits).
create or replace function public.validate_reservation_table_capacity()
returns trigger
language plpgsql
as $$
declare
  v_party_size integer;
  v_total_capacity integer;
begin
  select party_size into v_party_size from public.reservations where id = new.reservation_id;

  select coalesce(sum(dt.max_capacity), 0) into v_total_capacity
  from public.reservation_tables rt
  join public.dining_tables dt on dt.id = rt.table_id
  where rt.reservation_id = new.reservation_id;

  if v_total_capacity < v_party_size then
    raise exception 'party_size % exceeds combined table capacity %', v_party_size, v_total_capacity;
  end if;
  return new;
end;
$$;

create trigger reservation_tables_validate_capacity
  after insert on public.reservation_tables
  for each row execute function public.validate_reservation_table_capacity();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.halls enable row level security;
alter table public.dining_tables enable row level security;
alter table public.reservations enable row level security;
alter table public.reservation_tables enable row level security;

-- Floor plan / table data isn't sensitive - readable by anyone (including
-- anon), so the guest can browse availability before logging in.
create policy "halls are publicly readable"
  on public.halls for select
  using (true);

create policy "dining_tables are publicly readable"
  on public.dining_tables for select
  using (true);

create policy "staff manage halls"
  on public.halls for all
  using (public.is_staff())
  with check (public.is_staff());

create policy "staff manage dining_tables"
  on public.dining_tables for all
  using (public.is_staff())
  with check (public.is_staff());

create policy "guests can view their own reservations"
  on public.reservations for select
  using (auth.uid() = guest_user_id);

create policy "staff can view all reservations"
  on public.reservations for select
  using (public.is_staff());

create policy "guests can create their own reservations"
  on public.reservations for insert
  with check (auth.uid() = guest_user_id and status = 'pending');

create policy "staff can create reservations"
  on public.reservations for insert
  with check (public.is_staff());

create policy "staff can update reservations"
  on public.reservations for update
  using (public.is_staff())
  with check (public.is_staff());

create policy "guests can view their own reservation_tables"
  on public.reservation_tables for select
  using (
    exists (
      select 1 from public.reservations r
      where r.id = reservation_id and r.guest_user_id = auth.uid()
    )
  );

create policy "staff manage reservation_tables"
  on public.reservation_tables for all
  using (public.is_staff())
  with check (public.is_staff());
