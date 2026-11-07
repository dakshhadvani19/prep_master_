
create or replace function public.pm_exam_usage_reserve(
    p_user_id uuid,
    p_idempotency_key uuid,
    p_usage_kind text,
    p_credit_cost integer,
    p_subject_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_existing private.exam_usage_ledger%rowtype;
    v_used integer := 0;
    v_id uuid;
begin
    if p_user_id is null or p_idempotency_key is null then
        raise exception 'A user and idempotency key are required.';
    end if;
    if p_usage_kind not in ('exam', 'test_room')
       or (p_usage_kind = 'exam' and p_credit_cost <> 1)
       or (p_usage_kind = 'test_room' and p_credit_cost <> 2) then
        raise exception 'Invalid exam usage charge.';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_user_id::text, 0)
    );

    select * into v_existing
      from private.exam_usage_ledger
     where user_id = p_user_id
       and idempotency_key = p_idempotency_key;

    if found then
        if v_existing.status in ('reserved', 'committed')
           and (v_existing.status = 'committed' or v_existing.expires_at > now()) then
            select coalesce(sum(credit_cost), 0)::integer into v_used
              from private.exam_usage_ledger
             where user_id = p_user_id
               and (
                    (status = 'committed' and committed_at >= now() - interval '7 days')
                    or (status = 'reserved' and expires_at > now() and reserved_at >= now() - interval '7 days')
               );
            return pg_catalog.jsonb_build_object(
                'allowed', true, 'reservationId', v_existing.id,
                'usedCredits', v_used, 'remainingCredits', greatest(0, 10 - v_used),
                'alreadyReserved', v_existing.status = 'reserved',
                'alreadyCommitted', v_existing.status = 'committed'
            );
        end if;
        return pg_catalog.jsonb_build_object(
            'allowed', false,
            'reason', 'reservation_expired',
            'message', 'This exam request expired. Please start again.'
        );
    end if;

    select coalesce(sum(credit_cost), 0)::integer into v_used
      from private.exam_usage_ledger
     where user_id = p_user_id
       and (
            (status = 'committed' and committed_at >= now() - interval '7 days')
            or (status = 'reserved' and expires_at > now() and reserved_at >= now() - interval '7 days')
       );

    if v_used + p_credit_cost > 10 then
        return pg_catalog.jsonb_build_object(
            'allowed', false,
            'reason', 'weekly_limit',
            'usedCredits', v_used,
            'remainingCredits', greatest(0, 10 - v_used),
            'message', 'You have reached your weekly exam limit. Please subscribe to a paid plan for more exams.'
        );
    end if;

    insert into private.exam_usage_ledger (
        user_id, idempotency_key, usage_kind, credit_cost, subject_id
    ) values (
        p_user_id, p_idempotency_key, p_usage_kind, p_credit_cost, p_subject_id
    ) returning id into v_id;

    return pg_catalog.jsonb_build_object(
        'allowed', true, 'reservationId', v_id,
        'usedCredits', v_used + p_credit_cost,
        'remainingCredits', 10 - v_used - p_credit_cost,
        'alreadyReserved', false,
        'alreadyCommitted', false
    );
end;
$function$;

revoke all on function public.pm_exam_usage_reserve(uuid, uuid, text, integer, bigint) from public, anon, authenticated;
grant execute on function public.pm_exam_usage_reserve(uuid, uuid, text, integer, bigint) to service_role;
