# Admin Courses — Phase 2 Progress

Last updated: 2026-11-01

Status: **Implemented; database migration applied to the live Supabase project**

## Delivered

- Added syllabus and question-bank upload controls to the selected subject panel on /admin/courses.
- Added a private admin-course-files Supabase Storage bucket. Authenticated Storage inserts are limited to users whose server-side role resolves to admin or superAdmin; no public bucket access is enabled.
- Added private.admin_course_uploads for durable per-subject upload history, state, extracted preview, validation details, and activation timestamps.
- Added service-role-only RPCs for creating/listing upload records, recording validation outcomes, and atomically switching the active syllabus.
- Added /api/admin-course-uploads with Supabase JWT verification and an explicit public.Admins lookup. The service-role key stays server-side.
- Added resumable TUS uploads with progress, automatic retry, same-file resume, and a saved incomplete state that remains visible after refresh.
- Added PDF text extraction (pdfjs-dist), DOCX extraction (mammoth), and strict CSV parsing (csv-parse).
- Added a downloadable question-bank CSV template with an explicit MCQ/theory schema.
- Added a validation preview and a separate confirm step for syllabus replacement. The existing active syllabus is not replaced by a failed or merely uploaded candidate.
- Question-bank uploads stop at validated_waiting_phase3; Phase 2 does not insert question rows into TestsData.

## Limits and CSV contract

- File size: 20 MB maximum.
- PDF: 50 pages maximum.
- Extracted document/CSV text: 30,000 characters maximum.
- CSV: 10,000 question rows maximum.
- Syllabus: PDF or DOCX.
- Question bank: PDF, DOCX, or CSV.
- CSV columns, in exact order: question_type, question, option_a, option_b, option_c, option_d, correct_option, model_answer, marks, difficulty, rubric.
- question_type: mcq or theory. MCQ rows require options A–D and correct option A/B/C/D. Theory rows leave those option fields blank and require model_answer. Marks must be greater than zero; difficulty is easy, medium, or hard.

## Live database verification

Migration: 20261101090011_admin_course_file_intake (applied 2026-11-01).

Verified:
- Bucket admin-course-files exists and has public = false.
- Bucket size and MIME restrictions match the limits above.
- Storage object insert policy targets authenticated and checks current_role() against admin and superAdmin.
- private.admin_course_uploads has RLS enabled. anon and authenticated have no direct table read/write grants; service_role has the required server-side access.
- Four upload RPCs exist. anon and authenticated cannot execute them; service_role can.
- Existing public Courses, Subjects, and TestsData schemas were not changed.

The Supabase security advisor lists the private upload table under “RLS enabled, no policy”. This is intentional fail-closed behavior: the table has no client-facing policy or client grants and is accessed only through the authenticated server API using service_role.

## Verification

- tests/admin-course-upload-validation.test.js: 12 tests.
- tests/admin-course-uploads.test.jsx: 4 tests.
- tests/admin-course-uploads-api.test.js: 5 tests.
- Combined Phase 2 suites: 21/21 passing after the character-cap assertion correction.
- Targeted ESLint: passing.
- Vite production build: passing. Existing circular vendor chunk and large-chunk warnings remain.
- Admin dashboard regression suite still has one known pre-existing failure in the super admin staff-modals test: it expects a role=status element. This is unrelated to the upload implementation.

## Phase 3 remains

- Detect question boundaries in PDF/DOCX source files and preserve the source/page context.
- Normalize MCQ options and correct answers, theory answers and rubrics.
- Show parsing issues and source-to-question reconciliation for admin review.
- Batch/publish question-bank content only after explicit QA approval, with canonical SubjectId, CourseId, Semester and exam metadata.
- Do not infer subject mappings from TestId, question text, or other legacy TestsData fields.

## Production API follow-up — 2026-11-02

After the existing deployment-hardening changes, the admin page still showed HTTP 500 responses for upload history and upload start. The current production alias was confirmed on a READY deployment, but Vercel Hobby log retention did not provide the request stack trace.

Commit `c1f8045` removes the upload API's eager exam-policy import. The canonical exam policy is now dynamically loaded only for question-bank validation and publication; standard syllabus intake and file-history requests no longer initialize that module chain. This is a startup-isolation change only and leaves the API payloads, private storage flow, permissions, and database schema unchanged.

Verification: focused API test 7/7, targeted ESLint passed, production build passed, and live unauthenticated route smoke test returned the expected 401. Authenticated history retrieval and a real syllabus upload remain pending because no admin session token was available for this run.
Regression coverage in `global-exam-prep/tests/admin-course-uploads-api.test.js` verifies the authenticated upload-history GET path. In a clean Vercel sandbox checkout, `npx vitest run tests/admin-course-uploads-api.test.js` passed 7/7, targeted ESLint passed for the API and test files, and `npm run build` passed. The live production alias returned HTTP 401 with the expected sign-in JSON for an unauthenticated history request, proving that the route loads and reaches its handler. An authenticated GET and real file upload still require a logged-in admin browser session.
