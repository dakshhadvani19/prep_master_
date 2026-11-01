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

Status: **Planned; not implemented**

### Subject/syllabus intake

- Allow PDF and DOCX for syllabus replacement.
- Store the uploaded original file in a private storage location with authenticated admin-only upload authorization.
- Validate extension, MIME type, file size, page/word limits and empty/corrupt files before extraction.
- Keep the existing syllabus active until extraction and validation succeed; provide a preview and explicit confirmation before replacing it.
- Show actual stage/status text and progress where measurable. Warn admins not to close the page until the upload/processing success state is shown.

### Question-bank intake

- Initial supported formats: PDF, DOCX and CSV. Confirm exact CSV columns/format during Phase 2 before accepting it as a supported contract.
- Use the same private upload, validation, access-control and retry pattern.
- Persist upload/job metadata so a refresh does not silently lose the processing state.
- Do not insert unvalidated question rows into TestsData during this phase.

### Extraction implementation choice to evaluate

The application is already a Node.js/Vercel project. Prefer Node-compatible parsers in the existing API/runtime before introducing a separate Python service:
- PDF: evaluate pdfjs-dist (text extraction and page iteration).
- DOCX: evaluate mammoth (document body text extraction).
- CSV: evaluate csv-parse (strict row/column parsing).

Choose exact versions, runtime limits, file size/page caps and whether any extraction step needs a background job after a small prototype with representative files. If the extraction workload exceeds Vercel request limits, move the long-running parsing job to a supported asynchronous worker rather than keeping a browser tab as the only process owner.

## Phase 3 — Parsing, normalization, validation and ingestion

Status: **Planned; not implemented**

- Extract text and preserve page/paragraph/table/row context needed to trace a parsed question back to its source.
- Identify question boundaries and separate question, options, answer key, model answer, marks and rubric.
- Normalize MCQ labels/options and map the answer to one canonical option index. Reject ambiguous or incomplete questions rather than guessing.
- Normalize theory model answers and rubrics. Generate a rubric only when the source has no rubric, and mark generated rubric content for admin review before publishing.
- Validate duplicate questions, missing answers, invalid option counts, missing/invalid rubric allocations, mark totals and subject linkage.
- Split approved MCQ questions into 30-question sets; do not discard the remainder silently. Store unused valid questions for later sets or show an explicit short-bank report.
- Provide an admin review screen with valid, rejected and warning counts, source location, and per-question correction.
- Write to the canonical question-bank index and supported storage contract. Keep subject/course/semester/exam/difficulty metadata explicit; never infer it from an opaque TestId.
- Publish only after validation and admin confirmation. Keep ingestion idempotent so retries cannot duplicate a bank.

## Acceptance checks

- Phase 1: every department/course/semester/subject can be reached without student completion gates; each displayed subject ID and semester matches the live catalog query.
- Phase 2: valid and invalid files receive clear outcomes; failed uploads do not replace the current syllabus/question bank.
- Phase 3: parsed data reconciles to the source file, invalid items are visible instead of silently dropped, 30-question batching is deterministic, and every published bank has canonical subject/exam metadata.

## Phase 1 verification

- npx vitest run tests/admin-courses.test.jsx: 7/7 passed.
- npx eslint src/pages/AdminCourses.jsx tests/admin-courses.test.jsx: passed.
- npm run build: passed. Existing Vite circular vendor chunk and large chunk-size warnings remain unrelated to this phase.
