# PrepMaster — Current Status

Update this file after **every** Agent Mode task. Keep it short, factual, and code-verified.
Long-term rules and architecture live in `PREPMaster_PROJECT_CONTEXT.md` (same folder).

**Last updated:** 2026-10-03 (student catalog browse + ExamPortal numeric SubjectId bridge; **PR, not merged**)
**Verified by:** `npx vitest run` (276 passed) and `npm run build`.

## Repository state

| Item | Value |
| --- | --- |
| Git root / app dir | `/home/user/prep_master_` / `global-exam-prep/` |
| Branch | working branch for catalog PR (not `main` push) |
| Live DB CourseId check | **not possible in this sandbox** (no Supabase URL/key; no `.env`) |
| Catalog SELECT migration | in repo; **not applied live** |

## What this pass did

Student catalog: Department → Courses → Subjects → Semester → Start Exam.

- Home: `catalogDomains.js`, 0 Courses/Subjects queries.
- Department: `Courses` `.in('CourseId', ids)` for that domain only.
- Course: one `Courses` row + `Subjects` for that CourseId.
- Semester: `subjectSemesterMap.json` only; never guessed.
- Exam: `subjectIdBridge.json` + `subjectResolver.js` maps numeric SubjectId → original mockData source id. ExamPortal generation unchanged aside from that lookup.

## Remaining limitations

- Cannot re-verify CourseId 1–49 against hosted `public."Courses"` from this environment. Mapping is mockData walk order; IDs were not regenerated.
- Public catalog will 401/empty in production until `20261003120000_catalog_public_select.sql` is applied (if SELECT policies are not already present).
- SearchResults still uses `mockData.js` (out of browse scope).

## Verification snapshot

```
vitest: 24 files, 276 tests passed
vite build: run this pass
```