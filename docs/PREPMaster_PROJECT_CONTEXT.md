# PrepMaster — Project Context (long-term source of truth)

**Repository:** `/home/user/prep_master_` (git root) · application in `global-exam-prep/`
**Audience:** future Agent Mode sessions. This file is durable project knowledge.
`PREPMaster_CURRENT_STATUS.md` is the short, frequently-updated state file.
`PREPMaster_DATABASE_STATUS.md` is the dedicated database reference.

**Never put secrets in these files:** no passwords, API keys, service-role/`sb_secret_…` keys,
Gmail app passwords, OAuth client secrets, `OTP_PEPPER`, tokens or private credentials.
Environment-variable names are allowed; values never are.

---

## MANDATORY CONTEXT RULE — applies to EVERY future Agent Mode task

**BEFORE implementing anything:**
1. Read `docs/PREPMaster_PROJECT_CONTEXT.md`.
2. Read `docs/PREPMaster_CURRENT_STATUS.md`.
3. Read `docs/PREPMaster_DATABASE_STATUS.md` for any database-related task.
4. Treat these as project memory, then verify the relevant parts against the actual repository/code.
5. Restate internally what the current task is allowed to modify.

**AFTER completing the task:**
6. Review whether the change touched architecture, security rules, routes, database assumptions,
   authentication behaviour, UI rules, protected areas, or planned functionality.
7. Always update `PREPMaster_CURRENT_STATUS.md` to the true post-task repository state.
8. Update this file only when a permanent rule, architecture fact, or decision changed.
9. Update `PREPMaster_DATABASE_STATUS.md` whenever database design, schema, migration state,
   relationships, or database-related decisions change.
10. Report files changed + results, and distinguish pre-existing problems from newly introduced ones.

These files are documentation and constraints. They are never permission to implement anything.
Do not replace verified facts with guesses. When the current repository contradicts these documents,
verify the actual repository and record the change.

**Status legend:**
✅ implemented and verified in this repo
⚠️ partial / hybrid or verified with a documented limitation
🟡 owner-confirmed but not independently live-verified from this environment
📝 planned / not implemented
❓ cannot be verified from the available sources

---

## 1. Project Overview

PrepMaster is a university exam-preparation web app (React + Vite SPA) for diploma/degree
students. It provides course and subject browsing, exam preparation, dynamic question generation,
test execution, analysis, leaderboards, feedback, and an administrative control area.

- App code: `global-exam-prep/`
- Requirements/diagrams: `SRS/` is the primary requirements reference.
- Current authoritative SRS assets include:
  - `SRS_last_updated_print.pdf`
  - `UseCase_Diagram_last_updated_3_9.jpg`
  - `adminflowchart.jpg`
  - `updated_student_flow.jpg`
  - `sequenceadmin.jpg`
  - `sequencestudent.jpg`
  - `DFD0_last_updated_3_9.jpg`
  - `DFD1_last_updated_3_9.jpg`
  - `DFD2_last_updated_3_9.jpg`
  - `ER_Diagram_last_updated_3_9.jpg`
- Student/admin activity diagrams and the class diagram are inside the current SRS PDF
  (Figures 3.1, 3.2, and 7.1).
- Older `*_25_8.jpg`, `finaladmin_*`, `finalclass_*`, and `studentfinal_*` diagram files were
  removed and must not be treated as current references.
- `progress.txt` states that future feature implementation must reference diagrams in the SRS
  folder.
- Prefer the latest SRS/diagram over older notes when there is a difference, and record material
  changes in this file and `CURRENT_STATUS.md`.

Owner/reference notes:
- `progress.txt`
- `progressByAi.txt`
- `global-exam-prep/AUTH.md`
- `global-exam-prep/context/CODEBASE_DEEP_EXPLANATION.txt`

---

## 2. Technology Stack

Frontend:
- React 19.x
- Vite
- React Router
- Framer Motion
- Lucide
- CSS design tokens

