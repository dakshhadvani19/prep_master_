# PrepMaster — Project Context (long-term source of truth)

**Repository:** `/home/user/prep_master_` (git root) · application in `global-exam-prep/`
**Audience:** future Agent Mode sessions. This file is durable project knowledge.
`PREPMaster_CURRENT_STATUS.md` (same folder) is the short, frequently-updated state file.
**Never put secrets in these files:** no passwords, API keys, service-role/`sb_secret_…` keys,
Gmail app passwords, OAuth client secrets, `OTP_PEPPER`, tokens or private credentials.
Environment-variable **names** are allowed; values never are.

---

## ⚠️ MANDATORY CONTEXT RULE — applies to EVERY future Agent Mode task

**BEFORE implementing anything:**
1. Read `docs/PREPMaster_PROJECT_CONTEXT.md`.
2. Read `docs/PREPMaster_CURRENT_STATUS.md`.
3. Treat both as project memory, then **verify the relevant parts against the actual code**
   (this repo is the source of truth; the docs are a map, not a substitute).
4. Restate internally what the current task is *allowed* to modify.

**AFTER completing the task:**
5. Review whether the change touched architecture, security rules, routes, database
   assumptions, authentication behaviour, UI rules, protected areas, or planned functionality.
6. **Always** update `PREPMaster_CURRENT_STATUS.md` to the true post-task repository state.
7. Update **this** file only when a *permanent* rule, architecture fact or decision changed.
8. Report files changed + results, distinguish pre-existing problems from newly introduced ones, and stop.

These files are documentation and constraints. **They are never permission to implement anything.**
Do not update them mechanically when nothing changed; do not rewrite them needlessly; do not
replace verified facts with guesses; do not delete historical decisions without a reason.
If a new instruction conflicts with this context: follow the latest explicit user instruction,
implement it, update the context afterwards, and record the changed decision in `CURRENT_STATUS.md`.

**Status legend used throughout:** ✅ implemented and verified in this repo · ⚠️ partial / hybrid
(works, but with a documented gap) · 📝 planned, not in the repo · ❓ cannot be verified from the repo.

---

## 1. Project Overview

PrepMaster is a university exam-preparation web app (React + Vite SPA) for diploma/degree
students: browse a course catalog, open a subject, take a mid-term/final exam whose questions are
generated from syllabus material (static datasets plus AI generation), review results, and give
feedback. A staff (admin) area manages syllabus files today and is being expanded into
Courses/Subjects/Questions, Leaderboards and Feedback management (see §26).

- App code: `global-exam-prep/` (Vite root; `package.json` scripts live here).
- Requirements/diagrams: `SRS/*.jpg` (ER, DFD0-2, use-case, student & admin flow/sequence diagrams).
  `progress.txt` states: *"Always take reference from diagrams which are inside SRS folder for
  implementing any feature."* That is a standing project rule, not a suggestion.
- Owner notes: `progress.txt`, `progressByAi.txt`; auth design: `global-exam-prep/AUTH.md`
  (10 sections, the authoritative auth write-up); deep code explanation:
  `global-exam-prep/context/CODEBASE_DEEP_EXPLANATION.txt`.
- Identity: React 19 SPA, `HashRouter`-free (`BrowserRouter`), deployed on Vercel, with Supabase
  (auth + Postgres) and Firebase (Firestore/Storage) both live in the same app.

## 2. Technology Stack

Frontend: React 19.2, react-router-dom 7.13, framer-motion 12.34, lucide-react, CSS (design tokens
in `src/index.css`, auth-screen tokens in `src/pages/Auth.css`), pdfjs-dist 5.5 (syllabus parsing),
jszip, canvas-confetti, `@google/generative-ai`.
Data/identity: `@supabase/supabase-js` 2.109 (auth, Postgres via PostgREST + RPC),
`firebase` 12.10 (Firestore + Storage + `getAuth` compat object), RLS.
Server: Vercel Serverless/Edge functions in `api/`, `nodemailer` 6.9 (Gmail SMTP), Groq
(`llama-3.1-8b-instant`) via `api/ai.js`.
Two declared dependencies are **not imported anywhere** in `src/` or `api/` — `canvas-confetti` and
`@google/generative-ai` (AI questions go through `fetch('/api/ai')`, not the SDK). They were reviewed
in the cleanup audit and **kept deliberately**, so do not treat "unused" as "removable", and do not
assume the SDK is in the request path. `pdfjs-dist` + `jszip` are used by `src/utils/fileParser.js`.
Testing/tooling: Vitest 2.1 + Testing Library + jsdom, `@electric-sql/pglite` 0.5 (real Postgres
in tests), ESLint 9 with `react-hooks`/`react-refresh`.
Scripts (`global-exam-prep/package.json`): `dev` (vite), `build` (vite build), `lint`
(eslint .), `test` (vitest run), `test:watch`, `preview`, `deploy` (vercel --prod),
`deploy:rules` (firebase deploy --only firestore:rules).

## 3. Application Architecture

`src/main.jsx` → `src/App.jsx` (`BrowserRouter` → `AuthProvider` → `Layout` route with nested
routes, all pages `React.lazy`-loaded, `Suspense` fallback) → pages in `src/pages/`.

