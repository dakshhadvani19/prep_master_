-- Fix auth helper functions to reference the actual quoted ER table names.
-- RLS policies on "Students" and "Admins" execute these helpers during SELECT.
-- The previous lowercase references raised SQLSTATE 42P01 for profile reads.

CREATE OR REPLACE FUNCTION public."current_role"()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM public."Admins" AS a
            WHERE a.auth_uid = auth.uid()
              AND COALESCE(a."isSuperAdmin", false) = true
        ) THEN 'superAdmin'
        WHEN EXISTS (
            SELECT 1
            FROM public."Admins" AS a
            WHERE a.auth_uid = auth.uid()
        ) THEN 'admin'
        ELSE 'student'
    END;
$function$;

CREATE OR REPLACE FUNCTION public.current_admin_is_super()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $function$
    SELECT EXISTS (
        SELECT 1
        FROM public."Admins" AS a
        WHERE a.auth_uid = auth.uid()
          AND COALESCE(a."isSuperAdmin", false) = true
    );
$function$;

REVOKE ALL ON FUNCTION public."current_role"() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public."current_role"() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.current_admin_is_super() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_admin_is_super() TO authenticated, service_role;
