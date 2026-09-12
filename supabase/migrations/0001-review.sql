begin;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('user', 'organizer', 'admin'));

drop policy if exists "admins read every submission" on public.submissions;
create policy "admins read every submission"
  on public.submissions for select
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

drop policy if exists "admins review submissions" on public.submissions;
create policy "admins review submissions"
  on public.submissions for update
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

drop policy if exists "admins read every submitted deck" on public.submission_decks;
create policy "admins read every submitted deck"
  on public.submission_decks for select
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

commit;

