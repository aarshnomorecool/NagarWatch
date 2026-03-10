-- Civic Participation Leaderboard System
-- Tracks citizen participation points and verified reports

create table if not exists public.citizen_scores (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique,
  username text,
  total_points integer not null default 0,
  verified_reports_count integer not null default 0,
  reports_count integer not null default 0,
  upvotes_given integer not null default 0,
  verifications_given integer not null default 0,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists idx_citizen_scores_total_points on public.citizen_scores(total_points desc);
create index if not exists idx_citizen_scores_user_id on public.citizen_scores(user_id);

-- Point activity log for auditing
create table if not exists public.citizen_point_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  points integer not null,
  transaction_type text not null check (transaction_type in ('reported_issue', 'upvote', 'verification', 'report_verified')),
  reference_id text, -- issue_id or upvote_id or verification_id
  created_at timestamptz not null default now()
);

create index if not exists idx_citizen_point_transactions_user_id on public.citizen_point_transactions(user_id);
create index if not exists idx_citizen_point_transactions_created_at on public.citizen_point_transactions(created_at desc);

alter table public.citizen_scores enable row level security;
alter table public.citizen_point_transactions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='citizen_scores' and policyname='citizen_scores_select_all'
  ) then
    create policy citizen_scores_select_all on public.citizen_scores for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='citizen_scores' and policyname='citizen_scores_insert_all'
  ) then
    create policy citizen_scores_insert_all on public.citizen_scores for insert with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='citizen_scores' and policyname='citizen_scores_update_all'
  ) then
    create policy citizen_scores_update_all on public.citizen_scores for update using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='citizen_point_transactions' and policyname='citizen_point_transactions_select_all'
  ) then
    create policy citizen_point_transactions_select_all on public.citizen_point_transactions for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='citizen_point_transactions' and policyname='citizen_point_transactions_insert_all'
  ) then
    create policy citizen_point_transactions_insert_all on public.citizen_point_transactions for insert with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'citizen_scores'
  ) then
    execute 'alter publication supabase_realtime add table public.citizen_scores';
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'citizen_point_transactions'
  ) then
    execute 'alter publication supabase_realtime add table public.citizen_point_transactions';
  end if;
end $$;
