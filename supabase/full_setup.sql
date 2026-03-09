-- NagarWatch full setup
-- Run this script in Supabase SQL Editor.

create extension if not exists pgcrypto;

-- Core users table (optional for current no-auth identity mapping)
create table if not exists public.users (
  id text primary key,
  email text not null unique,
  role text not null check (role in ('citizen', 'authority', 'admin')) default 'citizen',
  authority_level text check (authority_level in ('ward', 'zone', 'city', 'state')),
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key,
  email text not null unique,
  role text not null check (role in ('citizen', 'authority', 'admin')) default 'citizen',
  created_at timestamptz not null default now()
);

create index if not exists idx_profiles_role on public.profiles(role);

create index if not exists idx_users_role on public.users(role);
create index if not exists idx_users_authority_level on public.users(authority_level);

create or replace function public.current_user_role()
returns text
language sql
stable
as $$
  select role from public.profiles where id = auth.uid() limit 1;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, coalesce(new.email, new.id::text || '@nagarwatch.local'), 'citizen')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.issues (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  category text not null,
  road_name text,
  landmark text,
  area_name text,
  latitude double precision not null,
  longitude double precision not null,
  image_url text,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'resolved')),
  created_by text not null,
  created_at timestamptz not null default now(),
  upvote_count integer not null default 0,
  downvote_count integer not null default 0,
  is_priority boolean not null default false,
  assigned_authority_level text not null default 'ward' check (assigned_authority_level in ('ward', 'zone', 'city', 'state')),
  escalation_level integer not null default 0,
  last_escalated_at timestamptz
);

alter table public.issues add column if not exists downvote_count integer not null default 0;
alter table public.issues add column if not exists is_priority boolean not null default false;
alter table public.issues add column if not exists road_name text;
alter table public.issues add column if not exists landmark text;
alter table public.issues add column if not exists area_name text;
alter table public.issues add column if not exists assigned_authority_level text not null default 'ward';
alter table public.issues add column if not exists escalation_level integer not null default 0;
alter table public.issues add column if not exists last_escalated_at timestamptz;
alter table public.users add column if not exists authority_level text;

create table if not exists public.upvotes (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  user_id text not null,
  created_at timestamptz not null default now(),
  unique(issue_id, user_id)
);

