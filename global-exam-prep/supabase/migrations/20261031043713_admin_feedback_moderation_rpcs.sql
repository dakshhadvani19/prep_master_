-- Admin-only feedback management endpoints.
-- Feedbacks intentionally has FORCE ROW LEVEL SECURITY and no direct client grants.
-- These narrowly scoped SECURITY DEFINER functions keep the browser from receiving
-- table-wide access while still supporting the admin feedback review screen.

begin;

create or replace function public.admin_get_feedback_dashboard()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
    feedback_items jsonb;
    spam_students jsonb;
begin
    if auth.uid() is null or not exists (
        select 1 from public."Admins" a where a.auth_uid = auth.uid()
    ) then
        raise exception 'not_authorized' using errcode = '42501';
    end if;

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'feedbackId', f."FeedbackId",
                'description', f."Description",
                'type', f."Type",
                'isSpam', f."isSpam",
                'isBookmark', f."isBookmark",
                'isSeen', f."isSeen",
                'studentId', s."StudentId",
                'studentName', s."FullName",
                'studentIsSpam', s."IsSpam"
            )
            order by f."FeedbackId" desc
        ),
        '[]'::jsonb
    )
    into feedback_items
    from public."Feedbacks" f
    join public."Students" s on s."StudentId" = f."StudentId";

    select coalesce(
        jsonb_agg(
            jsonb_build_object(
                'studentId', s."StudentId",
                'studentName', s."FullName"
            )
            order by s."StudentId" desc
        ),
        '[]'::jsonb
    )
    into spam_students
    from public."Students" s
    where s."IsSpam" = true
      and s.role = 'student';

    return jsonb_build_object(
        'feedbacks', feedback_items,
        'spamStudents', spam_students
    );
end;
$function$;

alter function public.admin_get_feedback_dashboard() owner to postgres;
revoke all on function public.admin_get_feedback_dashboard() from public, anon;
grant execute on function public.admin_get_feedback_dashboard() to authenticated;


create or replace function public.admin_update_feedback_flag(
    p_feedback_id bigint,
    p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
    action_name text := lower(trim(coalesce(p_action, '')));
    spam_flag boolean;
    bookmark_flag boolean;
    seen_flag boolean;
begin
    if auth.uid() is null or not exists (
        select 1 from public."Admins" a where a.auth_uid = auth.uid()
    ) then
        raise exception 'not_authorized' using errcode = '42501';
    end if;

    if action_name = 'spam' then
        update public."Feedbacks"
           set "isSpam" = true
         where "FeedbackId" = p_feedback_id
         returning "isSpam", "isBookmark", "isSeen"
              into spam_flag, bookmark_flag, seen_flag;
    elsif action_name = 'bookmark' then
        update public."Feedbacks"
           set "isBookmark" = true
         where "FeedbackId" = p_feedback_id
         returning "isSpam", "isBookmark", "isSeen"
              into spam_flag, bookmark_flag, seen_flag;
    elsif action_name = 'seen' then
        update public."Feedbacks"
           set "isSeen" = true
         where "FeedbackId" = p_feedback_id
         returning "isSpam", "isBookmark", "isSeen"
              into spam_flag, bookmark_flag, seen_flag;
    else
        raise exception 'invalid_feedback_action' using errcode = '22023';
    end if;

    if not found then
        raise exception 'feedback_not_found' using errcode = 'P0002';
    end if;

    return jsonb_build_object(
        'feedbackId', p_feedback_id,
        'isSpam', spam_flag,
        'isBookmark', bookmark_flag,
        'isSeen', seen_flag
    );
end;
$function$;

alter function public.admin_update_feedback_flag(bigint, text) owner to postgres;
revoke all on function public.admin_update_feedback_flag(bigint, text) from public, anon;
grant execute on function public.admin_update_feedback_flag(bigint, text) to authenticated;


create or replace function public.admin_mark_student_spam(p_student_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
    student_payload jsonb;
begin
    if auth.uid() is null or not exists (
        select 1 from public."Admins" a where a.auth_uid = auth.uid()
    ) then
        raise exception 'not_authorized' using errcode = '42501';
    end if;

    update public."Students"
       set "IsSpam" = true
     where "StudentId" = p_student_id
       and role = 'student'
     returning jsonb_build_object(
         'studentId', "StudentId",
         'studentName', "FullName",
         'isSpam', "IsSpam"
     )
     into student_payload;

    if not found then
        raise exception 'student_not_found' using errcode = 'P0002';
    end if;

    return student_payload;
end;
$function$;

alter function public.admin_mark_student_spam(bigint) owner to postgres;
revoke all on function public.admin_mark_student_spam(bigint) from public, anon;
grant execute on function public.admin_mark_student_spam(bigint) to authenticated;

comment on function public.admin_get_feedback_dashboard() is
    'Returns all feedback and spam-marked student names/IDs for the verified signed-in admin. No direct Feedbacks table access is granted to clients.';
comment on function public.admin_update_feedback_flag(bigint, text) is
    'Admin-only one-way feedback moderation: action is spam, bookmark, or seen. Status reversal remains blocked by the existing trigger.';
comment on function public.admin_mark_student_spam(bigint) is
    'Admin-only one-way spam marker for a student. IsSpam remains protected from direct client updates.';

commit;

notify pgrst, 'reload schema';
