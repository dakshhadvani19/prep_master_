
begin;

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
    v_subject_events integer := 0;
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
        return pg_catalog.jsonb_build_object('allowed', true, 'subjectCount', null);
    end if;

    select count(*)::integer into v_subject_events
      from private.exam_usage_ledger
     where user_id = p_user_id
       and subject_id = v_reservation.subject_id
       and id <> p_reservation_id
       and (
            (status = 'committed' and committed_at >= now() - interval '7 days')
            or (status = 'reserved' and expires_at > now() and reserved_at >= now() - interval '7 days')
       );

    if v_subject_events >= 10 then
        update private.exam_usage_ledger
           set status = 'released', released_at = now()
         where id = p_reservation_id
           and user_id = p_user_id
           and status = 'reserved';

        return pg_catalog.jsonb_build_object(
            'allowed', false,
            'reason', 'subject_generation_limit',
            'subjectCount', v_subject_events,
            'message', 'You have already used 10 exams for this subject in the last 7 days. New AI-generated exams are unavailable. Please subscribe to a paid plan for more exams.'
        );
    end if;

    return pg_catalog.jsonb_build_object(
        'allowed', true,
        'subjectCount', v_subject_events
    );
end;
$function$;

create or replace function public.pm_exam_resolve_subject_id(
    p_subject_code text,
    p_subject_name text,
    p_course_id bigint default null,
    p_semester integer default null
)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
    v_ids bigint[];
    v_id bigint;
begin
    if p_subject_name is not null and btrim(p_subject_name) <> '' then
        select array_agg(s."SubjectId" order by s."SubjectId")
          into v_ids
          from public."Subjects" s
         where pg_catalog.lower(pg_catalog.btrim(s."SubjectName")) =
               pg_catalog.lower(pg_catalog.btrim(p_subject_name))
           and (p_course_id is null or s."CourseId" = p_course_id)
           and (p_semester is null or s."Semester" = p_semester);

        if coalesce(array_length(v_ids, 1), 0) = 1 then
            return v_ids[1];
        end if;
        v_ids := null;
    end if;

    if p_subject_code is not null and btrim(p_subject_code) <> '' then
        select array_agg(distinct a.subject_id order by a.subject_id)
          into v_ids
          from private.exam_attempts a
         where a.subject_id is not null
           and pg_catalog.lower(pg_catalog.btrim(a.subject_code)) =
               pg_catalog.lower(pg_catalog.btrim(p_subject_code))
           and (
                p_subject_name is null
                or pg_catalog.lower(pg_catalog.btrim(a.subject_name)) =
                   pg_catalog.lower(pg_catalog.btrim(p_subject_name))
           );

        if coalesce(array_length(v_ids, 1), 0) = 1 then
            return v_ids[1];
        end if;
    end if;

    return null;
end;
$function$;

create or replace function public.pm_exam_testsdata_candidates(
    p_user_id uuid,
    p_subject_id bigint,
    p_exam_type text,
    p_difficulty text,
    p_question_type text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
    with requested_type as (
        select case
            when pg_catalog.lower(p_exam_type) ~ 'mid[^0-9]*1' then 'mid1'
            when pg_catalog.lower(p_exam_type) ~ 'mid[^0-9]*2' then 'mid2'
            when pg_catalog.lower(p_exam_type) ~ '(final|ese|end[^a-z0-9]*semester)' then 'final'
            else pg_catalog.regexp_replace(pg_catalog.lower(p_exam_type), '[^a-z0-9]', '', 'g')
        end as type_key
    ),
    mapped as (
        select distinct on (td."TestId")
            td."TestId" as source_test_id,
            to_jsonb(td."Questions") as questions,
            to_jsonb(td."Options") as options,
            to_jsonb(td."Answers") as answers,
            a.questions as private_questions,
            a.id as source_attempt_id,
            a.subject_id,
            a.exam_type,
            a.difficulty,
            a.total_marks,
            a.time_minutes,
            a.created_at,
            coalesce(k.answer_key, '{}'::jsonb) as answer_key
        from public."TestsData" td
        join private.exam_attempts a
          on a.core_test_id = td."TestId"
        left join private.exam_attempt_keys k
          on k.attempt_id = a.id
        cross join requested_type rt
        where p_user_id is not null
          and p_subject_id is not null
          and a.subject_id = p_subject_id
          and a.difficulty = p_difficulty
          and a.status <> 'cancelled'
          and (
                a.attempt_type = 'exam'
                or (a.attempt_type = 'test_room' and a.room_role = 'host')
          )
          and (
            case
                when pg_catalog.lower(a.exam_type) ~ 'mid[^0-9]*1' then 'mid1'
                when pg_catalog.lower(a.exam_type) ~ 'mid[^0-9]*2' then 'mid2'
                when pg_catalog.lower(a.exam_type) ~ '(final|ese|end[^a-z0-9]*semester)' then 'final'
                else pg_catalog.regexp_replace(pg_catalog.lower(a.exam_type), '[^a-z0-9]', '', 'g')
            end
          ) = rt.type_key
          and (
            (p_question_type = 'mcq' and (
                a.attempt_type = 'test_room'
                or exists (
                    select 1 from pg_catalog.jsonb_array_elements(a.questions) q
                    where q->>'type' = 'mcq'
                )
            ))
            or
            (p_question_type = 'theory' and exists (
                select 1 from pg_catalog.jsonb_array_elements(a.questions) q
                where q->>'type' = 'subjective'
            ))
          )
          and pg_catalog.jsonb_typeof(to_jsonb(td."Questions")) = 'array'
          and pg_catalog.jsonb_array_length(to_jsonb(td."Questions")) > 0
          and not exists (
              select 1
                from private.exam_usage_ledger used
               where used.user_id = p_user_id
                 and used.source_test_id = td."TestId"
                 and used.status = 'committed'
                 and used.committed_at >= now() - interval '7 days'
          )
        order by td."TestId", a.created_at desc
    )
    select coalesce(
        pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
                'sourceTestId', source_test_id,
                'sourceAttemptId', source_attempt_id,
                'questions', questions,
                'privateQuestions', private_questions,
                'options', options,
                'answers', answers,
                'answerKey', answer_key,
                'totalMarks', total_marks,
                'timeMinutes', time_minutes
            ) order by created_at asc, source_test_id asc
        ),
        '[]'::jsonb
    )
    from (select * from mapped order by created_at asc, source_test_id asc limit 20) candidates;
$function$;

revoke all on function public.pm_exam_usage_check_generation(uuid, uuid) from public, anon, authenticated;
grant execute on function public.pm_exam_usage_check_generation(uuid, uuid) to service_role;
revoke all on function public.pm_exam_resolve_subject_id(text, text, bigint, integer) from public, anon, authenticated;
grant execute on function public.pm_exam_resolve_subject_id(text, text, bigint, integer) to service_role;
revoke all on function public.pm_exam_testsdata_candidates(uuid, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.pm_exam_testsdata_candidates(uuid, bigint, text, text, text) to service_role;

commit;
