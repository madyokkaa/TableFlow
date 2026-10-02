-- Real-scale floor plans.
--
-- Until now a table's pos_x/pos_y were the top-left corner of its button in
-- raw editor pixels, and its size was a fixed per-shape pixel box - so the
-- same room looked different at every window width and nothing on the plan
-- had a real size. This migration moves every floor plan onto one shared
-- coordinate system:
--
--   * a hall has a real width and length in metres;
--   * positions (tables and the new hall objects) are the CENTRE of the
--     object, in logical plan units where 80 units = 1 metre
--     (40 units = one 50 cm grid cell, 20 units = the 25 cm snap step);
--   * a hall's plan therefore spans width_m*80 by length_m*80 units.
--
-- The staff editor and the guest booking plan both read this, so a table
-- sits in exactly the same place, at exactly the same size, for both.

-- ---------------------------------------------------------------------
-- Halls: real size and floor finish
-- ---------------------------------------------------------------------
alter table public.halls
  add column width_m numeric not null default 15
    check (width_m between 4 and 40),
  add column length_m numeric not null default 8.5
    check (length_m between 4 and 40),
  add column floor text not null default 'wood'
    check (floor in ('wood', 'tile', 'concrete'));

-- ---------------------------------------------------------------------
-- Tables: rotation + coordinate transfer
-- ---------------------------------------------------------------------
alter table public.dining_tables
  add column rotation smallint not null default 0
    check (rotation in (0, 90, 180, 270));

-- Old positions were the top-left corner of a fixed-size box (round and
-- square 84x84 px, rectangle 120x72 px). Reading one old pixel as one plan
-- unit and moving the anchor to the box's centre keeps every existing
-- layout's relative arrangement intact.
update public.dining_tables
set
  pos_x = pos_x + case shape when 'rectangle' then 60 else 42 end,
  pos_y = pos_y + case shape when 'rectangle' then 36 else 42 end;

-- A layout drawn on a wide screen may extend past the default 15 x 8.5 m
-- room. Grow such halls to fit their tables (plus a 1.5 m margin) instead
-- of piling those tables up against the far wall.
update public.halls h
set
  width_m = least(40, greatest(h.width_m, ceil((t.max_x + 120) / 80.0))),
  length_m = least(40, greatest(h.length_m, ceil((t.max_y + 120) / 80.0)))
from (
  select hall_id, max(pos_x) as max_x, max(pos_y) as max_y
  from public.dining_tables
  group by hall_id
) t
where t.hall_id = h.id;

-- Anything still outside the (now possibly larger) room - only possible for
-- a layout wider than the 40 m cap - is pulled back inside its walls.
update public.dining_tables dt
set
  pos_x = least(greatest(dt.pos_x, 60), h.width_m * 80 - 60),
  pos_y = least(greatest(dt.pos_y, 60), h.length_m * 80 - 60)
from public.halls h
where h.id = dt.hall_id;

-- New tables default to a spot one metre in from the top-left corner.
alter table public.dining_tables
  alter column pos_x set default 80,
  alter column pos_y set default 80;

-- ---------------------------------------------------------------------
-- Hall objects: everything on the plan that isn't a bookable table
-- ---------------------------------------------------------------------
create table public.hall_objects (
  id bigint generated always as identity primary key,
  hall_id bigint not null references public.halls (id) on delete cascade,
  kind text not null check (kind in (
    'bar', 'hostess', 'entrance', 'stairs', 'kitchen', 'wc', 'stage',
    'sofa', 'column', 'plant', 'window', 'door', 'wall', 'rail'
  )),
  -- Centre of the object, in plan units (80 = 1 m), same as dining_tables.
  pos_x double precision not null,
  pos_y double precision not null,
  -- Unrotated footprint, in plan units.
  width double precision not null check (width > 0 and width <= 3200),
  height double precision not null check (height > 0 and height <= 3200),
  rotation smallint not null default 0 check (rotation in (0, 90, 180, 270)),
  label text check (label is null or char_length(label) <= 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index hall_objects_hall_id_idx on public.hall_objects (hall_id);

create trigger hall_objects_set_updated_at
  before update on public.hall_objects
  for each row execute function public.set_updated_at();

alter table public.hall_objects enable row level security;

-- Same rule as halls/dining_tables: the floor plan isn't sensitive, so anyone
-- (including an anonymous guest) can read it; only staff can change it.
create policy "hall_objects are publicly readable"
  on public.hall_objects for select
  using (true);

create policy "staff manage hall_objects"
  on public.hall_objects for all
  using (public.is_staff())
  with check (public.is_staff());
