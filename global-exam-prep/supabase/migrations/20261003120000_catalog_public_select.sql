-- ==========================================================================
-- Public read-only SELECT on the existing catalog tables.
-- ==========================================================================
--
-- WHY THIS EXISTS
--   The student catalog (Department → Courses → Subjects) reads
--   public."Courses" and public."Subjects" from the browser with the anon /
--   publishable key. Those tables already exist in the hosted project.
--   This file does NOT create tables, add a semester column, or change
--   identifiers. It only enables RLS (if needed) and adds SELECT policies.
--
-- SECURITY MODEL
--   * Catalog rows are public information (course names, subject names).
--   * SELECT granted to anon and authenticated.
--   * No INSERT / UPDATE / DELETE grants.
--   * RLS stays enabled.
--   * No service_role usage.
--
-- APPLY: SQL Editor -> Run, or supabase db push.
-- Idempotent. Does not execute itself.
-- Does not run destructive SQL.

begin;

do $$
begin
    if to_regclass('public."Courses"') is null then
        raise exception
            'public."Courses" is missing. Create the catalog tables before applying catalog_public_select.';
    end if;
    if to_regclass('public."Subjects"') is null then
        raise exception
            'public."Subjects" is missing. Create the catalog tables before applying catalog_public_select.';
    end if;
end $$;

grant select on table public."Courses" to anon, authenticated;
grant select on table public."Subjects" to anon, authenticated;

alter table public."Courses" enable row level security;
alter table public."Subjects" enable row level security;

drop policy if exists courses_public_select on public."Courses";
create policy courses_public_select
    on public."Courses"
    for select
    to anon, authenticated
    using (true);

drop policy if exists subjects_public_select on public."Subjects";
create policy subjects_public_select
    on public."Subjects"
    for select
    to anon, authenticated
    using (true);

commit;