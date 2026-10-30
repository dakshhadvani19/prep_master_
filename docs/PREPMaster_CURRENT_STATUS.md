# PrepMaster — Current Status

_Last updated: 2026-10-13_

## 1. Repository and deployment

- Repository: dakshhadvani19/prep_master_
- Default branch: main
- App root: global-exam-prep
- Vercel project: prepmaster-tau.vercel.app
- Git policy: work lands directly on main; do not create or merge PRs unless explicitly requested.

## 2. Current architecture

React 19 + Vite, React Router, Framer Motion, Lucide, CSS design system, Supabase JS, and browser-local/static adapters for features whose persistent database design is still pending.

### Authentication

Supabase Auth is the only authentication provider: email/password, Google OAuth with PKCE, custom server-generated OTP signup gate, public.students, public.admins, and RLS-backed authorization.

## 3. Legacy backend removal

The previous secondary backend integration has been removed from the application.

Removed:
- SDK dependency
- initialization module
- database rules/configuration
- dedicated build chunk
- environment variables
- CSP endpoints
- test mocks
- remote exam-history reads/writes
- remote syllabus/storage reads/writes

Replacement behavior:

| Previous capability | Current temporary behavior |
|---|---|
| Exam history | Browser-local examHistoryStorage.js |
| Exam review | Reads the same browser-local history |
| Syllabus upload | Extract PDF text and keep metadata/text in browser storage |
| Syllabus PDF URL | Current-session object URL only |
| Numeric helper counters | Browser-local counters |
| Authentication | Supabase Auth |

These replacements are intentionally fast and do not add fake network delays.

## 4. Supabase database

Verified live project: prepmaster, ref llqwtgwjlwgrftihtern, region ap-south-1, ACTIVE_HEALTHY.

### Courses

public.Courses: CourseId BIGINT identity PK, CourseName, Sems INTEGER[], **40 live rows** at the 2026-10-13 snapshot, RLS enabled.

### Subjects

public.Subjects: SubjectId BIGINT PK, SubjectName, CourseId FK, Semester INTEGER NOT NULL, **1,938 live rows** at the 2026-10-13 snapshot; integrity checks found no null semesters, blank subject names, or orphan CourseIds. RLS is enabled.

There is deliberately **no Departments table**.

## 5. Student catalog contract

Departments are frontend-static in src/data/catalogDomains.js. Do not move them to Supabase.

Runtime source:
- Departments -> catalogDomains.js
- Courses -> Supabase Courses
- Course semester options -> Courses.Sems
- Subjects -> Supabase Subjects
- Subject semester -> Subjects.Semester

Compatibility files:
- src/data/courseMapping.json -> department-to-course scoping and source CourseId compatibility
- src/data/subjectIdBridge.json -> numeric SubjectId to legacy/source compatibility
- src/data/subjectSemesterMap.json -> legacy ExamPortal compatibility only

Do not infer semesters from SubjectId digits.

## 6. Catalog runtime flow

1. Homepage renders six static departments.
2. /domains/:domainId/courses queries only scoped Supabase Courses.
3. /courses/:courseId/subjects queries the selected Course and its Subjects.
4. Semester filters use Courses.Sems.
5. Subject semester values use Subjects.Semester.
6. Small in-memory caches/inflight deduplication may reduce repeated reads, but never replace Supabase as the source of truth.

The homepage does not fetch the full catalog.

## 7. Main routes

- /, /signup, /login, /register
- /domains/:domainId/courses
- /search, /feedback, /guide
- /courses/:courseId/subjects
- /exams/:subjectId/:examType/:difficulty
- /dashboard, /review/:historyId
- /admin/courses, /admin/syllabus
- /leaderboards

## 8. Exam system

The exam UI and question-generation stack remain protected. Exam generation can use static syllabus/question data, uploaded PDF text, and configured AI generation.

Exam submission writes a compact result to browser-local history and navigates immediately. This is temporary persistence, not a completed server-side attempts system.

## 9. Admin status

- /admin/courses remains an in-memory preview; persistent catalog CRUD is not complete.
- /admin/syllabus extracts PDF text but currently stores it locally.
- Leaderboard UI exists; persistent attempt/ranking storage is pending.
- Feedback submission/API plumbing exists; complete persistent admin feedback storage is pending.

