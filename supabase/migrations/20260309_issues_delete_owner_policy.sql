-- Allows users to delete only issues they created.

alter table public.issues enable row level security;

do $$
begin
  if exists (
    select 1
    from pg_policies
    where schemaname='public'
      and tablename='issues'
      and policyname='issues_delete_all'
  ) then
    drop policy issues_delete_all on public.issues;
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname='public'
      and tablename='issues'
      and policyname='issues_delete_own'
  ) then
    create policy issues_delete_own
      on public.issues
      for delete
      using (created_by = auth.uid()::text);
  end if;
end $$;
