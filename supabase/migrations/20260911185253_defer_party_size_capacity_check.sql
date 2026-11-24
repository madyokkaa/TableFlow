-- Same bug class as the earlier deferred-trigger fix, different trigger:
-- update_reservation() with both party_size and table_ids changed hits
-- "UPDATE reservations SET party_size=..." first, which fired
-- reservations_recheck_capacity immediately - checking capacity against the
-- OLD (not-yet-reassigned) table set, before the function got to the table
-- diff. Deferring the check to end-of-transaction fixes it the same way.

drop trigger if exists reservations_recheck_capacity on public.reservations;

create constraint trigger reservations_recheck_capacity
  after update of party_size on public.reservations
  deferrable initially deferred
  for each row execute function public.recheck_capacity_on_party_size_change();
