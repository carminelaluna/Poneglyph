-- Poneglyph — asking for the organizer role from inside the site.
--
-- Run **after** 0001-review.sql, which is what creates the `admin` role this
-- one leans on. `schema.sql` already contains both for a new project. Safe to run
-- twice.
--
-- Until now the site's answer to "how do I submit results" was "ask at the contact
-- address on the legal page" — an email, off the record, invisible to everyone but
-- whoever received it. This makes it a row: the person asks, an admin answers, and
-- the answer carries a reason.
--
-- **Asking is not being granted.** The role still changes only by an admin's
-- deliberate act, and the policy below is the narrowest rule that allows it: an
-- account can be moved between `user` and `organizer`, in either direction, and
-- nothing else. No client can create an admin, and no admin's row can be edited by
-- another admin. Minting that role stays something you do in the Supabase
-- dashboard, by hand, which is what the rest of this structure rests on.
--
-- If you ran an earlier copy of this file — the one whose admin checks were
-- subqueries over `profiles` — run 0003 as well, or instead: it repairs exactly
-- that. Running both in either order is safe.
--
--   Supabase dashboard -> SQL editor -> paste -> run.

begin;

-- ---------------------------------------------------------------- profiles

-- Asking about a role, without reading the table from inside its own policies.
--
-- The first version of this file wrote both checks below as `exists (select 1 from
-- public.profiles …)`. On another table that is fine; on `profiles` itself it means
-- a policy that has to evaluate itself, and Postgres answers `infinite recursion
-- detected in policy for relation "profiles"` — for every read of the table, not
-- just for the policy at fault, since SELECT policies are OR'd. `npm run check`
-- now refuses that shape.
--
-- `security definer` runs the body as the function's owner, who owns the table and
-- is exempt from its row-level security, so the lookup does not re-enter a policy.
-- Neither function takes a user id: they answer about the caller and nobody else.
create or replace function public.has_role(wanted text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = wanted
  );
$$;

create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid());
$$;

revoke execute on function public.has_role(text) from public, anon;
revoke execute on function public.my_role() from public, anon;
grant execute on function public.has_role(text) to authenticated;
grant execute on function public.my_role() to authenticated;

drop policy if exists "rename self only" on public.profiles;
create policy "rename self only"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id and role = public.my_role());

-- Reading the accounts it can act on, and only those.
--
-- Needed because an update that RLS filters out is not an error in PostgREST: it
-- affects zero rows and comes back looking like a success. Without a way to read
-- the row back, "Grant the role" would report that it had done something whenever
-- this policy was missing.
--
-- Restricted the same way the update is: an admin's row is not readable here
-- either, so this cannot be used to enumerate the people who hold that role.
drop policy if exists "admins read the accounts they can act on" on public.profiles;
create policy "admins read the accounts they can act on"
  on public.profiles for select
  using (role in ('user', 'organizer') and public.has_role('admin'));

drop policy if exists "admins move accounts between user and organizer" on public.profiles;
create policy "admins move accounts between user and organizer"
  on public.profiles for update
  -- The row being changed: an admin's row is not reachable through this.
  using (role in ('user', 'organizer') and public.has_role('admin'))
  -- The row as it would become: so this can never produce an admin.
  with check (role in ('user', 'organizer'));

-- ------------------------------------------------------- the requests

create table if not exists public.organizer_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,

  organizer_name text not null,
  events      text not null,
  link        text,

  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);

-- One open request per account: someone rejected may ask again, but nobody queues
-- fifty of them.
create unique index if not exists organizer_requests_one_open
  on public.organizer_requests (user_id)
  where status = 'pending';

create index if not exists organizer_requests_status_idx
  on public.organizer_requests (status);

alter table public.organizer_requests enable row level security;

drop policy if exists "ask as yourself" on public.organizer_requests;
create policy "ask as yourself"
  on public.organizer_requests for insert
  with check (auth.uid() = user_id and status = 'pending');

drop policy if exists "read own requests" on public.organizer_requests;
create policy "read own requests"
  on public.organizer_requests for select
  using (auth.uid() = user_id);

-- Deliberately no update and no delete for the person who sent it: a request that
-- could be rewritten, or taken back and replaced, after a reviewer had read it is
-- a request nobody can rely on having read. (An earlier version of this file did
-- allow a withdrawal; 0004 removes it.)

drop policy if exists "admins read every request" on public.organizer_requests;
create policy "admins read every request"
  on public.organizer_requests for select
  using (public.has_role('admin'));

drop policy if exists "admins answer requests" on public.organizer_requests;
create policy "admins answer requests"
  on public.organizer_requests for update
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

commit;
