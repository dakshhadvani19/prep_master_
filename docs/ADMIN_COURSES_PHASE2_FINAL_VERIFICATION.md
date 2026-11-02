# Admin Courses — Phase 2 Final Verification

Date: 2026-11-01
Status: **Complete and verified**

Phase 2 is implemented in the admin course workspace. This pass verified the existing implementation and its live Supabase configuration.

## Delivered

- PDF/DOCX syllabus upload and PDF/DOCX/CSV question-bank upload from the selected subject panel.
- Private Supabase Storage bucket: admin-course-files.
- Authenticated admin API: /api/admin-course-uploads. The server verifies the Supabase JWT and explicit public.Admins membership; service-role credentials remain server-side.
- Resumable TUS uploads with measured progress, retry, same-file resume and persistent incomplete upload status.
- File validation: 20 MB maximum, PDF 50 pages maximum, extracted text 30,000 characters maximum, CSV 10,000 rows maximum, strict MIME/extension/signature checks.
- Extraction: pdfjs-dist for PDF, mammoth for DOCX, csv-parse for CSV.
- Upload history and validation previews backed by private.admin_course_uploads.
- Syllabus activation requires a separate explicit confirmation; upload or parse success alone does not replace the active version.
- Question-bank files enter the Phase 3 review workflow; raw uploads are not written to public.TestsData.

## Live Supabase verification

- admin-course-files exists with public=false, a 20 MB limit and a PDF/DOCX/CSV MIME allowlist.
- The Storage insert policy is limited to authenticated users whose current_role() is admin or superAdmin.
- private.admin_course_uploads, private.question_banks, private.question_bank_questions and private.question_bank_sets exist.
- Migrations 20261101090011_admin_course_file_intake and 20261101093432_admin_question_bank_ingestion are recorded as applied.
- Private upload tables remain RLS-protected and are accessed through the authenticated server API.

## Verification run

- Upload validation: 12/12 tests passed.
- Upload UI: 5/5 tests passed.
- Upload API: 6/6 tests passed.
- Question-bank parser regression suite: 4/4 passed.
- Phase 2 upload-specific suites: 23/23 passed.
- Including the parser regression suite: 27/27 passed.
- Targeted ESLint across upload UI, API, validation/parser modules and related tests: passed.
- Vite production build: passed in 6.32 seconds. Existing circular vendor chunk and large-chunk-size warnings remain; there are no build errors.

## Remaining work outside Phase 2

Student-side selection of published question-bank sets is integrated into ExamPortal through a service-role-only RPC. It filters by subject/exam/type/difficulty, uses complete MCQ sets or exact theory mark sequences, and keeps answer keys server-side. Real-bank smoke testing awaits the first published bank.


## Production upload API hardening — 2026-11-02

A production smoke attempt showed HTTP 500 responses from both the admin upload-history and upload-start requests, before any corresponding upload RPC or Storage request appeared in Supabase logs. The live private bucket and authenticated-admin insert policy were present.

The API was hardened to:
- Keep PDF/DOCX/CSV parser dependencies out of the API module's startup path; load validation and question parsing only when those actions are requested.
- Move upload metadata checks and the upload error type into a lightweight module used by upload-history and upload-start.
- Preserve an uploaded source object when validation fails because of a transient server/runtime error; only file-validation failures mark the upload failed and clean up the object.
- Add explicit `.js` extensions to the server-side exam-policy import chain for Node ESM compatibility.

Code was committed to the main branch in commits `40993a5`, `8f0c968`, `2f9a22f`, `ff96206` and `c22daa9`. The final code revision is `c22daa96315468e8062524af572cb9d863df240b`.

**Verification status:** the final revision's Vercel production deployment was still building at the time of this update. A real authenticated syllabus upload has not yet been rerun, so end-to-end success must be confirmed by retrying the same upload after the final deployment is ready.

## 2026-11-02 production 500 follow-up

The admin upload screen continued to show HTTP 500 responses for both upload-history GET and upload-start POST after the previous ESM-extension hardening. Vercel confirmed that the current production alias was serving commit `7fae4bd` and the deployment was READY; the available Hobby runtime-error/log views did not return matching request records, so the failing request's stack trace was not available.

A focused API startup-isolation change was committed in `c1f8045`:
- Removed the eager static import of `src/utils/subjectExamPolicy.js` from the upload API entrypoint.
- Load the existing canonical exam-policy module only within question-bank upload validation and question-bank publication actions.
- Syllabus upload start and upload-history reads no longer need to initialize the exam-blueprint import chain.

This change preserves the shared exam-policy implementation and does not change API contracts, database schema, storage permissions, or question-bank rules.

**Initial status:** code had been committed; automated and runtime verification were pending.


## 2026-11-02 verification result

The follow-up revision (commit `dfdb165`) is deployed to production with state **READY** and the `prepmaster-tau.vercel.app` alias.

- Clean Vercel sandbox install: `npm ci` succeeded.
- Focused API suite: `npx vitest run tests/admin-course-uploads-api.test.js` — **7/7 passed**.
- Targeted ESLint for `api/admin-course-uploads.js` and `tests/admin-course-uploads-api.test.js` — passed.
- Production Vite build: `npm run build` — passed. Existing circular vendor chunk and large-chunk-size warnings remain.
- Live production request without Authorization: **HTTP 401** with the expected `Sign in to manage course files.` JSON response. This confirms the function initializes and the handler executes on the production alias.
- Vercel grouped runtime-error scan for the route over the latest hour: no matching runtime errors.

**Still pending:** authenticated upload-history GET and a real syllabus upload-start/finalize using the administrator's browser session. The available checks establish successful deployment and route startup, but cannot prove the authenticated Supabase/database/storage path without that session. Retry the same subject in the browser to complete the end-to-end smoke test.


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
