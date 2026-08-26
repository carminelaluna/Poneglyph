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
  -- 'user' or 'organizer'. Granted in the dashboard, never from the client.
  role        text not null default 'user' check (role in ('user', 'organizer')),
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

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
  with check (auth.uid() = id and role = (select role from public.profiles where id = auth.uid()));

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
  with check (
    auth.uid() = organizer_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'organizer'
    )
  );

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

-- -------------------------------------------------------- submitted decks

create table public.submission_decks (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions on delete cascade,

  -- As reported. "Not recorded" is a real answer and is stored as null.
  player        text,
  placing       integer,
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
