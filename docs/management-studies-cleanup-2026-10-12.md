# Management Studies cleanup — 2026-10-12

## Phase 1: audit

The live Supabase `public.Courses` / `public.Subjects` catalog was inspected. Management-related CourseIds 20–30 were compared by subject-row count, distinct title count, and populated semester count.

## Phase 2: decision

Removed only `Master In Global Business Management` (`CourseId=30`, frontend id `master-in-global-business-management`). It had zero subject rows, an empty semester list, and an empty `subjects` array in `mockData.js`; this was an empty placeholder rather than a usable course. The 44-subject MBA Business Analytics course and other populated Management Studies courses were retained.

## Phase 3: cleanup

- Remove the empty course object from `global-exam-prep/src/data/mockData.js`.
- Delete the empty `public.Courses` row only after confirming it has no `public.Subjects` rows.
- Preserve removed metadata in `docs/archives/management_course_removed_2026-10-12.csv`.
- Keep all code changes in a PR targeting `main`; do not push directly to `main`.

No other course is being removed based on low counts alone. A low count can indicate incomplete catalog coverage rather than an inherently empty course.
