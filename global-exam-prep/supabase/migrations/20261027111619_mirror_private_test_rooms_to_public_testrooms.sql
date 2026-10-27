BEGIN;

ALTER TABLE private.exam_attempts
  ADD COLUMN IF NOT EXISTS core_room_id bigint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='private.exam_attempts'::regclass
      AND conname='exam_attempts_core_room_id_fkey'
  ) THEN
    ALTER TABLE private.exam_attempts
      ADD CONSTRAINT exam_attempts_core_room_id_fkey
      FOREIGN KEY (core_room_id) REFERENCES public."TestRooms"("RoomId")
      ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS exam_attempts_room_code_core_room_idx
  ON private.exam_attempts (room_code, core_room_id)
  WHERE attempt_type='test_room';

-- Do not overwrite a saved paper's answer key before the private key exists.
CREATE OR REPLACE FUNCTION private.sync_core_exam_test_key(p_attempt_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
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
  IF NOT FOUND OR v_key IS NULL OR jsonb_typeof(v_key) NOT IN ('array','object') THEN RETURN; END IF;

  v_question_count := jsonb_array_length(COALESCE(v_attempt.questions,'[]'::jsonb));
  IF v_question_count < 1 THEN RETURN; END IF;
  IF jsonb_typeof(v_key)='array' THEN
    SELECT ARRAY(SELECT e.value FROM jsonb_array_elements(v_key) WITH ORDINALITY e(value,ord) ORDER BY e.ord)
      INTO v_key_array;
  ELSE
    SELECT ARRAY(SELECT v_key -> (q.value ->> 'id')
                 FROM jsonb_array_elements(v_attempt.questions) WITH ORDINALITY q(value,ord)
                 ORDER BY q.ord)
      INTO v_key_array;
  END IF;

  IF cardinality(v_key_array) <> v_question_count
     OR EXISTS (SELECT 1 FROM unnest(v_key_array) k(value) WHERE k.value IS NULL OR k.value='null'::jsonb) THEN
    RETURN;
  END IF;
  UPDATE public."TestsData" SET "Answers"=v_key_array WHERE "TestId"=v_attempt.core_test_id;
  PERFORM private.sync_core_exam_attempt(p_attempt_id);
END;
$function$;

CREATE OR REPLACE FUNCTION private.sync_core_test_room(p_room_code text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $function$
DECLARE
  v_test_id bigint;
  v_room_id bigint;
  v_attempt_count integer;
  v_test_count integer;
  v_unlinked_count integer;
  v_question_count integer;
  v_questions jsonb[];
  v_options jsonb[];
  v_key_array jsonb[];
  v_student_ids bigint[];
  v_points smallint[];
  v_correct smallint[];
  v_incorrect smallint[];
  v_attempted smallint[];
  v_unattempted smallint[];
  v_answers smallint[][];
BEGIN
  IF p_room_code IS NULL OR btrim(p_room_code)='' THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(657342, hashtext(p_room_code));

  SELECT count(*),count(DISTINCT core_test_id),
         count(*) FILTER (WHERE core_test_id IS NULL OR core_attempt_id IS NULL),
         min(core_test_id)
    INTO v_attempt_count,v_test_count,v_unlinked_count,v_test_id
    FROM private.exam_attempts
   WHERE attempt_type='test_room' AND room_code=p_room_code;

  IF v_attempt_count=0 OR v_unlinked_count>0 THEN RETURN; END IF;
  IF v_test_count<>1 OR v_test_id IS NULL THEN
    RAISE EXCEPTION 'Test Room attempts do not share one canonical saved paper';
  END IF;
  IF v_attempt_count>50 THEN RAISE EXCEPTION 'Test Room contains more than 50 attempt records'; END IF;

  SELECT d."Questions",d."Options",d."Answers"
    INTO v_questions,v_options,v_key_array
    FROM public."TestsData" d WHERE d."TestId"=v_test_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_question_count := cardinality(v_questions);
  IF v_question_count NOT BETWEEN 1 AND 30
     OR cardinality(v_options)<>v_question_count*4
     OR cardinality(v_key_array)<>v_question_count
     OR EXISTS (SELECT 1 FROM unnest(v_key_array) k(value)
                WHERE k.value IS NULL OR jsonb_typeof(k.value)<>'number'
                   OR (k.value #>> '{}') !~ '^[0-3]$') THEN
    -- During initial creation the paper can exist before its answer key.
    -- The answer-key trigger retries the aggregate after the full key is stored.
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM private.exam_attempts a
      WHERE a.attempt_type='test_room' AND a.room_code=p_room_code
        AND (jsonb_typeof(a.answers)<>'array' OR jsonb_array_length(a.answers)<>v_question_count)) THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM private.exam_attempts a
      LEFT JOIN public."Students" s ON s.auth_uid=a.user_id
      WHERE a.attempt_type='test_room' AND a.room_code=p_room_code AND s."StudentId" IS NULL) THEN
    RAISE EXCEPTION 'A Test Room participant has no linked public.Students profile';
  END IF;

  WITH members AS (
    SELECT a.id,a.created_at,a.user_id,a.room_role,
      s."StudentId" AS student_id,
      CASE WHEN a.room_role='host' THEN 0 ELSE 1 END AS host_order,
      LEAST(255,GREATEST(0,COALESCE(a.score,0)))::smallint AS points,
      ARRAY(
        SELECT CASE WHEN e.value IS NULL OR e.value='null'::jsonb OR e.value='""'::jsonb
                    THEN NULL::smallint ELSE (e.value #>> '{}')::smallint END
        FROM jsonb_array_elements(a.answers) WITH ORDINALITY e(value,ord) ORDER BY e.ord
      ) AS answer_values,
      (SELECT count(*)::integer
         FROM jsonb_array_elements(a.answers) WITH ORDINALITY e(value,ord)
        WHERE e.value IS NOT NULL AND e.value<>'null'::jsonb AND e.value<>'""'::jsonb) AS attempted_count,
      (SELECT count(*)::integer
         FROM jsonb_array_elements(a.answers) WITH ORDINALITY e(value,ord)
        WHERE e.value IS NOT NULL AND e.value<>'null'::jsonb AND e.value<>'""'::jsonb
          AND e.value=v_key_array[e.ord::integer]) AS correct_count
    FROM private.exam_attempts a
    JOIN public."Students" s ON s.auth_uid=a.user_id
    WHERE a.attempt_type='test_room' AND a.room_code=p_room_code
  ),
  normalized AS (
    SELECT m.*,
      (m.attempted_count-m.correct_count)::smallint AS incorrect_count,
      (v_question_count-m.attempted_count)::smallint AS unattempted_count
    FROM members m
  )
  SELECT
    array_agg(student_id ORDER BY host_order,created_at,id),
    array_agg(points ORDER BY host_order,created_at,id),
    array_agg(correct_count::smallint ORDER BY host_order,created_at,id),
    array_agg(incorrect_count ORDER BY host_order,created_at,id),
    array_agg(attempted_count::smallint ORDER BY host_order,created_at,id),
    array_agg(unattempted_count ORDER BY host_order,created_at,id),
    array_agg(answer_values ORDER BY host_order,created_at,id)
  INTO v_student_ids,v_points,v_correct,v_incorrect,v_attempted,v_unattempted,v_answers
  FROM normalized;

  IF cardinality(v_student_ids) NOT BETWEEN 1 AND 50
     OR cardinality(v_points)<>cardinality(v_student_ids)
     OR COALESCE(array_ndims(v_answers),0)<>2
     OR array_length(v_answers,1)<>cardinality(v_student_ids)
     OR array_length(v_answers,2)<>v_question_count THEN
    RAISE EXCEPTION 'Unable to build a rectangular Test Room answer grid';
  END IF;

  SELECT min(core_room_id) INTO v_room_id
    FROM private.exam_attempts
   WHERE attempt_type='test_room' AND room_code=p_room_code AND core_room_id IS NOT NULL;

  IF v_room_id IS NULL THEN
    INSERT INTO public."TestRooms" (
      "TestId","StudentId","Points","Difficulty","Correct","InCorrect","Attempted","Unattempted","Answers"
    )
    VALUES (
      v_test_id,v_student_ids,v_points,
      (SELECT a.difficulty FROM private.exam_attempts a
       WHERE a.attempt_type='test_room' AND a.room_code=p_room_code
       ORDER BY CASE WHEN a.room_role='host' THEN 0 ELSE 1 END,a.created_at,a.id LIMIT 1),
      v_correct,v_incorrect,v_attempted,v_unattempted,v_answers
    ) RETURNING "RoomId" INTO v_room_id;
  ELSE
    UPDATE public."TestRooms"
       SET "TestId"=v_test_id,"StudentId"=v_student_ids,"Points"=v_points,
           "Difficulty"=(SELECT a.difficulty FROM private.exam_attempts a
              WHERE a.attempt_type='test_room' AND a.room_code=p_room_code
              ORDER BY CASE WHEN a.room_role='host' THEN 0 ELSE 1 END,a.created_at,a.id LIMIT 1),
           "Correct"=v_correct,"InCorrect"=v_incorrect,"Attempted"=v_attempted,
           "Unattempted"=v_unattempted,"Answers"=v_answers
     WHERE "RoomId"=v_room_id;
    IF NOT FOUND THEN
      INSERT INTO public."TestRooms" (
        "TestId","StudentId","Points","Difficulty","Correct","InCorrect","Attempted","Unattempted","Answers"
      )
      VALUES (
        v_test_id,v_student_ids,v_points,
        (SELECT a.difficulty FROM private.exam_attempts a
         WHERE a.attempt_type='test_room' AND a.room_code=p_room_code
         ORDER BY CASE WHEN a.room_role='host' THEN 0 ELSE 1 END,a.created_at,a.id LIMIT 1),
        v_correct,v_incorrect,v_attempted,v_unattempted,v_answers
      ) RETURNING "RoomId" INTO v_room_id;
    END IF;
  END IF;

  UPDATE private.exam_attempts SET core_room_id=v_room_id
   WHERE attempt_type='test_room' AND room_code=p_room_code
     AND core_room_id IS DISTINCT FROM v_room_id;
END;
$function$;

CREATE OR REPLACE FUNCTION private.sync_private_attempt_to_core_room()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $function$
BEGIN
  IF TG_OP='UPDATE' AND OLD.room_code IS DISTINCT FROM NEW.room_code
     AND OLD.attempt_type='test_room' AND OLD.room_code IS NOT NULL THEN
    PERFORM private.sync_core_test_room(OLD.room_code);
  END IF;
  IF NEW.attempt_type='test_room' AND NEW.room_code IS NOT NULL THEN
    PERFORM private.sync_core_test_room(NEW.room_code);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.sync_private_answer_key_to_core()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog
AS $function$
DECLARE v_attempt private.exam_attempts%ROWTYPE;
BEGIN
  PERFORM private.sync_core_exam_test_key(NEW.attempt_id);
  SELECT * INTO v_attempt FROM private.exam_attempts WHERE id=NEW.attempt_id;
  IF FOUND AND v_attempt.attempt_type='test_room' AND v_attempt.room_code IS NOT NULL THEN
    PERFORM private.sync_core_test_room(v_attempt.room_code);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS private_exam_attempts_sync_room_after_insert ON private.exam_attempts;
CREATE TRIGGER private_exam_attempts_sync_room_after_insert
AFTER INSERT ON private.exam_attempts
FOR EACH ROW EXECUTE FUNCTION private.sync_private_attempt_to_core_room();

DROP TRIGGER IF EXISTS private_exam_attempts_sync_room_after_update ON private.exam_attempts;
CREATE TRIGGER private_exam_attempts_sync_room_after_update
AFTER UPDATE OF user_id,answers,score,status,attempt_type,room_code,difficulty,submitted_at,core_test_id,core_attempt_id
ON private.exam_attempts
FOR EACH ROW EXECUTE FUNCTION private.sync_private_attempt_to_core_room();

REVOKE ALL ON FUNCTION private.sync_core_exam_test_key(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.sync_core_test_room(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.sync_private_attempt_to_core_room() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION private.sync_private_answer_key_to_core() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.sync_core_exam_test_key(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.sync_core_test_room(text) TO service_role;

DO $$
DECLARE v_code text;
BEGIN
  FOR v_code IN SELECT DISTINCT room_code FROM private.exam_attempts
    WHERE attempt_type='test_room' AND room_code IS NOT NULL ORDER BY room_code
  LOOP
    PERFORM private.sync_core_test_room(v_code);
  END LOOP;
END;
$$;

COMMENT ON COLUMN private.exam_attempts.core_room_id IS
  'Link to public.TestRooms.RoomId for the room aggregate. Room codes and lifecycle stay in private/Redis.';
COMMENT ON FUNCTION private.sync_core_test_room(text) IS
  'Idempotently mirrors one private Redis-backed Test Room cohort to the existing public.TestRooms ERD table.';

NOTIFY pgrst, 'reload schema';
COMMIT;
