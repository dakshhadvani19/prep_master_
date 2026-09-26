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
- Requirements/diagrams: `SRS/` is the **primary requirements reference for future admin (and
  student) work**. Current files (owner commit `4804603`, 2026-09-25; the `*_25_8.jpg` names are
  gone): `SRS_last_updated_print.pdf` (44-page IEEE SRS), `UseCase_Diagram_last_updated_3_9.jpg`,
  `adminflowchart.jpg`, `updated_student_flow.jpg`, `sequenceadmin.jpg`, `sequencestudent.jpg`,
  `DFD0_last_updated_3_9.jpg`, `DFD1_last_updated_3_9.jpg`, `DFD2_last_updated_3_9.jpg`,
  `ER_Diagram_last_updated_3_9.jpg`. Student/admin **activity** diagrams and the **class** diagram
  live in the PDF only (Figures 3.1, 3.2, 7.1) after `studentfinal_25_8.jpg` / `finaladmin_25_8.jpg`
  / `finalclass_25_8.jpg` were deleted. `progress.txt` states: always take reference from diagrams
  which are inside the SRS folder for implementing any feature. That is a standing project rule.
  When an updated SRS/diagram differs from older context, **prefer the latest SRS/diagram** and
  record the change here + in `CURRENT_STATUS.md`. Do not invent missing requirements.
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
- Password meter: `checkPasswordStrength()` drives a **requirement checklist with tick marks** and
  nothing else — the owner removed the amber score ring ("only that list and tick mark on it is enough
  as user types password"). `tests/auth-strength-meter.test.js` pins both halves (list present, ring
  absent, `--ring-track` kept because the OTP timer still paints with it) and the scoring contract.
  Do not change the scoring, and do not "restore" the ring.

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
  `set search_path = public, pg_temp`, execute granted to `authenticated`, revoked from `public`/`anon`;
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

Routes (`src/App.jsx`, all nested under `Layout`): `/` (`HomeIndex`: LandingPage for guests/students;
authenticated admins `Navigate` to `/dashboard`) · `/signup` (`?mode=login|signup`,
`?method=email|google`) · `/login`, `/register` → `ForwardToAuth` (redirect to `/signup` **carrying
`location.state`**) · `/domains/:domainId/courses` · `/courses/:courseId/subjects` ·
`/exams/:subjectId/:examType/:difficulty` (protected) · `/dashboard` (protected, `DashboardSwitch`) ·
`/review/:historyId` (protected) · `/admin/syllabus` (`ProtectedRoute requiredRole="admin"`) ·
`/admin/courses` (`ProtectedRoute requiredRole="admin"`, Phase 3 mock catalog UI) · `/leaderboards`
(`ProtectedRoute`, Phase 4 mock ranking UI) · `/search` ·
`/feedback` · `/guide` · `*` → inline `NotFound`.

`ProtectedRoute`: `authLoading` → render nothing · no `currentUser` → `/signup?mode=login` with
`state.from = location` · `requiredRole='superAdmin'` without it → `/dashboard` if at least admin
else `/dashboard` · `requiredRole='admin'` without it → `/dashboard`. `adminHome` is `/dashboard`.

Navbar is **role-dependent** (`Layout.jsx`, `AuthContext.isAdmin` only):
- Guest / student: Home `/` · Leaderboards `/leaderboards` · Feedback `/feedback` · Subscriptions `/subscriptions`.
- Authenticated admin / superAdmin: Dashboard `/dashboard` · Courses `/admin/courses` · Leaderboards · Feedback.
⚠️ `/subscriptions` still has **no page** (`NotFound`). `/leaderboards` is the Phase 4 mock UI.
User menu: Dashboard,
Log out, gold **Syllabus Admin** when `isAdmin`. Logo goes to `/dashboard` for admins, `/` otherwise.

Landing page (`LandingPage.jsx`, owner `4804603`): the hero **“Continue with Google”** CTA is
commented out. Google signup/login is still available on `/signup`. Do not uncomment it as a “fix”.

## 12. Student UI Rules

- Students must see no admin affordance whatsoever; role-driven UI is `isAdmin`/`hasRole` only.
- Login screen layout/visuals are the owner's: change only what auth behaviour strictly requires.
- Auth page owns its own scoped tokens (see §18); the success overlay then
  navigates to the remembered path — do not reorder those two.
