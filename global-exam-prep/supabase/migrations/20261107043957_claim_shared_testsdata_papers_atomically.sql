
begin;

create or replace function public.pm_exam_usage_claim_source_test(
    p_user_id uuid,
    p_reservation_id uuid,
    p_source_test_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
    v_reserved private.exam_usage_ledger%rowtype;
begin
    if p_user_id is null or p_reservation_id is null or p_source_test_id is null then
        raise exception 'A user, reservation and source test are required.';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_user_id::text, 0)
    );

    select * into v_reserved
      from private.exam_usage_ledger
     where id = p_reservation_id
       and user_id = p_user_id
       and status = 'reserved'
       and expires_at > now()
     for update;

    if not found then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'reservation_expired');
    end if;

    if v_reserved.source_test_id = p_source_test_id then
        return pg_catalog.jsonb_build_object('ok', true, 'alreadyClaimed', true);
    end if;

    if exists (
        select 1
          from private.exam_usage_ledger other_usage
         where other_usage.user_id = p_user_id
           and other_usage.source_test_id = p_source_test_id
           and other_usage.id <> p_reservation_id
           and (
                (other_usage.status = 'committed' and other_usage.committed_at >= now() - interval '7 days')
                or (other_usage.status = 'reserved' and other_usage.expires_at > now() and other_usage.reserved_at >= now() - interval '7 days')
           )
    ) then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'paper_already_reserved');
    end if;

    update private.exam_usage_ledger
       set source_test_id = p_source_test_id
     where id = p_reservation_id
       and user_id = p_user_id
       and status = 'reserved';

    return pg_catalog.jsonb_build_object('ok', true, 'alreadyClaimed', false);
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
                 and (
                    (used.status = 'committed' and used.committed_at >= now() - interval '7 days')
                    or (used.status = 'reserved' and used.expires_at > now() and used.reserved_at >= now() - interval '7 days')
                 )
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

revoke all on function public.pm_exam_usage_claim_source_test(uuid, uuid, bigint) from public, anon, authenticated;
grant execute on function public.pm_exam_usage_claim_source_test(uuid, uuid, bigint) to service_role;
revoke all on function public.pm_exam_testsdata_candidates(uuid, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.pm_exam_testsdata_candidates(uuid, bigint, text, text, text) to service_role;

commit;
