begin;

create table if not exists private.admin_course_uploads (
    id uuid primary key default gen_random_uuid(),
    subject_id bigint not null,
    course_id bigint not null,
    semester integer not null check (semester between 0 and 20),
    kind text not null check (kind in ('syllabus', 'question_bank')),
    exam_type text,
    file_name text not null check (length(file_name) between 1 and 180),
    file_extension text not null check (file_extension in ('pdf', 'docx', 'csv')),
    mime_type text not null check (mime_type in (
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/csv'
    )),
    size_bytes bigint not null check (size_bytes between 1 and 20971520),
    object_path text not null unique,
    status text not null default 'uploading' check (status in (
        'uploading', 'validating', 'needs_confirmation',
        'validated_waiting_phase3', 'active', 'superseded', 'failed'
    )),
    is_active boolean not null default false,
    page_count integer check (page_count is null or page_count >= 0),
    word_count integer check (word_count is null or word_count >= 0),
    row_count integer check (row_count is null or row_count >= 0),
    preview_text text,
    validation_details jsonb not null default '{}'::jsonb,
    error_message text,
    created_by uuid not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    uploaded_at timestamptz,
    validated_at timestamptz,
    activated_at timestamptz,
    constraint admin_course_upload_kind_exam_type_check check (
        (kind = 'syllabus' and exam_type is null)
        or (kind = 'question_bank' and exam_type is not null)
    ),
    constraint admin_course_upload_active_kind_check check (
        not is_active or (kind = 'syllabus' and status = 'active')
    )
);

create index if not exists admin_course_uploads_subject_created_idx
    on private.admin_course_uploads (subject_id, created_at desc);

create unique index if not exists admin_course_uploads_one_active_syllabus_idx
    on private.admin_course_uploads (subject_id)
    where kind = 'syllabus' and is_active;

alter table private.admin_course_uploads enable row level security;
revoke all on private.admin_course_uploads from public, anon, authenticated;
grant usage on schema private to service_role;
grant select, insert, update, delete on private.admin_course_uploads to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'admin-course-files',
    'admin-course-files',
    false,
    20971520,
    array[
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/csv'
    ]
)
on conflict (id) do update set
    name = excluded.name,
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists pm_admin_course_upload_insert on storage.objects;
create policy pm_admin_course_upload_insert
    on storage.objects
    for insert
    to authenticated
    with check (
        bucket_id = 'admin-course-files'
        and public."current_role"() in ('admin', 'superAdmin')
        and (storage.foldername(name))[1] = 'subjects'
    );

create or replace function public.pm_admin_course_upload_create(
    p_admin_auth_uid uuid,
    p_subject_id bigint,
    p_course_id bigint,
    p_semester integer,
    p_kind text,
    p_exam_type text,
    p_file_name text,
    p_file_extension text,
    p_mime_type text,
    p_size_bytes bigint,
    p_object_path text
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
    v_row private.admin_course_uploads;
begin
    if not exists (select 1 from public."Admins" a where a.auth_uid = p_admin_auth_uid) then
        raise exception 'not_authorized' using errcode = '42501';
    end if;

    if not exists (
        select 1 from public."Subjects" s
        where s."SubjectId" = p_subject_id
          and s."CourseId" = p_course_id
          and s."Semester" = p_semester
    ) then
        raise exception 'subject_course_semester_mismatch' using errcode = '22023';
    end if;

    if p_kind not in ('syllabus', 'question_bank')
       or (p_kind = 'syllabus' and p_exam_type is not null)
       or (p_kind = 'question_bank' and nullif(trim(p_exam_type), '') is null) then
        raise exception 'invalid_upload_kind_or_exam_type' using errcode = '22023';
    end if;

    if p_size_bytes < 1 or p_size_bytes > 20971520
       or p_file_extension not in ('pdf', 'docx', 'csv')
       or length(trim(coalesce(p_file_name, ''))) < 1
       or length(p_file_name) > 180
       or p_mime_type not in (
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/csv'
       )
       or p_object_path not like ('subjects/' || p_subject_id::text || '/%') then
        raise exception 'invalid_upload_metadata' using errcode = '22023';
    end if;

    if (p_kind = 'syllabus' and p_file_extension not in ('pdf', 'docx'))
       or (p_kind = 'question_bank' and p_file_extension not in ('pdf', 'docx', 'csv')) then
        raise exception 'unsupported_file_for_upload_kind' using errcode = '22023';
    end if;

    insert into private.admin_course_uploads (
        subject_id, course_id, semester, kind, exam_type,
        file_name, file_extension, mime_type, size_bytes,
        object_path, created_by
    )
    values (
        p_subject_id, p_course_id, p_semester, p_kind, nullif(trim(p_exam_type), ''),
        p_file_name, p_file_extension, p_mime_type, p_size_bytes,
        p_object_path, p_admin_auth_uid
    )
    returning * into v_row;

    return to_jsonb(v_row);
end;
$function$;

create or replace function public.pm_admin_course_upload_list(
    p_admin_auth_uid uuid,
    p_subject_id bigint
) returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
    v_result jsonb;
begin
    if not exists (select 1 from public."Admins" a where a.auth_uid = p_admin_auth_uid) then
        raise exception 'not_authorized' using errcode = '42501';
    end if;

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'id', u.id,
                'subject_id', u.subject_id,
                'course_id', u.course_id,
                'semester', u.semester,
                'kind', u.kind,
                'exam_type', u.exam_type,
                'file_name', u.file_name,
                'file_extension', u.file_extension,
                'mime_type', u.mime_type,
                'size_bytes', u.size_bytes,
                'object_path', u.object_path,
                'status', u.status,
                'is_active', u.is_active,
                'page_count', u.page_count,
                'word_count', u.word_count,
                'row_count', u.row_count,
                'preview_text', u.preview_text,
                'validation_details', u.validation_details,
                'error_message', u.error_message,
                'created_at', u.created_at,
                'updated_at', u.updated_at,
                'uploaded_at', u.uploaded_at,
                'validated_at', u.validated_at,
                'activated_at', u.activated_at
            ) order by u.created_at desc
        ),
        '[]'::jsonb
    )
    into v_result
    from private.admin_course_uploads u
    where u.subject_id = p_subject_id;

    return v_result;