Data and identity:
- Supabase Auth
- Supabase PostgreSQL
- Firebase Firestore / Storage for legacy/live data paths
- RLS

Server:
- Vercel serverless/edge API routes
- Nodemailer/Gmail SMTP
- Groq AI proxy through `/api/ai`

Important hybrid rule:
- Supabase Auth is the only authentication provider.
- Firebase remains for existing Firestore/Storage application paths until the Supabase↔Firebase
  bridge problem is resolved.
- Do not remove Firebase merely because Supabase now owns authentication.

Testing:
- Vitest
- Testing Library
- jsdom
- PGlite for real-Postgres-style SQL tests
- ESLint

Do not casually change bundle/chunk strategy, dependency versions, environment-variable names, or
legacy data tooling.

---

## 3. Application Architecture

Main flow:

`src/main.jsx`
→ `src/App.jsx`
→ `BrowserRouter`
→ `AuthProvider`
→ `Layout`
→ protected/public routes
→ lazily loaded pages

Important ownership:
- `AuthContext` owns identity/authorization state.
- `src/utils/supabaseAuth.js` owns Supabase Auth and authorization helpers.
- `ProtectedRoute` enforces route authorization.
- `Layout` renders role-aware navigation.

Important static/data files:
- `src/data/mockData.js`
- `src/data/universitySyllabus.js`
- `src/data/pdfSyllabus.js`
- `src/data/predicted_ai_syllabus.json`
- `src/data/questionGenerator.js`

Repository root/application root also contain one-off data parsing/generation scripts and source PDFs.
Those are offline tooling and should not be deleted just because they are not part of the build.

---

## 4. Authentication Architecture

Current identity path:

Unauthenticated
→ Login/Signup
→ Supabase Auth
  - email/password
  - Google OAuth redirect + PKCE
→ authenticated session
→ `auth.uid()`
→ `AuthContext.loadIdentity()`
  - authorization from `public.admins`
  - student profile from `public.students` for students
→ role:
  - no admin row = student
  - admin row = standard admin
  - admin row + `is_super_admin` = super admin

Non-negotiable rules:
- Never use localStorage/sessionStorage/user metadata/JWT claims as the authorization source.
- `public.students.role` is not authoritative for admin authorization.
- `public.admins` is authoritative for staff authorization.
- Passwords live in Supabase Auth, not application profile tables.
- No second admin login.
- No frontend-only admin checks.
- No automatic admin-row provisioning on Google login.
- Password recovery uses Supabase Auth.
- Google uses redirect + PKCE with one exchange owner.
- Auth errors fail closed.

---

## 5. Student Signup / Authentication

Signup is two-step:
1. `/api/send-otp` issues a six-digit code.
2. OTP is stored as a keyed digest in `public.auth_otp`.
3. `/api/verify-otp` verifies and consumes it.
4. Only after successful OTP verification does the client call `supabase.auth.signUp`.

Rules:
- Supabase email confirmation must remain OFF for the current OTP flow.
- Password never reaches OTP endpoints.
- OTP is server-generated.
- HMAC-SHA256 is used for stored OTP digests.
- TTL, resend cooldown, and attempt limits are enforced.
- `handle_new_user()` is the database trigger that creates the student profile.
- Client does not directly insert student profiles.
- Student can update only allowed profile fields, currently display name.

The password UI is intentionally a checklist with tick marks. Do not restore the removed strength ring.

---

## 6. Admin Authorization

Authorization is based on the caller's verified Supabase identity.

`resolveAuthorization(client, authUid)`:
- first calls `admin_role_for_uid`
- uses a self-read fallback only when the RPC itself is absent
- rejects an admin row whose `auth_uid` does not match the caller
- returns one of the role states described above

Super-admin rules:
- Standard Admin: all ordinary admin functionality.
- Super Admin: all Standard Admin functionality plus:
  1. Add Admin
  2. Remove Admin
  3. Add Super Admin