Key files (line counts as of writing): `src/context/AuthContext.jsx` (762 — the only auth/role
owner), `src/utils/supabaseAuth.js` (603 — every Supabase Auth + authorization call),
`src/supabase.js` (203 — client, key validation, OAuth-callback capture),
`src/components/ProtectedRoute.jsx` (57), `src/components/Layout.jsx` (663 — navbar/header/user menu),
`src/pages/Signup.jsx` (1521 — login + signup + OTP + Google + forgot-password UI),
`src/pages/SyllabusAdmin.jsx` (331 — the only existing admin page), `src/firebase.js`.
Static data: `src/data/mockData.js` (catalog + exam definitions), `universitySyllabus.js`,
`pdfSyllabus.js`, `predicted_ai_syllabus.json`, `questionGenerator.js`.
Utilities: `syllabusStorage.js` (Firestore+Storage), `fileParser.js`, `geminiQuestions.js`
(AI via `/api/ai`), `passwordStrength.js`, `otpService.js` (client half of the OTP gate),
`hashUtil.js` (legacy, keep).
`src/data/mockData.js.bak` is a kept historical dataset — not dead code to delete.
Build: brotli+gzip via `vite-plugin-compression`; `manualChunks` splits `vendor-react`,
`vendor-firebase`, `vendor-ui`, `vendor`; `optimizeDeps.exclude: ['pdfjs-dist']`; dev server proxies
`/api/ai` → Groq. Changing the chunk strategy changes deployed artefacts — do not "tidy" it.
Tests: `tests/*.test.{js,jsx}` (17 files) with a shared harness `tests/supabaseMock.js` + `tests/setup.js`.
App root also holds 56 one-off maintenance scripts (41 `.cjs` + 15 `.js`) that (re)generate the
syllabus data files from the PDFs, plus `Subjects_Diploma.pdf`, `Subjects_Diploma__.pdf`,
`syllabus-pdfs/`. They are not part of the build; several require undeclared packages
(`pdf-parse`, `pdf2json`, `playwright`) and are intentionally left that way.

## 4. Authentication Architecture (current, real)

```
Unauthenticated → existing Login/Signup UI (src/pages/Signup.jsx)
   → Supabase Auth  ├── email + password (signInWithPassword)
                    └── Google OAuth (signInWithOAuth redirect + PKCE, same code path)
   → authenticated Supabase session, auth.uid()
   → AuthContext.loadIdentity(user)
        ├── resolveAuthorization(supabase, uid)  → public.admins lookup  → role
        └── fetchStudentProfile(supabase, uid)   → public.students profile (students only)
   → role: no admins row → Student · row → Standard Admin · row + is_super_admin → Super Admin
   → navigate to /dashboard (or the page remembered by ProtectedRoute)
```
Non-negotiable rules (all enforced in code today):
- Supabase Auth is the **only** authentication provider. No second admin login, no
  pre-authentication email search, no password comparison against any application table.
- `public.students` / `public.admins` are profile/authorization tables, never credentials.
- Identity source is `auth.uid()` / the verified session — never `localStorage`, never a
  frontend boolean, never JWT/user-metadata claims. The session is re-resolved on every boot.
- `adminProfile`, `authorizationError`, `role` and `hasRole()` exist **only** in
  `AuthContext`; pages/components consume them (`ProtectedRoute`, `Layout`, `SyllabusAdmin`) and
  must not derive roles themselves.
- Forgot/reset password is Supabase Auth's flow only (`sendPasswordReset` →
  `resetPasswordForEmail` with `redirectTo=<origin>/signup?mode=login` → `PASSWORD_RECOVERY`
  → `updateUser({ password })`), shared identically by students and admins.
- No admin email/password is hard-coded anywhere in the app.
- Passwords never reach the OTP endpoints, logs, Firestore or Supabase tables; `signup` sends
  only `full_name` as user metadata.
- `supabase.auth.onAuthStateChange` has exactly **one** subscriber (`AuthContext`);
  `detectSessionInUrl` is off and `src/supabase.js` captures `?code=`/`#code=` once at module load
  so no other effect can race the exchange.

## 5. Student Authentication

- **Signup is two-step and OTP-gated:** `requestSignup(email, password, name)` → `/api/send-otp`
  issues+mails a 6-digit code; `verifySignupOtp(email, code)` → `/api/verify-otp` consumes it, and
  only on `{ verified: true }` does the app call `supabase.auth.signUp` **once**. The password lives
  in memory for the lifetime of the OTP screen and is dropped on success/cancel.
  The project **must** have Supabase "Confirm email" **OFF** (`AUTH.md` §9 checklist is the
  authority): with it off, `signUp` returns a usable session and no second verification mail is sent;
  the app detects the ON shape (`user` but no session) and reports it instead of looping.
  `signupWithEmail` intentionally throws (single-call signup is gone).
- **Profile creation is the database's job:** `handle_new_user()` — an `AFTER INSERT` trigger on
  `auth.users` — mints `public.students` with `role='student'` (documented in `AUTH.md`; the trigger's
  DDL is **not** in this repo, see §8, so treat it as a live-project dependency). The client never
  inserts into `public.students`; a missing row produces an explicit operator-facing `profileError`.
- **Log in:** email+password or Google. Both land on `/dashboard` unless ProtectedRoute stashed a
  `state.from` destination.
- The only client write to `students` is the display name (`updateStudentFullName`).
- Password strength meter (`src/utils/passwordStrength.js`) + the amber score ring are UX-contracted
  by tests (`tests/auth-strength-ring.test.js`) — do not change the scoring.

## 6. Admin Authentication and Authorization (Phase 1 — ✅ done, 📝 for the UI)

Implemented (this is what the code actually does):
- `resolveAuthorization(client, authUid)` in `src/utils/supabaseAuth.js`:
  1. `client.rpc('admin_role_for_uid')` — the security-definer function from
     `supabase/migrations/20260925150000_admin_role_lookup.sql`. It takes **no argument**; the
     predicate is `auth_uid = auth.uid()` inside Postgres, so a caller cannot ask about anybody
     else. It returns one whitelisted `jsonb` object (`admin_id, auth_uid, full_name, email,
     is_super_admin`) or NULL.
  2. Only when that function is absent (`PGRST202`) it falls back to a self-read:
     `from('admins').select(whitelist).eq('auth_uid', uid).maybeSingle()` — the path that works if
     the project's RLS already grants a self-read policy. A permission error on the RPC does **not**
     trigger the fallback.
