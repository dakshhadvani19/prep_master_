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


## Production PDF validation failure — 2026-11-02

A real upload recording and Vercel runtime error aggregation identified the failure after the TUS transfer completed: the upload record and Storage object were created successfully, but the finalization API returned HTTP 503 while PDF.js initialized in the Node serverless runtime. The production error was DOMMatrix is not defined (three requests from one admin session, route /api/admin-course-uploads). This was a server PDF-runtime initialization defect, not a corrupt PDF or a TUS transfer failure.

Implemented:
- Added api/_lib/pdfjs-runtime.js, which explicitly loads @napi-rs/canvas and initializes DOMMatrix, ImageData and Path2D before dynamically importing PDF.js. Failed native-module imports can be retried instead of poisoning a warm function.
- Reused the same bootstrap in Phase 2 syllabus/document validation and Phase 3 PDF question-bank parsing.
- Promoted @napi-rs/canvas 0.1.96 to a direct production dependency and updated the lockfile.
- Changed the upload UI so storage completion is shown as a neutral pending-validation state; green success is no longer shown before server validation has passed.
- Added structured server diagnostics with request ID, method, action, subject/upload IDs and stack trace, without logging credentials, request bodies or file contents.

Verification in a clean Vercel sandbox checkout:
- npm ci: passed.
- Focused suites admin-course-upload-validation, question-bank-parser and admin-course-uploads-api: 26/26 passed. The API suite includes a real finalize-handler test using a stored PDF while all DOM geometry globals are initially absent.
- Targeted ESLint on all modified JS/JSX files: passed.
- npm run build: passed. Existing circular vendor-chunk and large-chunk-size warnings remain.
- git diff --check: passed.

The full repository suite was attempted but the sandbox session ended before the suite completed; no full-suite pass is claimed. The recording's failing API path is covered directly by the passing finalization regression test.

Post-deploy smoke test still required: after production deployment is READY, use the existing history entry's Check completed upload action first. That retries finalization against the already uploaded private Storage object and avoids transferring the PDF again. Confirm the status becomes needs_confirmation and the extracted preview is visible; then explicitly confirm the syllabus replacement. A full real authenticated finalize against the user's production session cannot be performed from this sandbox.


## Production deployment confirmation — 2026-11-02

Fix commit 5a34581fc8d1b2df371c12df149cb59005b28cea is deployed to the production alias prepmaster-tau.vercel.app. Vercel reports the deployment state READY. The post-deploy grouped runtime-error scan for /api/admin-course-uploads returned no matching errors during the first 10-minute window.

The authenticated storage-to-finalize smoke test remains a required admin-session check. Use the saved upload history's Check completed upload action to retry server-side finalization for the existing private Storage object; do not upload the same PDF again unless the object is missing.


## Asynchronous upload processing — 2026-11-02

The upload flow now uses the private Storage bucket plus a durable PGMQ Basic queue. The existing private.admin_course_uploads row remains the lifecycle record; queue messages contain only the upload UUID.

- The browser still uploads directly with resumable TUS. The API checks that the exact object exists and that its byte count matches the recorded upload before accepting it.
- A service-role-only database RPC changes the row to queued and sends the PGMQ message in the same transaction. The API returns HTTP 202 only after the transaction commits; after that response, the admin can safely close the page.
- The Node worker downloads and validates the stored file. A validated syllabus stops at needs_confirmation and still requires the existing explicit confirm RPC to replace the active syllabus. Question banks stop at validated_waiting_phase3.
- Infrastructure failures retry with increasing queue visibility delays. After five attempts they move to retry_waiting and a private dead-letter queue; an administrator can request another retry from upload history.
- Queue access is never granted to anon/authenticated browser roles.

Correction to the earlier PDF validation note: the PDF runtime helper existed, but both document-processing modules imported PDF.js directly while calling getPdfJsDocument(). That import mismatch is now corrected. The earlier verification missed the committed import mismatch and must not be treated as proof that the old import path was valid.

## Deployment, security and CI verification — 2026-11-02

- Production code commit `67d4d5a663054706771896da5e84434eb9bd516d` deployed READY; the subsequent docs/workflow commit `289c1ac72851f6bb79f3b0d09ec6cadf5e2a360d` is also READY on `prepmaster-tau.vercel.app`.
- `ADMIN_COURSE_UPLOAD_WORKER_SECRET` is a sensitive production Vercel environment variable. The token and worker URL are stored in Supabase Vault and are not present in source control.
- Supabase Cron job `admin-course-upload-worker-every-minute` is active on `* * * * *`. The pg_net HTTP timeout is 65 seconds, longer than the worker's 60-second Vercel execution limit. Consecutive recorded Cron runs succeeded.
- A direct call to the production worker with the Vault token returned HTTP 200 and `No queued uploads.`; a call without the token returned HTTP 401. After PGMQ permissions were tightened, an authenticated worker health call still returned HTTP 200 with no queued jobs.
- Queue access is restricted at both layers: browser roles have no usage on schema `pgmq`, no direct execute on PGMQ functions and no access to queue tables. The five application queue RPCs are executable by `service_role` only; the PGMQ operations inside them execute under their `postgres` SECURITY DEFINER owner.
- GitHub Actions focused course-upload job passed all five suites: upload document validation, question-bank parser, upload API, background worker and admin upload UI. Targeted ESLint for all changed upload-processing files passed. Vite production build passed.
- The full repository Vitest suite finished at **563/567 passed**. The remaining four failures are in existing unrelated areas: AdminDashboard staff-modal test, dashboard performance history, exam-answer normalization, and Gemini correction-prompt expectations. The upload UI test that initially failed because of the missing `getSubjectExamInfo` import passes in the focused upload job after the import was fixed.
- Repository-wide ESLint still fails on unrelated existing files; focused ESLint for every changed upload-processing file passes.
- Runtime error aggregation contains only the earlier `DOMMatrix is not defined` incidents from deployments before the PDF import correction and background worker. No worker-route runtime-error group was returned.

