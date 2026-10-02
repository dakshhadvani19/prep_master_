-- PrepMaster: synchronize existing live identifiers with the SRS/ER naming.
-- Rename/replace only. No table recreation and no data deletion.
-- Run after the existing Courses/Subjects/Feedbacks/Leaderboards tables exist.

begin;

do $$
begin
    if to_regclass('public.students') is not null
       and to_regclass('public."Students"') is null then
        alter table public.students rename to "Students";
    end if;

    if to_regclass('public.admins') is not null
       and to_regclass('public."Admins"') is null then
        alter table public.admins rename to "Admins";
    end if;

    if to_regclass('public.feedbacks') is not null
       and to_regclass('public."Feedbacks"') is null then
        alter table public.feedbacks rename to "Feedbacks";
    end if;
end
$$;

do $$
begin
    if to_regclass('public."Students"') is not null then
        if exists (
            select 1 from information_schema.columns
            where table_schema='public' and table_name='Students'
              and column_name='student_id'
        ) and not exists (
            select 1 from information_schema.columns
            where table_schema='public' and table_name='Students'
              and column_name='StudentId'
        ) then
            alter table public."Students" rename column student_id to "StudentId";
        end if;

        if exists (
            select 1 from information_schema.columns
            where table_schema='public' and table_name='Students'
              and column_name='full_name'
        ) and not exists (
            select 1 from information_schema.columns
            where table_schema='public' and table_name='Students'
              and column_name='FullName'
        ) then
            alter table public."Students" rename column full_name to "FullName";
        end if;

        if exists (
            select 1 from information_schema.columns
            where table_schema='public' and table_name='Students'
              and column_name='email'
        ) and not exists (
            select 1 from information_schema.columns
            where table_schema='public' and table_name='Students'
              and column_name='Email'
        ) then
            alter table public."Students" rename column email to "Email";
        end if;

        if exists (
            select 1 from information_schema.columns
            where table_schema='public' and table_name='Students'
              and column_name='is_spam'
        ) and not exists (
            select 1 from information_schema.columns
            where table_schema='public' and table_name='Students'
              and column_name='IsSpam'
        ) then
            alter table public."Students" rename column is_spam to "IsSpam";
        end if;
    end if;
end
$$;

do $$
begin
    if to_regclass('public."Admins"') is not null then
        if exists (
            select 1 from information_schema.columns
            where table_schema='public' and table_name='Admins'
              and column_name='admin_id'
        ) and not exists (
            select 1 from information_schema.columns
            where table_schema='public' and table_name='Admins'
              and column_name='AdminId'
        ) then
            alter table public."Admins" rename column admin_id to "AdminId";
        end if;

        if exists (
            select 1 from information_schema.columns
            where table_schema='public' and table_name='Admins'
              and column_name='full_name'
        ) and not exists (
            select 1 from information_schema.columns
            where table_schema='public' and table_name='Admins'
              and column_name='FullName'
        ) then
            alter table public."Admins" rename column full_name to "FullName";
        end if;

        if exists (
            select 1 from information_schema.columns
            where table_schema='public' and table_name='Admins'
              and column_name='email'
        ) and not exists (
            select 1 from information_schema.columns
            where table_schema='public' and table_name='Admins'
              and column_name='Email'
        ) then
            alter table public."Admins" rename column email to "Email";
        end if;

        if exists (
            select 1 from information_schema.columns
            where table_schema='public' and table_name='Admins'
              and column_name='is_super_admin'
        ) and not exists (
            select 1 from information_schema.columns
            where table_schema='public' and table_name='Admins'
              and column_name='isSuperAdmin'
        ) then
            alter table public."Admins" rename column is_super_admin to "isSuperAdmin";
        end if;
    end if;
end
$$;

