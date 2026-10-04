# PrepMaster — Current Status

_Last updated: 2026-10-04_

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

The previous Firebase integration has been removed from the application.

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

public.Courses: CourseId BIGINT identity PK, CourseName, Sems INTEGER[], 49 rows, RLS enabled, browser SELECT works.

### Subjects

public.Subjects: SubjectId BIGINT PK, SubjectName, CourseId FK, Semester INTEGER NOT NULL, 2788 rows, all rows have a semester, no blank names, no orphan CourseIds, RLS enabled, browser SELECT works.

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

## 12. Git/Arena workflow

1. Arena handles large repetitive implementation when useful.
2. User provides changed files/report/bundle.
3. Review the resulting files independently.
4. Validate against project docs and live backend where relevant.
5. Apply only verified changes to main.
6. Verify final main state.
7. Never claim push/deploy/test success without actual verification.

## 13. Current priorities

1. Keep the Supabase-only architecture clean.
2. Complete persistent data features with Supabase when schemas are ready.
3. Keep temporary local/static fallbacks explicit and fast.
4. Finish admin persistence.
5. Finish attempts/history persistence.
6. Finish leaderboard persistence.
7. Finish feedback persistence.
8. Keep project documentation synchronized with actual code.