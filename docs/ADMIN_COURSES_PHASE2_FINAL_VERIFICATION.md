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
