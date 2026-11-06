begin;

do $$
begin
    if to_regclass('public."Admins"') is null
       or to_regclass('public."Students"') is null
       or to_regclass('public."Feedbacks"') is null
       or to_regclass('public."Subjects"') is null
       or to_regclass('public."Courses"') is null
       or to_regclass('private.exam_attempts') is null then
        raise exception
            'Admin dashboard read models require admins, Students, Feedbacks, Subjects, Courses and private.exam_attempts.';
    end if;
end;
$$;

-- Narrow partial indexes keep repeated dashboard counts and bounded previews cheap.
create index if not exists exam_attempts_dashboard_recent_idx
    on private.exam_attempts (submitted_at desc, subject_id)
    where status in ('submitted', 'auto_submitted', 'disconnected', 'timed_out')
      and submitted_at is not null
      and score is not null
      and total_marks > 0;

create index if not exists feedbacks_dashboard_unseen_idx
    on public."Feedbacks" ("FeedbackId")
    where "isSeen" = false;

create index if not exists feedbacks_dashboard_bookmark_idx
    on public."Feedbacks" ("FeedbackId" desc)
    where "isBookmark" = true;

create index if not exists students_dashboard_spam_idx
    on public."Students" (created_at desc, "StudentId")
    where "IsSpam" = true and role = 'student';


-- Stage 1: compact counts only. This is the first dashboard request.
create or replace function public.admin_get_dashboard_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
    student_count bigint;
    attempts_last_7_days bigint;
    pending_feedback bigint;
    flagged_students bigint;
    bookmarked_feedback bigint;
begin
    if auth.uid() is null or not exists (
        select 1 from public."Admins" a
         where a.auth_uid::text = auth.uid()::text
    ) then
        raise exception 'not_authorized' using errcode = '42501';
    end if;

    select count(*)::bigint into student_count
      from public."Students" s
     where s.role = 'student';

    select count(*)::bigint into attempts_last_7_days
      from private.exam_attempts a
     where a.status in ('submitted', 'auto_submitted', 'disconnected', 'timed_out')
       and a.submitted_at >= now() - interval '7 days'
       and a.submitted_at <= now()
       and a.score is not null
       and a.total_marks > 0;

    select count(*)::bigint into pending_feedback
      from public."Feedbacks" f
     where f."isSeen" = false;

    select count(*)::bigint into flagged_students
      from public."Students" s
     where s."IsSpam" = true and s.role = 'student';

    select count(*)::bigint into bookmarked_feedback
      from public."Feedbacks" f
     where f."isBookmark" = true;

    return jsonb_build_object(
        'students', student_count,
        'attemptsLast7Days', attempts_last_7_days,
        'pendingFeedback', pending_feedback,
        'flaggedStudents', flagged_students,
        'bookmarkedFeedback', bookmarked_feedback
    );
end;
$function$;

alter function public.admin_get_dashboard_overview() owner to postgres;
revoke all on function public.admin_get_dashboard_overview() from public, anon;
grant execute on function public.admin_get_dashboard_overview() to authenticated;


-- Stage 2a: top three subjects by finalized, canonical attempts in the last 7 days.
-- Previous 7 days are included only for a grounded comparison.
create or replace function public.admin_get_dashboard_subject_activity()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
    subject_rows jsonb;
begin
    if auth.uid() is null or not exists (
        select 1 from public."Admins" a
         where a.auth_uid::text = auth.uid()::text
    ) then
        raise exception 'not_authorized' using errcode = '42501';
    end if;

    with recent as (
        select a.subject_id, a.user_id, a.attempt_type, a.submitted_at
          from private.exam_attempts a
         where a.subject_id is not null
           and a.status in ('submitted', 'auto_submitted', 'disconnected', 'timed_out')
           and a.submitted_at >= now() - interval '14 days'
           and a.submitted_at <= now()
           and a.score is not null
           and a.total_marks > 0
    ),
    ranked as (
        select
            s."SubjectId" as subject_id,
            s."SubjectName" as subject_name,
            c."CourseName" as course_name,
            s."Semester" as semester,
            count(*) filter (
                where r.submitted_at >= now() - interval '7 days'
            )::bigint as attempts,
            count(*) filter (
                where r.submitted_at < now() - interval '7 days'
            )::bigint as previous_attempts,
            count(distinct r.user_id) filter (
                where r.submitted_at >= now() - interval '7 days'
            )::bigint as unique_students,
            count(*) filter (
                where r.submitted_at >= now() - interval '7 days'
                  and r.attempt_type = 'exam'
            )::bigint as normal_attempts,
            count(*) filter (
                where r.submitted_at >= now() - interval '7 days'
                  and r.attempt_type = 'test_room'
            )::bigint as test_room_attempts
        from recent r
        join public."Subjects" s on s."SubjectId" = r.subject_id
        join public."Courses" c on c."CourseId" = s."CourseId"
        group by s."SubjectId", s."SubjectName", c."CourseName", s."Semester"
        having count(*) filter (
            where r.submitted_at >= now() - interval '7 days'
        ) > 0
        order by attempts desc, unique_students desc, subject_id
        limit 3
    )
    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'subjectId', subject_id,
                'subjectName', subject_name,
                'courseName', course_name,
                'semester', semester,
                'attempts', attempts,
                'previousAttempts', previous_attempts,
                'uniqueStudents', unique_students,
                'normalAttempts', normal_attempts,
                'testRoomAttempts', test_room_attempts
            )
            order by attempts desc, unique_students desc, subject_id
        ),
        '[]'::jsonb
    )
    into subject_rows
    from ranked;

    return subject_rows;
