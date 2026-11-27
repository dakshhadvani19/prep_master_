-- Remove routines superseded by current application flows.
-- These functions had no application, trigger, event-trigger, cron or SQL-routine callers.
-- No tables, rows, triggers, policies, queues, extensions or active RPCs are removed.

begin;

drop function if exists public.queue_subscription_purchase(bigint, bigint, text);
drop function if exists public.consume_subscription_tokens(bigint, bigint);
drop function if exists public.auth_otp_prune();
drop function if exists public.admin_get_feedback_summary();
drop function if exists public.pm_admin_subject_dependency_counts(bigint);
drop function if exists public.pm_student_active_subject_syllabus(bigint);

commit;

notify pgrst, 'reload schema';
