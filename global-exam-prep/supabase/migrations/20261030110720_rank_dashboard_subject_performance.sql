BEGIN;

CREATE OR REPLACE FUNCTION public.pm_dashboard_performance_summary(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_summary jsonb;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'A verified student identifier is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public."Students" AS student
    WHERE student.auth_uid = p_user_id
      AND student.role = 'student'
      AND student."IsSpam" IS NOT TRUE
  ) THEN
    RAISE EXCEPTION 'A student profile is required to load performance history';
  END IF;

  WITH caller_attempts AS MATERIALIZED (
    SELECT
      result.source_attempt_id,
      result.subject_id,
      subject."SubjectName" AS subject_name,
      subject."CourseId" AS course_id,
      subject."Semester" AS semester,
      result.exam_type,
      result.attempt_type,
      result.difficulty,
      result.score,
      result.max_score,
      result.percentage,
      result.completed_at
    FROM private.leaderboard_attempt_results AS result
    JOIN public."Subjects" AS subject
      ON subject."SubjectId" = result.subject_id
    WHERE result.student_auth_uid = p_user_id
      AND result.max_score > 0
      AND result.score >= 0
      AND result.score <= result.max_score
  ),
  totals AS (
    SELECT
      pg_catalog.count(*)::bigint AS total_attempts,
      COALESCE(pg_catalog.sum(score), 0)::numeric AS total_score,
      COALESCE(pg_catalog.sum(max_score), 0)::numeric AS total_max_marks,
      pg_catalog.count(DISTINCT subject_id)::bigint AS subjects_attempted,
      pg_catalog.max(completed_at) AS last_completed_at
    FROM caller_attempts
  ),
  subjects AS (
    SELECT
      subject_id,
      subject_name,
      course_id,
      semester,
      pg_catalog.count(*)::bigint AS attempts,
      pg_catalog.sum(score)::numeric AS total_score,
      pg_catalog.sum(max_score)::numeric AS total_max_marks,
      pg_catalog.max(completed_at) AS last_attempt_at
    FROM caller_attempts
    GROUP BY subject_id, subject_name, course_id, semester
  ),
  subject_rows AS (
    SELECT *
    FROM subjects
    ORDER BY total_score / NULLIF(total_max_marks, 0) DESC,
      attempts DESC, last_attempt_at DESC, subject_name ASC
    LIMIT 5
  ),
  recent_rows AS (
    SELECT *
    FROM caller_attempts
    ORDER BY completed_at DESC, source_attempt_id DESC
    LIMIT 8
  )
  SELECT pg_catalog.jsonb_build_object(
    'hasResults', totals.total_attempts > 0,
    'summary', pg_catalog.jsonb_build_object(
      'totalAttempts', totals.total_attempts,
      'totalScore', totals.total_score,
      'totalMaxMarks', totals.total_max_marks,
      'overallPercentage', CASE
        WHEN totals.total_max_marks > 0
          THEN pg_catalog.round(totals.total_score / totals.total_max_marks * 100, 2)
        ELSE NULL
      END,
      'subjectsAttempted', totals.subjects_attempted,
      'lastCompletedAt', totals.last_completed_at
    ),
    'subjectPerformance', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'subjectId', subject.subject_id,
          'subjectName', subject.subject_name,
          'courseId', subject.course_id,
          'semester', subject.semester,
          'attempts', subject.attempts,
          'totalScore', subject.total_score,
          'totalMaxMarks', subject.total_max_marks,
          'percentage', pg_catalog.round(
            subject.total_score / NULLIF(subject.total_max_marks, 0) * 100, 2
          )
        )
        ORDER BY subject.last_attempt_at DESC, subject.subject_name ASC
      )
      FROM subject_rows AS subject
    ), '[]'::jsonb),
    'recentResults', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'subjectId', recent.subject_id,
          'subjectName', recent.subject_name,
          'examType', recent.exam_type,
          'attemptType', recent.attempt_type,
          'difficulty', recent.difficulty,
          'score', recent.score,
          'maxScore', recent.max_score,
          'percentage', recent.percentage,
          'completedAt', recent.completed_at
        )
        ORDER BY recent.completed_at ASC, recent.source_attempt_id ASC
      )
      FROM recent_rows AS recent
    ), '[]'::jsonb),
    'dataBasis', 'verified_completed_attempts'
  )
  INTO v_summary
  FROM totals;

  RETURN v_summary;
END;
$function$;

COMMENT ON FUNCTION public.pm_dashboard_performance_summary(uuid) IS
  'Returns only the authenticated student''s aggregate performance and recent result summaries from normalized, verified completed leaderboard attempts. Contains no rank or other students'' data.';

REVOKE ALL ON FUNCTION public.pm_dashboard_performance_summary(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pm_dashboard_performance_summary(uuid)
  TO service_role;

COMMIT;