-- Adds human-readable location metadata for issue reports.

alter table public.issues add column if not exists road_name text;
alter table public.issues add column if not exists landmark text;
alter table public.issues add column if not exists area_name text;
