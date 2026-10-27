BEGIN;

-- Older attempts predate the canonical SubjectId columns. These short codes each
-- map to exactly one SubjectId in the current subjectIdBridge catalog. Do not
-- include codes such as 01ma0106 (Calculus), which map to several programs.
WITH legacy_map(subject_code, subject_id) AS (
  VALUES
    ('04id0002', 18000494000201::bigint), -- BCA, Semester 2: Basics of Accounting
    ('09ce1606', 44000935160601::bigint)  -- Diploma CE, Semester 6: Fundamentals of Machine Learning
),
verified_map AS (
  SELECT m.subject_code, s."SubjectId", s."CourseId", s."Semester"
    FROM legacy_map m
    JOIN public."Subjects" s ON s."SubjectId" = m.subject_id
)
UPDATE private.exam_attempts a
   SET subject_id = v."SubjectId",
       course_id = v."CourseId",
       semester = v."Semester"
  FROM verified_map v
 WHERE a.subject_id IS NULL
   AND lower(btrim(a.subject_code)) = v.subject_code;

NOTIFY pgrst, 'reload schema';
COMMIT;
