BEGIN;

ALTER TABLE private.exam_attempts
  ADD COLUMN IF NOT EXISTS subject_id bigint,
  ADD COLUMN IF NOT EXISTS course_id bigint,
  ADD COLUMN IF NOT EXISTS semester integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='private.exam_attempts'::regclass
      AND conname='exam_attempts_subject_id_fkey'
  ) THEN
    ALTER TABLE private.exam_attempts ADD CONSTRAINT exam_attempts_subject_id_fkey
      FOREIGN KEY (subject_id) REFERENCES public."Subjects"("SubjectId") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='private.exam_attempts'::regclass
      AND conname='exam_attempts_course_id_fkey'
  ) THEN
    ALTER TABLE private.exam_attempts ADD CONSTRAINT exam_attempts_course_id_fkey
      FOREIGN KEY (course_id) REFERENCES public."Courses"("CourseId") ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS exam_attempts_user_subject_completed_idx
  ON private.exam_attempts (user_id, subject_id, submitted_at DESC)
  WHERE status IN ('submitted','auto_submitted')
    AND submitted_at IS NOT NULL
    AND score IS NOT NULL
    AND total_marks > 0;

CREATE OR REPLACE FUNCTION public.pm_private_exam_tag_subject(
  p_attempt_id uuid,
  p_user_id uuid,
  p_subject_id bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_subject_id bigint;
  v_course_id bigint;
  v_semester integer;
  v_updated_subject_id bigint;
BEGIN
  SELECT s."SubjectId", s."CourseId", s."Semester"
    INTO v_subject_id, v_course_id, v_semester
    FROM public."Subjects" s
   WHERE s."SubjectId" = p_subject_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_subject');
  END IF;

  UPDATE private.exam_attempts a
     SET subject_id = v_subject_id,
         course_id = v_course_id,
         semester = v_semester
   WHERE a.id = p_attempt_id
     AND a.user_id = p_user_id
     AND (a.subject_id IS NULL OR a.subject_id = v_subject_id)
  RETURNING a.subject_id INTO v_updated_subject_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'attempt_not_found_or_subject_mismatch');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'subject_id', v_updated_subject_id,
    'course_id', v_course_id,
    'semester', v_semester
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.pm_private_exam_tag_subject(uuid, uuid, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pm_private_exam_tag_subject(uuid, uuid, bigint) TO service_role;

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
      AND a.status IN ('submitted', 'auto_submitted')
      AND a.submitted_at IS NOT NULL
      AND a.score IS NOT NULL
      AND a.total_marks > 0
      AND a.subject_id IS NOT NULL
    ORDER BY a.subject_id, a.submitted_at DESC
  ) AS completed;
$function$;

REVOKE ALL ON FUNCTION public.pm_leaderboard_completed_subjects(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pm_leaderboard_completed_subjects(uuid) TO service_role;

COMMENT ON COLUMN private.exam_attempts.subject_id IS
  'Canonical public.Subjects.SubjectId used to scope leaderboard access to the exact catalog subject.';
COMMENT ON COLUMN private.exam_attempts.course_id IS
  'CourseId copied from the canonical subject row for private audit/filtering; not accepted from the browser.';
COMMENT ON COLUMN private.exam_attempts.semester IS
  'Semester copied from the canonical subject row for private audit/filtering; not accepted from the browser.';
COMMENT ON FUNCTION public.pm_private_exam_tag_subject(uuid, uuid, bigint) IS
  'Server-only operation that links an owned private attempt to verified public.Subjects metadata.';
COMMENT ON FUNCTION public.pm_leaderboard_completed_subjects(uuid) IS
  'Server-only leaderboard filter data. Returns exact canonical subject ids only for the requesting student’s completed, scored attempts.';

NOTIFY pgrst, 'reload schema';
COMMIT;