## 10. Security rules

- Never ship service-role/secret keys to the browser.
- Keep RLS enabled.
- Authorization comes from authenticated identity and database policies.
- Never trust localStorage/sessionStorage for roles.
- Do not bypass blocked database operations by weakening security.
- Do not restore a removed backend just to make a feature persistent.

## 11. Protected areas

Unless the requested task directly requires them, avoid opportunistic rewrites of Supabase auth/OTP, AuthContext, question generation, subject-resolution bridge, exam UI, catalog source-of-truth rules, Vite chunk strategy, and RLS/security configuration.

## 12. Syllabus availability cleanup (2026-10-11)

- Archived 106 exact live B.Tech Subject rows under `global-exam-prep/temp_removed_subjects/` before deletion.
- Archived 88 Law & Arts audit rows before additional exclusions; 74 exact live Subject rows were then deleted, and 14 blank-title rows were already absent. Post-delete verification found zero of the 74 deleted SubjectIds remaining.
- Deleted 106 rows from live Supabase `public.Subjects`; a post-delete query confirmed none of those SubjectIds remained.
- Rejected four Arena-labelled PDFs after internal course codes did not match the intended B.Tech subject.
- The archives contain original SubjectId, course, title, semester, audit class, and reason needed for review/restoration. One B.Tech Bioinformatics target had no safe live-row match, so it was archived without a database deletion.
- Law & Arts network failures remain live: 33 occurrences across 19 titles are listed in `global-exam-prep/temp_removed_subjects/law_arts_network_retry_pending_2026-10-11.csv`; these are explicitly not deletions.
- The Arena summary logged zero HTTP attempts. Thus exclusions mean “no acceptable PDF in that package,” not proof that no public syllabus exists. Restore only after a correctly matched PDF is verified.

## 13. Git/Arena workflow

1. Arena handles large repetitive implementation when useful.
2. User provides changed files/report/bundle.
3. Review the resulting files independently.
4. Validate against project docs and live backend where relevant.
5. Apply only verified changes to main.
6. Verify final main state.
7. Never claim push/deploy/test success without actual verification.

## 14. Current priorities

1. Keep the Supabase-only architecture clean.
2. Complete persistent data features with Supabase when schemas are ready.
3. Keep temporary local/static fallbacks explicit and fast.
4. Finish admin persistence.
5. Finish attempts/history persistence.
6. Finish leaderboard persistence.
7. Finish feedback persistence.
8. Keep project documentation synchronized with actual code.
- The 88 archived Law & Arts IDs were also removed from the legacy `src/data/mockData.js` exam context (74 nonblank subject rows; 14 blank-title rows had no usable display label), preventing fallback resolution outside the numeric bridge. The 33 network-retry occurrences remain in the catalog and mapping files.

## Management Studies recovery cleanup — 2026-10-11

- Archive: `management_studies_removed_subjects_2026-10-11.csv`.
- The recovery run marked 74 unique normalized Management Studies subject titles as `FAILED_NO_MATCHING_OFFICIAL_PDF`, covering 122 course/semester occurrences. The exact 122 live Supabase rows are preserved in the archive with their original `SubjectId`, `SubjectName`, `CourseId`, `CourseName`, and `Semester`.
- The records are temporarily excluded under the user's direction after this recovery run. This status reflects the run result only, not proof that a syllabus does not exist: the report recorded HTTP 429 rate limits and zero candidate-download attempts for some failed titles.
- The same 122 IDs are removed from `src/data/subjectIdBridge.json`, `src/data/subjectSemesterMap.json`, and the legacy subject arrays in `src/data/mockData.js` to prevent stale numeric exam routes from resolving them.
- Restore only after a directly accessible syllabus is validated against the applicable course/program, subject code/title, and semester. Retry sources in priority order: official Marwadi University, GTU, then another credible official university for clearly-labelled comparable references.

## 2026-10-12 — Diploma syllabus-backed catalog sync