- Exam flow contract: SubjectDetails (semester → subject → exam type → difficulty) → ExamPortal →
  ReviewPage; results persist through `users/{uid}/examHistory` + a `localStorage.userExamHistory`
  cache that is cleared on logout.
- Public pages: LandingPage, CourseExplorer, SubjectDetails, SearchResults, FeedbackPage, UserGuide.

## 13. Admin UI Rules (Phase 2 shell ✅; persistence 📝)

**Status:** ✅ Phase 2 UI shell is in the repo (`AdminDashboard.jsx` on `/dashboard` for staff,
role-aware navbar). `/admin/courses` is the Phase 3 in-memory catalog UI. 📝 every write path
(feedback store, spam, staff add/remove, catalog persistence, leaderboard) is still mock-only.
`SyllabusAdmin.jsx` is the
pre-existing syllabus page (Firestore + Storage, still gated by the Firebase-identity gap in §9).

Primary reference (prefer these over any older `*_25_8` / `finaladmin_*` filenames — those files
are **not in the repo**): `SRS/adminflowchart.jpg`, `SRS/UseCase_Diagram_last_updated_3_9.jpg`,
`SRS/sequenceadmin.jpg`, `SRS/DFD1_last_updated_3_9.jpg`, `SRS/DFD2_last_updated_3_9.jpg`, SRS
§2.2 Admin Module / §3.1.4 Admin Dashboard Interface / §3.2 / §3.3.1, PDF Figure 3.2.

From `adminflowchart.jpg` (and the matching activity diagram):

1. **Authenticate** (✅ Phase 1): Start → Sign in with Google **or** login with email+password;
   invalid credentials / failed Google → Show Error, Retry; Forgot Password → Send Reset Link via
   Email (shared Supabase recovery). Then **is super admin?**
2. **Super Admin Dashboard** (✅ Phase 2 mock UI / 📝 Phase 5 writes): Add Admin (Enter Details &
   Confirm), Remove Admin (Select Admin & Confirm), Add Super Admin (Enter Details & Confirm).
   Use-case also names **Make an admin a super admin** and **Create account** (include Sign in
   with Google). DFD1 inbound: Signup credentials, Add/Remove admin, Make an admin super admin.
3. **Standard Admin Dashboard** (✅ Phase 2 UI): hub with Check Leaderboard & Ranking
   (📝 Phase 4), Read Feedback (✅ placeholder visualization; 📝 Phase 5 persistence), Edit Subject and
   Edit Question (✅ Phase 3 mock UI, entry → `/admin/courses`; 📝 persistence). Feedback actions: Set User as Spam,
   Set Feedback as Spam, Bookmark, Set as Seen — buttons exist, they do not write.
4. Logout → End.

SRS §2.2 / intro “Admin Panel” wording to keep: Admin dashboard, Add/Remove admin, Mark student
as spam, Edit course / subjects / questions, Review / flag feedbacks, Check leaderboards.

Owner Phase-2 extras that are **not** contradicted by the new diagrams (keep): navbar Home→Dashboard
and Subscriptions→Courses for admins; feedback Total / Seen / Remaining (= Total − Seen)
visualization; spam-users list; reuse the existing light-purple + dark-neutral language with
restrained gold (`#ffb454` family) for important / selected / super-admin emphasis.

Build rules:
- Admin screens are separate routes (e.g. under `/admin/…`) behind `ProtectedRoute requiredRole`;
  nothing may rely on hiding a button alone.
- There is **no** second admin login and **no** self-service admin signup in code today: a staff
  row is an operator insert into `public.admins`. Google can authenticate an already-listed admin.
  Do not auto-create `public.admins` on Google login just because the use-case has “Create account”.
- Mock-UI-first is the agreed approach for Phases 3–4: build the shells/flows, then wire
  persistence — and never present a mock as a working feature.

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

✅ Phase 3 mock UI (`AdminCourses.jsx` at `/admin/courses`) — Course → Semester → Subjects →
Questions, in memory only (seeded from two B.Tech courses; not `mockData.js` and not a DB).
**Add / Edit / Update / Remove** for Courses, Subjects, and Questions. Semesters are selected
from the course Sems list (no semester CRUD). Edit Subject / Edit Question include Choose
course (and subject). Destructive confirm toast: `Preview only — no data was changed.`
SRS/ER + Appendix A names:

