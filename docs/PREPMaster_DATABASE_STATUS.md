# PrepMaster — Database Status

> Schema updates (2026-10-27): operational `exam_attempts`, `exam_attempt_keys`, and `auth_otp` live in the unexposed `private` schema; the empty `exam_grades` table was removed. Phase 1 mirrors 18 private attempts into 13 public `TestsData` papers and 18 public `TestAttempts` rows; phase 2 maintains 13 `public.TestRooms` aggregates. Core ERD tables are unchanged. Older counts below are point-in-time snapshots unless explicitly updated.

_Last live verification: 2026-10-30 12:16 UTC (17:46 IST)_

This document records the current live Supabase database state and the most recent catalog changes. Live row counts are a snapshot and can change when users register or submit data.

For application architecture, see:
- [Current Status](PREPMaster_CURRENT_STATUS.md)
- [Project Context](PREPMaster_PROJECT_CONTEXT.md)

## 1. Live Supabase project

| Property | Value |
|---|---|
| Project | `prepmaster` |
| Project ref | `llqwtgwjlwgrftihtern` |
| Region | `ap-south-1` |
| Database | Supabase PostgreSQL |
| Schema | `public` |
| Current repository branch | `main` |

Row counts below were checked with direct SQL queries against the live project, not inferred from older docs or the catalog JSON files.

## 2. Current live row counts

| Table | Rows at verification | Notes |
|---|---:|---|
| `public.Courses` | **40** | Course catalog |
| `public.Subjects` | **1,855** | Subject catalog after project and activity-based exam-catalog exclusions |
| `public.Students` | 7 | Student-profile rows; not a count of all Auth users |
| `public.Admins` | 1 | Admin-profile row |
| `public.Feedbacks` | 0 | Authenticated feedback submission endpoint is live; table was empty at this verification |
| `public.Leaderboards` | 0 | No persistent leaderboard rows |
| `public.exam_history` | 0 | No persistent exam-history rows; app history currently uses browser-local storage |
| `private.auth_otp` | 1 | Short-lived OTP-challenge table; this count is transient |
| `public.temp_subjects_removed` | **96** | Internal recovery archive for the Diploma cleanup |

The totals of 40 Courses and 1,938 Subjects are the current catalog baseline as of the timestamp above. Older figures in historical notes (49 Courses or earlier Subject totals) predate later exclusions/removals and are not the current database state.

## 3. Current B.Tech catalog state

The live B.Tech Course records remaining in Supabase are:

| CourseId | CourseName | Live Subjects |
|---:|---|---:|
| 1 | B.Tech - Computer Engineering | 61 |
| 2 | B.Tech - IT | 26 |
| 4 | B.Tech - AI/ML | 16 |
| 5 | B.Tech - AI/Data science | 63 |
| 7 | B.Tech - ICT | 73 |
| 8 | B.Tech - CSE | 64 |
| 9 | B.Tech - CSE & Cyber Security | 63 |
| 10 | B.Tech - CSE & AI | 58 |
| **Total** | **8 active B.Tech course records** | **424** |

### B.Tech course removals recorded on 2026-10-13

Nine Course records and their subject rows were removed after the source audit found insufficient verified, mapped subject-level syllabus PDFs to complete the requested PDF-text-to-JSON conversion.

| CourseId | Course | Subject rows removed |
|---:|---|---:|
| 3 | B.Tech - Electrical Engineering | 78 |
| 6 | B.Tech - BioInformatics | 54 |
| 11 | B.Tech - Chemical Engineering | 61 |
| 12 | B.Tech - Civil Engineering | 106 |
| 13 | B.Tech - Mechanical Engineering | 86 |
| 14 | B.Tech - Mechanical Engineering & Ai/ML | 38 |
| 15 | B.Tech - Mechanical Engineering Robotics & Automation | 32 |
| 16 | B.Tech - Electronics & Communication | 49 |
| 17 | B.Tech - Electronics and Communication Engineering - AI | 50 |
| **Total** | **9 Course records** | **554 subject rows** |

Post-delete verification returned **0 live Course rows and 0 live Subject rows** for CourseIds `3, 6, 11, 12, 13, 14, 15, 16, 17`.

