begin;

create or replace function public.has_role(wanted text)
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

create or replace function public.my_role()
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

drop policy if exists "rename self only" on public.profiles;
create policy "rename self only"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id and role = public.my_role());

drop policy if exists "admins read the accounts they can act on" on public.profiles;
create policy "admins read the accounts they can act on"
  on public.profiles for select
  using (role in ('user', 'organizer') and public.has_role('admin'));

drop policy if exists "admins move accounts between user and organizer" on public.profiles;
create policy "admins move accounts between user and organizer"
  on public.profiles for update
  using (role in ('user', 'organizer') and public.has_role('admin'))
  with check (role in ('user', 'organizer'));

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

drop policy if exists "admins read every request" on public.organizer_requests;
create policy "admins read every request"
  on public.organizer_requests for select
  using (public.has_role('admin'));

drop policy if exists "admins answer requests" on public.organizer_requests;
create policy "admins answer requests"
  on public.organizer_requests for update
  using (public.has_role('admin'))
  with check (public.has_role('admin'));

commit;
