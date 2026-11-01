# Admin Courses — Phase 3 Progress

Last updated: 2026-11-01

Status: **Implemented; live Supabase migrations applied and verified**

## Delivered

- Added PDF, DOCX and CSV question-bank parsing with provenance: PDF page number, DOCX paragraph number, CSV row number.
- Parses numbered question sections into question text, MCQ options, answer key, theory model answer, marks, difficulty and rubric.
- Normalizes MCQ correct answers into zero-based option indices. Ambiguous/missing answers, invalid option counts, missing theory answers, duplicate text, invalid marks and invalid difficulty stay visible with per-item errors.
- Generates a draft marking rubric for theory items only when none is supplied. Generated drafts cannot publish until the administrator marks them reviewed.
- Adds a subject-specific exam mark check for complete 30-question MCQ sets. Expected marks are derived server-side from the verified subject/exam policy; any mismatch requires explicit admin acknowledgement. A partial final set is retained and labelled incomplete.
- Adds an editable admin review panel: source location, question text, options, correct answer, model answer, marks, difficulty, rubric, inclusion/exclusion and valid/rejected/warning counts.
- Adds a separate explicit publish action. Server and database checks block included invalid questions and unreviewed generated rubrics.
- Adds idempotent private canonical bank/question/set storage. MCQ questions are grouped into sets of 30; short remainders are stored rather than discarded.
- Canonical metadata comes from the verified upload record: SubjectId, CourseId, Semester and exam type.
- public.TestsData remains unchanged.

## Live database

Migrations:
- 20261101093432_admin_question_bank_ingestion
- 20261101094500_update_question_bank_publish_mark_totals

Both were applied on 2026-11-01.

Verified:
- private.question_banks, private.question_bank_questions and private.question_bank_sets exist.
- All three tables have RLS enabled and no direct anon/authenticated grants.
- Bank save/get RPCs and the mark-total-aware publish RPC are restricted to service_role.
- Upload status values include needs_review and published.

## Verification

- tests/question-bank-parser.test.js: 4 passing.
- tests/admin-course-uploads.test.jsx: 5 passing, including generated rubric approval and short-set publishing.
- tests/admin-course-uploads-api.test.js: 6 passing, including server-derived mark-total checks.
- Combined Phase 1/2/3 focused suites: 34/34 passing.
- Targeted ESLint: passing.
- Vite production build: passing. Existing circular vendor chunk and large-chunk warnings remain.
 
## Boundary

Phase 3 ingestion and admin publication are implemented into the private canonical question-bank index. The student exam-generation picker does not yet consume that index; that downstream integration is not part of this phase. The PDF/DOCX parser expects numbered sections and explicit labels; unrecognized layouts remain rejected for manual correction rather than guessed.
