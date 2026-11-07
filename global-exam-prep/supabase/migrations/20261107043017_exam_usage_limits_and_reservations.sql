
begin;

create table if not exists private.exam_usage_ledger (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    idempotency_key uuid not null,
    usage_kind text not null check (usage_kind in ('exam', 'test_room')),
    credit_cost smallint not null check (
        (usage_kind = 'exam' and credit_cost = 1)
        or (usage_kind = 'test_room' and credit_cost = 2)
    ),
    subject_id bigint references public."Subjects"("SubjectId") on delete set null,
    source_test_id bigint,
    attempt_id uuid references private.exam_attempts(id) on delete set null,
    status text not null default 'reserved'
        check (status in ('reserved', 'committed', 'released')),
    reserved_at timestamptz not null default now(),
    expires_at timestamptz not null default (now() + interval '15 minutes'),
    committed_at timestamptz,
    released_at timestamptz,
    created_at timestamptz not null default now(),
    unique (user_id, idempotency_key)
);

create index if not exists exam_usage_ledger_user_window_idx
    on private.exam_usage_ledger (user_id, reserved_at desc)
    where status in ('reserved', 'committed');

create index if not exists exam_usage_ledger_subject_window_idx
    on private.exam_usage_ledger (user_id, subject_id, committed_at desc)
    where status = 'committed' and subject_id is not null;

alter table private.exam_usage_ledger enable row level security;
revoke all on private.exam_usage_ledger from public, anon, authenticated;
grant select, insert, update on private.exam_usage_ledger to service_role;

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
    v_subject_used integer := 0;
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

    if p_subject_id is not null then
        select count(*)::integer into v_subject_used
          from private.exam_usage_ledger
         where user_id = p_user_id
           and subject_id = p_subject_id
           and (
                (status = 'committed' and committed_at >= now() - interval '7 days')
                or (status = 'reserved' and expires_at > now() and reserved_at >= now() - interval '7 days')
           );

        if v_subject_used >= 10 then
            return pg_catalog.jsonb_build_object(
                'allowed', false,
                'reason', 'subject_limit',
                'usedCredits', v_used,
                'remainingCredits', greatest(0, 10 - v_used),
                'message', 'You have used the 10 available exams for this subject in the last 7 days. Please subscribe to a paid plan for more exams.'
            );
        end if;
    end if;

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

create or replace function public.pm_exam_usage_commit(
    p_user_id uuid,
    p_reservation_id uuid,
    p_attempt_id uuid default null,
    p_source_test_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_row private.exam_usage_ledger%rowtype;
begin
    if p_user_id is null or p_reservation_id is null then
        raise exception 'A user and reservation are required.';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_user_id::text, 0)
    );

    update private.exam_usage_ledger
       set status = 'committed',
           committed_at = coalesce(committed_at, now()),
           attempt_id = coalesce(attempt_id, p_attempt_id),
           source_test_id = coalesce(source_test_id, p_source_test_id)
     where id = p_reservation_id
       and user_id = p_user_id
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

    if found and v_row.status = 'committed' then
        return pg_catalog.jsonb_build_object('ok', true, 'status', 'committed', 'alreadyCommitted', true);
    end if;

    return pg_catalog.jsonb_build_object('ok', false, 'status', coalesce(v_row.status, 'missing'));
end;
$function$;

create or replace function public.pm_exam_usage_release(
    p_user_id uuid,
    p_reservation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_status text;
begin
    if p_user_id is null or p_reservation_id is null then
        raise exception 'A user and reservation are required.';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_user_id::text, 0)
    );

    update private.exam_usage_ledger
       set status = 'released',
           released_at = now()
     where id = p_reservation_id
       and user_id = p_user_id
       and status = 'reserved'
    returning status into v_status;

    if found then
        return pg_catalog.jsonb_build_object('ok', true, 'status', 'released');
    end if;

    select status into v_status
      from private.exam_usage_ledger
     where id = p_reservation_id
       and user_id = p_user_id;

    return pg_catalog.jsonb_build_object(
        'ok', false, 'status', coalesce(v_status, 'missing')
    );
end;
$function$;

revoke all on function public.pm_exam_usage_reserve(uuid, uuid, text, integer, bigint) from public, anon, authenticated;
revoke all on function public.pm_exam_usage_commit(uuid, uuid, uuid, bigint) from public, anon, authenticated;
revoke all on function public.pm_exam_usage_release(uuid, uuid) from public, anon, authenticated;
grant execute on function public.pm_exam_usage_reserve(uuid, uuid, text, integer, bigint) to service_role;
grant execute on function public.pm_exam_usage_commit(uuid, uuid, uuid, bigint) to service_role;
grant execute on function public.pm_exam_usage_release(uuid, uuid) to service_role;

commit;
