# Admin Courses â€” Phase 2 Progress

Last updated: 2026-11-01

Status: **Implemented and verified; live database support applied**

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
- Question-bank uploads stop at validated_waiting_phase3; Phase 2 does not insert question rows into Tes¶»§q«^