Therefore the following are ordinary admin functionality and are NOT super-admin-only:
- course management
- subject management
- question/TestData management
- feedback moderation
- user spam flagging
- leaderboard monitoring

No client direct write to `public.admins` is allowed.
Staff-management writes use the server/database-controlled `manage_admin_staff` path.

---

## 7. Supabase Architecture

Client:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Server:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Security rule:
- service-role/secret keys must never be exposed through `VITE_*`.
- `src/supabase.js` rejects service-role JWT/secret forms.

Existing repository migrations:
- `supabase/migrations/20260905120000_auth_otp.sql`
- `supabase/migrations/20260925150000_admin_role_lookup.sql`
- `supabase/migrations/20260926180000_manage_admin_staff.sql`

Important:
- Repository migrations are not automatically applied to the live Supabase project.
- Live database state must be verified by the operator or by an explicit SQL result.
- Do not claim that a live table/function exists solely because a migration exists in git.

Every new migration should:
- use a timestamp-prefixed filename
- be wrapped in `begin; ... commit;`
- end with `notify pgrst, 'reload schema';`
- include appropriate grants/revokes
- preserve RLS and least privilege
- not casually modify already-applied production migrations

---

## 8. Database Rules and Current Schema Decisions

The detailed current database reference is:
`docs/PREPMaster_DATABASE_STATUS.md`

Permanent database rules:
- SRS/ER is the structural authority.
- Exact SRS field names should be used when implemented in PostgreSQL.
- Quoted identifiers are required where capitalization must match the SRS.
- `Long 64` maps to PostgreSQL `BIGINT`.
- `String N` maps to `VARCHAR(N)`.
- `Boolean` maps to `BOOLEAN`.
- `Array` must be translated into an appropriate PostgreSQL array/JSON structure only after its intended semantics are understood.
- Do not add columns absent from the SRS without an explicit decision.
- Remaining SRS tables are intentionally deferred until their functionality needs them.

---

## 9. Current Database Decisions

### "Courses"

SRS:
- `CourseId` Long 64, Primary Key
- `Sems` Array 12, Not Null
- `CourseName` String 100, Not Null

PostgreSQL design:
- `"CourseId"` BIGINT generated identity primary key
- `"Sems"` INTEGER[] NOT NULL
- `"CourseName"` VARCHAR(100) NOT NULL
- maximum 12 semester entries enforced

Owner has confirmed that the Courses table was successfully created in the live Supabase project using
the approved SQL.

### "Subjects"

SRS:
- `SubjectId` Long 64, Primary Key
- `SubjectName` String 100, Not Null
- `CourseId` String 64, Foreign Key

The SRS `CourseId` type is a documentation mistake.
Because it references `Courses.CourseId`, the intended type is:
- `"CourseId"` BIGINT

Relationship:
`"Subjects"."CourseId"` → `"Courses"."CourseId"`

Subjects are independent database records.
The application may later combine Course + Semester + Subject + Questions into one UI structure,
but Subjects remain independent rows.

No Semester/SemesterId column is to be invented for Subjects.

### "Feedbacks"

SRS:
- `FeedbackId` Long 64
- `Description` String 1000
- `Type` String 30
- `isSpam` Boolean
- `isBookmark` Boolean
- `isSeen` Boolean
- `StudentId` Long 64

Exact database identifiers:
- `"Feedbacks"`
- `"FeedbackId"`
- `"Description"`
- `"Type"`
- `"isSpam"`
- `"isBookmark"`
- `"isSeen"`
- `"StudentId"`

Relationship:
`"Feedbacks"."StudentId"` → `"Students"."StudentId"`

Behavior:
- defaults for `isSpam`, `isBookmark`, `isSeen` are false
- each can move false → true
- none can move true → false
- `Feedbacks.isSpam` means the feedback is spam
- `Students.is_spam` means the student account is spam
- these are separate states