- Courses: `CourseId` PK, `CourseName`, `Sems` (array, up to 12).
- Subjects: `SubjectId` PK, `SubjectName`, `CourseId` FK. Use-case: Edit question / Edit Subject
  **include** Choose course and subject.
- TestsData: `TestId` PK, `Questions` / `Options` / `Answers` arrays. Class diagram operations:
  `editQuestion`, `addQuestion`, `deleteQuestion`, `changeQuestionPreference`.

The admin catalog **UI** exists; **persistence does not.** No `domains/courses/subjects/questions`
tables exist in the Supabase migrations, and the Firestore collections `domains`, `courses`,
`subjects` are read-only `allow: if true` with writes gated on the (currently unreachable)
`isAdmin()`. Storage (Firestore vs Supabase tables + migrations) still has to be chosen before
any real CRUD. Do not treat the SRS data-dictionary types (`Long`, `Password` columns,
Mongo-style arrays) as a mandate to recreate that physical schema — they are conceptual.

## 16. Leaderboard Requirements

Verified current state: ✅ Phase 4 **mock UI** at `/leaderboards` (`Leaderboard.jsx`, in-memory
`leaderboardMock.js`). No table, query, or API. SRS/use-case/DFD/ER still require a real
Leaderboard (student “Check Leaderboard ranking”; admin “Check leaderboard and ranking”; DFD2 store
`Leaderboards`; ER `LeaderboardId`, `{StudentId}`, `{Points}`, `SubjectId`, `{TotalTests}`).
Student sequence: VIEW LEADER BOARD RANKING → REQUEST RANKING → SHOW RANKING.

Implemented in the mock UI (owner-specified Phase 4; SRS also names global + peer/friend ranking —
peer/friend is **not** in this UI):
- Students see only leaderboards they participate in / that are relevant to them.
- If a student attempted an exam but is outside the Top 100: still show the Top 100 **and** the
  student's own rank + percentile.
- Admins see all leaderboards (mock), with compact filters: Course, Semester, Subject, Student Name.
  Dependency rule: choosing a Course restricts the Subject list to that course's subjects and the
  Semester list to that course's semesters.
- Admin view: search, filtering, results, ranking. Persistence is still 📝.
- Data dependency: ranks need persisted attempts, which today sit behind the Firebase identity gap
  (§9) — resolve that (or define a Supabase-side attempts table) before promising real leaderboards.

## 17. Feedback Management Requirements

Verified current state: `FeedbackPage.jsx` (public route) posts to `/api/feedback`, which renders and
**emails** the message (types: general/bug/feature/content/ai, 1–5 stars, optional name/email/subject).
There is **no feedback store** — no table, no Firestore write — so nothing exists to list, filter,
bookmark or mark seen. The `feedback` collection exists in `firestore.rules` (create `if true`,
read/update `isAdmin()`, delete `isSuperAdmin()`) but no app code writes it.

📝 Planned admin feedback UI (Phase 2 visualization on mock/empty data; persistence is a later
decision): Total Feedback / Seen Feedback / **Remaining = Total − Seen**, shown as one professional
chart/progress visualization (pick the form that fits the data — a bar/stacked bar or a progress
donut, not decoration). Per-item actions from `adminflowchart.jpg` / use-case / sequenceadmin:
Set User as Spam (Select User, Confirm & Flag), Set Feedback as Spam, Bookmark Feedback, Set as
Seen; plus a spam-users list on the admin dashboard.

SRS Appendix A Table 1.8 / ER `FeedBacks`: `FeedbackId`, `Description`, `Type`, `isSpam`,
`isBookmark`, `isSeen`, `StudentId`. DFD1/2 process “Feedback management”. Class-diagram operations:
`giveFeedback`, `readFeedback`, `markAsSpam`, `markAsBookmark`, `markAsSeen`.

