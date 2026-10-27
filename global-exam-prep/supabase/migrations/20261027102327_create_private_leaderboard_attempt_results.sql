-- Private leaderboard result projection; support-table migration moves its attempt FK to private later.
CREATE SCHEMA IF NOT EXISTS private;

REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon;
REVOKE ALL ON SCHEMA private FROM authenticated;
GRANT USAGE ON SCHEMA private TO service_role;

CREATE TABLE private.leaderboard_attempt_results (
  source_attempt_id uuid PRIMARY KEY
    REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  student_auth_uid uuid NOT NULL
    REFERENCES auth.users(id) ON DELETE CASCADE,
  subject_id bigint NOT NULL
    REFERENCES public."Subjects"("SubjectId") ON DELETE RESTRICT,
  attempt_type text NOT NULL
    CHECK (attempt_type IN ('exam', 'test_room')),
  exam_type text NOT NULL
    CHECK (char_length(btrim(exam_type)) BETWEEN 1 AND 80),
  difficulty text NOT NULL
    CHECK (difficulty IN ('easy', 'medium', 'hard')),
  score numeric(8,2) NOT NULL
    CHECK (score >= 0),
  max_score numeric(8,2) NOT NULL
    CHECK (max_score > 0 AND score <= max_score),
  percentage numeric(5,2)
    GENERATED ALWAYS AS (round((score / max_score) * 100, 2)) STORED,
  completed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON SCHEMA private IS
  'Internal, unexposed implementation schema. Not part of the core ER diagram.';
COMMENT ON TABLE private.leaderboard_attempt_results IS
  'Internal leaderboard result projection. One verified, completed result per source exam_attempts row; does not replace or modify core public tables.';
COMMENT ON COLUMN private.leaderboard_attempt_results.source_attempt_id IS
  'One-to-one FK to the existing public.exam_attempts row; also acts as the idempotency key.';
COMMENT ON COLUMN private.leaderboard_attempt_results.student_auth_uid IS
  'Student identity, linked to Supabase Auth and checked against the source attempt by trigger.';
COMMENT ON COLUMN private.leaderboard_attempt_results.subject_id IS
  'Canonical public.Subjects.SubjectId; legacy subject codes are not stored as subject identity.';
COMMENT ON COLUMN private.leaderboard_attempt_results.percentage IS
  'Calculated by PostgreSQL from score and max_score; not supplied by the browser.';

CREATE INDEX leaderboard_attempt_results_subject_exam_completed_idx
  ON private.leaderboard_attempt_results (subject_id, exam_type, completed_at DESC);
CREATE INDEX leaderboard_attempt_results_student_subject_exam_idx
  ON private.leaderboard_attempt_results (student_auth_uid, subject_id, exam_type, completed_at DESC);

CREATE FUNCTION private.validate_leaderboard_attempt_result()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
DECLARE
  v_attempt record;
BEGIN
  SELECT a.user_id, a.score, a.total_marks, a.status, a.attempt_type,
         a.difficulty, a.submitted_at
    INTO v_attempt
    FROM public.exam_attempts AS a
   WHERE a.id = NEW.source_attempt_id
   FOR KEY SHARE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Source exam attempt does not exist'; END IF;
  IF v_attempt.user_id IS DISTINCT FROM NEW.student_auth_uid THEN
    RAISE EXCEPTION 'Leaderboard student does not match source attempt owner';
  END IF;
  IF v_attempt.status NOT IN ('submitted', 'auto_submitted')
     OR v_attempt.submitted_at IS NULL OR v_attempt.score IS NULL THEN
    RAISE EXCEPTION 'Only completed, scored attempts can enter the leaderboard';
  END IF;
  IF v_attempt.attempt_type IS DISTINCT FROM NEW.attempt_type
     OR v_attempt.difficulty IS DISTINCT FROM NEW.difficulty THEN
    RAISE EXCEPTION 'Leaderboard attempt metadata does not match source attempt';
  END IF;
  IF v_attempt.score::numeric IS DISTINCT FROM NEW.score
     OR v_attempt.total_marks::numeric IS DISTINCT FROM NEW.max_score THEN
    RAISE EXCEPTION 'Leaderboard score must match the finalized source attempt';
  END IF;
  NEW.completed_at := v_attempt.submitted_at;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION private.validate_leaderboard_attempt_result() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.validate_leaderboard_attempt_result() FROM anon;
REVOKE ALL ON FUNCTION private.validate_leaderboard_attempt_result() FROM authenticated;
GRANT EXECUTE ON FUNCTION private.validate_leaderboard_attempt_result() TO service_role;

CREATE TRIGGER validate_leaderboard_attempt_result_before_write
BEFORE INSERT OR UPDATE OF source_attempt_id, student_auth_uid, attempt_type, difficulty, score, max_score, completed_at
ON private.leaderboard_attempt_results
FOR EACH ROW EXECUTE FUNCTION private.validate_leaderboard_attempt_result();

ALTER TABLE private.leaderboard_attempt_results ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE private.leaderboard_attempt_results FROM PUBLIC;
REVOKE ALL ON TABLE private.leaderboard_attempt_results FROM anon;
REVOKE ALL ON TABLE private.leaderboard_attempt_results FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE private.leaderboard_attempt_results TO service_role;