- Source target: 245 intended Diploma subject records from the checked-in current Marwadi official-page syllabus manifest.
- Live sync completed against Supabase `public."Subjects"` for CourseIds 44–49. 241 target IDs existed and now match the manifest's CourseId, semester, and subject name. No duplicate-ID inserts were attempted.
- Four target records remain excluded pending evidence: two Applied Chemistry (`09GS3102`) rows whose PDF only specifies Semester I/II, and two rows whose source code/title validation remains flagged for review (`09CE2101` Computer Fundamental Skill for Mechanical and `09CI0616` Advance Design of Structures for Civil).
- Ninety-six superseded/unverified old subject rows were copied to `public.temp_subjects_removed` with source metadata and removal reasons, and to `global-exam-prep/temp_removed_subjects/diploma_removed_subjects_2026-10-12.csv`, before deletion. Post-write verification confirmed 96 archived, 0 archived IDs still live, and 241 live Diploma rows.
- `public.temp_subjects_removed` has RLS enabled and no privileges granted to `anon` or `authenticated`; it is an internal audit/recovery table, not student-facing content.
- `diploma_active_syllabus_catalog_2026-10-12.csv` represents the 241 active rows. The semester coverage report is `Syllabus/Diploma_Full_Collection_1/Marwadi_Official_Diploma_Collector/Marwadi_Diploma_Syllabus_Collection/Reports/diploma_syllabus_coverage_2026-10-12.csv`. The four unresolved targets remain in `diploma_semester_review_pending_2026-10-12.csv`.
- Compatibility maps and the Diploma arrays in `mockData.js` now omit the four unresolved subject IDs and contain the same 241 active numeric Diploma IDs.
- Coverage note: Diploma ICT semester 3 has no subject in the current active manifest with a validated current official syllabus PDF; six former semester-3 IDs are archived because no matching current official PDF was validated in the package. This is a syllabus-evidence gap, not proof that subjects do not exist.


## 15. B.Tech source-PDF → JSON coverage and live catalog cleanup (2026-10-13)

### Source folders and converter

- Source PDF collection: `Syllabus/B.Tech programs/_PDF_Library/`.
- Program catalog: `Syllabus/B.Tech programs/_Catalogs/program_catalog.csv` (20 program entries).
- Program/course/semester/PDF map: `Syllabus/B.Tech programs/_Catalogs/program_course_map.csv` (313 associations).
- PDF inventory: `Syllabus/B.Tech programs/_Catalogs/pdf_library_index.csv`.
- Converter: `Syllabus/build_btech_syllabus_txt.py`.
- Output: `Syllabus/syllabus_txt/B.Tech/`; generated index: `Syllabus/syllabus_txt/B.Tech/index.json`.

The index generated at 2026-10-13 05:30:45 UTC reports 9 program outputs, 11 programs without verified syllabus JSON, 313 program/PDF associations, 303 associations parsed as structured, and 10 where content sections need manual review. The current program map references 157 unique PDF paths. Extraction uses native PDF text via PyMuPDF and does not perform OCR; source text is preserved by page. The parsed syllabus units/topics require manual review when flagged.

### Supabase B.Tech removals

A source-coverage audit found nine course records without a complete verified source-PDF set for full conversion. On 2026-10-13, the matching Course rows and their 554 child Subject rows were removed from live Supabase:

- CourseIds: `3, 6, 11, 12, 13, 14, 15, 16, 17`.
- Post-delete SQL verification: zero of these Course IDs remain in `public.Courses`; zero linked Subject rows remain in `public.Subjects`.
- Recovery file: root-level `removed_course.json`. It includes course ID, department, course name, source-coverage reason and the full SubjectId/title/semester snapshot for recovery.

This is an exclusion due to incomplete validated source coverage, **not proof those subjects or programs do not exist**. ECE Robotics, ECE VLSI, and ECE IoT are included as catalog notes with `id: null` in the archive because no distinct matching Supabase Course row existed for them; they were not database deletions.

### Live catalog snapshot after cleanup

Checked directly in Supabase on 2026-10-13 at 06:22 UTC:

