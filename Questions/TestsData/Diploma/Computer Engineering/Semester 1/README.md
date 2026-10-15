# Diploma Computer Engineering — Semester 1 Exam Bank (v2)

This is the **exam-type-aware** bank for the eight active Semester 1 subjects in Supabase (CourseId = 44). Use the v2 export files below as the canonical bank.

## Canonical files

- [exam-bank-v2.json](./exam-bank-v2.json): 252 TestId-wise rows plus test_index metadata mapping each row to its subject, exam type, difficulty, format, question count and syllabus scope.
- [seed-all-v2.sql](./seed-all-v2.sql): one transaction containing the 252 INSERT statements for public."TestsData".
- [manifest.json](./manifest.json): counts and the per-subject exam policy.

## Exam rules implemented

| isDepartmentalSubject | Exam type | Paper format | Tests per type |
|---|---|---|---:|
| false | Mid 1 | 4 theory questions × 8 marks, with model answers | 12 |
| false | Mid 2 | 30 MCQs, four options each, with answer keys | 12 |
| false | ESE | 4 theory questions × 8 marks, with model answers | 12 |
| true | Mid 1 | 30 MCQs, four options each, with answer keys | 12 |
| true | Mid 2 | 30 MCQs, four options each, with answer keys | 12 |
| true | ESE | Not generated | 0 |

Each exam type has **4 Easy, 4 Medium and 4 Hard variants**. Mid 1 is restricted to the first 50% of the ordered syllabus; the scope applied to each subject is stated in test_index and subject_index in the v2 JSON.

## Size and data shape

| Measure | Count |
|---|---:|
| Active subjects | 8 |
| Non-departmental / departmental subjects | 5 / 3 |
| Exam-type banks | 21 |
| Test rows | 252 |
| MCQ test rows | 132 |
| Theory test rows | 120 |
| MCQ question entries | 3,960 |
| Theory question entries with model answers | 480 |
| MCQ option entries | 15,840 |

The live table has only TestId, Questions, Options and Answers columns, so subject/exam/difficulty/mark metadata is stored in the JSON test_index, not added to database rows.

- **MCQ row:** 30 question strings, 120 flattened option strings in A–D order, and 30 zero-based answer indexes (0=A, 1=B, 2=C, 3=D).
- **Theory row:** 4 question strings prefixed [8 marks], an empty Options array, and 4 model-answer strings in Answers. Each theory paper is 32 marks.
- **TestId:** decimal SubjectId followed by a per-subject occurrence. For non-departmental subjects, occurrences 1–12 = Mid 1, 13–24 = Mid 2, 25–36 = ESE. For departmental subjects, 1–12 = Mid 1 and 13–24 = Mid 2.

## Before insertion

The live public."TestsData" table was checked and had zero rows at the time of preparation; this task has **not inserted or changed any database rows**. Check for ID collisions again immediately before running the v2 SQL.

The previous seed-all.sql and each subject's seed.sql have been retired as insert scripts so they cannot seed the obsolete 10-MCQ-per-row structure. The old tests/test-XX-*.json files and answer-review.json files are retained as source/review material; they are **not** the current executable export.

**Quality note:** the objective variants are assembled from the existing draft MCQ pool, with question selection and answer positions rebalanced. Structural validation does not certify every answer or distractor. The theory answers are model-answer outlines, not an independently examiner-approved marking scheme. Review factual correctness, syllabus coverage and distractor quality before production use. The current MCQ-specific frontend must detect Options=[] before attempting to render a theory row.
