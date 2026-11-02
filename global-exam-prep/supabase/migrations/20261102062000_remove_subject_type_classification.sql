begin;

-- Subject classification is controlled only by isDepartmentalSubject.
-- Remove the obsolete metadata field without changing any public catalog IDs.
drop function if exists public.pm_admin_subject_create(
    uuid, bigint, text, text, bigint, integer, boolean, text, text,
    text, text, text, bigint, text, integer, integer
);

create function public.pm_admin_subject_create(
    p_admin_auth_uid uuid,
    p_subject_id bigint,
    p_subject_name text,
    p_subject_code text,
    p_course_id bigint,
    p_semester integer,
    p_is_departmental boolean,
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
    v_is_active boolean;
    v_restored boolean := false;
begin
    if not exists (select 1 from public."Admins" a where a.auth_uid = p_admin_auth_uid) then
        raise exception 'not_authorized' using errcode = '42501';
    end if;

    if p_subject_id is null or p_subject_id <= 0
       or length(btrim(coalesce(p_subject_name, ''))) < 2
       or length(p_subject_name) > 180
       or length(btrim(coalesce(p_subject_code, ''))) < 2
       or length(p_subject_code) > 40
       or p_semester < 0 or p_semester > 20
       or length(coalesce(p_syllabus_text, '')) < 50
       or length(p_syllabus_text) > 30000
       or p_file_extension not in ('pdf', 'docx')
       or p_size_bytes < 1 or p_size_bytes > 20971520
       or (p_page_count is not null and p_page_count < 1)
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

    select * into v_subject
    from public."Subjects"
    where "SubjectId" = p_subject_id
    for update;

    if found then
        if v_subject."CourseId" <> p_course_id or v_subject."Semester" <> p_semester then
            raise exception 'subject_identity_conflict' using errcode = '23505';
        end if;

        select s.is_active into v_is_active
        from private.subject_catalog_status s
        where s.subject_id = p_subject_id
        for update;

        if coalesce(v_is_active, true) then
            raise exception 'subject_already_active' using errcode = '23505';
        end if;

        v_restored := true;
        update public."Subjects"
        set "SubjectName" = btrim(p_subject_name),
            "isDepartmentalSubject" = coalesce(p_is_departmental, false)
        where "SubjectId" = p_subject_id
        returning * into v_subject;

        insert into private.subject_catalog_status (
            subject_id, is_active, restored_at, restored_by, updated_at, updated_by
        ) values (
            p_subject_id, true, now(), p_admin_auth_uid, now(), p_admin_auth_uid
        )
        on conflict (subject_id) do update
        set is_active = true,
            restored_at = excluded.restored_at,
            restored_by = excluded.restored_by,
            updated_at = excluded.updated_at,
            updated_by = excluded.updated_by;
    else
        insert into public."Subjects" (
            "SubjectId", "SubjectName", "CourseId", "Semester", "isDepartmentalSubject"
        ) values (
            p_subject_id, btrim(p_subject_name), p_course_id, p_semester, coalesce(p_is_departmental, false)
        ) returning * into v_subject;

        insert into private.subject_catalog_status (
            subject_id, is_active, restored_at, restored_by, updated_at, updated_by
        ) values (
            p_subject_id, true, now(), p_admin_auth_uid, now(), p_admin_auth_uid
        )
        on conflict (subject_id) do update
        set is_active = true,
            restored_at = excluded.restored_at,
            restored_by = excluded.restored_by,
            updated_at = excluded.updated_at,
            updated_by = excluded.updated_by;
    end if;

    insert into private.subject_catalog_metadata (
        subject_id, subject_code, syllabus_text,
        source_file_name, source_object_path, page_count, word_count, created_by, updated_at
    ) values (
        p_subject_id, upper(btrim(p_subject_code)), p_syllabus_text,
        p_file_name, p_object_path, p_page_count, p_word_count, p_admin_auth_uid, now()
    )
    on conflict (subject_id) do update
    set subject_code = excluded.subject_code,
        syllabus_text = excluded.syllabus_text,
        source_file_name = excluded.source_file_name,
        source_object_path = excluded.source_object_path,
        page_count = excluded.page_count,
        word_count = excluded.word_count,
        updated_at = excluded.updated_at;

    update private.admin_course_uploads
    set status = 'superseded', is_active = false
    where subject_id = p_subject_id
      and kind = 'syllabus'
      and is_active = true;

    insert into private.admin_course_uploads (
        subject_id, course_id, semester, kind, exam_type,
        file_name, file_extension, mime_type, size_bytes, object_path,
        status, is_active, page_count, word_count, preview_text, validation_details,
        created_by, uploaded_at, validated_at, activated_at
    ) values (
        p_subject_id, p_course_id, p_semester, 'syllabus', null,
        p_file_name, p_file_extension, p_mime_type, p_size_bytes, p_object_path,
        'active', true, p_page_count, p_word_count, left(p_syllabus_text, 4000),
        jsonb_build_object('extracted_text', true, 'direct_subject_creation', true, 'restored_existing_subject', v_restored),
        p_admin_auth_uid, now(), now(), now()
    ) returning * into v_upload;

    return jsonb_build_object(
        'restored', v_restored,
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

revoke all on function public.pm_admin_subject_create(
    uuid, bigint, text, text, bigint, integer, boolean, text,
    text, text, text, bigint, text, integer, integer
) from public, anon, authenticated;
grant execute on function public.pm_admin_subject_create(
    uuid, bigint, text, text, bigint, integer, boolean, text,
    text, text, text, bigint, text, integer, integer
) to service_role;

-- Existing metadata values are no longer used by the application.
alter table private.subject_catalog_metadata
    drop column if exists subject_type;

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
        'syllabus_text', m.syllabus_text,
        'source_file_name', m.source_file_name,
        'page_count', m.page_count,
        'word_count', m.word_count
    )
    into v_result
    from private.subject_catalog_metadata m
    join private.subject_catalog_status status
      on status.subject_id = m.subject_id and status.is_active = true
    where m.subject_id = p_subject_id;

    return v_result;
end;
$function$;

revoke all on function public.pm_get_subject_syllabus(bigint) from public, anon;
grant execute on function public.pm_get_subject_syllabus(bigint) to authenticated;

comment on table private.subject_catalog_metadata is
    'Private subject metadata and full extracted syllabus text. Departmental status is stored only on the canonical public Subjects row.';

commit;
notify pgrst, 'reload schema';
