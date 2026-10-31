-- Treat the MCQ -1 sentinel as unanswered in the legacy TestAttempts mirror.
-- Keep -1 in the mirrored Answers array, but exclude it from score/count totals.

begin;

do $migration$
declare
    function_definition text;
    old_fragment text;
begin
    function_definition := pg_get_functiondef(
        'private.sync_core_exam_attempt(uuid)'::regprocedure
    );
    old_fragment := 'v_answer IS NULL OR v_answer = ''null''::jsonb OR v_answer = ''""''::jsonb';

    if position(old_fragment in function_definition) = 0 then
        raise exception 'Could not find unanswered-answer branch in normal exam synchronizer';
    end if;

    function_definition := replace(
        function_definition,
        old_fragment,
        old_fragment || ' OR v_answer = ''-1''::jsonb'
    );
    execute function_definition;
end;
$migration$;

-- Re-run the core mirror for existing linked attempts, so public TestAttempts
-- has the same -1 values and attempted/unattempted totals as private attempts.
do $resync$
declare
    attempt_id uuid;
begin
    for attempt_id in
        select id
          from private.exam_attempts
         where attempt_type = 'exam'
           and core_test_id is not null
           and core_attempt_id is not null
         order by created_at, id
    loop
        perform private.sync_core_exam_attempt(attempt_id);
    end loop;
end;
$resync$;

commit;
