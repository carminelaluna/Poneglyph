-- Let an admin submit a tournament, not only review one.
--
-- Safe to run twice.
--
-- The role is a single column, not a set: an account is a `user`, an `organizer`
-- or an `admin`, and there is no way to be two of them. So the person who runs
-- this site could review submissions or send them, never both — asking for the
-- organizer role from an admin account cannot work either, because the grant
-- policy deliberately refuses to touch an admin's row.
--
-- Widening the insert is the way an admin gets to submit, and it is a small
-- widening: `auth.uid() = organizer_id` still stands, so an admin can only submit
-- as themselves, exactly like an organizer.
--
-- What it does allow is an admin approving their own submission. That is not a
-- hole this policy opens — an admin can already approve anything, and could set
-- the column by hand in the dashboard. The separation the original comment is
-- protecting is a different one: an *organizer* must not be able to approve their
-- own, and `edit while pending` still enforces that.

drop policy if exists "organizers submit" on public.submissions;

create policy "organizers and admins submit"
  on public.submissions for insert
  with check (
    auth.uid() = organizer_id
    and (public.has_role('organizer') or public.has_role('admin'))
  );
