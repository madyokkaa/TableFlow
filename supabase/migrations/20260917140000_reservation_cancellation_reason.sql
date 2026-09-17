-- Adds an optional cancellation reason to a reservation, plus who cancelled
-- it (guest self-service vs hostess), so the hostess panel can show why a
-- booking was cancelled/rejected and the guest's own history can tell "you
-- cancelled this" apart from "the restaurant cancelled this" without
-- exposing internal hostess notes to the guest.
alter table public.reservations
  add column cancellation_reason text
    check (cancellation_reason is null or char_length(cancellation_reason) <= 500),
  add column cancelled_by text
    check (cancelled_by is null or cancelled_by in ('guest', 'host'));