do $$
begin
    if to_regclass('public."Feedbacks"') is not null then
        if exists (
            select 1 from information_schema.columns
            where table_schema='public' and table_name='Feedbacks'
              and column_name='feedback_id'
        ) and not exists (
            select 1 from information_schema.columns
            where table_schema='public' and table_name='Feedbacks'
              and column_name='FeedbackId'
        ) then
            alter table public."Feedbacks" rename column feedback_id to "FeedbackId";
        end if;

        if exists (
            select 1 from information_schema.columns
            where table_schema='public' and table_name='Feedbacks'
              and column_name='description'
        ) and not exists (
            select 1 from information_schema.columns
            where table_schema='public' and table_name='Feedbacks'
              and column_name='Description'
        ) then
            alter table public."Feedbacks" rename column description to "Description";
        end if;

        if exists (
            select 1 from information_schema.columns
            where table_schema='public' and table_name='Feedbacks'
              and column_name='type'
        ) and not exists (
            select 1 from information_schema.columns
            where table_schema='public' and table_name='Feedbacks'
              and column_name='Type'
        ) then
            alter table public."Feedbacks" rename column type to "Type";
        end if;

        if exists (
            select 1 from information_schema.columns
            where table_schema='public' and table_name='Feedbacks'
              and column_name='is_spam'
        ) and not exists (
            select 1 from information_schema.columns
            where table_schema='public' and table_name='Feedbacks'
              and column_name='isSpam'
        ) then
            alter table public."Feedbacks" rename column is_spam to "isSpam";
        end if;

        if exists (
            select 1 from information_schema.columns
            where table_schema='public' and table_name='Feedbacks'
              and column_name='is_bookmark'
        ) and not exists (
            select 1 from information_schema.columns
            where table_schema='public' and table_name='Feedbacks'
              and column_name='isBookmark'
        ) then
            alter table public."Feedbacks" rename column is_bookmark to "isBookmark";
        end if;

        if exists (
            select 1 from information_schema.columns
            where table_schema='public' and table_name='Feedbacks'
              and column_name='is_seen'
        ) and not exists (
            select 1 from information_schema.columns
            where table_schema='public' and table_name='Feedbacks'
              and column_name='isSeen'
        ) then
            alter table public."Feedbacks" rename column is_seen to "isSeen";
        end if;

        if exists (
            select 1 from information_schema.columns
            where table_schema='public' and table_name='Feedbacks'
              and column_name='student_id'
        ) and not exists (
            select 1 from information_schema.columns
            where table_schema='public' and table_name='Feedbacks'
              and column_name='StudentId'
        ) then
            alter table public."Feedbacks" rename column student_id to "StudentId";
        end if;
    end if;
end
$$;

create or replace function public.guard_student_protected_columns()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
    if current_user in ('service_role','postgres','supabase_admin') then
        return new;
    end if;

    if new."StudentId" is distinct from old."StudentId"
       or new.auth_uid is distinct from old.auth_uid
       or new."Email" is distinct from old."Email"
       or new.role is distinct from old.role
       or new."IsSpam" is distinct from old."IsSpam"
       or new.created_at is distinct from old.created_at then
        raise exception 'Students: identity and security columns are immutable'
            using errcode = '42501';
    end if;

    return new;
end;
$function$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
    v_email text := lower(coalesce(new.email, ''));
    v_name text := nullif(
        btrim(coalesce(
            new.raw_user_meta_data->>'full_name',
            new.raw_user_meta_data->>'name',
            ''
        )),
        ''
    );
begin
    if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
        raise exception 'Students: invalid email %', left(v_email, 64)
            using errcode = '22023';
    end if;

    if length(v_email) > 320 then
        raise exception 'Students: email exceeds 320 characters'
            using errcode = '22001';
    end if;

    if v_name is null then
        v_name := split_part(v_email, '@', 1);
    end if;

    insert into public."Students" (
        auth_uid,
        "FullName",
        "Email",
        "IsSpam",
        role
    )
    values (
        new.id,
        left(v_name, 100),
        v_email,
        false,
        'student'
    )
    on conflict (auth_uid) do nothing;

    return new;