end;
$function$;

create or replace function public.pm_admin_course_upload_set_validation(
    p_admin_auth_uid uuid,
    p_upload_id uuid,
    p_status text,
    p_validation_details jsonb default '{}'::jsonb,
    p_preview_text text default null,
    p_page_count integer default null,
    p_word_count integer default null,
    p_row_count integer default null,
    p_error_message text default null
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
    v_row private.admin_course_uploads;
begin
    if not exists (select 1 from public."Admins" a where a.auth_uid = p_admin_auth_uid) then
        raise exception 'not_authorized' using errcode = '42501';
    end if;

    if p_status not in (
        'validating', 'needs_confirmation', 'validated_waiting_phase3', 'failed'
    ) then
        raise exception 'invalid_upload_status' using errcode = '22023';
    end if;

    update private.admin_course_uploads u
    set status = p_status,
        is_active = false,
        validation_details = coalesce(p_validation_details, '{}'::jsonb),
        preview_text = left(p_preview_text, 4000),
        page_count = p_page_count,
        word_count = p_word_count,
        row_count = p_row_count,
        error_message = case when p_status = 'failed' then left(p_error_message, 500) else null end,
        updated_at = now(),
        uploaded_at = case when p_status in ('validating', 'needs_confirmation', 'validated_waiting_phase3') then coalesce(u.uploaded_at, now()) else u.uploaded_at end,
        validated_at = case when p_status in ('needs_confirmation', 'validated_waiting_phase3') then now() else u.validated_at end
    where u.id = p_upload_id
      and u.status in ('uploading', 'validating')
      and not u.is_active
    returning * into v_row;

    if not found then
        raise exception 'upload_not_found_or_not_retryable' using errcode = 'P0002';
    end if;

    if (p_status = 'needs_confirmation' and v_row.kind <> 'syllabus')
       or (p_status = 'validated_waiting_phase3' and v_row.kind <> 'question_bank') then
        raise exception 'invalid_status_for_upload_kind' using errcode = '22023';
    end if;

    return to_jsonb(v_row);
end;
$function$;

create or replace function public.pm_admin_course_upload_confirm_syllabus(
    p_admin_auth_uid uuid,
    p_upload_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, private, pg_temp
as $function$
declare
    v_target private.admin_course_uploads;
begin
    if not exists (select 1 from public."Admins" a where a.auth_uid = p_admin_auth_uid) then
        raise exception 'not_authorized' using errcode = '42501';
    end if;

    select * into v_target
    from private.admin_course_uploads
    where id = p_upload_id
    for update;

    if not found
       or v_target.kind <> 'syllabus'
       or v_target.status <> 'needs_confirmation'
       or v_target.validated_at is null then
        raise exception 'syllabus_not_ready_for_confirmation' using errcode = 'P0002';
    end if;

    update private.admin_course_uploads
    set is_active = false,
        status = 'superseded',
        updated_at = now()
    where subject_id = v_target.subject_id
      and kind = 'syllabus'
      and is_active = true;

    update private.admin_course_uploads
    set is_active = true,
        status = 'active',
        activated_at = now(),
        updated_at = now(),
        error_message = null
    where id = p_upload_id
    returning * into v_target;

    return to_jsonb(v_target);
end;
$function$;

revoke all on function public.pm_admin_course_upload_create(uuid,bigint,bigint,integer,text,text,text,text,text,bigint,text) from public, anon, authenticated;
revoke all on function public.pm_admin_course_upload_list(uuid,bigint) from public, anon, authenticated;
revoke all on function public.pm_admin_course_upload_set_validation(uuid,uuid,text,jsonb,text,integer,integer,integer,text) from public, anon, authenticated;
revoke all on function public.pm_admin_course_upload_confirm_syllabus(uuid,uuid) from public, anon, authenticated;

grant execute on function public.pm_admin_course_upload_create(uuid,bigint,bigint,integer,text,text,text,text,text,bigint,text) to service_role;
grant execute on function public.pm_admin_course_upload_list(uuid,bigint) to service_role;
grant execute on function public.pm_admin_course_upload_set_validation(uuid,uuid,text,jsonb,text,integer,integer,integer,text) to service_role;
grant execute on function public.pm_admin_course_upload_confirm_syllabus(uuid,uuid) to service_role;

commit;
notify pgrst, 'reload schema';
