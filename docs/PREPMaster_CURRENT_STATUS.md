# PrepMaster — Current Status

Update this file after every Agent Mode task. Keep it short, factual, and code-verified.
Long-term rules and architecture live in PREPMaster_PROJECT_CONTEXT.md (same folder).

Last updated: 2026-10-03 (global final numeric SubjectId semester/ExamPortal bridge repair)
Verified: live Supabase catalog has 49 Courses + 2,788 Subjects; catalog SELECT/RLS is applied.

## Repository state

| Item | Value |
| --- | --- |
| Git root / app dir | /home/user/prep_master_ / global-exam-prep/ |
| Branch policy | main only |
| Live DB CourseId check | ✅ verified: CourseId 1–49 map to the canonical 49 courses |
| Live catalog rows | ✅ 49 Courses, ✅ 2,788 Subjects, ✅ 0 blank names, ✅ no orphan CourseIds |
| Live catalog SELECT | ✅ anon + authenticated SELECT on Courses/Subjects with RLS enabled |
| Subject semester bridge | ✅ repaired globally: 2,788 final numeric SubjectIds mapped |
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
- The live Subjects table was not reseeded or modified for this frontend-only repair.

## Verification snapshot

Arena reported:
- npx vitest run → 24 test files / 282 tests passed
- npm run build → success
- npm run lint → exit 1, 52 existing problems (48 errors, 4 warnings); unrelated lint was not mass-fixed.

This environment independently validated the 2,788-row reconstruction against current main and historical dd164dec, but did not execute the full Vite/Vitest workspace.
