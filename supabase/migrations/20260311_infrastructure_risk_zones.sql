-- Predictive Infrastructure Risk Zone Detection
-- Automatically detects and flags high-risk areas based on complaint patterns

create table if not exists public.infrastructure_risk_zones (
  id uuid primary key default gen_random_uuid(),
  latitude double precision not null,
  longitude double precision not null,
  radius_meters integer not null default 500,
  risk_type text not null check (risk_type in ('road_hazard', 'drainage', 'electrical', 'water', 'other')) default 'road_hazard',
  risk_level text not null check (risk_level in ('low', 'medium', 'high', 'critical')) default 'low',
  issue_count integer not null default 0,
  last_issue_at timestamptz,
  detected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  description text
);

create index if not exists idx_infrastructure_risk_zones_location on public.infrastructure_risk_zones(latitude, longitude);
create index if not exists idx_infrastructure_risk_zones_risk_level on public.infrastructure_risk_zones(risk_level);
create index if not exists idx_infrastructure_risk_zones_updated_at on public.infrastructure_risk_zones(updated_at desc);

-- Risk zone thresholds for different issue types
create table if not exists public.risk_zone_thresholds (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  min_reports_for_zone integer not null default 5,
  radius_meters integer not null default 500,
  risk_type text not null,
  risk_level_threshold text not null check (risk_level_threshold in ('low', 'medium', 'high', 'critical')),
  created_at timestamptz not null default now()
);

-- Insert default thresholds for critical categories
insert into public.risk_zone_thresholds (category, min_reports_for_zone, radius_meters, risk_type, risk_level_threshold)
values
  ('pothole', 8, 500, 'road_hazard', 'high'),
  ('road_collapse', 3, 500, 'road_hazard', 'critical'),
  ('open_drain', 5, 500, 'drainage', 'high'),
  ('water_leak', 4, 500, 'water', 'medium'),
  ('electric_wire', 3, 500, 'electrical', 'critical'),
  ('street_damage', 6, 500, 'road_hazard', 'medium')
on conflict do nothing;

alter table public.infrastructure_risk_zones enable row level security;
alter table public.risk_zone_thresholds enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='infrastructure_risk_zones' and policyname='infrastructure_risk_zones_select_all'
  ) then
    create policy infrastructure_risk_zones_select_all on public.infrastructure_risk_zones for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='infrastructure_risk_zones' and policyname='infrastructure_risk_zones_insert_all'
  ) then
    create policy infrastructure_risk_zones_insert_all on public.infrastructure_risk_zones for insert with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='infrastructure_risk_zones' and policyname='infrastructure_risk_zones_update_all'
  ) then
    create policy infrastructure_risk_zones_update_all on public.infrastructure_risk_zones for update using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='risk_zone_thresholds' and policyname='risk_zone_thresholds_select_all'
  ) then
    create policy risk_zone_thresholds_select_all on public.risk_zone_thresholds for select using (true);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'infrastructure_risk_zones'
  ) then
    execute 'alter publication supabase_realtime add table public.infrastructure_risk_zones';
  end if;
end $$;
