-- Poneglyph — asking for the organizer role from inside the site.
--
-- Run **after** 2026-08-26-review.sql, which is what creates the `admin` role this
-- one leans on. `schema.sql` already contains both for a new project. Safe to run
-- twice.
--
-- Until now the site's answer to "how do I submit results" was "ask at the contact
-- address on the legal page" — an email, off the record, invisible to everyone but
-- whoever received it. This makes it a row: the person asks, an admin answers, and
-- the answer carries a reason.
--
-- **Asking is not being granted.** The role still changes only by an admin's
-- deliberate act, and the policy below is the narrowest rule that allows it: an
-- account can be moved between `user` and `organizer`, in either direction, and
-- nothing else. No client can create an admin, and no admin's row can be edited by
-- another admin. Minting that role stays something you do in the Supabase
-- dashboard, by hand, which is what the rest of this structure rests on.
--
--   Supabase dashboard -> SQL editor -> paste -> run.

begin;

-- ---------------------------------------------------------------- profiles

drop policy if exists "admins read the accounts they can act on" on public.profiles;
create policy "admins read the accounts they can act on"
  on public.profiles for select
  using (
    role in ('user', 'organizer')
    and exists (
      select 1 from public.profiles me
      where me.id = auth.uid() and me.role = 'admin'
    )
  );

drop policy if exists "admins move accounts between user and organizer" on public.profiles;
create policy "admins move accounts between user and organizer"
  on public.profiles for update
  using (
    -- The row being changed: an admin's row is not reachable through this.
    role in ('user', 'organizer')
    and exists (
      select 1 from public.profiles me
      where me.id = auth.uid() and me.role = 'admin'
    )
  )
  with check (
    -- The row as it would become: so this can never produce an admin.
    role in ('user', 'organizer')
  );

-- ------------------------------------------------------- the requests

create table if not exists public.organizer_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,

  organizer_name text not null,
  events      text not null,
  link        text,

  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);

-- One open request per account: someone rejected may ask again, but nobody queues
-- fifty of them.
create unique index if not exists organizer_requests_one_open
  on public.organizer_requests (user_id)
  where status = 'pending';

create index if not exists organizer_requests_status_idx
  on public.organizer_requests (status);

alter table public.organizer_requests enable row level security;

drop policy if exists "ask as yourself" on public.organizer_requests;
create policy "ask as yourself"
  on public.organizer_requests for insert
  with check (auth.uid() = user_id and status = 'pending');

drop policy if exists "read own requests" on public.organizer_requests;
create policy "read own requests"
  on public.organizer_requests for select
  using (auth.uid() = user_id);

drop policy if exists "withdraw while pending" on public.organizer_requests;
create policy "withdraw while pending"
  on public.organizer_requests for delete
  using (auth.uid() = user_id and status = 'pending');

drop policy if exists "admins read every request" on public.organizer_requests;
create policy "admins read every request"
  on public.organizer_requests for select
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

drop policy if exists "admins answer requests" on public.organizer_requests;
create policy "admins answer requests"
  on public.organizer_requests for update
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

commit;
