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
- Courses: 49 rows
- Subjects: 2788 rows
- All Subjects rows have non-null Semester
- No blank subject names
- No orphan CourseIds
- RLS enabled
- Browser SELECT works for the catalog

Course semester options come from Courses.Sems.
Subject semester values come from Subjects.Semester.
Do not infer semester from SubjectId digits.

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