### "Leaderboards"

SRS:
- `LeaderboardId` Long 64, Primary Key
- `StudentId` Array 100, Foreign Key
- `Points` Array 100
- `SubjectId` Long 64, Foreign Key
- `TotalTests` Array 100, Not Null

Owner-confirmed interpretation:
- one row = one leaderboard
- one leaderboard can contain many students
- `StudentId` is an array
- `Points` is an array
- `TotalTests` is an array
- arrays correspond positionally
- `SubjectId` is one BIGINT FK to Subjects
- `LeaderboardId` is a randomized-looking 64-bit BIGINT
- not UUID
- not simple 1,2,3 numbering

The SRS wording marks `Points` as an Array + Foreign Key, which is not directly representable
as a normal PostgreSQL array foreign key.
Do not fabricate an invalid FK.
Any future relationship between leaderboard points and TestRooms must be evaluated when TestRooms is
actually designed and may be added later using `ALTER TABLE`.

---

## 10. Firebase Hybrid Architecture

Firebase remains for:
- exam history
- syllabus file/document paths
- existing syllabus storage
- existing Firestore reads/writes

Current limitation:
- Supabase owns browser authentication.
- Existing Firestore rules expect Firebase identity.
- Until the Supabase↔Firebase bridge is designed, some Firestore paths return permission-denied
  or empty/fail behavior.

Do not weaken Firebase rules merely to bypass this limitation.

---

## 11. API / Server Rules

Important routes include:
- `/api/send-otp`
- `/api/verify-otp`
- `/api/feedback`
- `/api/ai`

`/api/feedback` historically emails feedback to the owner and is not itself a durable feedback
database.

Do not describe the email pipeline as a feedback store.

---

## 12. Routing / Navigation Rules

Important routes:
- `/`
- `/signup`
- `/login`
- `/register`
- `/domains/:domainId/courses`
- `/courses/:courseId/subjects`
- `/exams/:subjectId/:examType/:difficulty`
- `/dashboard`
- `/review/:historyId`
- `/admin/syllabus`
- `/admin/courses`
- `/leaderboards`
- `/search`
- `/feedback`
- `/guide`

Admin access must be protected by route-level authorization.
Hiding a button is not an authorization boundary.

---

## 13. Student UI Rules

Students must not see admin affordances.

Existing exam flow:
- subject/course selection
- exam selection
- test execution
- results/review

Static catalog data still exists and should not be casually replaced until the database-backed
catalog transition is deliberately implemented.

---

## 14. Admin UI Rules

Current admin UI work:
- role-aware dashboard
- courses/subjects/questions mock catalog
- leaderboard mock UI
- feedback visualization/mocks
- staff management through the database RPC path

Mock-UI-first is an explicit development strategy:
- build the flow
- verify interaction
- then wire persistence

Never present mock/in-memory behavior as real persistence.

---

## 15. Courses / Subjects / Questions

The SRS requires content management over:
- Courses
- Subjects
- TestsData/questions

The current Phase 3 mock UI is:
`/admin/courses`
with:
`Course → Semester → Subject → Question`

Semesters are selection-only in the current UI.
No Semester CRUD is required.

The current mock UI is not the database source of truth.
The new database-backed catalog will be populated later from audited static datasets.

---

## 16. Leaderboard Requirements

The SRS requires:
- global rankings
- peer/friend ranking support
- subject-level performance
- real-time/updated leaderboard exposure to students and admins

Current Phase 4 UI is mock/in-memory.

The eventual database interpretation is documented in `PREPMaster_DATABASE_STATUS.md`:
one row per leaderboard, with arrays for students, points and total tests.

---

## 17. Feedback Management Requirements

The SRS requires:
- student feedback submission
- admin read
- mark feedback as spam
- bookmark
- mark as seen
- student spam moderation as a separate capability

