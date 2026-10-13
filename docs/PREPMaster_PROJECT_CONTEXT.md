# PrepMaster — Project Context

## Purpose

PrepMaster is a university-exam preparation SPA for diploma/degree students. The project combines a static department catalog, Supabase-backed course/subject catalog data, Supabase authentication, AI-assisted question generation, exam taking, admin tooling, and future persistent attempts/leaderboards.

## Repository

- GitHub: dakshhadvani19/prep_master_
- App: global-exam-prep/
- Default branch: main
- Deployment: Vercel
- Current live Supabase project: prepmaster
- Supabase ref: llqwtgwjlwgrftihtern
- Region: ap-south-1
- Git policy: main-only unless the user explicitly requests another flow.

## Source-of-truth hierarchy

1. Current code on main is the implementation source of truth.
2. Live Supabase schema/data is the backend source of truth for database-backed features.
3. docs/PREPMaster_CURRENT_STATUS.md is the current implementation/status handoff.
4. This document is the durable project architecture/context.
5. Historical artifacts are not requirements and must not override current code or explicit user instructions.

## Core architecture

- React 19 + Vite
- React Router
- Framer Motion
- Lucide
- Supabase JS
- Vercel serverless API endpoints
- Browser-local/static adapters only where persistent Supabase storage is not yet designed

There is one authentication provider: Supabase Auth.
There is no secondary backend integration in the current application.

## Authentication

Supabase Auth owns identity and sessions.

Supported flows:
- Email/password
- Google OAuth using PKCE
- Custom server-generated signup OTP gate
- Password recovery

Relevant files:
- src/supabase.js
- src/context/AuthContext.jsx
- src/utils/supabaseAuth.js
- src/utils/otpService.js
- src/pages/Signup.jsx
- api/send-otp.js
- api/verify-otp.js

Signup order:
1. User enters details.
2. /api/send-otp generates the code server-side.
3. Only an HMAC digest is stored in public.auth_otp.
4. /api/verify-otp verifies the code.
5. Only after verification does Supabase Auth create the account.
6. The auth.users trigger creates public.students.

Admin authorization is resolved from public.admins using auth.uid(). Client role state is not authoritative.

## Security

- Never expose SUPABASE_SERVICE_ROLE_KEY to browser code.
- Never put secret credentials in VITE_* variables.
- Keep RLS enabled.
- Never use localStorage/sessionStorage as an authorization source.
- Never let a client choose its own role.
- Do not weaken RLS to make a feature work.
- Do not add a second identity system.

## Secondary backend removal

The previous secondary backend integration was deliberately removed.

Deleted:
- Legacy initialization/configuration files
- Legacy package and lockfile entries
- Legacy build chunk
- Legacy environment variables and CSP endpoints
- Legacy test mocks

Features that previously required remote persistence now use explicit local/static adapters until their Supabase schemas are designed:
- src/utils/examHistoryStorage.js for exam history
- src/utils/syllabusStorage.js for syllabus metadata/text
- browser-local counters in src/utils/hashUtil.js

These adapters must be fast and must not simulate network fetching with arbitrary delays.

## Supabase catalog

Departments are intentionally frontend-static. There must never be a Departments table for this catalog requirement.

Static source:
- src/data/catalogDomains.js

Runtime database sources:
- public.Courses -> CourseId, CourseName, Sems
- public.Subjects -> SubjectId, SubjectName, CourseId, Semester

Current verified facts:
- Courses: **40 rows** at the 2026-10-13 direct-SQL snapshot
- Subjects: **1,938 rows** at the same snapshot
- All Subjects rows have a non-null Semester; no blank SubjectName values; no orphan CourseIds
- RLS is enabled on all inspected public tables
- The current B.Tech removals are recorded in root-level `removed_course.json`; details are in `docs/PREPMaster_DATABASE_STATUS.md`

Course semester options come from Courses.Sems.
Subject semester values come from Subjects.Semester.
Do not infer semester from SubjectId digits.

## Syllabus availability cleanup (2026-10-11)

