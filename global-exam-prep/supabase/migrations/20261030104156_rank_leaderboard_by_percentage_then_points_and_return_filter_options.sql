BEGIN;

CREATE OR REPLACE FUNCTION public.pm_leaderboard_rankings(p_subject_id bigint, p_user_id uuid, p_exam_type text DEFAULT NULL::text, p_difficulty text DEFAULT NULL::text, p_attempt_type text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_subject public."Subjects"%ROWTYPE;
  v_exam_type text;
  v_difficulty text;
  v_attempt_type text;
  v_is_overall boolean;
  v_result jsonb;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'A verified user identifier is required'; END IF;
  IF p_subject_id IS NULL OR p_subject_id <= 0 THEN RAISE EXCEPTION 'A valid subject identifier is required'; END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN RAISE EXCEPTION 'Page size must be between 1 and 100'; END IF;
  IF p_offset IS NULL OR p_offset < 0 OR p_offset > 100000 THEN RAISE EXCEPTION 'Page offset is outside the supported range'; END IF;

  v_exam_type := NULLIF(pg_catalog.btrim(p_exam_type), '');
  v_difficulty := NULLIF(pg_catalog.lower(pg_catalog.btrim(p_difficulty)), '');
  v_attempt_type := NULLIF(pg_catalog.lower(pg_catalog.btrim(p_attempt_type)), '');

  IF v_exam_type IS NOT NULL AND pg_catalog.char_length(v_exam_type) > 80 THEN RAISE EXCEPTION 'Exam type filter is invalid'; END IF;
  IF v_difficulty IS NOT NULL AND v_difficulty NOT IN ('easy', 'medium', 'hard') THEN RAISE EXCEPTION 'Difficulty filter is invalid'; END IF;
  IF v_attempt_type IS NOT NULL AND v_attempt_type NOT IN ('exam', 'test_room') THEN RAISE EXCEPTION 'Attempt type filter is invalid'; END IF;

  SELECT subject.* INTO v_subject
  FROM public."Subjects" AS subject
  WHERE subject."SubjectId" = p_subject_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Subject was not found'; END IF;

  v_is_overall := v_exam_type IS NULL AND v_difficulty IS NULL AND v_attempt_type IS NULL;

  WITH student_totals AS (
    SELECT
      student."StudentId" AS student_id,
      student."FullName" AS display_name,
      pg_catalog.sum(result.score)::numeric AS total_score,
      pg_catalog.sum(result.max_score)::numeric AS total_max_score,
      pg_catalog.count(*)::bigint AS total_tests
    FROM private.leaderboard_attempt_results AS result
    JOIN public."Students" AS student ON student.auth_uid = result.student_auth_uid
    WHERE result.subject_id = p_subject_id
      AND student.role = 'student'
      AND student."IsSpam" = false
      AND (v_exam_type IS NULL OR result.exam_type = v_exam_type)
      AND (v_difficulty IS NULL OR result.difficulty = v_difficulty)
      AND (v_attempt_type IS NULL OR result.attempt_type = v_attempt_type)
    GROUP BY student."StudentId", student."FullName"
  ),
  ranked_students AS (
    SELECT
      totals.*,
      pg_catalog.round((totals.total_score / NULLIF(totals.total_max_score, 0)) * 100, 2) AS percentage,
      pg_catalog.rank() OVER (
        ORDER BY totals.total_score / NULLIF(totals.total_max_score, 0) DESC,
          totals.total_score DESC
      ) AS competition_rank,
      pg_catalog.row_number() OVER (
        ORDER BY totals.total_score / NULLIF(totals.total_max_score, 0) DESC,
          totals.total_score DESC, totals.total_tests DESC, totals.student_id ASC
      ) AS deterministic_position
    FROM student_totals AS totals
  ),
  published_positions AS (
    SELECT
      leaderboard."StudentId"[position.i] AS student_id,
      leaderboard."Points"[position.i] AS published_points,
      leaderboard."TotalTests"[position.i] AS published_total_tests,
      position.i AS published_position
    FROM public."Leaderboards" AS leaderboard
    CROSS JOIN LATERAL pg_catalog.generate_subscripts(leaderboard."StudentId", 1) AS position(i)
    WHERE leaderboard."SubjectId" = p_subject_id
  ),
  selected_students AS (
    SELECT
      ranked.*,
      published.published_points,
      published.published_total_tests,
      published.published_position,
      CASE WHEN v_is_overall THEN published.published_position
           ELSE ranked.deterministic_position END AS page_position,
      CASE WHEN v_is_overall THEN published.published_position IS NOT NULL
           ELSE ranked.deterministic_position <= 100 END AS is_top_100
    FROM ranked_students AS ranked
    LEFT JOIN published_positions AS published ON published.student_id = ranked.student_id
    WHERE (v_is_overall AND published.published_position IS NOT NULL) OR NOT v_is_overall
  ),
  paged_students AS (
    SELECT * FROM selected_students
    ORDER BY page_position
    OFFSET p_offset
    LIMIT p_limit
  ),
  stats AS (
    SELECT
      (SELECT pg_catalog.count(*)::bigint FROM ranked_students) AS participant_count,
      CASE WHEN v_is_overall
        THEN LEAST(100::bigint, (SELECT pg_catalog.count(*)::bigint FROM ranked_students))
        ELSE (SELECT pg_catalog.count(*)::bigint FROM ranked_students)
      END AS available_entries,
      (SELECT pg_catalog.count(*)::bigint FROM paged_students) AS returned_entries
  ),
  filter_options AS (
    SELECT
      COALESCE(
        pg_catalog.array_agg(DISTINCT result.exam_type ORDER BY result.exam_type)
          FILTER (WHERE result.exam_type IS NOT NULL),
        ARRAY[]::text[]
      ) AS exam_types,
      COALESCE(
        pg_catalog.array_agg(DISTINCT result.difficulty ORDER BY result.difficulty)
          FILTER (WHERE result.difficulty IS NOT NULL),
        ARRAY[]::text[]
      ) AS difficulties,
      COALESCE(
        pg_catalog.array_agg(DISTINCT result.attempt_type ORDER BY result.attempt_type)
          FILTER (WHERE result.attempt_type IS NOT NULL),
        ARRAY[]::text[]
      ) AS attempt_types
    FROM private.leaderboard_attempt_results AS result
    WHERE result.subject_id = p_subject_id
  )
  SELECT pg_catalog.jsonb_build_object(
    'subject', pg_catalog.jsonb_build_object(
      'subjectId', v_subject."SubjectId",
      'subjectName', v_subject."SubjectName",
      'courseId', v_subject."CourseId",
      'semester', v_subject."Semester"
    ),
    'filters', pg_catalog.jsonb_build_object(
      'examType', v_exam_type, 'difficulty', v_difficulty, 'attemptType', v_attempt_type
    ),
    'filterOptions', pg_catalog.jsonb_build_object(
      'examTypes', filter_options.exam_types,
      'difficulties', filter_options.difficulties,
      'attemptTypes', filter_options.attempt_types
    ),
    'source', CASE WHEN v_is_overall THEN 'published' ELSE 'filtered' END,
    'participantCount', stats.participant_count,
    'availableEntries', stats.available_entries,
    'entries', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'rank', page.competition_rank,
          'position', page.page_position,
          'studentId', page.student_id,
          'displayName', page.display_name,
          'points', CASE WHEN v_is_overall THEN page.published_points ELSE page.total_score END,
          'maxPoints', page.total_max_score,
          'percentage', page.percentage,
          'totalTests', CASE WHEN v_is_overall THEN page.published_total_tests ELSE page.total_tests END,
          'topPercent', CASE WHEN stats.participant_count > 0
            THEN pg_catalog.ceil((page.competition_rank::numeric * 100) / stats.participant_count)::integer
            ELSE NULL END,
          'isTop100', page.is_top_100
        ) ORDER BY page.page_position
      )
      FROM paged_students AS page
    ), '[]'::jsonb),
    'viewer', (
      SELECT pg_catalog.jsonb_build_object(
        'rank', viewer.competition_rank,
        'position', CASE
          WHEN v_is_overall AND viewer_published.published_position IS NOT NULL
            THEN viewer_published.published_position
          ELSE viewer.deterministic_position
        END,
        'studentId', viewer.student_id,
        'displayName', viewer.display_name,
        'points', CASE
          WHEN v_is_overall AND viewer_published.published_position IS NOT NULL
            THEN viewer_published.published_points
          ELSE viewer.total_score
        END,
        'maxPoints', viewer.total_max_score,
        'percentage', viewer.percentage,
        'totalTests', CASE
          WHEN v_is_overall AND viewer_published.published_position IS NOT NULL
            THEN viewer_published.published_total_tests
          ELSE viewer.total_tests
        END,
        'topPercent', CASE WHEN stats.participant_count > 0
          THEN pg_catalog.ceil((viewer.competition_rank::numeric * 100) / stats.participant_count)::integer
          ELSE NULL END,
        'isTop100', CASE
          WHEN v_is_overall THEN viewer_published.published_position IS NOT NULL
          ELSE viewer.deterministic_position <= 100
        END
      )
      FROM ranked_students AS viewer
      LEFT JOIN published_positions AS viewer_published
        ON viewer_published.student_id = viewer.student_id
      WHERE viewer.student_id = (
        SELECT student."StudentId" FROM public."Students" AS student
        WHERE student.auth_uid = p_user_id AND student.role = 'student' AND student."IsSpam" = false
      )
    ),
    'pagination', pg_catalog.jsonb_build_object(
      'limit', p_limit, 'offset', p_offset,
      'returned', stats.returned_entries,
      'hasMore', p_offset + stats.returned_entries < stats.available_entries
    )
  )
  INTO v_result
  FROM stats
  CROSS JOIN filter_options;

  RETURN v_result;
END;
$function$
;

COMMENT ON FUNCTION public.pm_leaderboard_rankings(bigint, uuid, text, text, text, integer, integer) IS
  'Service-role-only leaderboard query. Competition rank orders by weighted percentage descending, then cumulative earned points descending; only equal percentages and equal points share a rank. Overall entries and their published positions come from public.Leaderboards; normalized private results supply weighted percentages, filter options, full participant counts and the verified viewer rank, including users outside the Top 100. Does not return auth UIDs or private attempt details.';

REVOKE ALL ON FUNCTION public.pm_leaderboard_rankings(bigint, uuid, text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pm_leaderboard_rankings(bigint, uuid, text, text, text, integer, integer) TO service_role;

COMMIT;