end;
$function$;

create or replace function public.validate_leaderboard_student_ids()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
    if exists (
        select 1
        from unnest(new."StudentId") as student_id
        where not exists (
            select 1
            from public."Students" s
            where s."StudentId" = student_id
        )
    ) then
        raise exception
            'Leaderboards.StudentId contains a StudentId that does not exist';
    end if;

    return new;
end;
$function$;

create or replace function public.admin_role_for_uid()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
    select (
        select jsonb_build_object(
            'AdminId',      a."AdminId",
            'auth_uid',     a.auth_uid,
            'FullName',     a."FullName",
            'Email',        a."Email",
            'isSuperAdmin', coalesce(a."isSuperAdmin", false)
        )
        from public."Admins" as a
        where a.auth_uid = auth.uid()
        order by coalesce(a."isSuperAdmin", false) desc,
                 a."AdminId" desc
        limit 1
    );
$function$;

revoke all on function public.admin_role_for_uid() from public;
revoke execute on function public.admin_role_for_uid()
    from anon, authenticator, service_role;
grant execute on function public.admin_role_for_uid()
    to authenticated;

create or replace function public.manage_admin_staff(
    p_action text,
    p_email text,
    p_full_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
    act text := lower(trim(coalesce(p_action, '')));
    mail text := lower(trim(coalesce(p_email, '')));
    nm text := nullif(trim(coalesce(p_full_name, '')), '');
    caller_super boolean := false;
    linked uuid;
    making_super boolean;
begin
    if act not in ('add', 'remove', 'add_super') then
        raise exception 'invalid_action' using errcode = '22023';
    end if;

    if mail = '' or position('@' in mail) = 0 then
        raise exception 'invalid_email' using errcode = '22023';
    end if;

    select coalesce(bool_or(coalesce(a."isSuperAdmin", false)), false)
      into caller_super
      from public."Admins" as a
     where a.auth_uid = auth.uid();

    if caller_super is not true then
        raise exception 'not_authorized' using errcode = '42501';
    end if;

    if act = 'remove' then
        if exists (
            select 1
            from public."Admins" as a
            where a.auth_uid = auth.uid()
              and lower(trim(a."Email")) = mail
        ) then
            raise exception 'cannot_remove_self' using errcode = '22023';
        end if;

        delete from public."Admins" as a
        where lower(trim(a."Email")) = mail;

        return jsonb_build_object(
            'ok', true,
            'action', 'remove',
            'email', mail
        );
    end if;

    making_super := (act = 'add_super');

    select u.id
      into linked
      from auth.users as u
     where lower(u.email) = mail
     limit 1;

    if linked is null then
        raise exception 'no_auth_user' using errcode = 'P0001';
    end if;

    if exists (
        select 1
        from public."Admins" as a
        where lower(trim(a."Email")) = mail
    ) then
        update public."Admins" as a
           set "FullName" = coalesce(nm, a."FullName"),
               "isSuperAdmin" = coalesce(a."isSuperAdmin", false) or making_super,
               auth_uid = coalesce(a.auth_uid, linked)
         where lower(trim(a."Email")) = mail;
    else
        insert into public."Admins" (
            auth_uid,
            "FullName",
            "Email",
            "isSuperAdmin"
        )
        values (
            linked,
            coalesce(nm, mail),
            mail,
            making_super
        );
    end if;

    return jsonb_build_object(
        'ok', true,
        'action', act,
        'email', mail,
        'isSuperAdmin', making_super
    );
end;
$function$;

revoke all on function public.manage_admin_staff(text, text, text) from public;
revoke execute on function public.manage_admin_staff(text, text, text)
    from anon, authenticator;
grant execute on function public.manage_admin_staff(text, text, text)
    to authenticated;

commit;

notify pgrst, 'reload schema';