Recovery source: repository-root [`removed_course.json`](../removed_course.json). It stores each removed course's ID, name, department, source-coverage reason, semester list, and the full child-subject snapshot (SubjectId, title, semester). This is a recovery/audit archive, not a live source of catalog data.

**Interpretation:** These rows were removed because the checked-in verified source set was incomplete for full conversion. Removal is not proof that a degree program or subject does not exist. Re-add a course only after its authoritative course/subject mapping is verified and the source syllabus PDFs are obtained and reviewed.

Three B.Tech specialization catalog entries—ECE Robotics, ECE VLSI Design and Technology, and ECE Internet of Things—had no separate matching row in `public.Courses`; they are noted with `id: null` in the archive and were not counted as database deletions.

## 4. Current Diploma catalog state

The six active Diploma course rows are CourseIds `44–49`:

| CourseId | Diploma program | Live Subjects |
|---:|---|---:|
| 44 | Computer Engineering | 39 |
| 45 | Mechanical Engineering | 38 |
| 46 | Chemical Engineering | 38 |
| 47 | Electrical Engineering | 42 |
| 48 | Civil Engineering | 41 |
| 49 | Information and Communication Technology | 43 |
| **Total** | **6 active Diploma programs** | **241** |

The 241 active Diploma subject IDs were synchronized against the current official Marwadi syllabus manifest. Four intended targets remain excluded pending semester/code/title evidence:
- Applied Chemistry (`09GS3102`) in Computer Engineering and Electrical Engineering: the PDF specifies Semester I/II without an unambiguous program-specific semester.
- Computer Fundamental Skill (`09CE2101`) in Mechanical Engineering: source-code/title match needs review.
- Advance Design of Structures (`09CI0616`) in Civil Engineering: source-code/title match needs review.

The previous 96 Diploma subject rows were archived to `public.temp_subjects_removed` before deletion. RLS is enabled on that table and direct checks confirm `anon` and `authenticated` do **not** have table-level SELECT privileges. It is an internal recovery table, not a browser-facing catalog.

## 5. Current data-integrity checks

The following checks returned zero at the verification timestamp:

- Subject rows with null `Semester`: **0**
- Subject rows with blank `SubjectName`: **0**
- Subject rows whose `CourseId` has no matching Course: **0**
- Removed B.Tech course IDs still live in `public.Courses`: **0**
- Subject rows for those removed B.Tech IDs still live in `public.Subjects`: **0**

Known catalog exception: CourseId `30`, `Master In Global Business Management`, is still present with an empty `Sems` array and zero Subjects. It was not changed during the B.Tech cleanup.

## 6. Schema and relationships

All listed application tables in the exposed `public` schema currently have Row Level Security (RLS) enabled.

| Table | Primary key | Important columns / relationships |
|---|---|---|
| `public.Courses` | `CourseId` BIGINT identity | `CourseName`, `Sems` INTEGER[] |
| `public.Subjects` | `SubjectId` BIGINT identity | `SubjectName`, `CourseId` → `Courses.CourseId`, `Semester` INTEGER |
| `public.Students` | `StudentId` BIGINT identity | `auth_uid` → `auth.users.id`, `FullName`, unique lowercase `Email`, `IsSpam`, `role`, `created_at` |
| `public.Admins` | `AdminId` BIGINT identity | `auth_uid` → `auth.users.id`, `FullName`, unique lowercase `Email`, `isSuperAdmin`, `created_at` |
| `public.Feedbacks` | `FeedbackId` BIGINT identity | `Description` (max 1,000), `Type`, `Rating` SMALLINT (1–5), moderation flags, `StudentId` → `Students.StudentId` |
| `public.Leaderboards` | `LeaderboardId` BIGINT | `StudentId` BIGINT[], `Points` BIGINT[], `SubjectId` → `Subjects.SubjectId`, `TotalTests` BIGINT[] |
| `public.exam_history` | `id` BIGINT | `auth_uid` → `auth.users.id`, exam metadata, score, question snapshot and user answers in JSONB |
| `private.auth_otp` | `email` TEXT | OTP digest, nonce, attempt count, creation and expiry times; short-lived auth support data |
| `public.temp_subjects_removed` | `SubjectId` BIGINT | Internal Diploma recovery archive with original course/title/semester data, source code, reason, replacement data, restorable flag and source JSONB |