The live Supabase `public.Subjects` catalog excludes 106 subjects from the Arena review batch that had no acceptable subject-matched PDF in the supplied recovery package, including four incorrectly labelled PDFs rejected after internal course-code inspection. Their pre-deletion row metadata is stored in `global-exam-prep/temp_removed_subjects/removed_subjects_2026-10-11.csv`; the Bioinformatics target with no safe live-row match is preserved separately and was not deleted. The `subjectIdBridge.json` and `subjectSemesterMap.json` compatibility maps exclude the same 106 numeric IDs. The Arena run recorded zero HTTP attempts, so this exclusion reflects the package's verified-file list, not proof of internet-wide unavailability.

## Catalog compatibility files

- src/data/courseMapping.json is allowed for department-to-course scoping and source CourseId compatibility.
- src/data/subjectIdBridge.json maps numeric SubjectIds to legacy/source compatibility values used by the exam path.
- src/data/subjectSemesterMap.json is legacy ExamPortal compatibility data, not the student catalog runtime source.

Do not create a Departments table. Do not make JSON catalog data the runtime source when a Supabase catalog field is required.

## Catalog UI flow

- Homepage renders six static departments and does not fetch the full catalog.
- /domains/:domainId/courses fetches scoped Courses.
- /courses/:courseId/subjects fetches the selected Course and its Subjects.
- Semester filters are derived from Courses.Sems.
- Subject semester display/filtering uses Subjects.Semester.
- Small in-memory cache/inflight deduplication is acceptable.
- Cache must never change the source of truth.

## Exam system

Main route: /exams/:subjectId/:examType/:difficulty

Protected exam files should not be opportunistically rewritten during unrelated catalog tasks.

Exam generation can use:
- static syllabus/question data
- uploaded PDF text
- configured AI generation
- existing subject-resolution compatibility

Exam submission creates a compact record containing date, subject, exam type, difficulty, type, score, total marks, question snapshot, and sanitized answers.

Current temporary persistence: src/utils/examHistoryStorage.js.
Future target: a properly designed Supabase attempts/history schema with RLS.

## Syllabus

Admin route: /admin/syllabus.

Current behavior:
- Admin selects a subject.
- PDF text is extracted locally.
- Extracted text is capped at 50,000 characters.
- Metadata/text is kept in browser local storage.
- PDF object URLs are current-session only.

Future target: persistent Supabase storage/database design after schema and RLS decisions are made.

## Admin

Admin route: /admin/courses.

Current state:
- UI is an in-memory preview.
- Persistent Course -> Semester -> Subject -> Question CRUD is not complete.

Do not invent persistence by adding another backend.

## Leaderboards

Leaderboard UI exists.
Real persistent ranking requires a durable attempts table and a defined ranking query.
Do not claim real leaderboard persistence until the Supabase attempts design is implemented and verified.

## Feedback

Feedback submission/API plumbing exists.
A complete persistent admin feedback store is still pending.
Do not create a hidden browser-only feedback system and call it persistent.

## Main routes

- /
- /signup
- /login
- /register
- /domains/:domainId/courses
- /search
- /feedback
- /guide
- /courses/:courseId/subjects
- /exams/:subjectId/:examType/:difficulty
- /dashboard
- /admin/courses
- /admin/syllabus
- /leaderboards
- /review/:historyId

## Important source files

- src/App.jsx: router and application shell
- src/data/catalogDomains.js: static departments
- src/utils/catalogApi.js: Supabase catalog reads
- src/pages/CourseExplorer.jsx: course catalog UI
- src/pages/SubjectDetails.jsx: subject/semester UI
- src/data/courseMapping.json: course scoping compatibility
- src/data/subjectIdBridge.json: numeric subject compatibility
- src/utils/subjectResolver.js: exam subject resolution
- src/pages/ExamPortal.jsx: exam flow
- src/utils/examHistoryStorage.js: temporary history persistence
- src/utils/syllabusStorage.js: temporary syllabus persistence
- src/context/AuthContext.jsx: authentication/session/role routing
- src/supabase.js: browser Supabase client

## Protected implementation rules

