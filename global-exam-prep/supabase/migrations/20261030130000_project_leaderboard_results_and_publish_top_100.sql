BEGIN;

-- The legacy public row is the published, per-subject Top 100 snapshot.
-- One row per SubjectId lets the publisher update a subject atomically.
CREATE UNIQUE INDEX IF NOT EXISTS leaderboards_subject_id_uidx
  ON public."Leaderboards" ("SubjectId");

COMMENT ON COLUMN public."Leaderboards"."Points" IS
  'Published Top 100 cumulative earned marks per student, aligned by array index with StudentId.';
COMMENT ON COLUMN public."Leaderboards"."TotalTests" IS
  'Count of qualifying finalized attempts per student, aligned by array index with StudentId.';
COMMENT ON TABLE public."Leaderboards" IS
  'Published per-subject Top 100 snapshot. Points is cumulative earned marks; TotalTests is qualifying attempt count. Detailed denominators and category metadata remain in private.leaderboard_attempt_results.';

-- Strengthen the source-row validator. A result must belong to the source
-- attempt, match its canonical catalog subject and exam metadata, and for
-- Test Rooms must also match the participant's positional Points value.
CREATE OR REPLACE FUNCTION private.validate_leaderboard_attempt_result()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_attempt record;
BEGIN
  SELECT
    a.user_id,
    a.score,
    a.total_marks,
    a.status,
    a.attempt_type,
    a.exam_type,
    a.difficulty,
    a.submitted_at,
    a.subject_id,
    a.course_id,
    a.semester,
    s."CourseId" AS catalog_course_id,
    s."Semester" AS catalog_semester
  INTO v_attempt
  FROM private.exam_attempts AS a
  LEFT JOIN public."Subjects" AS s
    ON s."SubjectId" = a.subject_id
  WHERE a.id = NEW.source_attempt_id
  FOR KEY SHARE OF a;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source exam attempt does not exist';
  END IF;

  IF v_attempt.user_id IS DISTINCT FROM NEW.student_auth_uid THEN
    RAISE EXCEPTION 'Leaderboard student does not match source attempt owner';
  END IF;

  IF v_attempt.status NOT IN ('submitted', 'auto_submitted', 'disconnected', 'timed_out')
     OR v_attempt.submitted_at IS NULL
     OR v_attempt.score IS NULL
     OR v_attempt.total_marks <= 0
     OR v_attempt.score < 0
     OR v_attempt.score > v_attempt.total_marks THEN
    RAISE EXCEPTION 'Only finalized, scored attempts with a positive maximum mark can enter the leaderboard';
  END IF;

  IF v_attempt.attempt_type IS DISTINCT FROM NEW.attempt_type
     OR v_attempt.exam_type IS DISTINCT FROM NEW.exam_type
     OR v_attempt.difficulty IS DISTINCT FROM NEW.difficulty THEN
    RAISE EXCEPTION 'Leaderboard attempt metadata does not match source attempt';
  END IF;

  IF v_attempt.subject_id IS NULL
     OR v_attempt.subject_id IS DISTINCT FROM NEW.subject_id
     OR v_attempt.catalog_course_id IS NULL
     OR v_attempt.catalog_course_id IS DISTINCT FROM v_attempt.course_id
     OR v_attempt.catalog_semester IS DISTINCT FROM v_attempt.semester THEN
    RAISE EXCEPTION 'Leaderboard result requires an exact canonical SubjectId, CourseId and semester match';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public."Students" AS student
    WHERE student.auth_uid = NEW.student_auth_uid
  ) THEN
    RAISE EXCEPTION 'Leaderboard result student has no public Students profile';
  END IF;

  IF NEW.attempt_type = 'test_room' AND NOT EXISTS (
    SELECT 1
    FROM private.exam_attempts AS a
    JOIN public."TestRooms" AS room
      ON room."RoomId" = a.core_room_id
    JOIN public."Students" AS student
      ON student.auth_uid = a.user_id
    CROSS JOIN LATERAL pg_catalog.unnest(room."StudentId")
      WITH ORDINALITY AS participant(student_id, ordinality)
    WHERE a.id = NEW.source_attempt_id
      AND a.attempt_type = 'test_room'
      AND room."TestId" = a.core_test_id
      AND room."Difficulty"::text = a.difficulty
      AND participant.student_id = student."StudentId"
      AND room."Points"[participant.ordinality::integer]
          = pg_catalog.least(255, pg_catalog.greatest(0, a.score))::smallint
  ) THEN
    RAISE EXCEPTION 'Test Room result does not match its StudentId/Points position in public.TestRooms';
  END IF;

  NEW.completed_at := v_attempt.submitted_at;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.validate_leaderboard_attempt_result() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.validate_leaderboard_attempt_result() TO service_role;