- `public.Courses`: 40 rows.
- `public.Subjects`: 1,938 rows.
- Remaining B.Tech CourseIds: `1, 2, 4, 5, 7, 8, 9, 10`, with 424 linked Subjects total.
- Active Diploma Subjects for CourseIds 44–49: 241.
- Diploma recovery rows in `public.temp_subjects_removed`: 96.
- Integrity checks: zero null semesters, blank subject names, or orphan CourseIds.
- RLS is enabled on all inspected public tables; the Diploma archive is not readable by `anon` or `authenticated`.

The PDF-to-JSON index and the live Supabase catalog are separate sources. Generated JSON output is not proof that a Course row is active, and removing a Course row does not automatically remove historical source mappings or generated files. Restore/reconcile a course only after official course mapping and subject-level source PDFs are validated.

## BCA/MCA catalog update — 2026-10-13

- CourseId 18 is named `BCA`; its semester options are 1–8 and it has 48 current subject rows.
- CourseId 19 is named `MCA`; its semester options are 1–4 and it has 29 current subject rows.
- The 77 subjects match the current Computer Applications `subject_inventory.csv` source list.
- SubjectIds follow `docs/primary_key_rules.md`; no arbitrary IDs or exceptions were used.
- `subjectIdBridge.json` and `subjectSemesterMap.json` were synchronized to the new inventory.
- The inventory's missing PDF URLs mean not every subject has a linked PDF available in this source manifest; inventory inclusion alone does not claim PDF-text verification.

See `docs/PREPMaster_DATABASE_STATUS.md` for details.


## Active task — Diploma exam-bank file structure (2026-10-18)

The immediate task is **GitHub-only**: verify and complete the subject-folder exam JSON layout for Diploma Computer Engineering and Diploma Chemical Engineering, Semesters 1–6. The user explicitly excluded Supabase work for this task. Read [DIPLOMA_EXAM_BANK_HANDOFF.md](DIPLOMA_EXAM_BANK_HANDOFF.md) for the exact target tree, exam rules, existing v2 counts, verified progress, gaps, validation checklist, and a paste-ready prompt for a new ChatGPT conversation.

Current truth: course- and semester-level v2 banks are documented in the repository, and some subject folders exist. The full inventory of the requested `Mid 1.json`, `Mid 2.json`, and conditionally `ESE.json` files across all 12 semesters is **not yet verified**. Do not claim the requested layout is complete until every subject is checked. Do not query/change Supabase or run staged SQL.

## 16. Project deliverable subject removal — 2026-10-30

The active Supabase catalog was audited across all departments/courses and **46 project/dissertation/research-project deliverable subjects were removed** from `public."Subjects"`. Their exact SubjectIds and original course/semester metadata are preserved in `global-exam-prep/temp_removed_subjects/project_deliverable_subjects_removed_2026-10-30.csv`.

- Migration `20261030113013_remove_project_deliverable_subjects_from_catalog` is applied.
- Live verification after the change: 40 courses, 1,913 active subjects, and zero remaining project/dissertation/research-project deliverables under the audited title rules.
- All 46 rows had zero exam attempts, normalized leaderboard results, and published leaderboard snapshots before deletion.
- The same IDs were removed from the ExamPortal bridge, semester map, legacy mock subject hierarchy, and BCA/MCA live context overrides. An automated bridge regression test now covers the 46 archived IDs.
- Academic project-management subjects were retained because they are taught theory/management subjects, not student project submissions.

- A follow-up scan removed **20 additional legacy-only project deliverables** from the inactive/older course hierarchy (not live Supabase rows). Their original titles, course/semester details and IDs are archived in `global-exam-prep/temp_removed_subjects/legacy_project_subjects_removed_2026-10-30.csv`. Their 15 remaining numeric bridge/semester keys were also removed. Current legacy static counts: 2,538 nonblank subjects and 2,452 numeric bridge/semester entries.
- The source syllabus JSON archives were retained; the runtime catalog and numeric exam routes are what were removed.

A separate list of **58 potential non-standard-assessment occurrences** (internship, seminar, colloquium, moot court, attachment, practice school, NCC, and physical education/wellness) is stored at `global-exam-prep/temp_removed_subjects/non_exam_subjects_for_review_2026-10-30.md`. They have **not** been removed. Review the official subject-level assessment schemes before disabling written exams or changing their assessment modes.