1. Departments remain static frontend data.
2. Courses/Sems/Subjects/Subject.Semester come from Supabase for the student catalog.
3. Do not create a Departments table.
4. Do not infer semester from SubjectId.
5. Do not use service-role credentials in browser code.
6. Do not weaken RLS.
7. Do not restore a removed backend.
8. Do not rewrite exam/question-generation code during unrelated catalog work.
9. Do not change Vite chunk strategy opportunistically.
10. Do not claim tests/build/deployment success without actually running or checking them.
11. If a requested migration would remove functionality and no Supabase design exists yet, use an explicit fast static/local fallback.
12. Ask the user before making a destructive architectural choice when the user has not already explicitly authorized that choice.

## Arena workflow

Arena is useful for large repetitive code changes.

Preferred process:
1. Give Arena a tightly scoped task.
2. Ask for changed files/report/bundle.
3. Review the actual result independently.
4. Compare against this document and current main.
5. Apply only verified changes to main.
6. Run relevant validation.
7. Never merge blindly and never claim a deployment that was not verified.

## Documentation rules

When architecture changes, update:
- docs/PREPMaster_CURRENT_STATUS.md
- docs/PREPMaster_PROJECT_CONTEXT.md
- AUTH.md when authentication changes

Do not preserve obsolete architecture descriptions as if they are active implementation.

## Current unfinished work

- Persistent exam attempts/history in Supabase
- Persistent syllabus storage in Supabase
- Persistent admin course/catalog CRUD
- Persistent leaderboards
- Persistent admin feedback store
- Any other feature whose final storage schema has not yet been designed and verified

The removal of the previous backend is complete at the application architecture level; the remaining work is to replace temporary local persistence with deliberate Supabase designs where needed.

## Law & Arts syllabus match cleanup (2026-10-11)

The Law & Arts PDF content audit temporarily excluded 74 live `public.Subjects` rows after archiving 88 audit rows (the other 14 were already absent). Archive: `global-exam-prep/temp_removed_subjects/law_arts_removed_subjects_2026-10-11.csv`. The 74 removed numeric IDs are removed from `subjectIdBridge.json` and `subjectSemesterMap.json`. Network-unverified cases (33 course/semester occurrences across 19 title groups) remain live and are documented in `law_arts_network_retry_pending_2026-10-11.csv`. The removal is based on an inconclusive/malformed one-to-one PDF mapping, not a claim that the underlying subject has no syllabus online; restore once the title/course code and syllabus are verified.

## Management Studies recovery cleanup — 2026-10-11

- Archive: `management_studies_removed_subjects_2026-10-11.csv`.
- The recovery run marked 74 unique normalized Management Studies subject titles as `FAILED_NO_MATCHING_OFFICIAL_PDF`, covering 122 course/semester occurrences. The exact 122 live Supabase rows are preserved in the archive with their original `SubjectId`, `SubjectName`, `CourseId`, `CourseName`, and `Semester`.
- The records are temporarily excluded under the user's direction after this recovery run. This status reflects the run result only, not proof that a syllabus does not exist: the report recorded HTTP 429 rate limits and zero candidate-download attempts for some failed titles.
- The same 122 IDs are removed from `src/data/subjectIdBridge.json`, `src/data/subjectSemesterMap.json`, and the legacy subject arrays in `src/data/mockData.js` to prevent stale numeric exam routes from resolving them.
- Restore only after a directly accessible syllabus is validated against the applicable course/program, subject code/title, and semester. Retry sources in priority order: official Marwadi University, GTU, then another credible official university for clearly-labelled comparable references.

## Diploma syllabus-backed catalog rule (updated 2026-10-12)

For Diploma CourseIds 44–49, synchronize against the current official Marwadi syllabus manifest at `Syllabus/Diploma_Full_Collection_1/Marwadi_Official_Diploma_Collector/Marwadi_Diploma_Syllabus_Collection/Reports/subject_inventory_from_marwadi_pages.csv` and the 245-target planning manifest in `global-exam-prep/temp_removed_subjects/diploma_catalog_sync_2026-10-12.csv`.

