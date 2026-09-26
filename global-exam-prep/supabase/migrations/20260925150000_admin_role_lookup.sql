-- ==========================================================================
-- Admin authorization lookup: "is this signed-in user staff?", from the uid
-- ==========================================================================
--
-- WHY THIS EXISTS
--   Admins authenticate through Supabase Auth exactly like students do: same
--   password provider, same Google provider, same recovery flow. What makes them an
--   admin is a row in the existing public.admins whose auth_uid equals their auth.users
--   id. So the app only ever needs one question answered, and it must be answered by
--   the database, from the verified session:
--       "does public.admins contain a row for auth.uid(), and is is_super_admin true?"
--
--   A plain client-side SELECT on public.admins would answer that only if the project
--   already grants `authenticated` a self-read policy, and it would put the uid in a
--   query string the browser controls. This function is the smallest server-side read
--   that works either way and changes nothing about the table's policies.
--
-- SECURITY MODEL
--   * No arguments. The uid comes from auth.uid() — the subject of the JWT PostgREST
--     has already verified — so a caller cannot ask about anyone else, cannot pass a
--     privileged uid, and cannot spoof it (the claim is set by GoTrue, not by the
--     client). There is nothing here that reads or returns a credential: the only
--     columns this can name are listed in the SELECT below, and public.admins holds
--     no password column by design.
--   * Returns one whitelisted jsonb object for the caller's own row, or SQL NULL when
--     no row exists. The NULL is the whole answer for a student: "not staff".
--   * Execute is granted to `authenticated` and revoked from public and anon, so an
--     unauthenticated visitor cannot probe it at all. public.admins is not made
--     readable to anon by this file, and no policy on it is created, altered or
--     dropped: RLS on the table stays exactly as the operator configured it.
--   * SECURITY DEFINER runs the read with the table owner's privileges, so the lookup
--     works without a new policy being added to anyone. If the owner is ever made
--     subject to RLS (FORCE ROW LEVEL SECURITY on a role that is not exempt) with no
--     self-read policy, the function returns no row and the app treats the session as a
--     student: losing access is the only failure this path can produce, never gaining
--     it. tests/admin-role-sql.test.js pins the asymmetry that does matter — the
--     caller's own direct read of public.admins stays filtered by RLS while the lookup
--     resolves the row, i.e. nothing was loosened to make admin sign-in work.
--   * `a.auth_uid::text = auth.uid()::text` is type-agnostic on purpose: it works
--     whether the column is uuid or varchar, which matters because this migration must
--     not depend on inspecting the live schema. The table holds staff rows, so the
--     cast costs nothing.
--   * Idempotent: safe to re-run from the SQL Editor or `supabase db push`.
--   * This migration never inserts or updates a row in public.admins. Provisioning
--     staff is an operator action, not something the app can do to itself.
--
-- APPLY:  Supabase dashboard -> SQL Editor -> paste -> Run
--         or: npx supabase db push   (same file under supabase/migrations)
--
-- The matching client code is resolveAuthorization()/deriveRole() in
-- src/utils/supabaseAuth.js; src/context/AuthContext.jsx is the only caller, so role
-- detection exists in exactly one place in the app.

begin;

-- Fail with an instruction, not a confusing "relation does not exist", if this is run
-- against a project where the admins table has not been created yet.
do $$
begin
    if to_regclass('public.admins') is null then
        raise exception
            'public.admins is missing in this database. Create it (admin_id, auth_uid, '
            'full_name, email, is_super_admin, created_at) before applying the '
            'admin-role lookup migration.';
    end if;

    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'admins' and column_name = 'auth_uid'
    ) or not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'admins' and column_name = 'is_super_admin'
    ) then
        raise exception
            'public.admins needs both auth_uid (referencing auth.users.id) and '
            'is_super_admin for the admin-role lookup to be defined.';
    end if;
end $$;

create or replace function public.admin_role_for_uid()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select (
        select jsonb_build_object(
            'admin_id',       a.admin_id,
            'auth_uid',       a.auth_uid,
            'full_name',      a.full_name,
            'email',          a.email,
            'is_super_admin', coalesce(a.is_super_admin, false)
        )
        from public.admins as a
        where a.auth_uid::text = auth.uid()::text
        -- One identity should have one staff row; if it has several, the most
        -- privileged wins and the tie-break is stable, so the answer cannot flip
        -- between two identical requests.
        order by coalesce(a.is_super_admin, false) desc, a.admin_id::text nulls last
        limit 1
    );
$$;

comment on function public.admin_role_for_uid() is
    'Returns the CALLER''s own public.admins row (whitelisted columns) as jsonb, or '
    'NULL when the signed-in uid is not staff. Takes no arguments by design: the uid '
    'is auth.uid(), so this cannot be pointed at another user. Execute is granted to '
    'authenticated only; it is not an enumeration oracle and exposes no credential.';

-- Only a signed-in user may call it, and only about themselves.
revoke all on function public.admin_role_for_uid() from public;
revoke execute on function public.admin_role_for_uid() from anon, authenticator, service_role;
grant execute on function public.admin_role_for_uid() to authenticated;

commit;

-- PostgREST caches the schema, so a brand-new RPC can otherwise 404 for a while.
notify pgrst, 'reload schema';
