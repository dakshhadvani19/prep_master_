BEGIN;

-- Return only the signed-in student's own qualifying completions. The browser
-- cannot query private.exam_attempts or call this function directly.
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
        'subject_code', completed.subject_code,
        'subject_name', completed.subject_name,
        'exam_type', completed.exam_type,
        'completed_at', completed.submitted_at
      )
      ORDER BY completed.submitted_at DESC, completed.subject_code, completed.subject_name
    ),
    '[]'::jsonb
  )
  FROM (
    SELECT DISTINCT ON (lower(btrim(a.subject_code)), lower(btrim(a.subject_name)))
      a.subject_code, a.subject_name, a.exam_type, a.submitted_at
    FROM private.exam_attempts AS a
    WHERE a.user_id = p_user_id
      AND a.attempt_type IN ('exam', 'test_room')
      AND a.status IN ('submitted', 'auto_submitted')
      AND a.submitted_at IS NOT NULL
      AND a.score IS NOT NULL
      AND a.total_marks > 0
      AND NULLIF(btrim(a.subject_code), '') IS NOT NULL
      AND NULLIF(btrim(a.subject_name), '') IS NOT NULL
    ORDER BY lower(btrim(a.subject_code)), lower(btrim(a.subject_name)), a.submitted_at DESC
  ) AS completed;
$function$;

REVOKE ALL ON FUNCTION public.pm_leaderboard_completed_subjects(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pm_leaderboard_completed_subjects(uuid) TO service_role;

COMMENT ON FUNCTION public.pm_leaderboard_completed_subjects(uuid) IS
  'Server-only leaderboard filter data. Returns a student’s distinct subject code/name pairs only for completed, scored attempts; does not return ranks or other students.';

NOTIFY pgrst, 'reload schema';
COMMIT;
