
begin;

create or replace function public.pm_exam_usage_check_generation(
    p_user_id uuid,
    p_reservation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_reservation private.exam_usage_ledger%rowtype;
    v_subject_used integer := 0;
begin
    if p_user_id is null or p_reservation_id is null then
        raise exception 'A user and reservation are required.';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_user_id::text, 0)
    );

    select * into v_reservation
      from private.exam_usage_ledger
     where id = p_reservation_id
       and user_id = p_user_id
       and status = 'reserved'
       and expires_at > now()
     for update;

    if not found then
        return pg_catalog.jsonb_build_object(
            'allowed', false,
            'reason', 'reservation_expired',
            'message', 'Your exam request expired. Please start again.'
        );
    end if;

    if v_reservation.subject_id is null then
        update private.exam_usage_ledger
           set status = 'released', released_at = now()
         where id = p_reservation_id and user_id = p_user_id and status = 'reserved';
        return pg_catalog.jsonb_build_object(
            'allowed', false,
            'reason', 'subject_unresolved',
            'message', 'We could not verify this subject for your weekly exam allowance. Please reload the subject and try again.'
        );
    end if;

    select count(distinct coalesce(source_test_id::text, id::text))::integer
      into v_subject_used
      from private.exam_usage_ledger
     where user_id = p_user_id
       and subject_id = v_reservation.subject_id
       and id <> p_reservation_id
       and (
            (status = 'committed' and committed_at >= now() - interval '7 days')
            or (status = 'reserved' and expires_at > now() and reserved_at >= now() - interval '7 days')
       );

    if v_subject_used >= 10 then
        update private.exam_usage_ledger
           set status = 'released', released_at = now()
         where id = p_reservation_id
           and user_id = p_user_id
           and status = 'reserved';

        return pg_catalog.jsonb_build_object(
            'allowed', false,
            'reason', 'subject_generation_limit',
            'subjectCount', v_subject_used,
            'message', 'You have already used 10 distinct exams for this subject in the last 7 days. New AI-generated exams are unavailable. Please subscribe to a paid plan for more exams.'
        );
    end if;

    return pg_catalog.jsonb_build_object('allowed', true, 'subjectCount', v_subject_used);
end;
$function$;

create or replace function public.pm_exam_usage_commit(
    p_user_id uuid,
    p_reservation_id uuid,
    p_attempt_id uuid default null,
    p_source_test_id bigint default null,
    p_expected_kind text default null,
    p_expected_cost integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_row private.exam_usage_ledger%rowtype;
begin
    if p_user_id is null or p_reservation_id is null
       or p_attempt_id is null
       or p_expected_kind not in ('exam', 'test_room')
       or p_expected_cost not in (1, 2) then
        raise exception 'A valid user, reservation, attempt and expected usage charge are required.';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_user_id::text, 0)
    );

    update private.exam_usage_ledger
       set status = 'committed',
           committed_at = coalesce(committed_at, now()),
           attempt_id = p_attempt_id,
           source_test_id = coalesce(source_test_id, p_source_test_id)
     where id = p_reservation_id
       and user_id = p_user_id
       and usage_kind = p_expected_kind
       and credit_cost = p_expected_cost
       and status = 'reserved'
       and expires_at > now()
    returning * into v_row;

    if found then
        return pg_catalog.jsonb_build_object('ok', true, 'status', 'committed');
    end if;

    select * into v_row
      from private.exam_usage_ledger
     where id = p_reservation_id
       and user_id = p_user_id;

    if found
       and v_row.status = 'committed'
       and v_row.usage_kind = p_expected_kind
       and v_row.credit_cost = p_expected_cost
       and v_row.attempt_id = p_attempt_id
       and (p_source_test_id is null or v_row.source_test_id = p_source_test_id) then
        return pg_catalog.jsonb_build_object('ok', true, 'status', 'committed', 'alreadyCommitted', true);
    end if;

    return pg_catalog.jsonb_build_object('ok', false, 'status', coalesce(v_row.status, 'missing'));
end;
$function$;

revoke all on function public.pm_exam_usage_check_generation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.pm_exam_usage_check_generation(uuid, uuid) to service_role;
revoke all on function public.pm_exam_usage_commit(uuid, uuid, uuid, bigint, text, integer) from public, anon, authenticated;
grant execute on function public.pm_exam_usage_commit(uuid, uuid, uuid, bigint, text, integer) to service_role;

commit;
