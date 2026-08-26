-- Poneglyph — a sent request stands until it is answered.
--
-- 0002 let the person who sent a request delete it while it was pending. That is
-- the same hole as editing it wearing different clothes: a request can be taken
-- back and replaced after a reviewer has read it, which makes "I read this one"
-- something nobody can rely on.
--
-- There was never an update policy for the sender, so this closes the other half.
-- Once it is in, the only way out is an answer — and a refusal carries a note and
-- allows another attempt, so nothing is lost but the ability to rewrite history.
--
-- Note this is the *organizer request*. An organizer can still withdraw a pending
-- **tournament submission**: that is work they did, on their own event, and taking
-- back a decklist they uploaded by mistake is not rewriting a decision anyone made.
--
--   Supabase dashboard -> SQL editor -> paste -> run.

begin;

drop policy if exists "withdraw while pending" on public.organizer_requests;

commit;
