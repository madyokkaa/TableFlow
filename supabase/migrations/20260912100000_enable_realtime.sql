-- The hostess dashboard and hall floor-plan pages subscribe to Postgres
-- Changes over WebSocket (supabase-js Realtime) instead of polling. That
-- only delivers events for tables added to the `supabase_realtime`
-- publication - without this, the client-side subscription would connect
-- successfully but silently never receive anything.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reservations'
  ) then
    alter publication supabase_realtime add table public.reservations;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reservation_tables'
  ) then
    alter publication supabase_realtime add table public.reservation_tables;
  end if;
end;
$$;