The database currently has **five legacy upload rows** still in `uploading`. In the admin upload history, use **Check completed upload** on each row. The API will compare the stored object size and enqueue it when the object is complete. Re-upload only when the file is absent or its byte count does not match.

A real authenticated browser upload that goes through Storage → queue → background PDF/DOCX/CSV validation still requires an admin-session smoke test. No full real-file processing success is claimed yet.

Applied queue-related Supabase migrations:
- `20261102044400_enable_admin_course_upload_queue_extensions`
- `20261102044806_admin_course_upload_async_queue`
- `20261102045212_schedule_admin_course_upload_worker`
- `20261102050129_lock_down_pgmq_browser_access`
- `20261102050304_increase_admin_course_upload_worker_http_timeout`



## Simplified subject management — 2026-11-02

The former selected-subject file-history panel is no longer part of the Admin Courses interface. Admins now follow Department → Course → Semester and then choose one of two actions: Add subject or Remove subject.

- Add subject collects subject name, official subject code, departmental flag, and one PDF/DOCX syllabus.
- The browser uploads that file directly to the existing private `admin-course-files` bucket. The authenticated API verifies the admin, course/semester, object ownership/path and exact byte count, then extracts readable text with the existing PDF.js/Mammoth utilities.
- The full extracted syllabus text (up to the existing 30,000-character limit) and official subject code are stored in `private.subject_catalog_metadata`. The canonical public `Subjects` row stores the departmental flag, and an active syllabus upload-history record is inserted in one database transaction.
- Existing public `Courses`, `Subjects`, and `TestsData` column definitions remain unchanged. The prior upload history/queue backend is retained for historical records, but its old multi-stage uploader is removed from the Admin Courses screen.
- A newly added numeric subject can be resolved from the live catalog in ExamPortal. Exam generation now prefers its saved extracted syllabus and falls back to the pre-existing static dataset for older subjects.
- Removal is blocked when exam attempts, leaderboard entries or published question-bank references exist. If allowed, the database record cleanup is transactional and old private Storage objects are removed after the transaction.

The canonical SubjectId scheme requires the official subject code; it is therefore a required field in Add subject even though the prior read-only subject browser only displayed the numeric ID. Scanned/image-only PDFs are not OCR-processed and must be supplied as a text-readable PDF or DOCX.

The live migration `20261102053000_admin_subject_management` has been applied and the private metadata table plus all three RPCs have been verified. Automated UI/API regression coverage is added to the existing Test Room regression workflow; check the linked run before treating test/build verification as complete.


## Immutable subject identity and soft removal — 2026-11-02

A catalog subject is no longer physically deleted. Migration `20261102055000_admin_subject_identity_restore` created private.subject_catalog_status and backfilled the 1,855 existing public Subjects rows as active. Admin Remove now archives the row by setting its status inactive; the public SubjectId and references in attempt/leaderboard/question-bank records remain untouched. Re-adding the same course, official code, occurrence and semester resolves the existing encoded SubjectId and restores that row; it does not allocate a new occurrence just because the row is archived.

The active student course list now uses `pm_catalog_subjects_for_course`, which filters archived rows without exposing the private state table. The archive/restore RPCs remain service-role-only. Verification on the live project confirmed 1,855 tracked active rows, no anon/authenticated access to the status table, and no direct browser execute permission for the archive RPC.

Live example verified: Diploma Computer Engineering, CourseId 44, Computer Fundamental Skill, official code `09CE2101`, Semester 1 → SubjectId `44000935210101`. A live transaction test archived this row, restored it through the add RPC, asserted the same SubjectId and active catalog visibility, and rolled the transaction back. No real catalog record was changed by that smoke test.

## Subject classification removal verification — 2026-11-02

- The Add Subject form now has exactly three subject metadata fields: subject name, official subject code, and departmental status. The required syllabus PDF/DOCX upload remains separate.
- API and database creation contracts no longer accept or store a subject type. The private metadata column was dropped and the syllabus RPC no longer returns it.
- Live Supabase verification: the new create RPC accepts the 15-argument signature, only `service_role` can execute it, and the old classification column is absent. A create-and-rollback smoke test passed without leaving a subject or upload row behind.
- GitHub Actions focused suite passed: 9 files / 64 tests. Changed-file ESLint, Test Room regression tests, and Vite production build passed.
- Repository-wide ESLint still fails on unrelated existing errors; the full Vitest suite has four unrelated failing test files (Admin Dashboard, Dashboard Performance, answer normalization, and Gemini correction prompts).

## PDF extraction reliability fix — 2026-11-02

- Fixed the Admin Subject PDF extraction path so a PDF.js/serverless worker failure is no longer mislabeled as a damaged or encrypted file. The original parser error is preserved in server logs.
- The Vercel `api/admin-subjects.js` function now explicitly includes the PDF.js worker, PDF.js support assets, and `@napi-rs` canvas runtime files.
- PDF.js extraction now enables XFA handling, continues through recoverable parser warnings, accepts a PDF header within the first 1,024 bytes without rewriting the original bytes, and includes available AcroForm values alongside page text. Failure to read optional form values does not discard successfully extracted page text.
- Focused upload/catalog regression checks (9 files) and the Vite production build passed for the preceding code commit. The latest tiny guard around optional AcroForm extraction is queued for the same CI checks.
- **Deployment blocker:** Vercel rejected the production deployment because the team hit its free deployment/API quota (`api-deployments-free-per-day`, retry reported in 24 hours). The fix is committed to `main` but is not live on the production domain yet.