- `acceptAdminRow()` discards any non-object answer **and** any row whose `auth_uid` is not the
  caller's (reported as `ADMIN_UID_MISMATCH`) — a tampered/edited lookup cannot hand out a role.
- `deriveRole(adminRow)` is the single role rule: `null → 'student'`, row → `'admin'`,
  row + `is_super_admin` → `'superAdmin'`. Truthy spellings tolerated: `true|'true'|1|'t'`.
- `AuthContext` state `adminRecord` + `authorizationError`; `role/isAdmin/isSuperAdmin/hasRole`
  derive from them; cleared on `SIGNED_OUT` and `logout()`; re-read on login, Google return,
  refresh (`INITIAL_SESSION`), signup completion, password recovery and `refreshStudentProfile()`.
  One `loadedForRef` uid claim per user prevents duplicate loads/out-of-order answers.
- An admin with no `public.students` row is **not** shown the "student profile is missing" message
  (staff are not students).
- `public.students.role` is deliberately **not** an authorization source any more (it is still
  returned on `studentData` as data). Reason: students may update their own `students` row, so a
  writable role column is self-service privilege escalation.
- Nothing is written to `public.admins` by the app, ever (asserted by tests). Google sign-in does
  not create/link/modify staff rows; identity linking for the same verified email is Supabase's.
- Tests: `tests/admin-auth.test.jsx` (13), `tests/admin-authorization.test.js` (10),
  `tests/admin-role-sql.test.js` (12, real Postgres), plus updated `tests/auth-flows.test.jsx`
  and `tests/auth-routing.test.jsx`.

Still 📝 (not implemented): every admin screen beyond `SyllabusAdmin`, role-aware navbar, admin
dashboard, staff management UI. **Granting** admin remains an operator action:
`insert into public.admins (auth_uid, full_name, email, is_super_admin) values ('<auth.users id>', …)`.

## 7. Supabase Architecture

- Client: `src/supabase.js` reads `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY`,
  validates them (placeholder detection, and it **refuses to boot** on an `sb_secret_…` key or a JWT
  whose payload says `role: service_role`), and exposes `supabase` (nullable) plus
  `supabaseConfigError`, `requireSupabase`, `consumeAuthCallback`, `hasPendingAuthCallback`.
  A build with no Supabase config must not hang the SPA (`authLoading` starts settled).
- Server-side access uses the separate, non-`VITE_` `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`
  inside `api/_otpStore.js` only.
- PKCE + **redirect** (no popup) for Google; `exchangeAuthCode()` bounds the exchange with a timeout
  and maps provider errors to safe copy; the auth callback is scrubbed from the URL at module load.
- Migrations live in `supabase/migrations/` (timestamp-prefixed, idempotent, `notify pgrst,
  'reload schema'` at the end): `20260905120000_auth_otp.sql`, `20260925150000_admin_role_lookup.sql`.
- RLS is the enforcement layer for `public.students` (own-row read + own `full_name` write, no
  INSERT/DELETE for `authenticated`). Do not "fix" a UI problem by loosening it.
- Dashboard settings the app depends on are tabulated in `AUTH.md` §9 (Confirm email OFF, signups ON,
  Site URL, Redirect URLs allow-list, Google callback URI, recovery template). A `redirectTo` that is
  not allow-listed is silently rewritten to Site URL.

## 8. Database Schema / Important Tables

⚠️ **Verification limit:** the repo contains **no DDL** for `public.students`, `public.admins`, their
PKs/FKs, `handle_new_user()`, `guard_student_protected_columns` or the `students` sequences — those
exist only in the live Supabase project, which this sandbox cannot read (no credentials, and none may
be added). So PK/FK/`ON DELETE CASCADE`/identity details for those two tables are **❓ not
verifiable from the repository**; what follows is what the code provably relies on.

Columns the application reads/writes (from `fetchStudentProfile` / `resolveAuthorization` / queries):
- `public.students`: `student_id` (used as `studentId`; AUTH.md §8 says it comes from a sequence),
  `auth_uid` (→ `auth.users.id`, the only join key the app uses), `full_name`, `email`,
  `is_spam`, `role` (`'student'|'admin'|'superAdmin'`; **not** used for authorization), `created_at`.
  Client-writable: `full_name` only.
- `public.admins`: `admin_id`, `auth_uid`, `full_name`, `email`, `is_super_admin` (boolean),
  `created_at`. **No password column exists and none may be added.** Not writable from the app.
- `public.auth_otp` ✅ fully defined in-repo (`20260905120000_auth_otp.sql`): `email text PK`
  (normalised, constrained), `otp_hash text` (HMAC digest, never plaintext), `nonce uuid
  default gen_random_uuid()`, `attempts smallint default 0`, `created_at timestamptz default now()`,
  `expires_at timestamptz`. RLS enabled with **zero policies**, `revoke all … from anon,
  authenticated`, `grant select,insert,update,delete … to service_role`; four
  `security definer` functions `auth_otp_issue/verify/discard/prune`, each pinned with
  `set search_path = public, pg_temp`, with execute granted to
  `service_role` only and revoked from `public, anon, authenticated`. Single live challenge per
  address (PK), resend cooldown and attempt ceiling enforced inside the SQL, row deleted on success.
- `public.admin_role_for_uid()` ✅ (see §6) — `security definer`, `stable`,
  `set search_path = public`, execute granted to `authenticated`, revoked from `public`/`anon`;
  returns NULL for non-staff. The migration creates no table, no column, no policy and no row, and
  fails with an explicit message if `public.admins` or its `auth_uid`/`is_super_admin` columns are absent.
- Legacy Firestore collections (still live; §9): `students/{uid}`, `admins/{adminId}`,
  `meta/counters`, `otp_tokens/{tokenId}` (obsolete path, rules retained), `users/{uid}/examHistory`,
  `domains`, `courses`, `subjects`, `syllabuses`, `feedback`.