end;
$function$;

alter function public.admin_get_dashboard_subject_activity() owner to postgres;
revoke all on function public.admin_get_dashboard_subject_activity() from public, anon;
grant execute on function public.admin_get_dashboard_subject_activity() to authenticated;


-- Stage 2b: bounded moderation previews, not the full feedback inbox.
create or replace function public.admin_get_dashboard_moderation_preview(
    p_limit integer default 4
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
    row_limit integer := greatest(1, least(coalesce(p_limit, 4), 6));
    bookmarked_rows jsonb;
    flagged_rows jsonb;
begin
    if auth.uid() is null or not exists (
        select 1 from public."Admins" a
         where a.auth_uid::text = auth.uid()::text
    ) then
        raise exception 'not_authorized' using errcode = '42501';
    end if;

    select coalesce(
        jsonb_agg(item.payload order by item.feedback_id desc),
        '[]'::jsonb
    )
    into bookmarked_rows
    from (
        select
            f."FeedbackId" as feedback_id,
            jsonb_build_object(
                'feedbackId', f."FeedbackId",
                'description', left(f."Description", 190),
                'type', f."Type",
                'isSeen', f."isSeen",
                'isSpam', f."isSpam",
                'studentId', s."StudentId",
                'studentName', s."FullName",
                'studentIsSpam', s."IsSpam"
            ) as payload
        from public."Feedbacks" f
        join public."Students" s on s."StudentId" = f."StudentId"
        where f."isBookmark" = true
        order by f."FeedbackId" desc
        limit row_limit
    ) item;

    select coalesce(
        jsonb_agg(item.payload order by item.created_at desc, item.student_id desc),
        '[]'::jsonb
    )
    into flagged_rows
    from (
        select
            s."StudentId" as student_id,
            s.created_at,
            jsonb_build_object(
                'studentId', s."StudentId",
                'studentName', s."FullName",
                'email', s."Email",
                'feedbackCount', (
                    select count(*)::bigint
                      from public."Feedbacks" f
                     where f."StudentId" = s."StudentId"
                )
            ) as payload
        from public."Students" s
        where s."IsSpam" = true and s.role = 'student'
        order by s.created_at desc, s."StudentId" desc
        limit row_limit
    ) item;

    return jsonb_build_object(
        'bookmarkedFeedback', bookmarked_rows,
        'flaggedStudents', flagged_rows
    );
end;
$function$;

alter function public.admin_get_dashboard_moderation_preview(integer) owner to postgres;
revoke all on function public.admin_get_dashboard_moderation_preview(integer) from public, anon;
grant execute on function public.admin_get_dashboard_moderation_preview(integer) to authenticated;


-- Stage 2c: complete staff directory is a Super Admin-only view.
-- auth_uid, passwords and credential metadata are intentionally not returned.
create or replace function public.admin_get_dashboard_staff()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $function$
declare
    staff_rows jsonb;
begin
    if auth.uid() is null or not exists (
        select 1 from public."Admins" a
         where a.auth_uid::text = auth.uid()::text
           and coalesce(a."isSuperAdmin", false) = true
    ) then
        raise exception 'not_authorized' using errcode = '42501';
    end if;

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'adminId', a."AdminId",
                'name', coalesce(nullif(trim(a."FullName"), ''), a."Email"),
                'email', a."Email",
                'isSuperAdmin', coalesce(a."isSuperAdmin", false),
                'createdAt', a.created_at
            )
            order by coalesce(a."isSuperAdmin", false) desc, a.created_at asc, a."AdminId"::text
        ),
        '[]'::jsonb
    )
    into staff_rows
    from public."Admins" a;

    return staff_rows;
end;
$function$;

alter function public.admin_get_dashboard_staff() owner to postgres;
revoke all on function public.admin_get_dashboard_staff() from public, anon;
grant execute on function public.admin_get_dashboard_staff() to authenticated;

comment on function public.admin_get_dashboard_overview() is
    'Compact first-stage counts for an authenticated admin dashboard; no user-level rows are returned.';
comment on function public.admin_get_dashboard_subject_activity() is
    'Top three canonical subjects by finalized normal-exam and Test Room attempts in the last seven days, with a prior-week comparison.';
comment on function public.admin_get_dashboard_moderation_preview(integer) is
    'Bounded admin dashboard preview of bookmarked feedback and spam-flagged students; full inbox remains on /feedback.';
comment on function public.admin_get_dashboard_staff() is
    'Super-admin-only staff directory with a minimal allowlist of display fields; auth_uid and credentials are never returned.';

commit;

notify pgrst, 'reload schema';
