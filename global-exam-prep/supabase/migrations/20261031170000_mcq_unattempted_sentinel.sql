-- Use -1 consistently for unattempted MCQ answers.
-- Update the legacy TestRooms validator and mirror function before migrating existing
-- private attempt rows, so the existing public room aggregate accepts the sentinel.

begin;

do $migration$
declare
    function_definition text;
    old_fragment text;
begin
    function_definition := pg_get_functiondef(
        'public.validate_testrooms_before_write()'::regprocedure
    );
    old_fragment := 'IF v_answer IS NULL THEN';
    if position(old_fragment in function_definition) = 0 then
        raise exception 'Could not find unanswered-answer branch in TestRooms validator';
    end if;
    function_definition := replace(
        function_definition,
        old_fragment,
        'IF v_answer IS NULL OR v_answer = -1 THEN'
    );
    execute function_definition;

    function_definition := pg_get_functiondef(
        'private.sync_core_test_room(text)'::regprocedure
    );
    if position('THEN NULL::smallint' in function_definition) = 0 then
        raise exception 'Could not find answer-grid NULL conversion in Test Room synchronizer';
    end if;
    function_definition := replace(
        function_definition,
        'THEN NULL::smallint',
        'THEN -1::smallint'
    );

    old_fragment := 'AND e.value<>''""''::jsonb';
    if (
        length(function_definition) - length(replace(function_definition, old_fragment, ''))
    ) / length(old_fragment) <> 2 then
        raise exception 'Expected two Test Room answer-count predicates to update';
    end if;
    function_definition := replace(
        function_definition,
        old_fragment,
        old_fragment || ' AND e.value<>''-1''::jsonb'
    );
    execute function_definition;
end;
$migration$;

with normalized_room_answers as (
    select
        attempt.id,
        jsonb_agg(
            case
                when entry.answer = 'null'::jsonb then '-1'::jsonb
                else entry.answer
            end
            order by entry.ordinality
        ) as answers
    from private.exam_attempts as attempt
    cross join lateral jsonb_array_elements(
        case
            when jsonb_typeof(attempt.answers) = 'array' then attempt.answers
            else '[]'::jsonb
        end
    ) with ordinality as entry(answer, ordinality)
    where attempt.attempt_type = 'test_room'
      and jsonb_typeof(attempt.answers) = 'array'
      and exists (
          select 1
            from jsonb_array_elements(attempt.answers) as unanswered(answer)
           where unanswered.answer = 'null'::jsonb
      )
    group by attempt.id
)
update private.exam_attempts as attempt
   set answers = normalized.answers
  from normalized_room_answers as normalized
 where normalized.id = attempt.id;

with missing_mcq_answers as (
    select
        attempt.id,
        jsonb_object_agg(question.key, '-1'::jsonb) as answers
    from private.exam_attempts as attempt
    join private.exam_attempt_keys as answer_key
      on answer_key.attempt_id = attempt.id
    cross join lateral jsonb_each(answer_key.answer_key) as question(key, expected)
    where attempt.attempt_type = 'exam'
      and jsonb_typeof(answer_key.answer_key) = 'object'
      and jsonb_typeof(attempt.answers) = 'object'
      and (
          attempt.answers -> question.key is null
          or attempt.answers -> question.key = 'null'::jsonb
          or attempt.answers -> question.key = '""'::jsonb
          or attempt.answers ->> question.key = ''
      )
    group by attempt.id
)
update private.exam_attempts as attempt
   set answers = attempt.answers || missing.answers
  from missing_mcq_answers as missing
 where missing.id = attempt.id;

commit;

notify pgrst, 'reload schema';
