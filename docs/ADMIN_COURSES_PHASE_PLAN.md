# Admin Courses & Question Management — Phase Plan

Last updated: 2026-11-01

## Purpose

Provide administrators with one unrestricted workspace to locate a catalog subject and manage its syllabus and question bank. The route remains /admin/courses and is protected by the existing admin route guard. The existing public Courses and Subjects catalog tables remain the source of truth; this feature does not create parallel course/subject catalogs.

## Phase 1 — Hierarchy locator UI

Status: **Implemented and verified**

Implemented in global-exam-prep/src/pages/AdminCourses.jsx and AdminCourses.css.

- Department → Course → Semester → Subject navigation.
- All six catalog departments are available; there is no leaderboard completion lock/unlock logic in this admin page.
- Departments use CATALOG_DOMAINS; courses and course semester lists load through fetchCoursesForDomain; subjects and their exact Semester values load through fetchCourseAndSubjects.
- Course search and subject search are supported. Subject search matches both the name and numeric SubjectId.
- Semester values are taken from Courses.Sems, including a legitimate semester value of 0; subject membership is filtered using Subjects.Semester.
- Subject details show canonical SubjectId, CourseId, semester, departmental status and the exam types applicable under subjectExamPolicy.
- Loading, retry, error and empty states are provided.
- The page is read-only in this phase. It does not expose fake add/edit/remove operations and does not mutate the database.
- Responsive layout and the existing dark / gold / violet design tokens are used.

### Question-bank linkage limitation

The live public.TestsData table currently contains only TestId, Questions, Options, and Answers. It has no canonical CourseId, SubjectId, or Semester columns/metadata. Therefore Phase 1 deliberately does not display question lists or counts by subject: attributing one of those rows to the selected subject would be an unsupported guess.

The selected subject's canonical identity is shown in the Question Locator panel as the target for Phase 3 ingestion. Do not add a guessed mapping from TestId, course title, or question text.

## Phase 2 — File intake and backend preparation

Status: **Implemented; live Supabase migration applied and verified**

### Subject/syllabus intake

- Accept PDF and DOCX syllabus files. Originals are stored in the private admin-course-files Supabase Storage bucket.
- Verify the Supabase session and the caller's row in public.Admins server-side; the browser never receives a service-role credential.
- Verify the selected SubjectId, CourseId and Semester against the live public.Subjects catalog before creating an upload record.
- Enforce a 20 MB file cap, PDF page cap of 50, extracted text cap of 30,000 characters, valid file signature/container, matching extension/MIME, and non-empty extractable text.
- Extract PDF text with pdfjs-dist and DOCX body text with mammoth on the Node/Vercel API runtime.
- Keep the existing active syllabus untouched while a candidate uploads and validates. Only a separate explicit admin confirmation atomically activates the new syllabus and marks the previous version superseded.
- Store durable upload status, validation counts/details and a bounded text preview. Failed files are removed from object storage; their failure metadata remains visible.
- Use authenticated resumable TUS uploads with progress, retry and same-file resume support. Do not rely on a signed resumable token.

### Question-bank intake

- Accepted formats: PDF, DOCX and CSV. The CSV contract is fixed by global-exam-prep/public/templates/question-bank-template.csv:
  question_type, question, option_a, option_b, option_c, option_d, correct_option, model_answer, marks, difficulty, rubric.
- question_type is mcq or theory; MCQ rows require A-D options and a correct option. Theory rows leave option/correct-option columns blank and require a model answer. Marks must be positive and difficulty must be easy, medium or hard.
- CSV parsing is strict about UTF-8, column order/count, required values, duplicate questions, row count and field lengths. Limits are 20 MB, 10,000 question rows and 30,000 extracted characters.
- Validate question-bank exam types with the existing subjectExamPolicy; departmental subjects retain only their configured exam types.
- Persist upload status and extracted preview. Valid question-bank files finish in validated_waiting_phase3; Phase 2 does not publish question rows to TestsData or any live question bank.

