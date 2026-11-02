# Admin Courses — Phase 3 Progress

Last updated: 2026-11-01

Status: **Implemented, including student-side published-bank selection; real-bank smoke test awaits first published bank**

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
- Student auto-exam generation checks a published bank matching numeric SubjectId, exam type, question type and difficulty before calling Groq.
- Mid-2 and departmental Mid-1 require a complete 30-question MCQ set. Theory Mid-1/ESE requires the exact configured mark sequence.
- The server creates the attempt from private bank content; MCQ answer keys are stored privately and theory answers/rubrics stay in the private attempt snapshot. The browser receives answer-free questions only.
- A service-role-only RPC returns at most 300 matching question records per bank. anon/authenticated cannot execute it.
- If no complete eligible bank exists, ExamPortal keeps the existing AI/syllabus fallback.
- public.TestsData remains unchanged.

## Live database

Migrations:
- 20261101093432_admin_question_bank_ingestion
- 20261101094500_update_question_bank_publish_mark_totals
- 20261101112056_add_student_published_question_bank_candidates
- 20261101112612_filter_student_question_bank_candidates

All four migrations were applied on 2026-11-01.

Verified:
- private.question_banks, private.question_bank_questions and private.question_bank_sets exist.
- All three tables have RLS enabled and no direct anon/authenticated grants.
- Bank save/get RPCs and the mark-total-aware publish RPC are restricted to service_role.
- Upload status values include needs_review and published.

## Verification

- tests/question-bank-parser.test.js: 4 passing.
- tests/published-question-bank.test.js: 4 passing.
- tests/student-published-question-bank-api.test.js: 2 passing; verifies private MCQ keys and no key in browser response.
- tests/admin-course-uploads.test.jsx: 5 passing, including generated rubric approval and short-set publishing.
- tests/admin-course-uploads-api.test.js: 6 passing, including server-derived mark-total checks.
- Combined question-bank and upload integration suites: 21/21 passing.
- Targeted ESLint: passing.
- Vite production build: passing in 6.66 seconds. Existing circular vendor chunk and large-chunk warnings remain.
- Targeted ESLint on changed server/helper/test/upload files: passing.
- Full repository suite: 557/561 passed; four remaining failures are in Gemini correction-prompt expectations, admin staff-modal assertion, dashboard test-room history, and MCQ answer normalization.
 
## Boundary

Phase 3 ingestion, admin publication and student-side published-bank selection are implemented. Live database currently has zero published banks/sets, so a real-bank smoke test awaits the first admin publication. Until then, existing AI/syllabus generation remains the fallback. The PDF/DOCX parser expects numbered sections and explicit labels; unrecognized layouts remain rejected for manual correction rather than guessed.


## Production PDF parser runtime correction — 2026-11-02

The PDF question-bank parser shared the same PDF.js Node initialization risk found in Phase 2 syllabus validation. Both flows now use api/_lib/pdfjs-runtime.js to initialize DOMMatrix, ImageData and Path2D from the direct @napi-rs/canvas 0.1.96 dependency before importing PDF.js.

Regression coverage now includes PDF question-bank parsing with DOMMatrix absent at startup and the syllabus finalization API path with a stored PDF. Combined Phase 2/3 focused suites passed 26/26, targeted ESLint passed, production build passed, and the lockfile passed a clean npm ci. Existing Vite chunk warnings remain. The full repository test command did not finish within the sandbox session and is not marked passed.


## Production deployment confirmation — 2026-11-02

Fix commit 5a34581fc8d1b2df371c12df149cb59005b28cea is deployed to the production alias prepmaster-tau.vercel.app. Vercel reports the deployment state READY. The post-deploy grouped runtime-error scan for /api/admin-course-uploads returned no matching errors during the first 10-minute window.

The authenticated storage-to-finalize smoke test remains a required admin-session check. Use the saved syllabus history's Check completed upload action when retrying a PDF finalization; question-bank PDF parsing uses the same Node runtime bootstrap.


## Background intake boundary — 2026-11-02

The asynchronous worker handles Phase 2 source-file validation and text extraction after a file is durably accepted. Phase 3 question-bank normalization, review, rubric approval and publication remain behind the existing explicit admin actions and are not automatically published by the worker.



## Syllabus source for newly added subjects — 2026-11-02

Admin subject creation now stores the full extracted syllabus text and the declared Theory / Practical / Theory + Practical type in the private subject metadata record. ExamPortal resolves newly created numeric subject IDs from the live catalog and calls `pm_get_subject_syllabus` before trying the static syllabus dataset. Existing published question-bank selection and answer-key handling are unchanged. The removed Admin Courses upload panel no longer exposes the Phase 3 parse/review/publish flow; its database/API artifacts are retained as legacy functionality so prior records are not dropped. The direct add flow does not auto-create or publish question banks.
