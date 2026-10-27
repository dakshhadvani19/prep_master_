BEGIN;

-- Timeouts and disconnects are finalized exam attempts too: if the server
-- recorded a score and submission timestamp, they qualify for subject access.
DROP INDEX IF EXISTS private.exam_attempts_user_subject_completed_idx;
CREATE INDEX exam_attempts_user_subject_completed_idx
  ON private.exam_attempts (user_id, subject_id, submitted_at DESC)
  WHERE status IN ('submitted','auto_submitted','disconnected','timed_out')
    AND submitted_at IS NOT NULL
    AND score IS NOT NULL
    AND total_marks > 0;

CREATE OR REPLACE FUNCTION public.pm_leaderboard_completed_subjects(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'subject_id', completed.subject_id,
        'course_id', completed.course_id,
        'semester', completed.semester,
        'subject_code', completed.subject_code,
        'subject_name', completed.subject_name,
        'exam_type', completed.exam_type,
        'completed_at', completed.submitted_at
      )
      ORDER BY completed.submitted_at DESC, completed.subject_id
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT DISTINCT ON (a.subject_id)
      a.subject_id,
      s."CourseId" AS course_id,
      s."Semester" AS semester,
      a.subject_code,
      s."SubjectName" AS subject_name,
      a.exam_type,
      a.submitted_at
    FROM private.exam_attempts a
    JOIN public."Subjects" s ON s."SubjectId" = a.subject_id
    WHERE a.user_id = p_user_id
      AND a.attempt_type IN ('exam', 'test_room')
      AND a.status IN ('submitted', 'auto_submitted', 'disconnected', 'timed_out')
      AND a.submitted_at IS NOT NULL
      AND a.score IS NOT NULL
      AND a.total_marks > 0
      AND a.subject_id IS NOT NULL
    ORDER BY a.subject_id, a.submitted_at DESC
  ) AS completed;
$function$;

REVOKE ALL ON FUNCTION public.pm_leaderboard_completed_subjects(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pm_leaderboard_completed_subjects(uuid) TO service_role;

COMMENT ON FUNCTION public.pm_leaderboard_completed_subjects(uuid) IS
  'Server-only leaderboard filter data. Returns exact canonical subject ids for a student’s submitted, timed-out or disconnected attempts when a final score and submission timestamp are available.';

NOTIFY pgrst, 'reload schema';
COMMIT;