Implementing any of this for real requires first deciding where feedback is stored (Supabase table
+ migration, or Firestore once the identity bridge exists) — that is a real design decision, not a
cleanup. Do not pretend `api/feedback.js` email is that store.

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
search, user guide, role gating of `/admin/syllabus`, the auth-page success overlay + the password
requirement list,
the service-role-key boot guard, and the `npm run build`/`npx vitest run` gates (18 files / 227 tests).

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
`deploy` → `vercel --prod`; `deploy:rules` publishes `firestore.rules`. Remote `origin` is
`https://github.com/dakshhadvani19/prep_master_.git` (plain HTTPS; no credential in the URL or in
`git config`). This sandbox has no persisted GitHub credential; do not write one. Post-deploy
checks: CSP console clean, a real login, a Google round trip, `/api/send-otp` not 502, and (once
staff exists) an admin sign-in.

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
- **The password meter is the checklist only, no ring** (owner decision, 2026-09-25, GitHub commit
  `2ca9fe8` "Remove password strength counter", merged back into `main`). The dead
  `.strength-ring*` rules were left in `Auth.css` on purpose: they are inert without markup, and
  `--ring-track` next to them is still used by the OTP countdown ring.
- **Docs are repo-backed** (this file): future sessions must not depend on chat history.
- **SRS/diagrams refreshed 2026-09-25** (owner `4804603` “docs: update SRS and sync current
  codebase”). Authoritative filenames are the `*_3_9.jpg` / undated current set listed in §1.
  Deleted from the repo (do not recreate, do not cite as if present): `finaladmin_25_8.jpg`,
  `finalclass_25_8.jpg`, `studentfinal_25_8.jpg`, and every `*_25_8.jpg`. Class + activity
  diagrams remain inside `SRS_last_updated_print.pdf`.
- **Admin Google OAuth is a first-class SRS path** (`adminflowchart.jpg`, admin activity
  diagram, use-case “Create account / Sign in with google”, DFD0 admin Login/Signup credentials).
  Phase 1 already authenticates admins through the same Google redirect as students; it does
  **not** auto-provision `public.admins`. Keep that split.
- **Landing-page Google CTA is intentionally commented out** (same owner commit). Google remains
  on `/signup`. Do not restore the button unless asked.
- **`admin_role_for_uid` pins `search_path = public, pg_temp`** (aligned with the OTP functions;
  one-line hardening 2026-09-25). If an older copy with `search_path = public` was already applied
  live, re-run this `CREATE OR REPLACE FUNCTION` file.
- **Phase 2 admin shell (2026-09-26):** `/dashboard` is role-switched, not duplicated; admin navbar
  is AuthContext-driven; super-admin staff controls are `isSuperAdmin` only; no `public.admins`
  writes from the UI.
- **Phase 3 catalog UI (2026-09-26):** `/admin/courses` is in-memory Course → Semester → Subject →
  Question CRUD (semesters select-only). No tables, no API, no persistence. Student catalog remains
  `mockData.js`.
- **Phase 4 leaderboard UI (2026-09-26):** `/leaderboards` is in-memory Top 100 + own rank/percentile
  (students) and Course → Semester → Subject all-boards (admins). No tables, no API, no persistence.

## 26. Future Planned Work (owner's phase plan)

1. **Phase 1 — Real admin authentication.** ✅ code-complete in this repo (see §6); operator steps
   (apply migration, insert the staff row) are outstanding.
2. **Phase 2 — Admin UI shell + role-aware navigation + admin dashboard.** ✅ UI-complete in this
   repo (no persistence). `/dashboard` is `DashboardSwitch`: students keep `Dashboard.jsx`, staff
   see `AdminDashboard.jsx`. Navbar Home→Dashboard and Subscriptions→Courses for admins only.
3. **Phase 3 — Courses / Subjects / Questions: mock UI.** ✅ UI-complete in this repo (no
   persistence). Course → Semester → Subjects → Questions with Add/Edit/Update/Remove for
   courses, subjects, and questions (semesters select-only), following `SRS/adminflowchart.jpg`
   (Edit Subject / Edit Question), the use-case “Choose course and subject”, ER Courses/Subjects/
   TestsData, and SRS §3.2 Content Management; storage decision documented before any persistence.
4. **Phase 4 — Leaderboard UI.** ✅ UI-complete in this repo (no persistence). Student-scoped
   boards, Top 100 + self rank/percentile; admin all-boards view with Course → Semester → Subject
   dependent filters. Storage/attempts still blocked by §9 before real ranks.
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
- `AUTH.md` §9 rate-limit copy matches `api/_otpStore.js` (`MAX_IP_PER_WINDOW = 20`).
- `api/feedback.js` hard-codes the owner's email address as its recipient (no fallback env var).
- Gmail app-password quota is a real ceiling on a cohort signup day; a transactional provider is the
  eventual replacement.
