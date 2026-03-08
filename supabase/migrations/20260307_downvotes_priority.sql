-- Adds social-style downvotes and admin priority escalation signal.

alter table public.issues add column if not exists downvote_count integer not null default 0;
alter table public.issues add column if not exists is_priority boolean not null default false;

create table if not exists public.downvotes (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  user_id text not null,
  created_at timestamptz not null default now(),
  unique(issue_id, user_id)
);

create index if not exists idx_downvotes_issue_id on public.downvotes(issue_id);

alter table public.downvotes enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='downvotes' and policyname='downvotes_select_all') then
    create policy downvotes_select_all on public.downvotes for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='downvotes' and policyname='downvotes_insert_all') then
    create policy downvotes_insert_all on public.downvotes for insert with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='downvotes' and policyname='downvotes_delete_all') then
    create policy downvotes_delete_all on public.downvotes for delete using (true);
  end if;
end $$;

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

alter table public.issue_events drop constraint if exists issue_events_event_type_check;
alter table public.issue_events
add constraint issue_events_event_type_check
check (event_type in ('reported', 'upvote', 'downvote', 'priority', 'assigned', 'in_progress', 'resolved', 'comment', 'resolution_proof'));

-- Realtime publication registration (idempotent).
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'downvotes'
  ) then
    execute 'alter publication supabase_realtime add table public.downvotes';
  end if;
end $$;