## 9. Firebase Hybrid Architecture (⚠️ deliberately still here)

`src/firebase.js` initialises Firebase app + `getAuth` + `getFirestore` + `getStorage` from
`VITE_FIREBASE_*` names and exports `{ app, auth, db, storage, firebaseConfigError }`. It is **not**
an authentication path any more (`AuthContext` is Supabase-only); `currentUser` kept in the context
is a Firebase-*shaped* compat view (`uid, email, displayName, photoURL, providerData, emailVerified,
authProvider:'supabase'`) with no `getIdToken()` on purpose.

Live Firestore/Storage consumers: `Dashboard.jsx` (`users/{uid}/examHistory` read),
`ExamPortal.jsx` (history write), `ReviewPage.jsx` (history read), `utils/syllabusStorage.js`
(`syllabuses/{courseId}_{subjectId}` docs + `syllabuses/<course>/<subject>/<ts>_<file>` Storage objects),
`SyllabusAdmin.jsx` (upload/list/delete). `firestore.rules` (214 ln) still gates on
`request.auth.uid`, i.e. a **Firebase** identity, and its `isAdmin()` reads `students/{uid}.role`.

Documented consequence (`AUTH.md` §10): until the Supabase↔Firebase bridge exists, those paths return
`permission-denied` for a Supabase-only session — exam history reads warn/return empty, saves fail,
syllabus admin writes are rejected. This is knowingly not worked around: faking a Firebase session or
loosening rules would be the worse bug. Do **not** remove the `firebase` dependency, `firestore.rules`,
`firebase.json`, `deploy:rules` or the `VITE_FIREBASE_*` names: five live modules import
`src/firebase.js` (`Dashboard.jsx`, `ExamPortal.jsx`, `ReviewPage.jsx`, `utils/hashUtil.js`,
`utils/syllabusStorage.js`), and both the `vendor-firebase` chunk and that behaviour depend on it.

## 10. API / Serverless Architecture (`api/`, Vercel)

| Endpoint | Runtime | Does | Env names it reads |
| --- | --- | --- | --- |
| `POST /api/send-otp` | node | generates the 6-digit code with `crypto.randomInt` (first digit non-zero), stores **only** `HMAC-SHA256(OTP_PEPPER, email:code)` via `auth_otp_issue`, mails it with Nodemailer/Gmail; store-then-mail with rollback if mail fails; returns `{sentAt, resendAfter, expiresIn, nonce}` | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OTP_PEPPER`, `GMAIL_USER`, `GMAIL_APP_PASSWORD` |
| `POST /api/verify-otp` | node | atomically verifies + single-use burns the challenge via `auth_otp_verify`; returns `{verified:true}` or a mapped reason; the client then calls `supabase.auth.signUp` | same Supabase trio |
| `POST /api/feedback` | node | renders the submission to HTML and **emails it** to the owner address hard-coded in the file; no database store | `GMAIL_USER`, `GMAIL_APP_PASSWORD` |
| `POST /api/ai` | **edge** | Groq proxy (`https://api.groq.com/...`, default model `llama-3.1-8b-instant`, `temperature 0.1`) | `GROQ_API_KEY` (or `VITE_GROQ_API_KEY`) |
| `api/_otpStore.js` | lib | shared server module (crypto, digests, `rpc()` with timeout, in-memory sliding-window limiter, `missingConfig()`): **not** a route | — |

Rate limits in `_otpStore.js`: 5 codes/address/window, 10 verify guesses/address/window,
20 requests/IP/window; attempt ceiling 3 inside SQL; resend cooldown 60 s; TTL 600 s
(`src/utils/otpService.js` mirrors these for the UI countdown only). CORS is `*` for these endpoints.
`vercel.json` rewrites everything **except** `/api/*` to `/index.html` (the negative lookahead is load-bearing).
`missingConfig()` errors name variables only — never values. Keep it that way.

## 11. Routing and Navigation Rules

Routes (`src/App.jsx`, all nested under `Layout`): `/` (LandingPage, index) · `/signup`
(`?mode=login|signup`, `?method=email|google`) · `/login`, `/register` → `ForwardToAuth` (redirect to
`/signup` **carrying `location.state`**) · `/domains/:domainId/courses` · `/courses/:courseId/subjects`
· `/exams/:subjectId/:examType/:difficulty` (protected) · `/dashboard` (protected) ·
`/review/:historyId` (protected) · `/admin/syllabus` (`ProtectedRoute requiredRole="admin"`) ·
`/search` · `/feedback` · `/guide` · `*` → inline `NotFound`.

`ProtectedRoute` (verbatim behaviour): `authLoading` → render nothing · no `currentUser` →
`/signup?mode=login` with `state.from = location` · `requiredRole='superAdmin'` without it →
`/admin/syllabus` if the user is at least admin else `/dashboard` · `requiredRole='admin'` without it
→ `/dashboard`. `adminHome` is `/admin/syllabus` because **there is no `/admin/dashboard` route yet**.

Navbar (`Layout.jsx` `navItems`): Home `/` · Leaderboards `/leaderboards` · Feedback `/feedback` ·
Subscriptions `/subscriptions`. ⚠️ `/leaderboards` and `/subscriptions` have **no routes** — today they
render `NotFound`. The user menu adds Dashboard `/dashboard`, Log out, and a gold **Syllabus Admin**
link that appears only when `isAdmin`.

Requirement for Phase 2 (📝, owner-specified): for authenticated admins **Home → Dashboard** and
**Subscriptions → Courses**; the other two navbar options stay unchanged. Admins have **no
separate admin homepage** — after real admin auth they land on the existing Dashboard screen.

## 12. Student UI Rules