DROP TRIGGER IF EXISTS validate_leaderboard_attempt_result_before_write
  ON private.leaderboard_attempt_results;

CREATE TRIGGER validate_leaderboard_attempt_result_before_write
BEFORE INSERT OR UPDATE OF
  source_attempt_id,
  student_auth_uid,
  subject_id,
  attempt_type,
  exam_type,
  difficulty,
  score,
  max_score,
  completed_at
ON private.leaderboard_attempt_results
FOR EACH ROW
EXECUTE FUNCTION private.validate_leaderboard_attempt_result();

-- Keep the public table limited to one compact Top 100 snapshot per subject.
-- Ranking order is weighted percentage (sum(score)/sum(max_score)); Points
-- stores sum(score), not the percentage. Stable secondary ordering makes
-- array positions deterministic. True equal-percentage ranks are calculated
-- later from the normalized private result set.
CREATE OR REPLACE FUNCTION private.refresh_leaderboard_subject(p_subject_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_student_ids bigint[];
  v_points bigint[];
  v_total_tests bigint[];
BEGIN
  IF p_subject_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(657344, pg_catalog.hashint8(p_subject_id));

  WITH student_totals AS (
    SELECT
      student."StudentId" AS student_id,
      pg_catalog.sum(result.score)::numeric AS total_points,
      pg_catalog.sum(result.max_score)::numeric AS total_max_score,
      pg_catalog.count(*)::bigint AS total_tests
    FROM private.leaderboard_attempt_results AS result
    JOIN public."Students" AS student
      ON student.auth_uid = result.student_auth_uid
    WHERE result.subject_id = p_subject_id
      AND student.role = 'student'
      AND student."IsSpam" = false
    GROUP BY student."StudentId"
  ),
  ordered_students AS (
    SELECT
      student_id,
      total_points,
      total_tests,
      pg_catalog.row_number() OVER (
        ORDER BY
          total_points / NULLIF(total_max_score, 0) DESC,
          total_points DESC,
          total_tests DESC,
          student_id ASC
      ) AS snapshot_position
    FROM student_totals
  )
  SELECT
    pg_catalog.array_agg(student_id ORDER BY snapshot_position),
    pg_catalog.array_agg(total_points::bigint ORDER BY snapshot_position),
    pg_catalog.array_agg(total_tests ORDER BY snapshot_position)
  INTO v_student_ids, v_points, v_total_tests
  FROM ordered_students
  WHERE snapshot_position <= 100;

  IF v_student_ids IS NULL OR pg_catalog.cardinality(v_student_ids) = 0 THEN
    DELETE FROM public."Leaderboards"
    WHERE "SubjectId" = p_subject_id;
    RETURN;
  END IF;

  INSERT INTO public."Leaderboards" ("StudentId", "Points", "SubjectId", "TotalTests")
  VALUES (v_student_ids, v_points, p_subject_id, v_total_tests)
  ON CONFLICT ("SubjectId") DO UPDATE
  SET
    "StudentId" = EXCLUDED."StudentId",
    "Points" = EXCLUDED."Points",
    "TotalTests" = EXCLUDED."TotalTests";
END;
$function$;

REVOKE ALL ON FUNCTION private.refresh_leaderboard_subject(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.refresh_leaderboard_subject(bigint) TO service_role;

-- Normal exams use the server-calculated private attempt score directly.
-- Test Room attempts are deliberately handled by the TestRooms array projector
-- below so their earned marks come from Points[the matching StudentId index].
CREATE OR REPLACE FUNCTION private.project_normal_exam_attempt_to_leaderboard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_old_subject_id bigint;
  v_new_subject_id bigint;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    SELECT result.subject_id
    INTO v_old_subject_id
    FROM private.leaderboard_attempt_results AS result
    WHERE result.source_attempt_id = NEW.id;
  END IF;

  IF NEW.attempt_type = 'exam' THEN
    IF NEW.status IN ('submitted', 'auto_submitted', 'disconnected', 'timed_out')
       AND NEW.submitted_at IS NOT NULL
       AND NEW.score IS NOT NULL
       AND NEW.total_marks > 0
       AND NEW.score >= 0
       AND NEW.score <= NEW.total_marks
       AND NEW.subject_id IS NOT NULL
       AND NEW.course_id IS NOT NULL
       AND NEW.semester IS NOT NULL
       AND pg_catalog.char_length(pg_catalog.btrim(NEW.exam_type)) BETWEEN 1 AND 80
       AND NEW.difficulty IN ('easy', 'medium', 'hard')
       AND EXISTS (
         SELECT 1
         FROM public."Subjects" AS subject
         WHERE subject."SubjectId" = NEW.subject_id
           AND subject."CourseId" = NEW.course_id
           AND subject."Semester" = NEW.semester
       )
       AND EXISTS (
         SELECT 1
         FROM public."Students" AS student
         WHERE student.auth_uid = NEW.user_id
       ) THEN
      v_new_subject_id := NEW.subject_id;

      INSERT INTO private.leaderboard_attempt_results (
        source_attempt_id,
        student_auth_uid,
        subject_id,
        attempt_type,
        exam_type,
        difficulty,
        score,
        max_score,
        completed_at
      )
      VALUES (
        NEW.id,
        NEW.user_id,
        NEW.subject_id,
        NEW.attempt_type,
        NEW.exam_type,
        NEW.difficulty,
        NEW.score::numeric,
        NEW.total_marks::numeric,
        NEW.submitted_at
      )
      ON CONFLICT (source_attempt_id) DO UPDATE
      SET
        student_auth_uid = EXCLUDED.student_auth_uid,
        subject_id = EXCLUDED.subject_id,
        attempt_type = EXCLUDED.attempt_type,
        exam_type = EXCLUDED.exam_type,
        difficulty = EXCLUDED.difficulty,
        score = EXCLUDED.score,
        max_score = EXCLUDED.max_score,
        completed_at = EXCLUDED.completed_at
      WHERE (
        private.leaderboard_attempt_results.student_auth_uid,
        private.leaderboard_attempt_results.subject_id,
        private.leaderboard_attempt_results.attempt_type,
        private.leaderboard_attempt_results.exam_type,
        private.leaderboard_attempt_results.difficulty,
        private.leaderboard_attempt_results.score,
        private.leaderboard_attempt_results.max_score,
        private.leaderboard_attempt_results.completed_at
      ) IS DISTINCT FROM (
        EXCLUDED.student_auth_uid,
        EXCLUDED.subject_id,
        EXCLUDED.attempt_type,
        EXCLUDED.exam_type,
        EXCLUDED.difficulty,
        EXCLUDED.score,
        EXCLUDED.max_score,
        EXCLUDED.completed_at
      );
    ELSE
      DELETE FROM private.leaderboard_attempt_results
      WHERE source_attempt_id = NEW.id;
    END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.attempt_type = 'exam' THEN
    DELETE FROM private.leaderboard_attempt_results
    WHERE source_attempt_id = NEW.id;
  ELSE
    RETURN NEW;
  END IF;

  IF v_old_subject_id IS NOT NULL
     AND v_old_subject_id IS DISTINCT FROM v_new_subject_id THEN
    PERFORM private.refresh_leaderboard_subject(v_old_subject_id);
  END IF;

  IF v_new_subject_id IS NOT NULL THEN
    PERFORM private.refresh_leaderboard_subject(v_new_subject_id);
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.project_normal_exam_attempt_to_leaderboard() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.project_normal_exam_attempt_to_leaderboard() TO service_role;

-- Test Room score projection reads the actual ordered arrays. It will not
-- accept waiting/cancelled attempts, unmapped students, noncanonical subjects,
-- mismatched scores, or mismatched room/test/difficulty metadata.
CREATE OR REPLACE FUNCTION private.project_testroom_results_to_leaderboard(p_room_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_affected_subjects bigint[];
  v_subject_id bigint;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN;
  END IF;

  WITH candidates AS MATERIALIZED (
    SELECT
      attempt.id AS source_attempt_id,
      attempt.user_id AS student_auth_uid,
      attempt.subject_id,
      attempt.exam_type,
      room."Difficulty"::text AS difficulty,
      room."Points"[participant.ordinality::integer]::numeric AS score,
      attempt.total_marks::numeric AS max_score,
      attempt.submitted_at AS completed_at
    FROM public."TestRooms" AS room
    CROSS JOIN LATERAL pg_catalog.unnest(room."StudentId")
      WITH ORDINALITY AS participant(student_id, ordinality)
    JOIN public."Students" AS student
      ON student."StudentId" = participant.student_id
    JOIN private.exam_attempts AS attempt
      ON attempt.core_room_id = room."RoomId"
     AND attempt.user_id = student.auth_uid
     AND attempt.attempt_type = 'test_room'
    JOIN public."Subjects" AS subject
      ON subject."SubjectId" = attempt.subject_id
     AND subject."CourseId" = attempt.course_id
     AND subject."Semester" = attempt.semester
    WHERE room."RoomId" = p_room_id
      AND room."TestId" = attempt.core_test_id
      AND room."Difficulty"::text = attempt.difficulty
      AND room."Points"[participant.ordinality::integer]
          = pg_catalog.least(255, pg_catalog.greatest(0, attempt.score))::smallint
      AND attempt.status IN ('submitted', 'auto_submitted', 'disconnected', 'timed_out')
      AND attempt.submitted_at IS NOT NULL
      AND attempt.score IS NOT NULL
      AND attempt.score >= 0
      AND attempt.total_marks > 0
      AND attempt.score <= attempt.total_marks
      AND attempt.subject_id IS NOT NULL
      AND pg_catalog.char_length(pg_catalog.btrim(attempt.exam_type)) BETWEEN 1 AND 80
  ),
  existing AS MATERIALIZED (
    SELECT
      result.source_attempt_id,
      result.subject_id
    FROM private.leaderboard_attempt_results AS result
    JOIN candidates
      ON candidates.source_attempt_id = result.source_attempt_id
  ),
  deleted AS (
    DELETE FROM private.leaderboard_attempt_results AS result
    USING private.exam_attempts AS attempt
    WHERE result.source_attempt_id = attempt.id
      AND attempt.attempt_type = 'test_room'
      AND attempt.core_room_id = p_room_id
      AND NOT EXISTS (
        SELECT 1
        FROM candidates
        WHERE candidates.source_attempt_id = attempt.id
      )
    RETURNING result.source_attempt_id, result.subject_id
  ),
  upserted AS (
    INSERT INTO private.leaderboard_attempt_results AS current_result (
      source_attempt_id,
      student_auth_uid,
      subject_id,
      attempt_type,
      exam_type,
      difficulty,
      score,
      max_score,
      completed_at
    )
    SELECT
      source_attempt_id,
      student_auth_uid,
      subject_id,
      'test_room',
      exam_type,
      difficulty,
      score,
      max_score,
      completed_at
    FROM candidates
    ON CONFLICT (source_attempt_id) DO UPDATE
    SET
      student_auth_uid = EXCLUDED.student_auth_uid,
      subject_id = EXCLUDED.subject_id,
      attempt_type = EXCLUDED.attempt_type,
      exam_type = EXCLUDED.exam_type,
      difficulty = EXCLUDED.difficulty,
      score = EXCLUDED.score,
      max_score = EXCLUDED.max_score,
      completed_at = EXCLUDED.completed_at
    WHERE (
      current_result.student_auth_uid,
      current_result.subject_id,
      current_result.attempt_type,
      current_result.exam_type,
      current_result.difficulty,
      current_result.score,
      current_result.max_score,
      current_result.completed_at
    ) IS DISTINCT FROM (
      EXCLUDED.student_auth_uid,
      EXCLUDED.subject_id,
      EXCLUDED.attempt_type,
      EXCLUDED.exam_type,
      EXCLUDED.difficulty,
      EXCLUDED.score,
      EXCLUDED.max_score,
      EXCLUDED.completed_at
    )
    RETURNING source_attempt_id, subject_id
  ),
  changed_subjects AS (
    SELECT subject_id FROM deleted
    UNION ALL
    SELECT subject_id FROM upserted
    UNION ALL
    SELECT existing.subject_id
    FROM existing
    JOIN upserted USING (source_attempt_id)
  )
  SELECT COALESCE(
    pg_catalog.array_agg(DISTINCT changed.subject_id),
    ARRAY[]::bigint[]
  )
  INTO v_affected_subjects
  FROM changed_subjects AS changed
  WHERE changed.subject_id IS NOT NULL;

  FOREACH v_subject_id IN ARRAY v_affected_subjects
  LOOP
    PERFORM private.refresh_leaderboard_subject(v_subject_id);
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION private.project_testroom_results_to_leaderboard(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.project_testroom_results_to_leaderboard(bigint) TO service_role;

-- Existing room rows are updated before private.exam_attempts.core_room_id is
-- assigned for a newly-created room. This trigger handles existing-room
-- updates; the core_room_id trigger below handles the initial linkage.
CREATE OR REPLACE FUNCTION private.project_leaderboard_after_testroom_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM private.project_testroom_results_to_leaderboard(NEW."RoomId");
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.project_leaderboard_after_testroom_write() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.project_leaderboard_after_testroom_write() TO service_role;

DROP TRIGGER IF EXISTS testrooms_project_leaderboard_after_write
  ON public."TestRooms";

CREATE TRIGGER testrooms_project_leaderboard_after_write
AFTER INSERT OR UPDATE OF "TestId", "StudentId", "Points", "Difficulty"
ON public."TestRooms"
FOR EACH ROW
EXECUTE FUNCTION private.project_leaderboard_after_testroom_write();

CREATE OR REPLACE FUNCTION private.project_leaderboard_after_room_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.attempt_type = 'test_room' AND NEW.core_room_id IS NOT NULL THEN
    PERFORM private.project_testroom_results_to_leaderboard(NEW.core_room_id);
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.project_leaderboard_after_room_link() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.project_leaderboard_after_room_link() TO service_role;

DROP TRIGGER IF EXISTS private_exam_attempts_project_leaderboard_after_room_link
  ON private.exam_attempts;

CREATE TRIGGER private_exam_attempts_project_leaderboard_after_room_link
AFTER UPDATE OF core_room_id
ON private.exam_attempts
FOR EACH ROW
WHEN (
  NEW.attempt_type = 'test_room'
  AND NEW.core_room_id IS NOT NULL
  AND NEW.core_room_id IS DISTINCT FROM OLD.core_room_id
)
EXECUTE FUNCTION private.project_leaderboard_after_room_link();

-- Project ordinary finalized exams when their authoritative server-side
-- attempt record changes. Test Room rows remain the only score source for
-- Test Room results.
DROP TRIGGER IF EXISTS private_exam_attempts_z_project_leaderboard_after_write
  ON private.exam_attempts;

CREATE TRIGGER private_exam_attempts_z_project_leaderboard_after_write
AFTER INSERT OR UPDATE OF
  user_id,
  status,
  score,
  total_marks,
  submitted_at,
  attempt_type,
  subject_id,
  course_id,
  semester,
  exam_type,
  difficulty
ON private.exam_attempts
FOR EACH ROW
EXECUTE FUNCTION private.project_normal_exam_attempt_to_leaderboard();

CREATE OR REPLACE FUNCTION private.project_leaderboard_after_attempt_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF OLD.attempt_type = 'test_room' AND OLD.core_room_id IS NOT NULL THEN
    PERFORM private.project_testroom_results_to_leaderboard(OLD.core_room_id);
  END IF;

  IF OLD.subject_id IS NOT NULL THEN
    PERFORM private.refresh_leaderboard_subject(OLD.subject_id);
  END IF;

  RETURN OLD;
END;
$function$;

REVOKE ALL ON FUNCTION private.project_leaderboard_after_attempt_delete() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.project_leaderboard_after_attempt_delete() TO service_role;

DROP TRIGGER IF EXISTS private_exam_attempts_project_leaderboard_after_delete
  ON private.exam_attempts;

CREATE TRIGGER private_exam_attempts_project_leaderboard_after_delete
AFTER DELETE ON private.exam_attempts
FOR EACH ROW
EXECUTE FUNCTION private.project_leaderboard_after_attempt_delete();

-- Backfill completed ordinary exams. Invalid or ambiguous legacy subject
-- records are intentionally excluded; they are never guessed from short codes.
INSERT INTO private.leaderboard_attempt_results (
  source_attempt_id,
  student_auth_uid,
  subject_id,
  attempt_type,
  exam_type,
  difficulty,
  score,
  max_score,
  completed_at
)
SELECT
  attempt.id,
  attempt.user_id,
  attempt.subject_id,
  attempt.attempt_type,
  attempt.exam_type,
  attempt.difficulty,
  attempt.score::numeric,
  attempt.total_marks::numeric,
  attempt.submitted_at
FROM private.exam_attempts AS attempt
JOIN public."Subjects" AS subject
  ON subject."SubjectId" = attempt.subject_id
 AND subject."CourseId" = attempt.course_id
 AND subject."Semester" = attempt.semester
JOIN public."Students" AS student
  ON student.auth_uid = attempt.user_id
WHERE attempt.attempt_type = 'exam'
  AND attempt.status IN ('submitted', 'auto_submitted', 'disconnected', 'timed_out')
  AND attempt.submitted_at IS NOT NULL
  AND attempt.score IS NOT NULL
  AND attempt.total_marks > 0
  AND attempt.score >= 0
  AND attempt.score <= attempt.total_marks
  AND pg_catalog.char_length(pg_catalog.btrim(attempt.exam_type)) BETWEEN 1 AND 80
ON CONFLICT (source_attempt_id) DO UPDATE
SET
  student_auth_uid = EXCLUDED.student_auth_uid,
  subject_id = EXCLUDED.subject_id,
  attempt_type = EXCLUDED.attempt_type,
  exam_type = EXCLUDED.exam_type,
  difficulty = EXCLUDED.difficulty,
  score = EXCLUDED.score,
  max_score = EXCLUDED.max_score,
  completed_at = EXCLUDED.completed_at;

-- Backfill Test Room results by reading TestRooms.StudentId and Points at
-- exactly the same ordinality, then joining each participant to their
-- private attempt for status, canonical subject and maximum-mark metadata.
DO $function$
DECLARE
  v_room_id bigint;
  v_subject_id bigint;
BEGIN
  FOR v_room_id IN
    SELECT room."RoomId"
    FROM public."TestRooms" AS room
    ORDER BY room."RoomId"
  LOOP
    PERFORM private.project_testroom_results_to_leaderboard(v_room_id);
  END LOOP;

  -- Rebuild every currently represented subject once after the backfill.
  FOR v_subject_id IN
    SELECT DISTINCT result.subject_id
    FROM private.leaderboard_attempt_results AS result
    ORDER BY result.subject_id
  LOOP
    PERFORM private.refresh_leaderboard_subject(v_subject_id);
  END LOOP;

  -- Remove any stale published row for which there is no longer a qualifying
  -- normalized result. The public snapshot is derived data, never a source.
  DELETE FROM public."Leaderboards" AS leaderboard
  WHERE NOT EXISTS (
    SELECT 1
    FROM private.leaderboard_attempt_results AS result
    WHERE result.subject_id = leaderboard."SubjectId"
  );
END;
$function$;

COMMENT ON FUNCTION private.refresh_leaderboard_subject(bigint) IS
  'Rebuilds one published Top 100 subject snapshot from normalized finalized results, ranking by weighted percentage.';
COMMENT ON FUNCTION private.project_testroom_results_to_leaderboard(bigint) IS
  'Projects verified Test Room results from public.TestRooms StudentId/Points positional arrays and private attempt metadata; source_attempt_id makes the projection idempotent.';

COMMIT;
