create table public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  display_name text,
  role        text not null default 'user'
                check (role in ('user', 'organizer', 'admin')),
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

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

revoke execute on function public.has_role(text) from public;
revoke execute on function public.my_role() from public;
grant execute on function public.has_role(text) to anon, authenticated;
grant execute on function public.my_role() to anon, authenticated;

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

create policy "rename self only"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id and role = public.my_role());

create policy "admins read the accounts they can act on"
  on public.profiles for select
  using (role in ('user', 'organizer') and public.has_role('admin'));

create policy "admins move accounts between user and organizer"
  on public.profiles for update
  using (role in ('user', 'organizer') and public.has_role('admin'))
  with check (role in ('user', 'organizer'));

create table public.decks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users on delete cascade,
  name        text not null default 'Untitled deck',
  leader_id   text not null,
  cards       jsonb not null default '[]'::jsonb,
  format      text not null default 'Standard' check (format in ('Standard', 'Extra')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index decks_user_id_idx on public.decks (user_id);

alter table public.decks enable row level security;

create policy "own decks" on public.decks for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table public.organizer_requests (
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

create policy "admins read every request"
  on public.organizer_requests for select
  using (public.has_role('admin'));

create policy "admins answer requests"
  on public.organizer_requests for update
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

create table public.submissions (
  id          uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references auth.users on delete cascade,

  event_name  text not null,
  event_date  date not null,
  venue       text,
  tier        text not null default 'local',
  region      text not null default 'EN' check (region in ('EN', 'JP')),

  sampling    text not null check (sampling in ('field', 'winners')),
  players     integer,

  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  review_note text,
  reviewed_at timestamptz,

  created_at  timestamptz not null default now()
);

create index submissions_status_idx on public.submissions (status);

alter table public.submissions enable row level security;

create policy "organizers and admins submit"
  on public.submissions for insert
  with check (
    auth.uid() = organizer_id
    and (public.has_role('organizer') or public.has_role('admin'))
  );

create policy "read own submissions"
  on public.submissions for select
  using (auth.uid() = organizer_id);

create policy "edit while pending"
  on public.submissions for update
  using (auth.uid() = organizer_id and status = 'pending')
  with check (auth.uid() = organizer_id and status = 'pending');

create policy "withdraw while pending"
  on public.submissions for delete
  using (auth.uid() = organizer_id and status = 'pending');

create policy "admins read every submission"
  on public.submissions for select
  using (public.has_role('admin'));

create policy "admins review submissions"
  on public.submissions for update
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

create table public.submission_decks (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions on delete cascade,

  player        text,
  place         integer,
  wins          integer not null default 0,
  losses        integer not null default 0,
  ties          integer not null default 0,

  leader_id     text not null,
  cards         jsonb not null default '[]'::jsonb
);

create index submission_decks_submission_idx on public.submission_decks (submission_id);

alter table public.submission_decks enable row level security;

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

create policy "admins read every submitted deck"
  on public.submission_decks for select
  using (public.has_role('admin'));

