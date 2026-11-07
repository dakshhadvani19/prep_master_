begin;

create table if not exists private.exam_source_paper_history (
    user_id uuid not null references auth.users(id) on delete cascade,
    source_test_id bigint not null,
    first_received_at timestamptz not null default now(),
    primary key (user_id, source_test_id)
);

create index if not exists exam_source_paper_history_user_idx
    on private.exam_source_paper_history (user_id, first_received_at desc);

alter table private.exam_source_paper_history enable row level security;
revoke all on private.exam_source_paper_history from public, anon, authenticated;
grant select, insert, update, delete on private.exam_source_paper_history to service_role;

insert into private.exam_source_paper_history (user_id, source_test_id, first_received_at)
select distinct on (user_id, source_test_id)
       user_id, source_test_id, coalesce(committed_at, created_at, now())
  from private.exam_usage_ledger
 where status = 'committed'
   and source_test_id is not null
 order by user_id, source_test_id, committed_at asc nulls first
on conflict (user_id, source_test_id) do nothing;

create or replace function public.pm_exam_source_paper_claim(
    p_user_id uuid,
    p_reservation_id uuid,
    p_source_test_id bigint,
    p_require_usage_reservation boolean default true
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
    v_reserved private.exam_usage_ledger%rowtype;
    v_inserted bigint;
begin
    if p_user_id is null or p_source_test_id is null or p_source_test_id <= 0 then
        raise exception 'A user and valid source paper are required.';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(p_user_id::text, 0)
    );

    if p_require_usage_reservation then
        if p_reservation_id is null then
            return pg_catalog.jsonb_build_object('ok', false, 'reason', 'reservation_missing');
        end if;

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
    end if;

    if exists (
        select 1
          from private.exam_source_paper_history history
         where history.user_id = p_user_id
           and history.source_test_id = p_source_test_id
    ) or exists (
        select 1
          from private.exam_usage_ledger used
         where used.user_id = p_user_id
           and used.source_test_id = p_source_test_id
           and used.status = 'committed'
    ) then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'paper_already_received');
    end if;

    insert into private.exam_source_paper_history (user_id, source_test_id)
    values (p_user_id, p_source_test_id)
    on conflict (user_id, source_test_id) do nothing
    returning source_test_id into v_inserted;

    if v_inserted is null then
        return pg_catalog.jsonb_build_object('ok', false, 'reason', 'paper_already_received');
    end if;

    if p_require_usage_reservation then
        update private.exam_usage_ledger
           set source_test_id = p_source_test_id
         where id = p_reservation_id
           and user_id = p_user_id
           and status = 'reserved';
    end if;

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
volatile
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
                from private.exam_source_paper_history received
               where received.user_id = p_user_id
                 and received.source_test_id = td."TestId"
          )
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
            ) order by random()
        ),
        '[]'::jsonb
    )
    from (select * from mapped order by random() limit 20) candidates;
$function$;

revoke all on function public.pm_exam_source_paper_claim(uuid, uuid, bigint, boolean) from public, anon, authenticated;
grant execute on function public.pm_exam_source_paper_claim(uuid, uuid, bigint, boolean) to service_role;
revoke all on function public.pm_exam_testsdata_candidates(uuid, bigint, text, text, text) from public, anon, authenticated;
grant execute on function public.pm_exam_testsdata_candidates(uuid, bigint, text, text, text) to service_role;

commit;
