-- TableFlow core schema: restaurant_tables -> slots -> bookings, plus
-- booking_status_logs (audit trail) and staff (hostess role marker).
-- Double-booking protection is a DB-level partial unique index, not just
-- application logic - see uq_active_booking_per_slot below.

create extension if not exists "pgcrypto";

-- Drop tables from the abandoned Flask/SQLAlchemy backend this project
-- pivoted away from (same project, reused). No-ops on a clean database,
-- so this migration is still reproducible via `supabase db push` there.
-- Order matters: this must run before the CREATE TABLEs below, since
-- "slots"/"bookings"/"booking_status_logs" reuse those names.
drop table if exists public.booking_status_logs cascade;
drop table if exists public.bookings cascade;
drop table if exists public.slots cascade;
drop table if exists public.tables cascade;
drop table if exists public.alembic_version cascade;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

create table public.restaurant_tables (
  id bigint generated always as identity primary key,
  number integer not null unique,
  capacity integer not null check (capacity > 0),
  zone text not null
);

create table public.slots (
  id bigint generated always as identity primary key,
  table_id bigint not null references public.restaurant_tables (id) on delete cascade,
  date date not null,
  start_time time not null,
  duration_minutes integer not null default 90 check (duration_minutes > 0),
  unique (table_id, date, start_time)
);

create index slots_date_idx on public.slots (date);

-- Marks which auth.users accounts are hostess staff (invite-only, no public
-- signup route creates rows here - see the seed/invite script).
create table public.staff (
  user_id uuid primary key references auth.users (id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.bookings (
  id bigint generated always as identity primary key,
  slot_id bigint not null references public.slots (id) on delete cascade,
  guest_user_id uuid not null references auth.users (id) on delete cascade,
  guest_name text not null check (char_length(guest_name) between 1 and 120),
  guest_phone text check (guest_phone is null or char_length(guest_phone) <= 30),
  guest_email text check (guest_email is null or char_length(guest_email) <= 255),
  party_size integer not null check (party_size between 1 and 100),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'cancelled', 'no-show')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guest_contact_required check (guest_phone is not null or guest_email is not null)
);

create index bookings_slot_id_idx on public.bookings (slot_id);
create index bookings_guest_user_id_idx on public.bookings (guest_user_id);

-- The double-booking guard: only one pending/confirmed booking may exist
-- per slot at a time. Cancelled/no-show bookings don't count, so a
-- cancellation frees the slot for someone else. A single INSERT is already
-- atomic in Postgres, so this index alone is enough for the concurrency
-- test - no explicit transaction needed in application code.
create unique index uq_active_booking_per_slot
  on public.bookings (slot_id)
  where status in ('pending', 'confirmed');

create table public.booking_status_logs (
  id bigint generated always as identity primary key,
  booking_id bigint not null references public.bookings (id) on delete cascade,
  from_status text check (from_status is null or from_status in ('pending', 'confirmed', 'cancelled', 'no-show')),
  to_status text not null check (to_status in ('pending', 'confirmed', 'cancelled', 'no-show')),
  changed_by uuid references auth.users (id),
  changed_at timestamptz not null default now()
);

create index booking_status_logs_booking_id_idx on public.booking_status_logs (booking_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------

alter table public.restaurant_tables enable row level security;
alter table public.slots enable row level security;
alter table public.staff enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_status_logs enable row level security;

-- SECURITY DEFINER so this can read public.staff regardless of the
-- caller's own row-level access, without granting them staff table
-- access directly.
create or replace function public.is_staff()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.staff s
    where s.user_id = auth.uid() and s.active
  );
$$;

-- Menu/availability data isn't sensitive - readable by anyone (including
-- anon), so the guest can browse before logging in.
create policy "restaurant_tables are publicly readable"
  on public.restaurant_tables for select
  using (true);

create policy "slots are publicly readable"
  on public.slots for select
  using (true);

-- Writes to restaurant_tables/slots go through the service-role seed
-- script only - no policy grants insert/update/delete here on purpose.

create policy "staff can view their own staff row"
  on public.staff for select
  using (auth.uid() = user_id);

create policy "guests can view their own bookings"
  on public.bookings for select
  using (auth.uid() = guest_user_id);

create policy "staff can view all bookings"
  on public.bookings for select
  using (public.is_staff());

create policy "guests can create their own bookings"
  on public.bookings for insert
  with check (auth.uid() = guest_user_id);

create policy "staff can update booking status"
  on public.bookings for update
  using (public.is_staff())
  with check (public.is_staff());

create policy "guests can view status logs for their own bookings"
  on public.booking_status_logs for select
  using (
    exists (
      select 1 from public.bookings b
      where b.id = booking_id and b.guest_user_id = auth.uid()
    )
  );

create policy "staff can view all status logs"
  on public.booking_status_logs for select
  using (public.is_staff());
