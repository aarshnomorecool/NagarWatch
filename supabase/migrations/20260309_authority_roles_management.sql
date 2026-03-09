-- Adds admin-managed authority role assignments and username support.

alter table public.users add column if not exists username text;

create table if not exists public.authority_roles (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  username text not null,
  role text not null check (role in ('authority', 'admin')) default 'authority',
  authority_level text not null check (authority_level in ('ward', 'zone', 'city', 'state')) default 'ward',
  active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists idx_authority_roles_email on public.authority_roles(email);

alter table public.authority_roles enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='authority_roles' and policyname='authority_roles_select_all') then
    create policy authority_roles_select_all on public.authority_roles for select using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='authority_roles' and policyname='authority_roles_insert_all') then
    create policy authority_roles_insert_all on public.authority_roles for insert with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='authority_roles' and policyname='authority_roles_update_all') then
    create policy authority_roles_update_all on public.authority_roles for update using (true) with check (true);
  end if;
end $$;
