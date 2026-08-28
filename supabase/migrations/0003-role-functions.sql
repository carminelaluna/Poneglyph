-- Poneglyph — stop the policies reading `profiles` directly.
--
-- **Run this if you applied the first version of 0002** — the one whose admin
-- checks were subqueries over `profiles`. Without it, renaming yourself fails with
-- `infinite recursion detected in policy for relation "profiles"`, and so does
-- every other read of that table. 0002 has since been corrected at the source, so
-- a project set up from scratch never needs this; running it anyway changes
-- nothing.
--
-- What happened: 0002 added a SELECT policy *on* profiles that ran a SELECT *from*
-- profiles to ask whether the reader is an admin. Evaluating it requires evaluating
-- it. Postgres does not unwind that, it refuses — and because SELECT policies are
-- OR'd together, one recursive policy poisons every read of the table, including
-- the `with check` on "rename self only" that re-reads the stored role, and every
-- policy on *other* tables that asks profiles a question.
--
-- The fix is the standard one: ask through a `security definer` function. It runs
-- as its owner, who owns the table and is therefore exempt from its row-level
-- security, so the lookup inside does not re-enter any policy. Neither function
-- takes a user id — they answer only about the caller — so neither can be used to
-- probe somebody else's account.
--
--   Supabase dashboard -> SQL editor -> paste -> run.

begin;

-- ----------------------------------------------------------- the questions

-- "Does the caller hold this role?" Nothing else. `search_path` is emptied, so
-- every name inside has to be schema-qualified, which is what stops the function
-- resolving to something planted on a different search path.
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

-- "What is the caller's own role?" Used by the rename check, which has to compare
-- the role being written against the one already stored.
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid());
$$;

revoke execute on function public.has_role(text) from public;
revoke execute on function public.my_role() from public;
grant execute on function public.has_role(text) to anon, authenticated;
grant execute on function public.my_role() to anon, authenticated;

-- ---------------------------------------------------------------- profiles

drop policy if exists "rename self only" on public.profiles;
create policy "rename self only"
  on public.profiles for update
  using (auth.uid() = id)
  -- The role has to come back unchanged. Reading it through the function is what
  -- keeps this from re-entering the table's own policies.
  with check (auth.uid() = id and role = public.my_role());

drop policy if exists "admins read the accounts they can act on" on public.profiles;
create policy "admins read the accounts they can act on"
  on public.profiles for select
  using (role in ('user', 'organizer') and public.has_role('admin'));

drop policy if exists "admins move accounts between user and organizer" on public.profiles;
create policy "admins move accounts between user and organizer"
  on public.profiles for update
  using (role in ('user', 'organizer') and public.has_role('admin'))
  with check (role in ('user', 'organizer'));

-- ------------------------------------------------------------- submissions

drop policy if exists "organizers submit" on public.submissions;
create policy "organizers submit"
  on public.submissions for insert
  with check (auth.uid() = organizer_id and public.has_role('organizer'));

drop policy if exists "admins read every submission" on public.submissions;
create policy "admins read every submission"
  on public.submissions for select
  using (public.has_role('admin'));

drop policy if exists "admins review submissions" on public.submissions;
create policy "admins review submissions"
  on public.submissions for update
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

drop policy if exists "admins read every submitted deck" on public.submission_decks;
create policy "admins read every submitted deck"
  on public.submission_decks for select
  using (public.has_role('admin'));

-- ------------------------------------------------------ organizer requests

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

-- Afterwards, renaming yourself works again, and so does everything that asks
-- profiles a question. Nothing about who may do what has changed: the same roles
-- decide the same things, through a function instead of a subquery.