Current student feedback form historically posts to `/api/feedback` email flow.
The database-backed Feedbacks table is now part of the database design.

No new Feedbacks columns such as rating, subject, admin_id, timestamps, or seen_by may be added
unless explicitly approved.

---

## 18. UI Design System

Existing structural language:
- dark neutral surfaces
- light purple/violet primary interaction language
- restrained gold/amber emphasis
- existing design tokens in `src/index.css` and `src/pages/Auth.css`

Future admin UI must extend the established visual language rather than importing unrelated templates.

Motion:
- Framer Motion is used for transitions and feedback.
- UI actions may use professional completion animations.
- Destructive actions should remain restrained and clear.

---

## 19. Security Rules

Permanent:
1. Credentials live only in Supabase Auth.
2. No password column on `public.students` or `public.admins`.
3. No secret/service-role key in frontend environment variables.
4. Never trust client storage or metadata for authorization.
5. Use RLS and least-privilege grants.
6. `public.auth_otp` is server-controlled.
7. Authorization failures fail closed.
8. Avoid existence oracles and raw backend error leakage.
9. Never invent deployment/verification state.
10. Do not weaken security controls simply to make a UI function.

---

## 20. Protected Areas

Do not modify unless explicitly authorized:
- existing student authentication
- Signup visuals
- OTP system
- Firebase syllabus/exam paths
- existing exam history implementation
- unrelated pages/components
- environment variable names
- existing migrations that are already considered authoritative
- SRS diagrams/PDFs
- legacy offline data-generation scripts
- dependencies without explicit reason

No opportunistic cleanup, dependency removal, or modernization.

---

## 21. Existing Functionality That Must Not Break

Keep working:
- login/signup
- Google redirect + PKCE
- OTP signup
- password reset
- session restore
- role resolution
- student profile operations
- dashboard
- syllabus UI
- exam pages
- AI question generation
- search
- user guide
- protected admin routes
- existing mock catalog and leaderboard behavior unless the current task explicitly replaces them

---

## 22. Development / Testing Rules

Work from `global-exam-prep/`.

Standard gates:
- `npm run build`
- `npx vitest run` (or project test command)
- `npm run lint` when source changes

Fix problems introduced by the current task.
Do not casually fix unrelated baseline issues.

Database SQL tests should use the existing PGlite testing style where appropriate.

Never claim a check ran if it did not run.

Never commit or push unless explicitly requested.

---

## 23. Migration / Database Rules

- Never casually drop/recreate production tables.
- Never edit an already-applied migration in place.
- Add a new timestamped migration for later changes.
- Preserve RLS and explicit grants/revokes.
- New public-schema tables should include appropriate Data API grants/revokes.
- Security-definer functions must pin `search_path`.
- Database invariants should be enforced in the database when practical.
- Verify SQL in the actual project before claiming live state.

For the current database phase:
- Courses table has been owner-confirmed as created.
- Subjects/Feedbacks/Leaderboards designs are finalized.
- Remaining tables are intentionally deferred.
- The next major task is auditing existing static data before importing large volumes into Supabase.

---

## 24. Deployment Rules

Vercel project root:
`global-exam-prep/`

Production environment variable names include:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_FIREBASE_*`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OTP_PEPPER`
- `GMAIL_USER`
- `GMAIL_APP_PASSWORD`
- `GROQ_API_KEY` / existing supported Groq name

Never rename environment variables without explicit authorization.

---

## 25. Important Permanent Decisions

