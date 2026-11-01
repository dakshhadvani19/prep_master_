# Admin Courses — Phase 1 Progress

Date: 2026-11-01

## Completed

- Replaced the old seeded in-memory AdminCourses preview with a read-only catalog locator.
- Built the four-step Department -> Course -> Semester -> Subject hierarchy.
- Uses live catalog helpers; no new database table, schema change, or CRUD endpoint was introduced.
- No leaderboard lock/unlock restrictions are used in this admin flow.
- Added course search and subject name/SubjectId search.
- Uses the course's real semester list and the subject's exact Semester value, including semester 0.
- Shows canonical IDs, departmental status, and exam-type availability from subjectExamPolicy.
- Added loading, error/retry and empty states, responsive layouts, and keyboard focus styles.
- Added global-exam-prep/tests/admin-courses.test.jsx coverage for all six departments, course lookup/search, semester filtering including semester zero, subject search/details, question-bank mapping honesty, retry, and absence of fake CRUD.

## Verified

- npx vitest run tests/admin-courses.test.jsx — 7 passed.
- npx eslint src/pages/AdminCourses.jsx tests/admin-courses.test.jsx — passed after moving loading transitions to selection/retry actions and keeping effects asynchronous.
- npm run build — passed in 5.80 seconds.
- Existing Vite circular vendor chunk and large chunk-size warnings remain.

## Known dependency for Phase 3

public.TestsData currently stores only TestId, Questions, Options, and Answers. The rows cannot be safely assigned to a selected subject from this schema. Do not display invented per-subject question counts. Phase 3 must introduce a canonical question-bank metadata/index contract and populate it through validated ingestion.

## Not done yet

- Phase 2: private PDF/DOCX/CSV intake, file validation, upload progress/job state, and syllabus replacement preview/confirmation.
- Phase 3: text extraction, question boundary detection, MCQ normalization, answer/rubric parsing, admin QA, 30-question batching and canonical database ingestion.
- Subject add/edit/remove and syllabus mutation are not implemented in Phase 1.
