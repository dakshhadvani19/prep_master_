-- Make the student-level Spam control reversible.
-- The function name is retained to preserve the existing client RPC contract.

create or replace function public.admin_mark_student_spam(p_student_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
    admin_uid uuid := auth.uid();
    student_name text;
    current_spam boolean;
    next_spam boolean;
begin
    if admin_uid is null or not exists (
        select 1
          from public."Admins" a
         where a.auth_uid = admin_uid
    ) then
        raise exception 'not_authorized' using errcode = '42501';
    end if;

    select s."FullName", s."IsSpam"
      into student_name, current_spam
      from public."Students" s
     where s."StudentId" = p_student_id
       and s.role = 'student'
     for update;

    if not found then
        raise exception 'student_not_found' using errcode = 'P0002';
    end if;

    next_spam := not current_spam;

    update public."Students" s
       set "IsSpam" = next_spam
     where s."StudentId" = p_student_id;

    return jsonb_build_object(
        'studentId', p_student_id,
        'studentName', student_name,
        'isSpam', next_spam
    );
end;
$function$;

alter function public.admin_mark_student_spam(bigint) owner to postgres;
revoke all on function public.admin_mark_student_spam(bigint) from public, anon;
grant execute on function public.admin_mark_student_spam(bigint) to authenticated;

comment on function public.admin_mark_student_spam(bigint) is
    'Admin-only student spam toggle. Each call reverses IsSpam for the specified student.';