- Students must see no admin affordance whatsoever; role-driven UI is `isAdmin`/`hasRole` only.
- Login screen layout/visuals are the owner's: change only what auth behaviour strictly requires.
- Auth page owns its own scoped tokens and the amber score ring (see §18); the success overlay then
  navigates to the remembered path — do not reorder those two.
- Exam flow contract: SubjectDetails (semester → subject → exam type → difficulty) → ExamPortal →
  ReviewPage; results persist through `users/{uid}/examHistory` + a `localStorage.userExamHistory`
  cache that is cleared on logout.
- Public pages: LandingPage, CourseExplorer, SubjectDetails, SearchResults, FeedbackPage, UserGuide.

## 13. Admin UI Rules (📝 planned; today only SyllabusAdmin exists)

Planned admin experience, per the owner's flow diagram (`SRS/adminflowchart_25_8.jpg`) and
`SRS/finaladmin_25_8.jpg`, and to be built on the **existing** visual language:
- Standard Admin: Dashboard (admin), Feedback management/overview, Leaderboard & Ranking,
  Subject management, Question management, Logout.
- Super Admin: everything a Standard Admin has **plus** Add Admin, Remove Admin, Add Super Admin.
- The Courses section replaces the student-facing "Subscriptions" navbar entry **for admins only**.
- Admin screens are separate routes (e.g. under `/admin/…`) behind `ProtectedRoute requiredRole`;
  nothing may rely on hiding a button alone.
- Today's only real admin surface: `SyllabusAdmin.jsx` — syllabus PDF upload / list / delete
  (Firestore + Storage, currently gated by the Firebase-identity gap in §9).
- Mock-UI-first is the agreed approach for Phases 3–4: build the shells/flows, then wire persistence —
  and never present a mock as a working feature.

## 14. Super Admin Rules

- Source of truth: `public.admins.is_super_admin` for the caller's row → `role === 'superAdmin'`
  (`hasRole('superAdmin')` is an exact match; `hasRole('admin')` is a rank check:
  `ROLE_RANK = { student: 0, admin: 1, superAdmin: 2 }`).
- Super-admin-only operations in the plan: adding/removing admins and adding super admins. Those
  writes must go through a server-side/database path with RLS — never a client-side bulk write, and
  never an auto-provisioned row during Google login.
- Legacy Firestore rules already encode a similar split (`students` delete and `feedback` delete
  require `isSuperAdmin()`), which is why `firestore.rules` must not be loosened casually.
- Gold emphasis may be reserved for super-admin surfaces (§18).

## 15. Courses / Subjects / Questions Requirements

Verified current state: the catalog is **static data**, not a database.
`src/data/mockData.js` exports `domains[]` → `{ id, title, icon, description, courses[] }` →
`{ id, title, semesters?, subjects[] }` → `{ id (e.g. '09ma2101'), title, sem, exams: ['mid-1','mid-2','final'] }`,
plus `examPrompts` (per exam type: title, `timeMinutes`, `totalMarks`, `type: subjective|objective`).
`SubjectDetails.jsx` already implements Course → **Step 1: Select Semester** → Subjects → exam picker.
Questions come from `src/data/questionGenerator.js` (`universitySyllabus` + `examTemplates`),
`universitySyllabus.js`, `pdfSyllabus.js`, `predicted_ai_syllabus.json`, uploaded/`fetchSyllabus`
Firestore PDFs, and AI generation via `geminiQuestions.js` → `/api/ai`.

📝 Planned admin Courses flow (Course → Semester → Subjects → Questions) with
**Add / Edit / Update / Remove** for Subjects and **Add / Edit / Update / Remove** for Questions:
**none of this exists in the repo** (grep for `addSubject|deleteSubject|updateSubject|addQuestion|…`
returns nothing). No `domains/courses/subjects/questions` tables exist in the Supabase migrations,
and the Firestore collections `domains`, `courses`, `subjects` are read-only `allow: if true` with
writes gated on the (currently unreachable) `isAdmin()`. Phase 3 is therefore mock UI + a storage
decision that has to be made explicitly (Firestore vs Supabase tables + migrations).

## 16. Leaderboard Requirements

Verified current state: **not implemented.** The only occurrences are the navbar label/link in
`Layout.jsx` (`/leaderboards`) and a mobile link + `Trophy` icon; there is no route, page, query,
table or ranking logic anywhere in `src/` or `api/`.

Requirements to build (owner-specified, 📝):
- Students see only leaderboards they participate in / that are relevant to them.
- If a student attempted an exam but is outside the Top 100: still show the Top 100 **and** the
  student's own rank + percentile.
- Admins eventually see all leaderboards, with search + compact filters: Student Name, Subject Name,
  Subject ID, Course, Semester. Dependency rule: choosing a Course restricts the Subject list to that
  course's subjects and the Semester list to that course's semesters. Keep filters few and useful.
- Admin view needs: search, filtering, results, ranking, percentile, useful exam/context columns.
- Data dependency: ranks need persisted attempts, which today sit behind the Firebase identity gap
  (§9) — resolve that (or define a Supabase-side attempts table) before promising real leaderboards.

## 17. Feedback Management Requirements

Verified current state: `FeedbackPage.jsx` (public route) posts to `/api/feedback`, which renders and
**emails** the message (types: general/bug/feature/content/ai, 1–5 stars, optional name/email/subject).
There is **no feedback store** — no table, no Firestore write — so nothing exists to list, filter,
bookmark or mark seen. The `feedback` collection exists in `firestore.rules` (create `if true`,
read/update `isAdmin()`, delete `isSuperAdmin()`) but no app code writes it.

📝 Planned admin feedback UI: Total Feedback / Seen Feedback / **Remaining = Total − Seen**, shown as
one professional chart/progress visualization (pick the form that fits the data — a bar/stacked bar
or a progress donut, not decoration); per-item actions from the diagram: Set User as Spam, Set Feedback
as Spam, Bookmark Feedback, Set as Seen; plus a spam-users list on the admin dashboard. Implementing
any of this requires first deciding where feedback is stored (Supabase table + migration, or
Firestore once the identity bridge exists) — that is a real design decision, not a cleanup.

