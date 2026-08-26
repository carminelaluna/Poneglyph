-- Poneglyph — accounts, saved decks and tournament submissions.
--
--   Run this once in the Supabase SQL editor on a new project.
--
-- Two roles. A **user** signs in and saves decks that only they can see. An
-- **organizer** can additionally submit a tournament: an event and its decklists,
-- which after review join the metagame corpus.
--
-- The role is granted by hand and cannot be set by the person it belongs to. That
-- is the whole security model here, so it is worth saying why: every share and win
-- rate on the site is derived from recorded results, and an account that could make
-- itself an organizer could put anything into those numbers. The policies below let
-- a profile row be read and its display name changed, and nothing else.
--
-- Submissions do not reach the site directly either. `ingest-submissions.mjs` reads
-- only rows marked `approved`, with the service role key, from a scheduled job — so
-- the gate is a column, and the site keeps being built from a reviewed corpus.

-- ---------------------------------------------------------------- profiles

create table public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  display_name text,
  -- 'user', 'organizer' or 'admin'. Granted in the dashboard, never from the
  -- client. An admin is the person who reviews submissions; the role exists so
  -- that reviewing is a page on the site rather than hand-editing a `status`
  -- column in the table editor, which is what it used to be.
  role        text not null default 'user'
                check (role in ('user', 'organizer', 'admin')),
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- ------------------------------------------------- asking about a role
--
-- Every policy below that depends on who you are asks through one of these, and
-- none of them reads `profiles` directly. That is not tidiness: a policy *on*
-- profiles that runs a select *from* profiles has to evaluate itself to decide
-- whether it applies, and Postgres answers `infinite recursion detected in policy
-- for relation "profiles"`. Because SELECT policies are OR'd, one such policy
-- breaks every read of the table — including the rename check below, and every
-- policy on another table that asks profiles a question.
--
-- `security definer` runs the body as the function's owner, who owns the table and
-- is therefore exempt from its row-level security, so the lookup does not re-enter
-- any policy. Neither function takes a user id: they answer about the caller and
-- nobody else, so neither can be used to probe another account.
create function public.has_role(wanted text)
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

create function public.my_role()
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

-- A profile appears the moment someone signs up, rather than on first write.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create policy "read own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Deliberately no insert policy: the trigger creates the row, nobody else does.
--
-- Update is restricted to the display name by a check that the role is unchanged.
-- Writing `using (auth.uid() = id)` alone would let anyone promote themselves with
-- a single PATCH, which is the one thing this table exists to prevent.
create policy "rename self only"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id and role = public.my_role());

-- The one way a role changes without opening the dashboard, and it is deliberately
-- the narrowest rule that does the job.
--
-- `using` reads the row being changed: it must currently be a 'user' or an
-- 'organizer', so an admin cannot be demoted or edited by another admin.
-- `with check` reads the row as it would become: it must still be one of those two,
-- so **no client can ever mint an admin**. Granting that role stays a thing you do
-- in Supabase, by hand, which is what keeps the whole structure standing up.
--
-- What this does allow an admin to do is move somebody between user and organizer —
-- which is the decision the request queue below exists to record — and, since RLS
-- cannot restrict columns, to change that person's display name. That is not a
-- threat to the corpus, which is what these policies are protecting.
-- Reading the accounts it can act on, and only those.
--
-- Needed because an update that RLS filters out is not an error in PostgREST: it
-- affects zero rows and comes back looking like a success. Without a way to read
-- the row back, "Grant the role" would report that it had done something whenever
-- this policy was missing — the exact failure the review page exists to avoid.
--
-- Restricted the same way the update is: an admin's row is not readable here
-- either, so this cannot be used to enumerate the people who hold that role.
create policy "admins read the accounts they can act on"
  on public.profiles for select
  using (role in ('user', 'organizer') and public.has_role('admin'));

create policy "admins move accounts between user and organizer"
  on public.profiles for update
  using (role in ('user', 'organizer') and public.has_role('admin'))
  with check (role in ('user', 'organizer'));

-- ------------------------------------------------------------- saved decks

create table public.decks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  name        text not null default 'Untitled deck',
  leader_id   text not null,
  -- [{ "id": "OP01-025", "count": 4 }, …]. Validated in the page, not here:
  -- the rules live in lib/deck-rules.ts and a copy in SQL would drift from it.
  cards       jsonb not null default '[]'::jsonb,
  format      text not null default 'Standard' check (format in ('Standard', 'Extra')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index decks_user_id_idx on public.decks (user_id);

alter table public.decks enable row level security;

-- Private, in all four directions. There is no sharing feature, and a policy that
-- allowed reading someone else's row would be the thing that quietly added one.
create policy "own decks" on public.decks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------- becoming an organizer

-- Asking for the organizer role, in the open.
--
-- Before this the answer on the site was "ask at the contact address on the legal
-- page", which is an email — off the record, easy to lose, and invisible to anyone
-- but the person who received it. A row is none of those things.
--
-- Asking is not being granted. Nothing here changes a role; approving a request is
-- an admin acting on `profiles` under the policy above, and the request is only the
-- record of the decision and the reason for it.
create table public.organizer_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,

  -- Their own words: who they are, what they run, and where it can be checked.
  -- A store name and a link is most of what a reviewer needs; the rest is judgment.
  organizer_name text not null,
  events      text not null,
  link        text,

  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);

-- One open request per account. Someone who has been rejected can ask again — a
-- shop changes hands, an answer changes — but nobody can queue fifty of them.
create unique index organizer_requests_one_open
  on public.organizer_requests (user_id)
  where status = 'pending';

create index organizer_requests_status_idx on public.organizer_requests (status);

