-- Adds issue follows, in-app notifications, reopen workflow fields, and SLA target support.

alter table public.issues add column if not exists sla_target_hours integer not null default 72;
alter table public.issues add column if not exists reopened_at timestamptz;
alter table public.issues add column if not exists reopened_by text;
alter table public.issues add column if not exists reopen_reason text;
alter table public.issues add column if not exists reopen_proof text;

create table if not exists public.issue_follows (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  user_id text not null,
  created_at timestamptz not null default now(),
  unique(issue_id, user_id)
);

create index if not exists idx_issue_follows_issue_id on public.issue_follows(issue_id);
create index if not exists idx_issue_follows_user_id on public.issue_follows(user_id);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  issue_id uuid references public.issues(id) on delete cascade,
  notification_type text not null,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user_id on public.notifications(user_id);
create index if not exists idx_notifications_created_at on public.notifications(created_at desc);

alter table public.issue_follows enable row level security;
alter table public.notifications enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='issue_follows' and policyname='issue_follows_select_all') then
    create policy issue_follows_select_all on public.issue_follows for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='issue_follows' and policyname='issue_follows_insert_all') then
    create policy issue_follows_insert_all on public.issue_follows for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='issue_follows' and policyname='issue_follows_delete_all') then
    create policy issue_follows_delete_all on public.issue_follows for delete using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='notifications' and policyname='notifications_select_all') then
    create policy notifications_select_all on public.notifications for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='notifications' and policyname='notifications_insert_all') then
    create policy notifications_insert_all on public.notifications for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='notifications' and policyname='notifications_update_all') then
    create policy notifications_update_all on public.notifications for update using (true) with check (true);
  end if;
end $$;

alter table public.issue_events drop constraint if exists issue_events_event_type_check;
alter table public.issue_events
add constraint issue_events_event_type_check
check (event_type in ('reported', 'upvote', 'downvote', 'priority', 'assigned', 'in_progress', 'resolved', 'comment', 'resolution_proof', 'reopened'));

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'issue_follows'
  ) then
    execute 'alter publication supabase_realtime add table public.issue_follows';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end $$;