There is intentionally **no `Departments` table**. Department selection is frontend-static in `global-exam-prep/src/data/catalogDomains.js`.

## 7. Application data-source contract

- Departments: `global-exam-prep/src/data/catalogDomains.js` (static).
- Runtime Courses and semester options: `public.Courses`.
- Runtime Subjects and each subject's semester: `public.Subjects`.
- `src/data/courseMapping.json`: department scoping and source CourseId compatibility only.
- `src/data/subjectIdBridge.json`: numeric subject ID compatibility for the exam path.
- `src/data/subjectSemesterMap.json`: legacy ExamPortal compatibility only.
- Do not infer semesters from SubjectId digits, and do not treat syllabus JSON as the runtime Supabase catalog.

## 8. B.Tech PDF-to-JSON generation state

| Item | Current verified state |
|---|---|
| Source PDF library | `Syllabus/B.Tech programs/_PDF_Library/` |
| Program catalog | `Syllabus/B.Tech programs/_Catalogs/program_catalog.csv` |
| Program-to-PDF/semester map | `Syllabus/B.Tech programs/_Catalogs/program_course_map.csv` |
| PDF inventory | `Syllabus/B.Tech programs/_Catalogs/pdf_library_index.csv` |
| Generator | `Syllabus/build_btech_syllabus_txt.py` |
| Generated output | `Syllabus/syllabus_txt/B.Tech/` |
| Generated index timestamp | 2026-10-13 05:30:45 UTC |
| Program catalog entries | 20 |
| Program entries with JSON output | 9 |
| Programs without verified JSON output | 11 |
| Program-course/PDF associations | 313 |
| Unique referenced PDF files | 157 |
| Native-text extraction status | 303 structured; 10 content sections need manual review |

The builder uses PyMuPDF native text-layer extraction; it does not run OCR. JSON preserves extracted text by page and records extraction warnings. Unit/topic parsing is best-effort. The 10 review-needed associations must not be described as fully structured without manual inspection.

The B.Tech PDF catalog and the live database Course catalog are separate sources. In particular, the generated output currently includes a one-PDF output for Mechanical Engineering AI/ML even though live CourseId 14 was removed for incomplete coverage. Do not reinsert the corresponding database course merely because an output folder exists.

## 9. Database safety and change rules

- Never expose `service_role` or secret credentials to browser code.
- Keep RLS enabled.
- Do not grant `anon` or `authenticated` access to internal recovery archives.
- Do not use localStorage/sessionStorage as an authorization source.
- Do not create a Departments table.
- Do not claim a source syllabus is unavailable everywhere merely because it is missing from the checked-in collection.
- Archive source records before destructive catalog removal and verify the post-delete database state.
- Reconcile static ID mappings when adding or removing catalog records; avoid restoring a record until the course, subject IDs, semester and official source are verified.

## 10. BCA/MCA catalog reconciliation — 2026-10-13

The Computer Applications catalog was reconciled against `Syllabus/Computer_Applications_1/Computer_Applications_Batch_Runner/output/subject_inventory.csv`.

| CourseId | CourseName | Current subjects | Semesters |
|---:|---|---:|---|
| 18 | BCA | 48 | 1–8 |
| 19 | MCA | 29 | 1–4 |
| **Total** | | **77** | |

The existing CourseIds were retained to avoid breaking references. Course names were normalized to `BCA` and `MCA`, and `Courses.Sems` was updated to match the inventory. All 77 subject records were upserted and then verified by reading the live rows. No stale BCA/MCA rows outside the current inventory remained to delete.

SubjectIds follow `docs/primary_key_rules.md`: actual CourseId prefix, official subject code letter/digit encoding, and two-digit occurrence suffix; no rule exception or arbitrary IDs were introduced. The `subjectIdBridge.json` and `subjectSemesterMap.json` compatibility maps were synchronized to the same 77 records, replacing 56 old BCA/MCA mapping entries. The primary-key rules document did not require a deviation note.