- Bundle sizes: ExamPortal and the pdf.worker chunk are large (`pdfjs-dist`); the 600 KB
  `chunkSizeWarningLimit` is intentional.
- One-off root scripts import packages that are not in `package.json` (`pdf-parse`, `pdf2json`,
  `playwright`) — they are offline tooling, deliberately not installed.
- Admin UI is Phase 2 shell + Phase 3 mock catalog + Phase 4 mock leaderboard: a real admin lands
  on `AdminDashboard.jsx`; `/admin/courses` and `/leaderboards` are in-memory. Writes (staff, spam,
  feedback, catalog, leaderboard) are still preview-only.
- **SRS vs running stack (do not “fix” code to match the stack paragraph):** the PDF still names
  MERN, MongoDB, JWT, Socket.io, Tailwind CSS v4. The running app is Vite + React 19, Supabase Auth
  + Postgres, Firebase Firestore/Storage, Vercel serverless, and CSS design tokens. Follow the
  **diagrams and functional requirements**; do not migrate the stack because of that prose.
- **SRS vs auth tables:** Appendix A Tables 1.1/1.2 and the ER diagram still list `Password` on
  Students and Admins. Implementation: passwords live only in Supabase Auth; `public.admins` has
  **no** password column and none may be added (`AUTH.md` §7). Document the difference; do not add
  the column.
- **SRS student features not in Phases 2–5** (still 📝, do not sneak them into an admin task):
  test rooms (create/join/share, timer & participants), subscriptions/tokens/payment/refund,
  “Available Tokens/Plan?” gates on Choose exam and Create test room (`updated_student_flow.jpg`,
  DFD Payment management, ER Subscriptions/Subscribers). Navbar `/subscriptions` is a dead link.

---

### Appendix A — Traceability to current `SRS/` diagrams

These are the files that exist **now**. Do not cite `*_25_8.jpg`, `finaladmin_*`, `finalclass_*` or
`studentfinal_*` — they were removed in `4804603`.

**Implemented vs planned vs mock** (do not describe 📝 as ✅):

| Area | Status |
| --- | --- |
| Student email+password, Google, OTP signup, password recovery | ✅ |
| Admin authentication through the same Supabase Auth + `public.admins` lookup | ✅ Phase 1 |
| Super vs standard role flag (`is_super_admin`) | ✅ resolution only; 📝 no dashboard split UI |
| Student exam catalog / take test / review (static data + Firestore history) | ⚠️ history blocked by Firebase-identity gap (§9) |
| Syllabus Admin page | ⚠️ UI exists; writes blocked by §9 |
| Admin Dashboard, role-aware nav, staff management UI | ✅ Phase 2 UI shell (mock writes); 📝 Phase 5 persistence |
| Courses / Subjects / Questions admin CRUD | ✅ Phase 3 mock UI (`/admin/courses`); 📝 no persistence (student catalog still static `mockData.js`) |
| Leaderboards | ✅ Phase 4 mock UI (`/leaderboards`); 📝 no persistence |
| Feedback store + admin moderation | 📝 — student form emails the owner; no store |
| Test rooms, subscriptions, payments, token gates | 📝 SRS-required, **outside** Phases 2–5 |