### Storage and database boundary

- Additive migration 20261101090011_admin_course_file_intake.sql creates only private.admin_course_uploads, the private Storage bucket, its admin-only insert policy, and four service-role-only metadata RPCs.
- Public Courses, Subjects and TestsData tables are not modified. TestsData is not guessed or backfilled from TestId/question text.
- Private metadata table has RLS enabled and no anon/authenticated table grants. The public RPC functions are executable only by service_role; the API authenticates the administrator before using them.
- The browser only uploads through Supabase Storage with its own verified user JWT and publishable key. Reading originals and metadata is handled by the authenticated server API.

### Verification

- Unit, API and component tests cover metadata/type checks, CSV rules, valid PDF/DOCX text extraction, admin-only access, subject verification, interrupted uploads, history, and explicit syllabus replacement.
- Phase 2 focused tests: 21 passing.
- ESLint on all changed application/API/test files: passing.
- Vite production build: passing; existing circular vendor chunk and large-chunk warnings remain.
- Live Supabase checks confirmed the bucket is private, the upload policy is for authenticated admins, the private table has RLS, and only service_role can read it/call the metadata RPCs.

## Phase 3 — Parsing, normalization, validation and ingestion

Status: **Implemented; live Supabase migrations applied and verified**

- PDF parsing extracts page text and groups text spans into lines; DOCX parsing preserves paragraph locations; CSV parsing preserves source row numbers from the Phase 2 template.
- Numbered question sections are split into question text, options, answer key, theory model answer, marks, difficulty and rubric.
- MCQ answers are normalized to a zero-based option index. Ambiguous answers, missing answers, invalid option counts and duplicates remain visible as rejected items for admin correction or exclusion.
- Theory items receive a generated draft rubric only when the source has none. Generated rubrics require explicit administrator review before publication.
- Validation checks question completeness, positive marks, difficulty, MCQ options/answers and duplicates. Complete 30-question MCQ sets are compared against the selected subject's exam mark total; server-side publication requires explicit acknowledgement for mismatches.
- Selected MCQs are stored deterministically in groups of 30. A short final remainder is retained as an incomplete set and reported, not discarded. Theory questions remain individually indexed.
- Admin review shows extracted/valid/rejected/warning/selected counts, source location, editable question text/options/answers/marks/difficulty/rubric, inclusion controls and generated-rubric approval.
- Canonical ingestion uses private.question_banks, private.question_bank_questions and private.question_bank_sets. Each bank copies verified SubjectId/CourseId/Semester/exam metadata from the source upload; no identity is inferred from TestId.
- Publishing is separate, administrator-confirmed, server-revalidated and idempotent by source upload.
- public.TestsData remains unchanged. Wiring this private index into the student exam-generation picker is a separate downstream integration.

### Phase 3 implementation files

- Parser: global-exam-prep/api/_lib/question-bank-parser.js.
- Admin API actions: parse_question_bank, save_review, publish_question_bank; review retrieval uses the same authenticated admin endpoint.
- UI: AdminCourseUploads.jsx and AdminCourseUploads.css.
- Migrations: 20261101093432_admin_question_bank_ingestion.sql and 20261101094500_update_question_bank_publish_mark_totals.sql.

## Acceptance checks

- Phase 1: every department/course/semester/subject can be reached without student completion gates; each displayed subject ID and semester matches the live catalog query.
- Phase 2: valid and invalid files receive clear outcomes; failed uploads do not replace the current syllabus/question bank.
- Phase 3: parsed data reconciles to the source file, invalid items are visible instead of silently dropped, 30-question batching is deterministic, and every published bank has canonical subject/exam metadata.

## Phase 1 verification

- npx vitest run tests/admin-courses.test.jsx: 7/7 passed.
- npx eslint src/pages/AdminCourses.jsx tests/admin-courses.test.jsx: passed.
- npm run build: passed. Existing Vite circular vendor chunk and large chunk-size warnings remain unrelated to this phase.