The inventory includes some rows without an attached PDF URL and should be treated as the current subject inventory, not as proof that every syllabus PDF has been text-verified.

## 11. Project/dissertation subject cleanup — 2026-10-30

A live catalog audit identified 46 subjects whose titles represented project deliverables rather than ordinary teachable/examinable course units. The exact original rows are preserved in [`global-exam-prep/temp_removed_subjects/project_deliverable_subjects_removed_2026-10-30.csv`](../global-exam-prep/temp_removed_subjects/project_deliverable_subjects_removed_2026-10-30.csv).

- **Live migration:** `20261030113013_remove_project_deliverable_subjects_from_catalog`.
- **Deleted:** 46 exact rows from `public."Subjects"`, across B.Tech, Diploma, BCA/MCA, Management Studies, Law & Arts, and Science & Pharmacy.
- **Pre-delete dependency check:** zero matching rows in `private.exam_attempts`, zero in `private.leaderboard_attempt_results`, and zero subject snapshots in `public."Leaderboards"`. The migration performs these checks again and aborts if they are no longer zero.
- **Post-delete verification (2026-10-30):** 40 courses and 1,913 active subjects; zero of the 46 archived SubjectIds remain; zero project/dissertation/research-project deliverable rows remain under the audit's title rules.
- **Compatibility cleanup:** `subjectIdBridge.json` and `subjectSemesterMap.json` each now contain 2,452 entries (previously 2,513); `liveSubjectContextOverrides.json` now has 54 BCA/MCA entries (previously 60); 40 matching legacy subject records were removed from the static `mockData.js` hierarchy. The remaining six BCA project records were present only in the live numeric bridge/override, not in that legacy hierarchy.
- **Intentionally retained:** taught subjects such as Project Management, Software Project Management, Construction Project Management, Project Appraisal, Portfolio Management, and Design Engineering and Project Management. Their titles contain “project”, but their content is academic theory/management and can support conventional examination.
- The full original syllabus JSON collections are retained as source/reference archives; they are not runtime catalog sources.


- A second scan found **20 more project-deliverable records** only in inactive/older static course data. They are archived separately in [`legacy_project_subjects_removed_2026-10-30.csv`](../global-exam-prep/temp_removed_subjects/legacy_project_subjects_removed_2026-10-30.csv) and removed from `mockData.js`; 15 stale numeric bridge entries and their semester-map keys were also removed. These 20 did not exist as live Supabase subject rows and did not require database deletion. Following both passes, 2,538 nonblank static subject entries and 2,452 numeric compatibility entries remain.

A separate title-based audit identified **58 activity-/workplace-based occurrences** (internships/placements, seminars, colloquia, moot court, attachment, practice school, NCC, and physical education/wellness). They were subsequently removed from the active exam catalog in migration `20261030115624_remove_non_exam_activity_subjects_from_catalog`; this catalog exclusion does not mean the university does not assess them through practical, oral, workplace or activity-based methods. See [`global-exam-prep/temp_removed_subjects/non_exam_subjects_for_review_2026-10-30.md`](../global-exam-prep/temp_removed_subjects/non_exam_subjects_for_review_2026-10-30.md) for the course/semester list.


## 12. Feedback persistence — 2026-10-30

- Migration: `20261030121639_add_feedback_rating` adds required `public."Feedbacks"."Rating"` as SMALLINT with a database constraint of 1–5.
- The active form has three inputs: feedback type (General, Bug Report, Feature Request, Content Issue, Other), rating, and description.
- Description is limited to 1,000 characters in the browser and validated again by the server.
- `POST /api/feedback` verifies the caller's Supabase bearer token, resolves `StudentId` from the matching `Students.auth_uid` row, and inserts only `Description`, `Type`, `Rating`, and `StudentId` into `public."Feedbacks"`.
- The server omits `FeedbackId` and moderation flags so PostgreSQL generates the identity and applies existing defaults. The service-role credential remains server-only; direct browser table access remains closed by RLS and grants.
- The endpoint no longer depends on the optional Gmail mailer to record a submission. A successful response is returned only after the database insert completes.
