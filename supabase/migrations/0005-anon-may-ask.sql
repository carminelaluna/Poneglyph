-- Poneglyph — let a signed-out reader ask the role question too.
--
-- 0002 and 0003 revoked `has_role` and `my_role` from `anon`, on the reasoning that
-- a signed-out visitor has no role to ask about. That is true and it is the wrong
-- conclusion, because of how policies are evaluated.
--
-- SELECT policies are OR'd, so Postgres evaluates *all* of them before deciding a
-- row is invisible — including the admin one, which calls the function. Without the
-- grant, a signed-out request for `profiles`, `submissions`, `submission_decks` or
-- `organizer_requests` does not come back empty; it comes back
-- `42501 permission denied for function has_role`. Row-level security is supposed
-- to answer "nothing here", not to error.
--
-- Nothing is disclosed by allowing it. Neither function takes a user id: they ask
-- about `auth.uid()`, which for an anonymous caller is null, so `has_role` returns
-- false and `my_role` returns null whatever is passed. The grant buys a correct
-- empty answer and costs no information at all.
--
-- The site does not currently read those tables signed out — every caller sits
-- behind a session check — so this fixes a latent trap rather than a live fault.
-- It is the kind that surfaces months later as an unexplainable 401 in someone
-- else's feature.
--
--   Supabase dashboard -> SQL editor -> paste -> run.

begin;

grant execute on function public.has_role(text) to anon;
grant execute on function public.my_role() to anon;

commit;

-- Afterwards, an anonymous read of any of those tables returns `[]`, which is what
-- row-level security filtering an unauthenticated caller is meant to look like.
