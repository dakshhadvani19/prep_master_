begin;

-- Standardize every canonical subject name and enforce the same format on
-- future inserts and name edits, regardless of which authorized write path is used.
create or replace function private.pm_normalize_subject_name_title_case()
returns trigger
language plpgsql
set search_path = pg_catalog
as $function$
begin
    new."SubjectName" := pg_catalog.initcap(pg_catalog.btrim(new."SubjectName"));
    return new;
end;
$function$;

revoke all on function private.pm_normalize_subject_name_title_case() from public, anon, authenticated;

drop trigger if exists subjects_normalize_subject_name_title_case on public."Subjects";

create trigger subjects_normalize_subject_name_title_case
before insert or update of "SubjectName"
on public."Subjects"
for each row
execute function private.pm_normalize_subject_name_title_case();

update public."Subjects"
set "SubjectName" = pg_catalog.initcap(pg_catalog.btrim("SubjectName"))
where "SubjectName" is distinct from pg_catalog.initcap(pg_catalog.btrim("SubjectName"));

commit;
