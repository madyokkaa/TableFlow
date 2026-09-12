-- Support for the hostess-panel "add admin" feature, hardened after
-- self-review found the naive version let any staff member seize an
-- unrelated existing account (including another admin's) by "promoting"
-- its email and setting a password on it. The fix moves credential
-- handling so a promotion never touches an existing account's password -
-- see app/api/staff/route.ts.

-- Replaces app/api/staff/route.ts's old listUsers() pagination scan (which
-- had no page cap and, worse, compared emails case-sensitively so it never
-- found a match with different casing) with a single indexed lookup.
create or replace function public.find_auth_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

revoke execute on function public.find_auth_user_id_by_email(text) from public, anon, authenticated;

-- Audit trail: which staff account granted this one access. Nullable
-- because the existing seed/demo staff rows predate this column.
alter table public.staff add column if not exists created_by uuid references auth.users (id);