## 18. UI Design System / Theme

Existing structural foundation is **dark neutral**: `--bg-primary #0f1115`, `--bg-secondary #16181d`,
`--bg-tertiary #1c1f26`, text `#ffffff / #a0a5b1 / #6b7280`, `--border-color rgba(255,255,255,.1)`,
glass surfaces `--glass-bg / --glass-border`, radii `6/12/16/24/32/9999px`, shadows incl.
`--shadow-glow`, transitions `0.15s / 0.3s ease` (all in `src/index.css`).
Primary interactive/selection colour is **light purple/violet**: `--accent-primary #3b82f6` with
`--accent-gradient: linear-gradient(135deg,#3b82f6,#8b5cf6)`; the auth screen's own tokens are
`--bg-void #050506`, `--accent #ffb454` (amber), `--accent-2 #8d7bff` (violet),
`--border-subtle rgba(255,255,255,.08)` (`src/pages/Auth.css`).
**Gold** must be taken from that existing auth-page gold family (`#ffb454`, with `#ffd08a`,
`#fbbf24`, `#ffdca8` as the current range; `#eab308` already marks the admin link, `#f59e0b` the
leaderboards icon, `#a78bfa` feedback, `#34d399` subscriptions).
Rules: gold is professional, restrained, elegant, readable — for important states, critical actions,
selected/highlighted items, meaningful emphasis, and super-admin emphasis. Never everywhere, never
childish, never oversaturated. Light purple stays the primary selection colour; dark gray stays the
structural neutral. Motion: framer-motion is used on landing/auth/transition surfaces — reuse
existing patterns. **Future admin UI must extend this language, not import an unrelated template.**

## 19. Security Rules (permanent)

1. Credentials live only in Supabase Auth. No password column on `students`/`admins`, no plaintext
   password in code, migrations, env, logs or emails; `pbkdf2`/`hashUtil.js` paths are legacy and stay.
2. No service-role/secret key in any `VITE_*` variable or bundle; `src/supabase.js` refuses to boot
   with one. Server keys stay in Vercel env for `api/` only.
3. Never trust client state for authorization: no `localStorage`/`sessionStorage`/JWT-claim/user-metadata
   role. Role comes from the authenticated uid's `public.admins` row, re-read per session.
4. RLS: enabled where intended; grants are least-privilege; `public.admins` must never become
   anon-readable; `public.auth_otp` is unreadable by every client role.
5. Fail closed: unreadable authorization ⇒ student (+ `authorizationError`).
6. OTP: server-generated, HMAC-SHA256 keyed with `OTP_PEPPER`, TTL 600 s, 60 s cooldown, 3 attempts,
   single live code per address, atomically consumed, browser never touches the store, password never
   sent to the OTP API, OTP never bypassed.
7. Auth errors are mapped to safe copy; no raw server message or existence oracle leaks
   (`checkEmailExists` throws on purpose).
8. CSP in `index.html` must keep `https://*.supabase.co` (plus `*.googleapis.com`, `*.firebaseio.com`,
   `api.groq.com`, `apis.google.com`, `accounts.google.com`, `www.gstatic.com`, `*.googleusercontent.com`)
   in the right directives — a missing `connect-src` entry silently killed Google sign-in once.
9. `.env*` files are git-ignored (`.env.example` names only); never create or overwrite a `.env`.
10. Never fabricate refs, domains, keys or "already deployed" claims; report unverifiable things as such.

## 20. Protected Areas (do not touch unless the task explicitly authorises it)

Syllabus functionality & storage (`utils/syllabusStorage.js`, `fileParser.js`, `SyllabusAdmin.jsx`,
the syllabus data files and `Subjects_Diploma*.pdf`) · exam functionality (`ExamPortal.jsx`,
`ReviewPage.jsx`, `data/questionGenerator.js`, `universitySyllabus.js`) · Firebase-based
syllabus/exam logic (`src/firebase.js`, `firestore.rules`, `firebase.json`, `deploy:rules`,
`VITE_FIREBASE_*` names) · the OTP system (`src/utils/otpService.js`, `api/send-otp.js`,
`api/verify-otp.js`, `api/_otpStore.js`, its migration) · `src/utils/hashUtil.js` (keep) ·
student authentication and the existing student experience/data · `Signup.jsx` visuals ·
`src/supabase.js` env names and key guards · `vercel.json` (both copies) · unrelated pages/components ·
tables unrelated to the task · the SRS PDFs/diagrams.
**When uncertain: KEEP the existing code.** No opportunistic cleanup, renames, dependency removals,
version bumps (`npm audit fix` is never run), or "modernisation".

## 21. Existing Functionality That Must Not Break

Login/signup tabs via `?mode=`, legacy `/login` `/register` aliases, the OTP-gated signup (single
`signUp` per verified code, resend/cancel), Google redirect + PKCE return leg (single owner, one
exchange, `?method=google`), password reset + in-app recovery mode, session restore on refresh,
"student profile missing" operator message, exam history read/write + localStorage cache, the
dashboard, syllabus upload/list/delete, feedback email, AI question generation through `/api/ai`,
search, user guide, role gating of `/admin/syllabus`, the auth-page success overlay + score ring,
the service-role-key boot guard, and the `npm run build`/`npx vitest run` gates (17 files / 216 tests;
dist = 74 files; lint 45 problems).

## 22. Development / Testing Rules

- Work from `global-exam-prep/`. Only these scripts exist: `dev build lint test test:watch preview deploy deploy:rules`.
  Do not invent new ones. `node_modules` may be pruned between sandbox sessions — run `npm install`
  first if `vite`/`vitest` report "not found" or output nothing.
