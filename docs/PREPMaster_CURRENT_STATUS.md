# PrepMaster — Current Status

Update this file after **every** Agent Mode task. Keep it short, factual, and code-verified.
Long-term rules and architecture live in `PREPMaster_PROJECT_CONTEXT.md` (same folder).

**Last updated:** 2026-10-03 (post-merge catalog audit: frontend subject bridges are stale against final DB SubjectIds)
**Verified:** live Supabase catalog has 49 Courses + 2,788 Subjects; RLS/Data API SELECT for catalog is applied and anon can read both tables.

## Repository state

| Item | Value |
| --- | --- |
| Git root / app dir | `/home/user/prep_master_` / `global-exam-prep/` |
| Branch policy | **main only** (feature branch was merged/deleted) |
| Live DB CourseId check | ✅ verified: CourseId 1–49 map to the canonical 49 courses |
| Live catalog rows | ✅ 49 Courses, ✅ 2,788 Subjects, ✅ 0 blank names, ✅ no orphan CourseIds |
| Live catalog SELECT | ✅ applied: `anon` + `authenticated` SELECT on Courses/Subjects with RLS enabled |
| Current subject bridge state | ⚠️ **stale**: `subjectSemesterMap.json` and `subjectIdBridge.json` contain the pre-final numeric SubjectIds |

## What the catalog audit found

The final numeric SubjectIds in `mockData.js` were rebuilt before the database seed. The live `public."Subjects"` table uses those final IDs. The checked-in semester/ExamPortal bridge artifacts were generated against the older IDs.

- Canonical source: current `global-exam-prep/src/data/mockData.js` (commit `a7732c4b66904fe86f260903eeb8a7ba159437d5`).
- Canonical source contains **2,788 nonblank subject occurrences with 2,788 unique numeric SubjectIds** and explicit semesters; no semester conflicts were found.
- Current `subjectSemesterMap.json`: **2,788 entries, but 2,788 are stale relative to the canonical final IDs**.
- Current `subjectIdBridge.json`: **2,788 entries, but 2,788 are stale relative to the canonical final IDs**.
- Example: live/current DB ID `1001131010601` = `Calculus`, semester 1; the checked-in map does not contain that final ID.
- The first visible warning of 61 subjects was simply the entire CourseId 1 offering; other courses have the same stale-artifact problem.

## Required next catalog task

Regenerate **both** frontend artifacts globally from the current canonical `mockData.js`:

1. `src/data/subjectSemesterMap.json`: final numeric SubjectId → explicit semester.
2. `src/data/subjectIdBridge.json`: final numeric SubjectId → sourceSubjectId, source CourseId, numeric CourseId, and semester.

Do **not** redesign the numeric SubjectId scheme and do **not** guess semesters from ID digits. Do not reseed or alter the live Subjects table unless an independent validation proves the DB is wrong.

Acceptance checks for the next task:
- 2,788/2,788 live SubjectIds are present in the semester map.
- 2,788/2,788 live SubjectIds are present in the ExamPortal bridge.
- 0 stale/extra bridge keys relative to the canonical final SubjectIds.
- 0 missing semesters and 0 semester conflicts.
- CourseId 1–49 mapping remains unchanged.
- Existing exam-generation algorithms remain unchanged apart from resolving the corrected bridge entries.
- `npx vitest run`, `npm run build`, and `npm run lint` are run and reported accurately.

## Verification snapshot

```
vitest: 24 files, 276 tests passed
vite build: run this pass
```