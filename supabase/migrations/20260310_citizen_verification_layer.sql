-- Adds citizen verification on resolved issues with auto-reopen threshold support.

create table if not exists public.issue_verifications (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  user_id text not null,
  verdict text not null,
  note text,
  created_at timestamptz not null default now(),
  constraint issue_verifications_verdict_check
    check (verdict in ('fully_fixed', 'partially_fixed', 'not_fixed')),
  unique(issue_id, user_id)
);

create index if not exists idx_issue_verifications_issue_id on public.issue_verifications(issue_id);
create index if not exists idx_issue_verifications_verdict on public.issue_verifications(verdict);

alter table public.issue_verifications enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'issue_verifications'
      and policyname = 'issue_verifications_select_all'
  ) then
    create policy issue_verifications_select_all
      on public.issue_verifications
      for select
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'issue_verifications'
      and policyname = 'issue_verifications_insert_all'
  ) then
    create policy issue_verifications_insert_all
      on public.issue_verifications
      for insert
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'issue_verifications'
      and policyname = 'issue_verifications_update_all'
  ) then
    create policy issue_verifications_update_all
      on public.issue_verifications
      for update
      using (true)
      with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'issue_verifications'
  ) then
    execute 'alter publication supabase_realtime add table public.issue_verifications';
  end if;
end $$;
