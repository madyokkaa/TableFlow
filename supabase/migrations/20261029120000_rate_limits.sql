-- Fixed-window request counters for the public API routes (see
-- lib/rateLimit.ts). One row per (key, window); the key is the route name
-- plus a keyed hash of the caller's IP, never the raw address.

create table if not exists public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);

-- Lets the cleanup in rate_limit_hit find old windows without a full scan.
create index if not exists rate_limits_window_start_idx on public.rate_limits (window_start);

-- Service-role only: RLS on with no policies, and no table grants for the
-- client roles either.
alter table public.rate_limits enable row level security;
revoke all on table public.rate_limits from public, anon, authenticated;

-- Counts one hit for p_key in the current p_window_seconds window and says
-- whether the caller is still within p_limit. The insert ... on conflict
-- is a single atomic statement, so concurrent requests can't both read the
-- same count. Windows are aligned to the epoch (lib/rateLimit.ts computes
-- Retry-After the same way). Old windows are removed on the way: this
-- key's earlier ones, and anyone's older than a day (the longest window
-- allowed).
create or replace function public.rate_limit_hit(p_key text, p_window_seconds integer, p_limit integer)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_window timestamptz;
  v_hits integer;
begin
  if p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'rate_limit_hit: window must be between 1 and 86400 seconds';
  end if;
  if p_limit is null or p_limit < 1 then
    raise exception 'rate_limit_hit: limit must be positive';
  end if;

  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits as r (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning r.hits into v_hits;

  delete from public.rate_limits where key = p_key and window_start < v_window;
  delete from public.rate_limits where window_start < now() - interval '1 day';

  return v_hits <= p_limit;
end;
$$;

revoke execute on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;
