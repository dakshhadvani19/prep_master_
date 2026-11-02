-- PGMQ's schema and routines must not be directly callable by browser roles.
-- Application queue operations are reached only through the service-role-only
-- SECURITY DEFINER RPCs in 20261102044806_admin_course_upload_async_queue.sql.
begin;
revoke all on schema pgmq from public, anon, authenticated;
revoke all on all functions in schema pgmq from public, anon, authenticated;
revoke all on all tables in schema pgmq from public, anon, authenticated;
revoke all on all sequences in schema pgmq from public, anon, authenticated;

alter default privileges for role postgres in schema pgmq
    revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema pgmq
    revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema pgmq
    revoke execute on functions from public, anon, authenticated;
commit;