- Supabase Auth replaced Firebase Auth for identity.
- Firebase remains only for legacy/application data paths not yet migrated.
- `public.admins` is the staff authorization source.
- `public.students.role` is not the authorization source.
- Google authentication is a first-class admin/student authentication path.
- Admin standard vs super-admin capability split is fixed as documented above.
- Class-diagram function names are conceptual references, not code requirements.
- ER diagrams define structural relationships.
- Flowcharts may summarize multiple operations under labels such as “Edit Subject” or “Edit Course”.
- SRS CRUD requirements are authoritative when explicitly stated.
- Exact SRS field names should be preserved when implementing matching database entities.
- Courses, Subjects, Feedbacks and Leaderboards now have finalized database designs.
- Remaining SRS tables are intentionally deferred until related functionality requires them.
- Static-data import must be audited and deduplicated before large Supabase inserts.

---

## 26. Current Planned Work

1. Finish/verify database foundation for the already-decided catalog/feedback/leaderboard entities.
2. Audit static course/subject/syllabus/question datasets.
3. Determine canonical source files versus generated/intermediate files.
4. Deduplicate course and subject data.
5. Map audited data to:
   - `"Courses"`
   - `"Subjects"`
   - future `"TestsData"`
6. Estimate database/storage impact before importing large datasets.
7. Keep unnecessary duplicated static data outside Supabase where appropriate.
8. Create remaining database tables only when their functionality is implemented.
9. Wire real admin catalog persistence.
10. Wire real leaderboard persistence after TestAttempts/TestRooms dependencies are defined.
11. Wire real feedback persistence and moderation.
12. Continue final integration/QA.

---

## 27. Known Constraints

- Live Supabase schema for the older `public.students` / `public.admins` setup cannot be independently
  inspected from this environment.
- Some current live database facts are therefore owner-confirmed rather than repository-verified.
- The repository's migrations and the live Supabase database are not automatically synchronized.
- Existing Firebase identity/data-path limitations remain.
- `README.md` contains a pre-existing merge-conflict marker block and should not be opportunistically
  cleaned.
- Some one-off data-generation scripts use packages not declared in `package.json`; they are offline
  tooling.
- The SRS stack paragraph mentions technologies that are not the running stack. Do not migrate the
  running project to match that prose.
- SRS/ER still show Password on Students/Admins. Passwords are intentionally not stored there.
- SRS has the known Subjects.CourseId type typo; intended database type is BIGINT because it references
  Courses.CourseId.
- Leaderboard SRS foreign-key wording for Points is technically non-relational when represented as an
  array. Do not fabricate an invalid PostgreSQL FK.
- Static catalog/question data currently exists in multiple JSON/JS/PDF-derived forms. Do not import
  all copies blindly.

---

## Appendix A — Current SRS Entity Summary

### Students
`StudentId`, `FullName`, `Email`, `Password`, `IsSpam`

### Admins
`AdminId`, `FullName`, `Email`, `Password`, `isSuperAdmin`

### TestRooms
`RoomId`, `StudentId`, `Points`, `Difficulty`, `Correct`, `InCorrect`

### TestAttempts
`TestId`, `StudentId`, `Points`, `Difficulty`, `Correct`, `InCorrect`,
`UnAttempted`, `Attempted`

### Subjects
`SubjectId`, `SubjectName`, `CourseId`

### Courses
`CourseId`, `Sems`, `CourseName`

### TestsData
`TestId`, `Questions`, `Options`, `Answers`

### Feedbacks
`FeedbackId`, `Description`, `Type`, `isSpam`, `isBookmark`, `isSeen`, `StudentId`

### Leaderboards
`LeaderboardId`, `StudentId[]`, `Points[]`, `SubjectId`, `TotalTests[]`

### Subscribers
`SubscriberId`, `StudentId`, `StartDate`, `EndDate`, `SubscriptionId`, `RemainingTokens`

### Subscriptions
`SubscriptionId`, `Amount`, `Tokens`, `TimeValidity`

---

## Appendix B — Source Priority

When making implementation decisions, use this priority:

1. Latest explicit owner clarification
2. Latest SRS/ER/DFD/activity/class diagrams
3. Actual repository implementation/code
4. Existing project documentation
5. Older chat/history notes

Never use older material to override a newer explicit owner decision.