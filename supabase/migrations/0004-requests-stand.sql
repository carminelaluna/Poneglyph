begin;

drop policy if exists "withdraw while pending" on public.organizer_requests;

commit;