- Gates per task: `npm run build`, `npx vitest run` (or `npm test`), plus `npm run lint` when source
  changed. Fix lint you introduce; **do not** fix unrelated pre-existing lint (baseline is
  45 problems / 40 errors / 5 warnings, incl. `Layout.jsx` & `ExamPortal.jsx` react-hooks warnings,
  `SearchResults.jsx` no-useless-escape, `AuthContext.jsx` react-refresh, `process`-in-`api` no-undef,
  and the one-off scripts).
- Test style: the auth tests drive **real** `AuthContext` + real `src/utils/supabaseAuth.js` against
  `tests/supabaseMock.js` (chainable builder + `rpc` + recorded calls, `state.profile`,
  `state.adminRow`, `adminLookup`, `adminsSelfRead`), asserting what the app actually asks the
  database for. DB-rule tests run the SQL file on real Postgres via `@electric-sql/pglite`
  (`tests/auth-otp-sql.test.js`, `tests/admin-role-sql.test.js`). No fake authentication in tests.
- Prefer extending the existing files over new parallel harnesses. Any new client call the mock
  doesn't implement (e.g. a new `.rpc`) must be added to the mock, or tests fail opaquely.
- Report exact files changed, results, and anything intentionally left untouched. Never claim a
  check ran that didn't. Never commit/push unless explicitly instructed (push from this sandbox has
  no credentials).

## 23. Migration / Database Rules

- Never drop or recreate production tables casually; never modify student data; never edit applied
  migrations — add a new timestamped one (`YYYYMMDDHHMMSS_name.sql`) so changes stay reproducible.
- Each migration is idempotent, wrapped in `begin; … commit;`, and ends with
  `notify pgrst, 'reload schema';` (PostgREST caches schemas; without this a new RPC 404s).
- RLS and grants are **two separate layers**: enabling RLS is not a grant, and `revoke`/`grant` is
  not a policy. Keep RLS enabled where intended, use least-privilege grants, and never grant `anon`
  on an admin/OTP table just to make a screen render.
- **Supabase Data API grant requirement:** after Supabase's announced policy change, newly created
  `public`-schema tables need **explicit Data API grants** in the same migration where appropriate;
  existing tables keep their current grants. Any new table this project adds must ship its
  `grant`/`revoke` lines with it, reviewed against RLS.
- Security-definer functions must pin `search_path`, expose a whitelisted column set, take the
  caller's identity from `auth.uid()` rather than an argument, and be tested against a real
  Postgres (PGlite pattern) including the "other role is refused" case.
- New table migrations must be tested; do not weaken an existing policy to make UI work — report it.
- Migrations in this repo are **not** auto-applied: `supabase db push`/SQL Editor is an operator step,
  and both current migrations still need applying to the live project (see CURRENT_STATUS).

## 24. Deployment Rules

Vercel project root **must** be `global-exam-prep/` (both `vercel.json` copies are equivalent:
`buildCommand npm run build`, `outputDirectory dist`, `framework vite`, SPA rewrites excluding `/api/`).
Production env var **names**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
`VITE_FIREBASE_*` (6), `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OTP_PEPPER`, `GMAIL_USER`,
`GMAIL_APP_PASSWORD`, and `GROQ_API_KEY` (or `VITE_GROQ_API_KEY`). `VITE_*` values are baked at
build time → changing them needs a redeploy. Never rename an env var. Never prefix a server secret.
`deploy` → `vercel --prod`; `deploy:rules` publishes `firestore.rules`. No git remote is configured in
this clone; pushes are done by the owner's environment. Post-deploy checks: CSP console clean, a real
login, a Google round trip, `/api/send-otp` not 502, and (once staff exists) an admin sign-in.

## 25. Important Project Decisions (dated, with reasons)

- **Supabase Auth replaced Firebase Auth** (student identity) because a browser-direct Firestore/
  Auth dependency blocked reliable signups; `VITE_FIREBASE_*` stays for data paths. *(Phase "auth migration".)*
- **Profiles are created by a DB trigger** (`handle_new_user`), and the client is granted no INSERT —
  closes half-written profiles and client-side profile forgery.
- **`signup` is two-step** (Gmail OTP verified server-side, then one `supabase.auth.signUp`) with
  Confirm-email OFF — Supabase's own mailer would otherwise create an unusable, unconfirmed account.
- **OTP moved from Firestore to Postgres** (`public.auth_otp` + 4 functions) with the server minting
  the code and only its keyed digest stored; rollback-on-mail-failure; `hashUtil.js`/`otpService.js`
  kept.
- **Google uses redirect + PKCE with a single exchange owner**, because `detectSessionInUrl` plus a
  second listener could clobber the one-time verifier ("Unable to exchange external code").
- **CSP is part of the auth contract** — the Google outage was a missing `connect-src` entry, not a
  code bug. Do not conclude "not a frontend problem" from clean code.
- **`public.students.role` is no longer an authorization source; `public.admins` is** (Phase 1).
  Reason: `students` rows are owner-updatable, so the column was a self-promotion path; and it makes
  admin status a property of the authenticated identity, as required.
- **Admin lookup = `security definer` RPC keyed on `auth.uid()`, with a self-read fallback**, because
  the live RLS on `public.admins` cannot be inspected from here and the answer must be unambiguous
  (RLS-filtered empty results vs. a real "not staff"). A row for another uid is discarded, and every
  failure fails closed to student with a visible `authorizationError`.
- **Phase 1 shipped no admin UI at all**, by explicit instruction — role plumbing was wired into
  `ProtectedRoute`/`Layout`/`SyllabusAdmin` by making the context authoritative, with zero page edits.
- **Cleanup audits keep "unused but possibly meaningful" files** (e.g. `@google/generative-ai`,
  `canvas-confetti`, `mockData.js.bak`, both reference images): "unused" ≠ "unnecessary".
