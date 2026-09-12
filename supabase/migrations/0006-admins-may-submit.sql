drop policy if exists "organizers submit" on public.submissions;

create policy "organizers and admins submit"
  on public.submissions for insert
  with check (
    auth.uid() = organizer_id
    and (public.has_role('organizer') or public.has_role('admin'))
  );
