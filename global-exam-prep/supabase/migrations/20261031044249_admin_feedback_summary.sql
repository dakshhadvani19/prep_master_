-- Lightweight count-only endpoint for the Admin Dashboard.
-- The full feedback payload is fetched only on the dedicated /feedback inbox page.

begin;

create or replace function public.admin_get_feedback_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
    total_count bigint;
    seen_count bigint;
begin
    if auth.uid() is null or not exists (
        select 1 from public."Admins" a where a.auth_uid = auth.uid()
    ) then
        raise exception 'not_authorized' using errcode = '42501';
    end if;

    select
        count(*)::bigint,
        count(*) filter (where f."isSeen" = true)::bigint
    into total_count, seen_count
    from public."Feedbacks" f;

    return jsonb_build_object(
        'total', total_count,
        'seen', seen_count
    );
end;
$function$;

alter function public.admin_get_feedback_summary() owner to postgres;
revoke all on function public.admin_get_feedback_summary() from public, anon;
grant execute on function public.admin_get_feedback_summary() to authenticated;

comment on function public.admin_get_feedback_summary() is
    'Admin-only count summary for the dashboard. Full feedback content is fetched on the dedicated feedback inbox page.';

commit;

notify pgrst, 'reload schema';
