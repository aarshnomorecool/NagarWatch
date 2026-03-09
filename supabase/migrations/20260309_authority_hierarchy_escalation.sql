-- Adds authority hierarchy fields and assignment-based escalation support.

alter table public.users add column if not exists authority_level text;
alter table public.users drop constraint if exists users_authority_level_check;
alter table public.users
add constraint users_authority_level_check
check (authority_level is null or authority_level in ('ward', 'zone', 'city', 'state'));

alter table public.issues add column if not exists assigned_authority_level text not null default 'ward';
alter table public.issues add column if not exists escalation_level integer not null default 0;
alter table public.issues add column if not exists last_escalated_at timestamptz;
alter table public.issues drop constraint if exists issues_assigned_authority_level_check;
alter table public.issues
add constraint issues_assigned_authority_level_check
check (assigned_authority_level in ('ward', 'zone', 'city', 'state'));

alter table public.escalations add column if not exists escalated_to_level text not null default 'ward';
alter table public.escalations drop constraint if exists escalations_escalated_to_level_check;
alter table public.escalations
add constraint escalations_escalated_to_level_check
check (escalated_to_level in ('ward', 'zone', 'city', 'state'));

create index if not exists idx_issues_assigned_authority_level on public.issues(assigned_authority_level);
create index if not exists idx_users_authority_level on public.users(authority_level);
