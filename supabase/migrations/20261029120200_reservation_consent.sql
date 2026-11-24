-- When the guest agreed to the processing of their personal data for this
-- booking: the consent checkbox on the guest booking form, or the staff
-- booking drawer's "the guest agreed" checkbox - POST /api/reservations
-- requires one of them. Null for bookings made before this existed.
alter table public.reservations
  add column if not exists consent_at timestamptz;