- **Docs are repo-backed** (this file): future sessions must not depend on chat history.

## 26. Future Planned Work (owner's phase plan)

1. **Phase 1 — Real admin authentication.** ✅ code-complete in this repo (see §6); operator steps
   (apply migration, insert the staff row) are outstanding.
2. **Phase 2 — Admin UI shell + role-aware navigation + admin dashboard.** Routes under `/admin/…`,
   navbar Home→Dashboard and Subscriptions→Courses for admins, dashboard with the feedback
   Total/Seen/Remaining visualization and a spam-users list. Existing Dashboard stays as the admin's
   landing screen until this shell exists.
3. **Phase 3 — Courses / Subjects / Questions: mock UI** for Course → Semester → Subjects → Questions
   with Add/Edit/Update/Remove for subjects and questions, following `SRS/finaladmin_25_8.jpg` /
   `SRS/adminflowchart_25_8.jpg`; storage decision documented before any persistence.
4. **Phase 4 — Leaderboard UI**: student-scoped boards, Top 100 + self rank/percentile, admin
   all-boards view with the compact Course→Subject/Semester dependent filters.
5. **Phase 5 — Final admin integration / QA**: wire the mock admin flows to real data, staff
   management (Add/Remove Admin, Add Super Admin) through a secure write path, end-to-end QA of both
   roles, then a docs update.
Explicitly **not** authorised by these plans: removing Firebase, changing the OTP design,
loosening RLS, or renaming env vars — each needs its own instruction.

## 27. Known Constraints

- The live Supabase schema (students/admins DDL, triggers, policies, grants) is **not** in the repo and
  cannot be read from this sandbox: verify with the owner or an SQL dump before asserting FK/CASCADE
  behaviour (§8).
- `supabase/migrations/*` are not applied to the live project; until they are, `/api/send-otp`
  answers 502 `store_unavailable` and admins resolve as students.
- Firestore/Storage writes from a Supabase session are rejected (no Firebase identity) — the §9 bridge
  is a pending decision, not a bug to patch by weakening rules.
- `README.md` at the repo root contains an **unresolved merge-conflict marker block** (`# Learning_Git`
  vs `# exam_prep_master`) — pre-existing, cosmetic, unfixed here because it is outside a
  documentation task's remit; worth a one-line owner decision.
- `AUTH.md` §9 says "12/IP" while `api/_otpStore.js` uses `MAX_IP_PER_WINDOW = 20` — code is right, doc is stale.
- `api/feedback.js` hard-codes the owner's email address as its recipient (no fallback env var).
- Gmail app-password quota is a real ceiling on a cohort signup day; a transactional provider is the
  eventual replacement.
- Bundle sizes: ExamPortal and the pdf.worker chunk are large (`pdfjs-dist`); the 600 KB
  `chunkSizeWarningLimit` is intentional.
- One-off root scripts import packages that are not in `package.json` (`pdf-parse`, `pdf2json`,
  `playwright`) — they are offline tooling, deliberately not installed.
- Minor hardening candidate: `20260905120000_auth_otp.sql` pins `set search_path = public, pg_temp`
  on its four functions, while `20260925150000_admin_role_lookup.sql` pins `search_path = public`
  (its table/function references are schema-qualified, so nothing is currently shadowable). Aligning
  the two is a follow-up for whoever next touches a migration — do not re-run an applied migration
  just for style.
- No admin/staff UI exists yet, so a real admin today lands on the student Dashboard with a "Syllabus
  Admin" link only.

---

### Appendix A — Traceability to `SRS/` diagrams

| Diagram (`SRS/`) | What it governs | Repo status |
| --- | --- | --- |
| `ER_Diagram_last_updated_25_8.jpg` | Students{StudentId PK, FullName, Email, Password, IsSpam}, Admins{AdminId PK, FullName, Email, Password, isSuperAdmin} | ✅ mirrored as `public.students` / `public.admins`, with "Password" satisfied by Supabase Auth instead of a table column |
| `UseCase_Diagram_last_updated_25_8.jpg` | student vs admin use cases | 📝 admin use cases are Phases 2–5 |
| `adminflowchart_25_8.jpg` | Login → credentials validation → *is super admin?* → Super Admin Dashboard (Add Admin / Remove Admin / Add Super Admin, each "Enter Details & Confirm" / "Select Admin & Confirm") or Standard Admin Dashboard → Dashboard → Check Leaderboard & Ranking · Read Feedback · Edit Subject · Edit Question → feedback actions (Set User as Spam → Select User, Confirm & Flag; Set Feedback as Spam; Bookmark Feedback; Set as Seen) → Logout. Forgot Password → Send Reset Link via Email; invalid credentials → Show Error, Retry Login | ✅ auth/validation/"is super admin" branch and forgot-password are implemented (§4, §6); 📝 every dashboard/management node |
| `sequenceadmin_25_8.jpg`, `finaladmin_25_8.jpg` | admin interaction sequences / final admin screens | 📝 Phase 2–3 targets |
| `sequencestudent_25_8.jpg`, `studentfinal_25_8.jpg`, `updated_student_flow_25_8.jpg` | student flow | ✅ implemented on static data + Firestore history (see §9 gap) |
| `DFD0/DFD1/DFD2_last_updated_25_8.jpg` | data-flow levels | mixed: student paths ✅, admin paths 📝 |

### Appendix B — Where to read more

`global-exam-prep/AUTH.md` (§1–§10: Firebase checklist, env, rules, doc shape, registration flow,
routes, roles, follow-ups, Supabase dashboard checklist, Firebase-bridge gap) ·
`global-exam-prep/context/CODEBASE_DEEP_EXPLANATION.txt` · `progress.txt` + `progressByAi.txt`
(owner notes/changelog) · the SQL files under `supabase/migrations/` (authoritative for what this repo
defines) · `firestore.rules` (authoritative for the Firestore paths).
