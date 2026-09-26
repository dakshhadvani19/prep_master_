-- ==========================================================================
-- Super-admin staff writes: add / remove / promote. Never a client table write.
-- ==========================================================================
--
-- WHY THIS EXISTS
--   Phase 5 needs Add Admin, Remove Admin, and Add Super Admin without granting
--   INSERT/UPDATE/DELETE on public.admins to the browser. The caller is always
--   auth.uid(); the client cannot pass "I am super admin".
--
-- SECURITY MODEL
--   * SECURITY DEFINER, search_path pinned to public, pg_temp.
--   * Execute granted only to authenticated; revoked from public/anon.
--   * The function refuses anyone whose own public.admins row is not
--     is_super_admin. Standard admins and students get SQLSTATE 42501.
--   * p_action is a closed set: add | remove | add_super. No boolean the
--     client can set on their own row.
--   * Add / add_super require an existing auth.users row for that email so this
--     function never creates passwords or auth identities. If nobody has signed
--     up yet, it raises no_auth_user — operator SQL remains the path for
--     pre-provisioning.
--   * Remove cannot target the caller's own email.
--   * No password column is read or written.
--   * This file does not CREATE the admins table, does not add policies, and
--     does not GRANT table writes to authenticated.
--
-- APPLY: SQL Editor -> Run, or supabase db push.
-- Idempotent.

begin;

do $$
begin
    if to_regclass('public.admins') is null then
        raise exception
            'public.admins is missing. Create it before applying manage_admin_staff.';
    end if;
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'admins' and column_name = 'auth_uid'
    ) or not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'admins' and column_name = 'is_super_admin'
    ) then
        raise exception
            'public.admins needs auth_uid and is_super_admin for manage_admin_staff.';
    end if;
end $$;

create or replace function public.manage_admin_staff(
    p_action text,
    p_email text,
    p_full_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    act text := lower(trim(coalesce(p_action, '')));
    mail text := lower(trim(coalesce(p_email, '')));
    nm text := nullif(trim(coalesce(p_full_name, '')), '');
    caller_super boolean := false;
    linked uuid;
    uid_type text;
    making_super boolean;
begin
    if act not in ('add', 'remove', 'add_super') then
        raise exception 'invalid_action' using errcode = '22023';
    end if;
    if mail = '' or position('@' in mail) = 0 then
        raise exception 'invalid_email' using errcode = '22023';
    end if;

    select coalesce(bool_or(coalesce(a.is_super_admin, false)), false)
      into caller_super
      from public.admins as a
     where a.auth_uid::text = auth.uid()::text;

    if caller_super is not true then
        raise exception 'not_authorized' using errcode = '42501';
    end if;

    if act = 'remove' then
        if exists (
            select 1 from public.admins as a
             where a.auth_uid::text = auth.uid()::text
               and lower(trim(a.email)) = mail
        ) then
            raise exception 'cannot_remove_self' using errcode = '22023';
        end if;
        delete from public.admins as a where lower(trim(a.email)) = mail;
        return jsonb_build_object('ok', true, 'action', 'remove', 'email', mail);
    end if;

    making_super := (act = 'add_super');

    linked := null;
    begin
        select u.id into linked
          from auth.users as u
         where lower(u.email) = mail
         limit 1;
    exception
        when undefined_table then
            linked := null;
        when undefined_object then
            linked := null;
    end;

    if linked is null then
        raise exception 'no_auth_user' using errcode = 'P0001';
    end if;

    select c.data_type into uid_type
      from information_schema.columns as c
     where c.table_schema = 'public' and c.table_name = 'admins' and c.column_name = 'auth_uid';

    if exists (select 1 from public.admins as a where lower(trim(a.email)) = mail) then
        execute format(
            'update public.admins set full_name = coalesce($1, full_name), is_super_admin = (is_super_admin or $2), auth_uid = coalesce(auth_uid, ($3)::%s) where lower(trim(email)) = $4',
            case when uid_type = 'uuid' then 'uuid' else 'text' end
        ) using nm, making_super, linked::text, mail;
    else
        execute format(
            'insert into public.admins (auth_uid, full_name, email, is_super_admin) values (($1)::%s, $2, $3, $4)',
            case when uid_type = 'uuid' then 'uuid' else 'text' end
        ) using linked::text, coalesce(nm, mail), mail, making_super;
    end if;

    return jsonb_build_object(
        'ok', true,
        'action', act,
        'email', mail,
        'is_super_admin', making_super
    );
end;
$$;

comment on function public.manage_admin_staff(text, text, text) is
    'Super-admin-only staff write. Action add|remove|add_super; email identifies the '
    'target. Caller is auth.uid(); the client cannot assert is_super_admin. Add requires '
    'an existing auth.users row. No password column is touched. Table grants unchanged.';

revoke all on function public.manage_admin_staff(text, text, text) from public;
revoke execute on function public.manage_admin_staff(text, text, text) from anon, authenticator;
grant execute on function public.manage_admin_staff(text, text, text) to authenticated;

commit;

notify pgrst, 'reload schema';