- Verified ID format: convert alphabetic characters in the official subject code to 1-based alphabet positions (A=1…Z=26), preserve numeric digits, append `01`, left-pad the encoded code to 12 digits, then prefix CourseId. Example: CourseId 44 + `09CE3102` → `44000935310201`.
- Completed sync state: 241 active Diploma Subject IDs in Supabase match the manifest by SubjectId, CourseId, semester, and subject name. Do not re-insert an existing SubjectId.
- Four targets remain excluded until evidence is resolved: Computer Engineering and Electrical Engineering Applied Chemistry (`09GS3102`), because the PDFs specify Semester I/II without a program-specific semester; Mechanical Engineering Computer Fundamental Skill (`09CE2101`) and Civil Engineering Advance Design of Structures (`09CI0616`), because code/title validation is pending.
- Ninety-six superseded/unverified previous rows were archived in `public.temp_subjects_removed` and the checked-in CSV archive before deletion. Keep RLS enabled; do not grant browser `anon` or `authenticated` read/write access to this internal archive.
- Keep `subjectIdBridge.json`, `subjectSemesterMap.json`, and static Diploma subject arrays synchronized to the **241 active IDs**, excluding the four unresolved targets.
- Active catalog and semester-coverage reports distinguish missing validated PDFs from proof that a subject does not exist. Network, source-code, or semester uncertainty is not evidence of absence.


## B.Tech syllabus PDF-to-JSON state and Supabase cleanup (verified 2026-10-13)

The source PDF collection and the runtime Supabase course catalog are separate:

- PDF library: `Syllabus/B.Tech programs/_PDF_Library/`.
- Program catalog: `Syllabus/B.Tech programs/_Catalogs/program_catalog.csv` (20 program entries).
- Program/PDF map: `Syllabus/B.Tech programs/_Catalogs/program_course_map.csv` (313 associations; 157 unique referenced PDF paths).
- Builder: `Syllabus/build_btech_syllabus_txt.py`.
- Generated JSON: `Syllabus/syllabus_txt/B.Tech/`; index: `Syllabus/syllabus_txt/B.Tech/index.json`.

The generated index at 2026-10-13 05:30:45 UTC lists 9 program outputs and 11 programs with no verified syllabus JSON. Of 313 mapped program/PDF associations, 303 were classified as structured and 10 were flagged for manual review of content sections. The builder uses PyMuPDF native text extraction, does not run OCR, and preserves the text extracted from each page. “Structured” means the parser found units/topics; it is not a guarantee that all content is correct. The 10 review-needed items must be inspected against the source PDFs.

### Live Supabase catalog snapshot after the B.Tech cleanup

Direct SQL verification on 2026-10-13 at 06:22 UTC returned 40 rows in `public.Courses` and 1,938 rows in `public.Subjects`. The live B.Tech IDs are now `1, 2, 4, 5, 7, 8, 9, 10`, representing 424 subject rows.

On 2026-10-13, course IDs `3, 6, 11, 12, 13, 14, 15, 16, 17` were deleted along with 554 linked Subject rows because their mapped source-PDF sets were insufficient to fully convert their listed syllabi. Post-delete queries verified zero of those Course IDs and zero linked subjects remain live. The full recovery snapshot is the root-level [`removed_course.json`](../removed_course.json), containing the removed IDs, department/course names, reason and SubjectId/title/semester details.

This is a source-evidence cleanup, not a claim that the underlying degrees or subjects do not exist. The JSON converter has 9 program outputs and its output includes the one mapped Machine Learning PDF for Mechanical Engineering AI/ML even though CourseId 14 was removed from the live catalog; generated output is not authority for whether a Supabase course row exists. ECE Robotics, VLSI and IoT catalog entries had no distinct matching Supabase IDs and were noted as `id: null`, not counted among deletions.

The six active Diploma course IDs `44–49` still have 241 current Subject rows. The internal `public.temp_subjects_removed` archive contains 96 superseded Diploma subject rows; RLS is enabled and `anon`/`authenticated` have no SELECT privilege. The same live snapshot had no null subject semesters, blank subject names, or orphan CourseIds. CourseId 30 remains a known exception with an empty semester list and no subject rows.

For full exact database counts, table columns and FK details, see `docs/PREPMaster_DATABASE_STATUS.md`. Historical counts in older notes describe earlier catalog states and must not be treated as live counts.
