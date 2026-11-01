begin;

create or replace function public.pm_admin_subject_dependency_counts(p_subject_id bigint)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
    select jsonb_build_object(
        'Leaderboards', (
            select count(*) from public."Leaderboards" where "SubjectId" = p_subject_id
        ),
        'leaderboard_attempt_results', (
            select count(*) from private.leaderboard_attempt_results where subject_id = p_subject_id
        ),
        'exam_attempts', (
            select count(*) from private.exam_attempts where subject_id = p_subject_id
        ),
        'admin_course_uploads', (
            select count(*) from private.admin_course_uploads where subject_id = p_subject_id
        ),
        'question_banks', (
            select count(*) from private.question_banks where subject_id = p_subject_id
        )
    );
$$;

revoke all on function public.pm_admin_subject_dependency_counts(bigint) from public, anon, authenticated;
grant execute on function public.pm_admin_subject_dependency_counts(bigint) to service_role;

create or replace function public.pm_student_active_subject_syllabus(p_subject_id bigint)
returns table (
    file_name text,
    preview_text text,
    word_count integer,
    activated_at timestamptz
)
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
    select u.file_name, u.preview_text, u.word_count, u.activated_at
    from private.admin_co¶»§q«^