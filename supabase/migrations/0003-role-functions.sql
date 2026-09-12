begin;

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

revoke execute on function public.has_role(text) from public;
revoke execute on function public.my_role() from public;
grant execute on function public.has_role(text) to anon, authenticated;
grant execute on function public.my_role() to anon, authenticated;

drop policy if exists "rename self only" on public.profiles;
create policy "rename self only"
  on public.profiles for update
  using (auth.uid() = id)
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

