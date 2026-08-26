-- Poneglyph — reviewing submissions from the site instead of the table editor.
--
-- `schema.sql` is the whole thing for a **new** project. This is the same change
-- for one that has already been created, and it is safe to run twice.
--
-- What it adds: an `admin` role, and the two policies that let someone holding it
-- read every submission and set its status. Nothing here lets an account grant
-- itself the role — that is still done by hand in the dashboard, and it is still
-- the only gate standing between a stranger and the numbers on this site.
--
--   Supabase dashboard -> SQL editor -> paste -> run.

begin;

-- 'admin' alongside the two roles that already existed.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('user', 'organizer', 'admin'));

-- Reading someone else's submission, and setting its status. Both are written
-- against the reader's *own* profile row, which the existing "read own profile"
-- policy already permits, so no policy added here reads another account's row.
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

-- Select only: a reviewer must see the fifty cards, and rewriting them would be
-- authorship rather than review.
drop policy if exists "admins read every submitted deck" on public.submission_decks;
create policy "admins read every submitted deck"
  on public.submission_decks for select
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

commit;

-- Afterwards, grant yourself the role once:
--
--   update public.profiles set role = 'admin' where id = '<your auth.users id>';
--
-- and /review becomes reachable. Everyone else sees the same page saying the role
-- is granted by hand.
