BEGIN;

ALTER TABLE private.exam_attempts
  ADD COLUMN IF NOT EXISTS core_test_id bigint,
  ADD COLUMN IF NOT EXISTS core_attempt_id bigint;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='private.exam_attempts'::regclass AND conname='exam_attempts_core_test_id_fkey') THEN
    ALTER TABLE private.exam_attempts ADD CONSTRAINT exam_attempts_core_test_id_fkey
      FOREIGN KEY (core_test_id) REFERENCES public."TestsData"("TestId") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='private.exam_attempts'::regclass AND conname='exam_attempts_core_attempt_id_fkey') THEN
    ALTER TABLE private.exam_attempts ADD CONSTRAINT exam_attempts_core_attempt_id_fkey
      FOREIGN KEY (core_attempt_id) REFERENCES public."TestAttempts"("AttemptId") ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION private.sync_core_exam_attempt(p_attempt_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $function$
DECLARE
  v_attempt private.exam_attempts%ROWTYPE;
  v_key jsonb;
  v_questions jsonb[];
  v_key_array jsonb[];
  v_answers_array jsonb[];
  v_question_count integer;
  v_attempted integer := 0;
  v_correct integer := 0;
  v_incorrect integer := 0;
  v_unattempted integer := 0;
  v_answer jsonb;
  v_expected jsonb;
  v_question jsonb;
  v_i integer;
  v_points integer;
BEGIN
  SELECT * INTO v_attempt FROM private.exam_attempts WHERE id=p_attempt_id;
  IF NOT FOUND OR v_attempt.core_test_id IS NULL OR v_attempt.core_attempt_id IS NULL THEN RETURN; END IF;
  v_question_count := jsonb_array_length(COALESCE(v_attempt.questions, '[]'::jsonb));
  IF v_question_count < 1 OR v_question_count > 50 THEN RAISE EXCEPTION 'Core attempt must contain 1 to 50 questions'; END IF;

  SELECT ARRAY(SELECT q.value FROM jsonb_array_elements(v_attempt.questions) WITH ORDINALITY q(value,ord) ORDER BY q.ord) INTO v_questions;
  SELECT k.answer_key INTO v_key FROM private.exam_attempt_keys k WHERE k.attempt_id=p_attempt_id;

  IF jsonb_typeof(v_key)='array' THEN
    SELECT ARRAY(SELECT e.value FROM jsonb_array_elements(v_key) WITH ORDINALITY e(value,ord) ORDER BY e.ord) INTO v_key_array;
  ELSIF jsonb_typeof(v_key)='object' THEN
    SELECT ARRAY(SELECT v_key -> (q.value ->> 'id') FROM jsonb_array_elements(v_attempt.questions) WITH ORDINALITY q(value,ord) ORDER BY q.ord) INTO v_key_array;
  ELSE
    v_key_array := array_fill(NULL::jsonb, ARRAY[v_question_count]);
  END IF;

  IF jsonb_typeof(v_attempt.answers)='array' THEN
    SELECT ARRAY(SELECT a.value FROM jsonb_array_elements(v_attempt.answers) WITH ORDINALITY a(value,ord) ORDER BY a.ord) INTO v_answers_array;
  ELSIF jsonb_typeof(v_attempt.answers)='object' THEN
    SELECT ARRAY(SELECT v_attempt.answers -> (q.value ->> 'id') FROM jsonb_array_elements(v_attempt.questions) WITH ORDINALITY q(value,ord) ORDER BY q.ord) INTO v_answers_array;
  ELSE
    v_answers_array := array_fill('null'::jsonb, ARRAY[v_question_count]);
  END IF;
  IF cardinality(v_answers_array) <> v_question_count THEN RAISE EXCEPTION 'Core answer count does not match the saved question count'; END IF;

  FOR v_i IN 1..v_question_count LOOP
    v_question := v_questions[v_i];
    v_answer := v_answers_array[v_i];
    v_expected := v_key_array[v_i];
    IF v_answer IS NULL OR v_answer='null'::jsonb OR v_answer='""'::jsonb THEN CONTINUE; END IF;
    v_attempted := v_attempted + 1;
    IF v_question ->> 'type'='mcq' OR jsonb_typeof(v_question -> 'options')='array' THEN
      IF v_expected IS NOT NULL AND v_expected <> 'null'::jsonb AND v_answer=v_expected THEN
        v_correct := v_correct + 1;
      ELSE
        v_incorrect := v_incorrect + 1;
      END IF;
    END IF;
  END LOOP;

  v_unattempted := v_question_count - v_attempted;
  v_points := LEAST(255, GREATEST(0, COALESCE(v_attempt.score,0)));
  UPDATE public."TestAttempts"
     SET "Answers"=v_answers_array,
         "Points"=v_points::smallint,
         "Difficulty"=COALESCE(v_attempt.difficulty,'medium'),
         "Correct"=v_correct::smallint,
         "InCorrect"=v_incorrect::smallint,
         "Attempted"=v_attempted::smallint,
         "UnAttempted"=v_unattempted::smallint
   WHERE "AttemptId"=v_attempt.core_attempt_id;
END;
$function$;

CREATE OR REPLACE FUNCTION private.sync_core_exam_test_key(p_attempt_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $function$
DECLARE
  v_attempt private.exam_attempts%ROWTYPE;
  v_key jsonb;
  v_key_array jsonb[];
  v_question_count integer;
BEGIN
  SELECT * INTO v_attempt FROM private.exam_attempts WHERE id=p_attempt_id;
  IF NOT FOUND OR v_attempt.core_test_id IS NULL THEN RETURN; END IF;
  SELECT answer_key INTO v_key FROM private.exam_attempt_keys WHERE attempt_id=p_attempt_id;
  v_question_count := jsonb_array_length(COALESCE(v_attempt.questions,'[]'::jsonb));

  IF jsonb_typeof(v_key)='array' THEN
    SELECT ARRAY(SELECT e.value FROM jsonb_array_elements(v_key) WITH ORDINALITY e(value,ord) ORDER BY e.ord) INTO v_key_array;
  ELSIF jsonb_typeof(v_key)='object' THEN
    SELECT ARRAY(SELECT v_key -> (q.value ->> 'id') FROM jsonb_array_elements(v_attempt.questions) WITH ORDINALITY q(value,ord) ORDER BY q.ord) INTO v_key_array;
  ELSE
    v_key_array := array_fill(NULL::jsonb, ARRAY[v_question_count]);
  END IF;
  IF cardinality(v_key_array) <> v_question_count THEN RAISE EXCEPTION 'Core answer-key count does not match the saved question count'; END IF;

  UPDATE public."TestsData" SET "Answers"=v_key_array WHERE "TestId"=v_attempt.core_test_id;
  PERFORM private.sync_core_exam_attempt(p_attempt_id);
END;
$function$;

CREATE OR REPLACE FUNCTION private.ensure_core_exam_attempt(p_attempt_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $function$
DECLARE
  v_attempt private.exam_attempts%ROWTYPE;
  v_student_id bigint;
  v_test_id bigint;
  v_core_attempt_id bigint;
  v_questions jsonb[];
  v_options jsonb[];
  v_key jsonb;
  v_key_array jsonb[];
  v_question_count integer;
  v_initial_answers jsonb[];
BEGIN
  SELECT * INTO v_attempt FROM private.exam_attempts WHERE id=p_attempt_id;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT s."StudentId" INTO v_student_id FROM public."Students" s WHERE s.auth_uid=v_attempt.user_id;
  IF v_student_id IS NULL THEN RAISE EXCEPTION 'No public.Students profile exists for the authenticated attempt owner'; END IF;
  IF v_attempt.core_test_id IS NOT NULL AND v_attempt.core_attempt_id IS NOT NULL THEN
    PERFORM private.sync_core_exam_attempt(p_attempt_id);
    RETURN;
  END IF;

  v_question_count := jsonb_array_length(COALESCE(v_attempt.questions,'[]'::jsonb));
  IF v_question_count < 1 OR v_question_count > 50 THEN RAISE EXCEPTION 'Public TestAttempts supports 1 to 50 questions per saved attempt'; END IF;

  PERFORM pg_advisory_xact_lock(657341,211);
  IF v_attempt.attempt_type='test_room' AND NULLIF(v_attempt.room_code,'') IS NOT NULL THEN
    SELECT a.core_test_id INTO v_test_id
      FROM private.exam_attempts a
     WHERE a.room_code=v_attempt.room_code AND a.id<>v_attempt.id AND a.core_test_id IS NOT NULL
     ORDER BY a.created_at LIMIT 1;
  END IF;

  IF v_test_id IS NULL THEN
    SELECT COALESCE(MAX(td."TestId"),0)+1 INTO v_test_id FROM public."TestsData" td;
    SELECT ARRAY(SELECT q.value FROM jsonb_array_elements(v_attempt.questions) WITH ORDINALITY q(value,ord) ORDER BY q.ord) INTO v_questions;
    SELECT ARRAY(SELECT o.option_value
      FROM jsonb_array_elements(v_attempt.questions) WITH ORDINALITY q(value,q_ord)
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(q.value->'options')='array' THEN q.value->'options' ELSE '[]'::jsonb END)
        WITH ORDINALITY o(option_value,o_ord)
      ORDER BY q.q_ord,o.o_ord) INTO v_options;
    SELECT answer_key INTO v_key FROM private.exam_attempt_keys WHERE attempt_id=p_attempt_id;
    IF jsonb_typeof(v_key)='array' THEN
      SELECT ARRAY(SELECT e.value FROM jsonb_array_elements(v_key) WITH ORDINALITY e(value,ord) ORDER BY e.ord) INTO v_key_array;
    ELSIF jsonb_typeof(v_key)='object' THEN
      SELECT ARRAY(SELECT v_key -> (q.value->>'id') FROM jsonb_array_elements(v_attempt.questions) WITH ORDINALITY q(value,ord) ORDER BY q.ord) INTO v_key_array;
    ELSE
      v_key_array := array_fill(NULL::jsonb, ARRAY[v_question_count]);
    END IF;
    INSERT INTO public."TestsData" ("TestId","Questions","Options","Answers")
    VALUES (v_test_id,v_questions,COALESCE(v_options,ARRAY[]::jsonb[]),v_key_array);
  END IF;

  SELECT ta."AttemptId" INTO v_core_attempt_id FROM public."TestAttempts" ta
   WHERE ta."TestId"=v_test_id AND ta."StudentId"=v_student_id LIMIT 1;
  IF v_core_attempt_id IS NULL THEN
    v_initial_answers := array_fill('null'::jsonb,ARRAY[v_question_count]);
    INSERT INTO public."TestAttempts" ("TestId","StudentId","Points","Difficulty","Correct","InCorrect","UnAttempted","Attempted","Answers")
    VALUES (v_test_id,v_student_id,0,COALESCE(v_attempt.difficulty,'medium'),0,0,v_question_count,0,v_initial_answers)
    RETURNING "AttemptId" INTO v_core_attempt_id;
  END IF;

  UPDATE private.exam_attempts SET core_test_id=v_test_id,core_attempt_id=v_core_attempt_id
   WHERE id=p_attempt_id AND (core_test_id IS DISTINCT FROM v_test_id OR core_attempt_id IS DISTINCT FROM v_core_attempt_id);
  PERFORM private.sync_core_exam_test_key(p_attempt_id);
  PERFORM private.sync_core_exam_attempt(p_attempt_id);
END;
$function$;

CREATE OR REPLACE FUNCTION private.sync_private_attempt_to_core()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $function$
BEGIN
  IF TG_OP='UPDATE' AND
    (NEW.core_test_id IS DISTINCT FROM OLD.core_test_id OR NEW.core_attempt_id IS DISTINCT FROM OLD.core_attempt_id) THEN
    RETURN NEW;
  END IF;
  PERFORM private.ensure_core_exam_attempt(NEW.id);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.sync_private_answer_key_to_core()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $function$
BEGIN
  PERFORM private.sync_core_exam_test_key(NEW.attempt_id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS private_exam_attempts_sync_core_after_write ON private.exam_attempts;
CREATE TRIGGER private_exam_attempts_sync_core_after_write
AFTER INSERT OR UPDATE ON private.exam_attempts
FOR EACH ROW EXECUTE FUNCTION private.sync_private_attempt_to_core();

DROP TRIGGER IF EXISTS private_exam_attempt_keys_sync_core_after_write ON private.exam_attempt_keys;
CREATE TRIGGER private_exam_attempt_keys_sync_core_after_write
AFTER INSERT OR UPDATE ON private.exam_attempt_keys
FOR EACH ROW EXECUTE FUNCTION private.sync_private_answer_key_to_core();

REVOKE ALL ON FUNCTION private.sync_core_exam_attempt(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.sync_core_exam_test_key(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.ensure_core_exam_attempt(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.sync_private_attempt_to_core() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.sync_private_answer_key_to_core() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.sync_core_exam_attempt(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.sync_core_exam_test_key(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.ensure_core_exam_attempt(uuid) TO service_role;

UPDATE private.exam_attempts SET updated_at=updated_at;

COMMENT ON COLUMN private.exam_attempts.core_test_id IS
  'Link to the canonical public.TestsData row mirrored for the ERD. Test Room participants share their room paper.';
COMMENT ON COLUMN private.exam_attempts.core_attempt_id IS
  'Link to the individual public.TestAttempts row used by the ERD; operational status and recovery details remain private.';

NOTIFY pgrst,'reload schema';
NOTIFY pgrst, 'reload schema';
COMMIT;
