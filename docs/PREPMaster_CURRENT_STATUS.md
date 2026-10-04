# PrepMaster — Current Status

Update this file after every Agent Mode task. Keep it short, factual, and code-verified.
Long-term rules and architecture live in PREPMaster_PROJECT_CONTEXT.md (same folder).

Last updated: 2026-10-04 (Firebase removal and Supabase exam-history migration)
Verified: live Supabase catalog has 49 Courses + 2,788 Subjects; catalog SELECT/RLS is applied. Firebase runtime has been removed from the application.

## Repository state

| Item | Value |
| --- | --- |
| Git root / app dir | /home/user/prep_master_ / global-exam-prep/ |
| Branch policy | main only |
| Live DB CourseId check | ✅ verified: CourseId 1–49 map to the canonical 49 courses |
| Live catalog rows | ✅ 49 Courses, ✅ 2,788 Subjects, ✅ 0 blank names, ✅ no orphan CourseIds |
| Live catalog SELECT | ✅ anon + authenticated SELECT on Courses/Subjects with RLS enabled |
| Student catalog runtime source | ✅ Courses + Courses.Sems + Subjects + Subjects.Semester are read from Supabase on catalog navigation |
| Subject semester bridge | ✅ retained only for ExamPortal/legacy numeric-ID resolution; student catalog no longer reads it |
| ExamPortal bridge | ✅ repaired globally: 2,788 final numeric SubjectIds mapped to source ID, source course, numeric CourseId, semester |

## Bridge repair verification

- Current main mockData.js: 2,788 nonblank subjects, 2,788 unique numeric SubjectIds, all with explicit semesters.
- Historical source catalog: commit dd164dec330f006ae37c3b13be2ec1847b49a6fa.
- Reconstruction check: 2,788 / 2,788 IDs reproduced with 0 ID-generation mismatches and 0 subject-order/title mismatches.
- subjectSemesterMap.json and subjectIdBridge.json both contain exactly 2,788 keys with the same key set and 0 semester conflicts.
- CourseId distribution is preserved across all populated CourseIds; CourseId 1 has 61 subjects.
- Current ID 1001131010601 maps to Calculus / 01ma0106 / CourseId 1 / semester 1.
- Current ID 1016132000101 maps to Reading and Writing for Technology / PM20001 / CourseId 1 / semester 2.
- Stale digit-stripped ID 1000001010601 is absent.
- The live `Subjects.Semester` column is populated for all 2,788 subjects and is now the student catalog's semester source.
- No student catalog page uses `subjectSemesterMap.json` for runtime semester grouping.

## Verification snapshot

Arena reported:
- npx vitest run → 24 test files / 282 tests passed
- npm run build → success
- npm run lint → exit 1, 52 existing problems (48 errors, 4 warnings); unrelated lint was not mass-fixed.

This environment independently validated the 2,788-row reconstruction against current main and historical dd164dec, but did not execute the full Vite/Vitest workspace.

## 16. New-reader project map

This is the fastest way for a new developer or agent to understand the system:

Student browser
  → React/Vite SPA
  → Supabase Auth for identity
  → frontend-static department definitions
  → Supabase Courses
  → Supabase Courses.Sems
  → Supabase Subjects
  → Supabase Subjects.Semester
  → existing ExamPortal / legacy generation stack
  → Firebase-backed legacy history/syllabus paths where those have not yet been migrated

Source-of-truth rule:
  * Displayed catalog Courses, Semesters, and Subjects are runtime database data.
  * Departments are the explicit exception and are frontend configuration.
  * Local bridge JSON is compatibility metadata, not the student catalog source of truth.

## 17. Data ownership map

| Concern | System | Current source of truth | Status |
|---|---|---|---|
| Departments | React static data | `src/data/catalogDomains.js` | ✅ intentional |
| Courses | Supabase Postgres | `public.Courses` | ✅ live |
| Course semester options | Supabase Postgres | `public.Courses.Sems` | ✅ live |
| Subjects | Supabase Postgres | `public.Subjects` | ✅ live |
| Subject semester | Supabase Postgres | `public.Subjects.Semester` | ✅ live |
| Subject/legacy compatibility | Frontend JSON | `subjectIdBridge.json` + `subjectSemesterMap.json` | ✅ compatibility only |
| Authentication | Supabase Auth | `auth.users` + session | ✅ live |
| Admin authorization | Supabase | `public.admins` + authorization lookup | ✅ implemented |
| Exam generation | Hybrid | local syllabus/question data + AI API + local/static syllabus fallback | ⚠️ hybrid |
| Exam history | Supabase | `public.exam_history` with `auth_uid` ownership RLS | ✅ migrated |
| Syllabus storage | Local/static fallback | Browser localStorage; no artificial fetch delay | ⚠️ temporary until Supabase Storage contract is added |
| Leaderboards | React mock UI | in-memory mock data | 📝 persistence pending |
| Admin catalog CRUD | React mock UI | in-memory admin catalog | 📝 persistence pending |
| Feedback management | API/email + legacy paths | no finished persistent admin store | 📝 pending |

## 18. Latest implementation history

The catalog work was completed in this sequence:
1. Courses were moved to runtime Supabase reads.
2. Subjects were moved to runtime Supabase reads.
3. The final numeric SubjectId bridge was repaired after the earlier stale-ID mismatch.
4. The live Subjects table gained/populated `Semester`.
5. The student UI was changed to use `Courses.Sems` and `Subjects.Semester` directly.
6. Tests were updated so a future regression back to the frontend semester map is visible.

Latest code commits on main for this task:
`167cfa89d83fcf346e4ff9dc32a4cc7d4368e447` — read semester data from Supabase
`96138350d1a811aca680e2cd4cc10d6640b43221` — render semesters from Supabase Course.Sems
`d7dcadf6aa740ac3169a9dd429c36569cd0f12e0` — remove leftover semester-map state
`e2b32f0dd90475dae2994bbbafe6b946326dc5a9` — latest catalog test alignment

## 19. How future work is handled

Normal workflow for this project:
1. Inspect current main and the two project docs.
2. Check the SRS diagrams when the feature is covered by requirements.
3. Define the smallest allowed change.
4. Give the implementation task to Arena when long-context/code-volume work benefits from it.
5. Receive Arena report plus every changed file.
6. Independently review the returned implementation against the actual current main code and the database when relevant.
7. Push only validated changes directly to main.
8. Update these docs with the true result.

Never assume an Arena statement such as tests passed, build passed, or deployment succeeded without verification.

## 20. Important do-not-do rules

- Do not create a Supabase `Departments` table.
- Do not move catalog semester grouping back to `subjectSemesterMap.json`.
- Do not use `mockData.js` as the runtime source for the displayed student catalog.
- Do not put Supabase service-role or secret keys into browser code.
- Do not disable RLS to make the catalog work.
- Do not redesign the final numeric SubjectId scheme without explicit authorization.
- ExamPortal now uses Supabase for exam-history persistence; do not reintroduce a second backend identity layer.
- Do not claim a deployment is successful while its CI/Vercel status is pending.

## 21. Reading order for a new agent

1. `docs/PREPMaster_PROJECT_CONTEXT.md` — durable architecture, security, requirements, protected areas, and historical decisions.
2. `docs/PREPMaster_CURRENT_STATUS.md` — this live implementation snapshot.
3. `global-exam-prep/AUTH.md` — detailed authentication and Supabase security contract.
4. `SRS/` — requirements and diagrams; use the latest diagrams for feature behavior.
5. Relevant source files — code is the final implementation truth.