| Diagram (`SRS/`) | What it governs | Repo status |
| --- | --- | --- |
| `SRS_last_updated_print.pdf` | IEEE SRS (scope, FR/NFR, Appendix A data dictionary, Figures 1.1–7.1) | authoritative requirements text; the stack paragraph is **not** the running stack (§27) |
| `ER_Diagram_last_updated_3_9.jpg` | Students{StudentId, FullName, Email, Password, IsSpam}; Admins{AdminId, FullName, Email, Password, isSuperAdmin}; Courses{CourseId, Sems, CourseName}; Subjects{SubjectId, SubjectName, CourseId}; TestsData{TestId, Questions, Answers, Options}; TestAttempts; TestRooms; FeedBacks{FeedbackId, Description, Type, isSpam, isBookmark, isSeen, StudentId}; Leaderboards; Subscriptions; Subscribers | ⚠️ Students/Admins mirrored as `public.students` / `public.admins` with **Password satisfied by Supabase Auth, not a table column**; other entities 📝 |
| `UseCase_Diagram_last_updated_3_9.jpg` | Student: Choose exam/Give tests, Review Analysis, Create account (Google + email), Join/Create test room (+ Share), Give Feedback, Login (email+password **and Google**), Change question preference, Forgot Password, Check Leaderboard, Logout, Choose Subscription (Make payment / Make refund). Admin: Login (email+password), Logout, Remove/Add admin, Check leaderboard, Set user as spam, Edit question / Edit Subject (include Choose course and subject), Forgot Password, Read Feedback (include Set feedback as spam, Bookmark, Set as seen), Make an admin a super admin, **Create account (include Sign in with google)** — this last bubble is new vs the 25_8 diagram | student auth ✅; admin auth ✅; everything else 📝 |
| `adminflowchart.jpg` | Start → Sign in with Google **or** login (email+password, Continue with Google, Forgot Password → email reset) → Credentials/Google valid? → **is super admin?** → Super Admin Dashboard (Add Admin / Remove Admin / Add Super Admin) **or** Standard Admin Dashboard → Dashboard → Leaderboard, Read Feedback, Edit Subject, Edit Question → feedback actions → Logout. **Change vs 25_8:** Google is a first-class start path, not email-only | ✅ auth / validation / is-super-admin branch / forgot-password / Google-can-auth-an-admin; 📝 every dashboard/management node |
| `sequenceadmin.jpg` | Admin ↔ Authentication / Email / Dashboard / Admin management / Leaderboard / Feedback / Subject / Question / Creating another SuperAdmin / Database | 📝 Phase 2–5; login/reset ✅ |
| `sequencestudent.jpg` | Student ↔ Auth / Email / Google / Dashboard / Exam / Test room / Feedback / Leaderboard / Preference / Subscription / Database | ⚠️ exam path on static data; Google/auth/OTP ✅; rooms/leaderboard/subscription 📝 |
| `updated_student_flow.jpg` | Register? → Login (email+password or Google) or Sign Up (Google, or email+password → OTP → credentials valid) → Student Dashboard → Choose Exam (**Available Tokens/Plan?**) / Join Test Room / Create Test Room (token gate, timer & participants, share code) / Review Analysis / Give Feedback / Leaderboard / Change Question Preference / Choose Subscription (pay / refund) | auth+OTP ✅; dashboard/exam ⚠️; token gates, rooms, subscription 📝. **Change vs 25_8:** explicit token/plan diamonds on Choose Exam and Create Test Room |
| `DFD0_last_updated_3_9.jpg` | Student and Admin as external entities around System. Admin inbound includes Login, Signup, Add/Remove admin, Feedback flag, Set user spam, Edit Subjects/Questions, Forget password | mixed |
| `DFD1_last_updated_3_9.jpg` | Processes: Student auth+dashboard; Test and testroom; Admin auth+dashboard (incl. Make an admin super admin); Feedback management; Payment management | student auth ✅; others 📝 |
| `DFD2_last_updated_3_9.jpg` | Same processes + stores Students, TestsData, TestsAttempts, TestsRooms, Courses, Feedbacks, Leaderboards, Admins, Subscription, Subscribers | only `public.students` / `public.admins` / `public.auth_otp` exist in-repo as Postgres; exam history is Firestore |
| PDF Fig 3.1 / 3.2 | Student / Admin activity (same content as the flowcharts, including admin Google) | same status as the flow jpgs |
| PDF Fig 7.1 Class Diagram | Operations on the ER entities (e.g. Admins.`login with google`, `addAdmin`, `removeAdmin`, `setUserAsSpam`) | 📝 except login/logout/Google |

### Appendix B — Where to read more

`global-exam-prep/AUTH.md` (§1–§10: Firebase checklist, env, rules, doc shape, registration flow,
routes, roles, follow-ups, Supabase dashboard checklist, Firebase-bridge gap) ·
`global-exam-prep/context/CODEBASE_DEEP_EXPLANATION.txt` · `progress.txt` + `progressByAi.txt`
(owner notes/changelog) · the SQL files under `supabase/migrations/` (authoritative for what this repo
defines) · `firestore.rules` (authoritative for the Firestore paths).
