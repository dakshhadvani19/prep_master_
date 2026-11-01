# Admin Courses — Phase 2 Final Verification

Date: 2026-11-01
Status: **Complete and verified**

Phase 2 was already implemented in the repository. This pass verified the existing implementation rather than rebuilding it.

## Delivered

- PDF/DOCX syllabus upload and PDF/DOCX/CSV question-bank upload from the selected subject panel.
- Private Supabase Storage bucket: admin-course-files.
- Authenticated admin API: /api/admin-course-uploads. Server verifies Supabase JWT and explicit public.Admins membership; service-role credentials remain server-side.
- Resumable TUS uploads with measured progress, retry, same-file resume and persistent incomplete upload status.
- File validation: 20 MB maximum, PDF 50 pages maximum, extracted text 30,000 characters maximum, CSV 10,000 rows maximum, strict MIME/extension/signature checks.
- Extraction: pdfjs-dist for PDF, mammoth for DOCX, csv-parse for CSV.
- Upload history and validation previews backed by private.admin_course_uploads.
- Syllabus activation is a separate explicit confirmation; the active syllabus is not replaced by upload or parse success alone.
- Question-bank uploads are validated and passed to the Phase 3 review workflow; Phase 2 does not write raw question data to public.TestsData.

## Live Supabase verification

- Bucket admin-course-files exists with public=false, 20 MB maximum and PDF/DOCX/CSV MIME allowlist.
- Storage insert policy is limited to authenticated users whose current_role() is admin or superAdmin.
- private.admin_course_uploads, private.question_banks, private.question_bank_questions and private.question_bank_sets exist.
- Migrations 20261101090011_admin_course_file_intake and 20261101093432_admin_question_bank_ingestion are recorded as applied.
- Upload metadata/RPC access remains server-side with the private tables protected by RLS and no direct anon/authenticated table grants.

## Verification run

- Phase 2 suites: 12 upload-validation + 5 upload-UI + 6 upload-API = **23/23 passed**.
- Parser regression suite: **4/4 passed**.
- Admin locator suite: **9/9 passed**.
- Combined verification: **36/36 passed**.
- Targeted ESLint across upload UI, API, validation/parser modules and tests: passed.
- Vite production build: passed in 6.32 seconds. Existing circular vendor chunk and >600 kB chunk-size warnings remain, but there are no build errors.
- The upload review UI includes the required getSubjectExamInfo import.

## Remaining work outside Phase 2

Phase 3 student-side selection of published question-bank sets in ExamPortal remains separate. It must preserve the question-bank subject/exam/difficulty metadata and must not expose correct answers before submission.
