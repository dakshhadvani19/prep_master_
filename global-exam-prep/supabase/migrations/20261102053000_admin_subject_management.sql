begin;

create table if not exists private.subject_catalog_metadata (
    subject_id bigint primary key references public."Subjects"("SubjectId") on delete cascade,
    subject_code text not null,
    subject_type text not null check (subject_type in ('theory', 'practical', 'both')),
    syllabus_text text not null check (char_length(btrim(syllabus_text)) >= 50 and char_length(syllabus_text) <= 30000),
    source_file_name text not null,
    source_object_path text not null,
    page_count integer check (page_count is null or page_count >= 1),
    word_count integer not null check (word_count >= 1),
    created_by uuid not null references auth.users(id),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table private.subject_catalog_metadata enable row level security;
revoke all on private.subject_catalog_metadata from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update, delete on private.subject_catalog_metadata to service_role;

create or replace function public.pm_admin_subject_create(
    p_admin_auth_uid uuid,
    p_subject_id bigint,
    p_subject_name text,
    p_subject_code text,
    p_course_id bigint,
    p_semester integer,
    p_is_departmental boolean,
    p_subject_type text,
    p_syllabus_text text,
    p_file_name text,
    p_file_extension text,
    p_mime_type text,
    p_size_bytes bigint,
    p_object_path text,
    p_page_count integer,
    p_word_count integer
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $function$
declare
    v_subject public."Subjects";
    v_upload private.admin_course_uploads;
begin
    if not exists (select 1 from public."Admins" a where a.auth_uid = p_admin_auth_uid) then
        raise exception 'not_authorized' using errcode = '42501';
    end if;

    if p_subject_id is null or p_subject_id <= 0
       or length(btrim(coalesce(p_subject_name, ''))) < 2
       or length(p_subject_name) > 180
       or length(btrim(coalesce(p_subject_code, ''))) < 2
       or length(p_subject_code) > 40
       or p_subject_type not in ('theory', 'practical', 'both')
       or p_semester < 0 or p_semester > 20
       or length(coalesce(p_syllabus_text, '')) < 50
       or length(p_syllabus_text) > 30000
       or p_file_extension not in ('pdf', 'docx')
       or p_size_bytes < 1 or p_size_bytes > 20971520
       or p_page_count is null or p_page_count < 1
       or p_word_count is null or p_word_count < 1
       or p_object_path not like 'subjects/new/%'
       or (p_file_extension = 'pdf' and p_mime_type <> 'application/pdf')
       or (p_file_extension = 'docx' and p_mime_type <> 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') then
        raise exception 'invalid_subject_metadata' using errcode = '22023';
    end if;

    if not exists (
        select 1 from public."Courses" c
        where c."CourseId" = p_course_id and p_semester = any(c."Sems")
    ) then
        raise exception 'course_semester_mismatch' using errcode = '22023';
    end if;

    insert into public."Subjects" (
        "SubjectId", "SubjectName", "CourseId", "Semester", "isDepartmentalSubject"
    ) values (
        p_subject_id, btrim(p_subject_name), p_course_id, p_semester, coalesce(p_is_departmental, false)
    ) returning * into v_subject;

    insert into private.subject_catalog_metadata (
        subject_id, subject_code, subject_type, syllabus_text,
        source_file_name, source_object_path, page_count, word_count, created_by
    ) values (
        p_subject_id, upper(btrim(p_subject_code)), p_subject_type, p_syllabus_text,
        p_file_name, p_object_path, p_page_count, p_word_count, p_admin_auth_uid
    );

    insert into private.admin_course_uploads (
        subject_id, course_id, semester, kind, exam_type,
        file_name, file_extension, mime_type, size_bytes, object_path,
        status, is_active, page_count, word_count, preview_text, validation_details,
        created_by, uploaded_at, validated_at, activated_at
    ) values (
        p_subject_id, p_course_id, p_semester, 'syllabus', null,
        p_file_name, p_file_extension, p_mime_type, p_size_bytes, p_object_path,
        'active', true, p_page_count, p_word_count, left(p_syllabus_text, 4000),
        jsonb_build_object('extracted_text', true, 'direct_subject_creation', true),
        p_admin_auth_uid, now(), now(), now()
    ) returning * into v_upload;

    return jsonb_build_object(
        'subject', to_jsonb(v_subject),
        'upload', jsonb_build_object(
            'id', v_upload.id,
            'status', v_upload.status,
            'is_active', v_upload.is_active,
            'file_name', v_upload.file_name,
            'page_count', v_upload.page_count,
            'word_count', v_upload.word_count
        )
    );
end;
$function$;

create or replace function public.pm_admin_subject_remove(
    p_admin_auth_uid uuid,
    p_subject_id bigint,
    p_course_id bigint,
    p_semester integer
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $function$
declare
    v_paths text[];
    v_subject public."Subjects";
begin
    if not exists (select 1 from public."Admins" a where a.auth_uid = p_admin_auth_uid) then
        raise exception 'not_authorized' using errcode = '42501';
    end if;

    select * into v_subject
    from public."Subjects"
    where "SubjectId" = p_subject_id
      and "CourseId" = p_course_id
      and "Semester" = p_semester
    for update;

    if not found then
        raise exception 'subject_not_found' using errcode = 'P0002';
    end if;

    if exists (select 1 from public."Leaderboards" where "SubjectId" = p_subject_id)
       or exists (select 1 from private.exam_attempts where subject_id = p_subject_id)
       or exists (select 1 from private.leaderboard_attempt_results where subject_id = p_subject_id)
       or exists (select 1 from private.question_banks where subject_id = p_subject_id)
       or exists (
            select 1 from private.question_banks b
            join private.admin_course_uploads u on u.id = b.source_upload_id
            where u.subject_id = p_subject_id
       ) then
        raise exception 'subject_has_exam_or_question_history' using errcode = '23503';
    end if;

    select coalesce(array_agg(distinct object_path), array[]::text[])
    into v_paths
    from (
        select u.object_path
        from private.admin_course_uploads u
        where u.subject_id = p_subject_id and u.object_path is not null
        union all
        select m.source_object_path
        from private.subject_catalog_metadata m
        where m.subject_id = p_subject_id and m.source_object_path is not null
    ) paths;

    delete from private.admin_course_uploads where subject_id = p_subject_id;
    delete from public."Subjects" where "SubjectId" = p_subject_id;

    return jsonb_build_object('subject_id', p_subject_id, 'object_paths', to_jsonb(v_paths));
end;
$function$;

create or replace function public.pm_get_subject_syllabus(p_subject_id bigint)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth, pg_temp
as $function$
declare
    v_result jsonb;
begin
    if auth.uid() is null then
        raise exception 'authentication_required' using errcode = '42501';
    end if;

    select jsonb_build_object(
        'subject_id', m.subject_id,
        'subject_code', m.subject_code,
        'subject_type', m.subject_type,
        'syllabus_text', m.syllabus_text,
        'source_file_name', m.source_file_name,
        'page_count', m.page_count,
        'word_count', m.word_count
    )
    into v_result
    from private.subject_catalog_metadata m
    where m.subject_id = p_subject_id;

    return v_result;
end;
$function$;

revoke all on function public.pm_admin_subject_create(uuid,bigint,text,text,bigint,integer,boolean,text,text,text,text,text,bigint,text,integer,integer) from public, anon, authenticated;
revoke all on function public.pm_admin_subject_remove(uuid,bigint,bigint,integer) from public, anon, authenticated;
grant execute on function public.pm_admin_subject_create(uuid,bigint,text,text,bigint,integer,boolean,text,text,text,text,text,bigint,text,integer,integer) to service_role;
grant execute on function public.pm_admin_subject_remove(uuid,bigint,bigint,integer) to service_role;

revoke all on function public.pm_get_subject_syllabus(bigint) from public, anon;
grant execute on function public.pm_get_subject_syllabus(bigint) to authenticated;

comment on table private.subject_catalog_metadata is
    'Private subject metadata and full extracted syllabus text created through the admin subject add flow.';
comment on function public.pm_get_subject_syllabus(bigint) is
    'Returns extracted syllabus content for a subject to signed-in users only.';

commit;
notify pgrst, 'reload schema';