alter table public.organizer_requests enable row level security;

create policy "ask as yourself"
  on public.organizer_requests for insert
  with check (auth.uid() = user_id and status = 'pending');

create policy "read own requests"
  on public.organizer_requests for select
  using (auth.uid() = user_id);

-- Taking it back, while it is still waiting. Not editing it: a request that could
-- be rewritten after a reviewer read it is a request nobody can rely on having read.
create policy "withdraw while pending"
  on public.organizer_requests for delete
  using (auth.uid() = user_id and status = 'pending');

create policy "admins read every request"
  on public.organizer_requests for select
  using (public.has_role('admin'));

create policy "admins answer requests"
  on public.organizer_requests for update
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

-- ------------------------------------------------------------- submissions

create table public.submissions (
  id          uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references auth.users on delete cascade,

  event_name  text not null,
  event_date  date not null,
  venue       text,
  -- Matches the vocabulary in scripts/sources.mjs: regional, treasure, local, …
  tier        text not null default 'local',
  region      text not null default 'EN' check (region in ('EN', 'JP')),

  -- How the results were collected, and it is not cosmetic.
  --
  -- 'field' means every deck in the event; 'winners' means only those that placed.
  -- Share counts every deck, win rate counts only whole fields — a winners-only
  -- event counted as a field reads near 100% and means nothing. The organizer is
  -- asked which one this is, and the ingest carries the answer per deck.
  sampling    text not null check (sampling in ('field', 'winners')),
  -- Entrants, when known. Null rather than 0 — "not recorded" is not "nobody came".
  players     integer,

  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_at timestamptz,

  created_at  timestamptz not null default now()
);

create index submissions_status_idx on public.submissions (status);

alter table public.submissions enable row level security;

-- Only an organizer may submit, and only as themselves.
create policy "organizers submit"
  on public.submissions for insert
  with check (auth.uid() = organizer_id and public.has_role('organizer'));

create policy "read own submissions"
  on public.submissions for select
  using (auth.uid() = organizer_id);

-- Editable only while it is still waiting, and the status is not theirs to change.
-- Without the second condition an organizer could approve their own submission.
create policy "edit while pending"
  on public.submissions for update
  using (auth.uid() = organizer_id and status = 'pending')
  with check (auth.uid() = organizer_id and status = 'pending');

create policy "withdraw while pending"
  on public.submissions for delete
  using (auth.uid() = organizer_id and status = 'pending');

-- ------------------------------------------------------------------ review
--
-- Approving used to mean opening the Supabase table editor and changing a column
-- by hand. That is fine for the first few and stops being fine quickly: the
-- decklists are JSON in a cell, so the one thing a reviewer actually has to look
-- at is the thing hardest to look at there.
--
-- The gate does not move. It is still a role granted by hand in the dashboard,
-- still unreachable from any client, and an organizer still cannot touch `status`.
-- What changes is only *where* the person holding that role does the work.
--
-- Written as `role = 'admin'` against the reader's own profile row, which the
-- "read own profile" policy above already allows — so no policy here reads anyone
-- else's row, and the property that nothing in this file exposes one account's
-- data to another still holds.
create policy "admins read every submission"
  on public.submissions for select
  using (public.has_role('admin'));

create policy "admins review submissions"
  on public.submissions for update
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

-- -------------------------------------------------------- submitted decks

create table public.submission_decks (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions on delete cascade,

  -- As reported. "Not recorded" is a real answer and is stored as null.
  player        text,
  /*
   * `place`, not `placing`.
   *
   * PLACING is a **reserved** word in PostgreSQL — it belongs to the
   * `overlay(string placing string from int)` syntax — so a bare `placing integer`
   * fails to parse, complaining at the column name itself and giving no hint why.
   * It could be quoted as "placing", but then every query touching it has to quote
   * it too, forever, and the one that forgets fails the same puzzling way.
   *
   * The corpus calls this `placing`; ingest-submissions.mjs maps the name across.
   * `role` and `format` elsewhere in this file are *non*-reserved and are fine bare.
   */
  place         integer,
  wins          integer not null default 0,
  losses        integer not null default 0,
  ties          integer not null default 0,

  leader_id     text not null,
  -- [{ "id": "OP01-025", "count": 4 }, …]
  cards         jsonb not null default '[]'::jsonb
);

create index submission_decks_submission_idx on public.submission_decks (submission_id);

alter table public.submission_decks enable row level security;

-- Reached only through the parent, so the parent's rules apply to these too.
create policy "own submission decks"
  on public.submission_decks for all
  using (
    exists (
      select 1 from public.submissions s
      where s.id = submission_id and s.organizer_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.submissions s
      where s.id = submission_id and s.organizer_id = auth.uid() and s.status = 'pending'
    )
  );

-- Reading, and only reading. A reviewer has to see the fifty cards to say yes to
-- them; editing someone else's decklist is not review, it is authorship, and the
-- honest answer to a list that is wrong is to reject it with a note.
create policy "admins read every submitted deck"
  on public.submission_decks for select
  using (public.has_role('admin'));

-- ------------------------------------------------------------------ notes
--
-- Nothing above grants read access to another person's rows, and nothing grants
-- anyone the ability to set `role` or `status`. Both are changed from the Supabase
-- dashboard, which is the manual gate that was chosen deliberately: there are few
-- real organizers, and the numbers are the thing being protected.
--
-- The ingest reads approved submissions with the **service role key**, which
-- bypasses every policy here. That key belongs in the GitHub Actions secrets and
-- nowhere else — never in .env.local, never in anything NEXT_PUBLIC_, never in the
-- browser bundle. The anon key is the one the site ships with, and it is safe to
-- because these policies are what stand behind it.