create table if not exists public.downvotes (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  user_id text not null,
  created_at timestamptz not null default now(),
  unique(issue_id, user_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  user_id text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  resolution_rate numeric(5,2) not null default 0
);

create table if not exists public.resolutions (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  resolved_by text not null,
  proof_image text,
  resolution_note text,
  resolved_at timestamptz not null default now()
);

create unique index if not exists idx_resolutions_unique_issue on public.resolutions(issue_id);

create table if not exists public.escalations (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  escalation_level integer not null check (escalation_level between 1 and 3),
  escalated_to text not null,
  escalated_to_level text not null check (escalated_to_level in ('ward', 'zone', 'city', 'state')),
  created_at timestamptz not null default now()
);

alter table public.escalations add column if not exists escalated_to_level text not null default 'ward';

create unique index if not exists idx_escalations_issue_level_unique on public.escalations(issue_id, escalation_level);

create table if not exists public.issue_events (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  event_type text not null check (event_type in ('reported', 'upvote', 'downvote', 'priority', 'assigned', 'in_progress', 'resolved', 'comment', 'resolution_proof')),
  message text not null,
  created_by text not null check (created_by in ('citizen', 'authority', 'system')),
  created_at timestamptz not null default now()
);

alter table public.issue_events drop constraint if exists issue_events_event_type_check;
alter table public.issue_events
add constraint issue_events_event_type_check
check (event_type in ('reported', 'upvote', 'downvote', 'priority', 'assigned', 'in_progress', 'resolved', 'comment', 'resolution_proof'));

create index if not exists idx_issues_created_at on public.issues(created_at desc);
create index if not exists idx_issues_status on public.issues(status);
create index if not exists idx_comments_issue_id on public.comments(issue_id);
create index if not exists idx_upvotes_issue_id on public.upvotes(issue_id);
create index if not exists idx_downvotes_issue_id on public.downvotes(issue_id);
create index if not exists idx_events_issue_id on public.issue_events(issue_id);
create index if not exists idx_escalations_issue_id on public.escalations(issue_id);

-- Keep issue upvote_count synced automatically.
create or replace function public.handle_upvote_counter()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    update public.issues
    set upvote_count = upvote_count + 1
    where id = new.issue_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.issues
    set upvote_count = greatest(upvote_count - 1, 0)
    where id = old.issue_id;
    return old;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_upvote_counter_insert on public.upvotes;
create trigger trg_upvote_counter_insert
after insert on public.upvotes
for each row execute function public.handle_upvote_counter();

drop trigger if exists trg_upvote_counter_delete on public.upvotes;
create trigger trg_upvote_counter_delete
after delete on public.upvotes
for each row execute function public.handle_upvote_counter();

-- Keep issue downvote_count and priority flag synced automatically.
create or replace function public.handle_downvote_counter()
returns trigger
language plpgsql
as $$
declare
  target_issue_id uuid;
begin
  target_issue_id := case when tg_op = 'INSERT' then new.issue_id else old.issue_id end;

  update public.issues
  set downvote_count = (
      select count(*)::int
      from public.downvotes
      where issue_id = target_issue_id
    ),
    is_priority = (
      (select count(*)::int from public.downvotes where issue_id = target_issue_id) > 10
    )
  where id = target_issue_id;

  if tg_op = 'INSERT' then
    return new;
  end if;

  return old;
end;
$$;

drop trigger if exists trg_downvote_counter_insert on public.downvotes;
create trigger trg_downvote_counter_insert
after insert on public.downvotes
for each row execute function public.handle_downvote_counter();

drop trigger if exists trg_downvote_counter_delete on public.downvotes;
create trigger trg_downvote_counter_delete
after delete on public.downvotes
for each row execute function public.handle_downvote_counter();

-- Seed departments for dashboard charts.
insert into public.departments(name)
values ('pothole'), ('garbage'), ('streetlight'), ('water'), ('other')
on conflict (name) do nothing;

-- Realtime publication registration (idempotent).
do $$
declare
  t text;
  tables text[] := array[
    'issues',
    'upvotes',
    'downvotes',
    'comments',
    'issue_events',
    'escalations',
    'resolutions'
  ];
begin
  foreach t in array tables
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Storage buckets (public read)
insert into storage.buckets (id, name, public)
values ('issue-images', 'issue-images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('resolution-proofs', 'resolution-proofs', true)
on conflict (id) do nothing;

-- Enable RLS and add app-friendly policies.
alter table public.users enable row level security;
alter table public.profiles enable row level security;
alter table public.issues enable row level security;
alter table public.upvotes enable row level security;
alter table public.downvotes enable row level security;
alter table public.comments enable row level security;
alter table public.departments enable row level security;
alter table public.resolutions enable row level security;
alter table public.escalations enable row level security;
alter table public.issue_events enable row level security;

-- App mode (no-auth currently): allow anon + authenticated to read/write civic tables.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='issues' and policyname='issues_select_all') then
    create policy issues_select_all on public.issues for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='issues' and policyname='issues_insert_all') then
    create policy issues_insert_all on public.issues for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='issues' and policyname='issues_update_all') then
    create policy issues_update_all on public.issues for update using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='upvotes' and policyname='upvotes_select_all') then
    create policy upvotes_select_all on public.upvotes for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='upvotes' and policyname='upvotes_insert_all') then
    create policy upvotes_insert_all on public.upvotes for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='upvotes' and policyname='upvotes_delete_all') then
    create policy upvotes_delete_all on public.upvotes for delete using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='downvotes' and policyname='downvotes_select_all') then
    create policy downvotes_select_all on public.downvotes for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='downvotes' and policyname='downvotes_insert_all') then
    create policy downvotes_insert_all on public.downvotes for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='downvotes' and policyname='downvotes_delete_all') then
    create policy downvotes_delete_all on public.downvotes for delete using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='comments' and policyname='comments_select_all') then
    create policy comments_select_all on public.comments for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='comments' and policyname='comments_insert_all') then
    create policy comments_insert_all on public.comments for insert with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='issue_events' and policyname='issue_events_select_all') then
    create policy issue_events_select_all on public.issue_events for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='issue_events' and policyname='issue_events_insert_all') then
    create policy issue_events_insert_all on public.issue_events for insert with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='departments' and policyname='departments_select_all') then
    create policy departments_select_all on public.departments for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='departments' and policyname='departments_update_all') then
    create policy departments_update_all on public.departments for update using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='resolutions' and policyname='resolutions_select_all') then
    create policy resolutions_select_all on public.resolutions for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='resolutions' and policyname='resolutions_insert_all') then
    create policy resolutions_insert_all on public.resolutions for insert with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='escalations' and policyname='escalations_select_all') then
    create policy escalations_select_all on public.escalations for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='escalations' and policyname='escalations_insert_all') then
    create policy escalations_insert_all on public.escalations for insert with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='users' and policyname='users_select_all') then
    create policy users_select_all on public.users for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='users' and policyname='users_insert_all') then
    create policy users_insert_all on public.users for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='users' and policyname='users_update_all') then
    create policy users_update_all on public.users for update using (true) with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_select_all') then
    create policy profiles_select_all on public.profiles for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_insert_all') then
    create policy profiles_insert_all on public.profiles for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_update_all') then
    create policy profiles_update_all on public.profiles for update using (true) with check (true);
  end if;
end $$;

-- Storage object policies for app mode.
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='objects_select_public_nagarwatch'
  ) then
    create policy objects_select_public_nagarwatch
    on storage.objects
    for select
    using (bucket_id in ('issue-images', 'resolution-proofs'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='objects_insert_public_nagarwatch'
  ) then
    create policy objects_insert_public_nagarwatch
    on storage.objects
    for insert
    with check (bucket_id in ('issue-images', 'resolution-proofs'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='objects_update_public_nagarwatch'
  ) then
    create policy objects_update_public_nagarwatch
    on storage.objects
    for update
    using (bucket_id in ('issue-images', 'resolution-proofs'))
    with check (bucket_id in ('issue-images', 'resolution-proofs'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='objects_delete_public_nagarwatch'
  ) then
    create policy objects_delete_public_nagarwatch
    on storage.objects
    for delete
    using (bucket_id in ('issue-images', 'resolution-proofs'));
  end if;
end $$;
