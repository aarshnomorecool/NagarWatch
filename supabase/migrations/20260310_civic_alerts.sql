-- Adds authority-created civic emergency alerts.

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  lat double precision not null,
  lng double precision not null,
  radius_km double precision not null default 2,
  authority_id text not null,
  created_at timestamptz not null default now(),
  constraint alerts_radius_positive check (radius_km > 0)
);

create index if not exists idx_alerts_created_at on public.alerts(created_at desc);
create index if not exists idx_alerts_location on public.alerts(lat, lng);

alter table public.alerts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='alerts' and policyname='alerts_select_all'
  ) then
    create policy alerts_select_all on public.alerts for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='alerts' and policyname='alerts_insert_all'
  ) then
    create policy alerts_insert_all on public.alerts for insert with check (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'alerts'
  ) then
    execute 'alter publication supabase_realtime add table public.alerts';
  end if;
end $$;
