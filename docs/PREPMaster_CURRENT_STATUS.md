# PrepMaster — Current Status

Update this file after **every** Agent Mode task. Keep it short, factual, and code-verified.
Long-term rules and architecture live in `PREPMaster_PROJECT_CONTEXT.md` (same folder).

**Last updated:** 2026-09-25 (documentation task that created `docs/`)
**Verified by:** inspecting the working tree and running the test suite; nothing here is inferred
from chat history.

## Repository state

| Item | Value |
| --- | --- |
| Git root / app dir | `/home/user/prep_master_` / `global-exam-prep/` |
| Branch | `main` |
| HEAD | `7f73d70` — `revert(cleanup): keep three files that were removed for tidiness, not necessity` |
| Working tree | dirty: **11 entries** in `git status --porcelain` — 6 modified + 5 untracked (the 4 Phase 1 files + `docs/`, which holds the 2 files from this task). Nothing was committed, per instruction |
| Remote | none configured in this clone; pushes are the owner's step |

Uncommitted changes right now:
```
 M global-exam-prep/AUTH.md                            (admin-role section + deploy gate row)
 M global-exam-prep/src/context/AuthContext.jsx         (loadIdentity, adminRecord, role from admins)
 M global-exam-prep/src/utils/supabaseAuth.js           (+ resolveAuthorization / deriveRole / guards)
 M global-exam-prep/tests/auth-flows.test.jsx           (RBAC block → new authority)
 M global-exam-prep/tests/auth-routing.test.jsx         (staff rows instead of students.role)
 M global-exam-prep/tests/supabaseMock.js               (rpc + admins seams)
?? global-exam-prep/supabase/migrations/20260925150000_admin_role_lookup.sql   (119 ln)
?? global-exam-prep/tests/admin-auth.test.jsx           (13 tests)
?? global-exam-prep/tests/admin-authorization.test.js   (10 tests)
?? global-exam-prep/tests/admin-role-sql.test.js        (12 tests, real Postgres)
?? docs/PREPMaster_PROJECT_CONTEXT.md and docs/PREPMaster_CURRENT_STATUS.md      (this task)
```

## Architecture snapshot (verified)

React 19 + Vite SPA (`BrowserRouter`, lazy routes, manual vendor chunks, brotli+gzip). Identity and
role resolution are Supabase (`src/supabase.js`, `src/utils/supabaseAuth.js`, `src/context/AuthContext.jsx`).
Profiles/authorization are Postgres tables `public.students` / `public.admins` behind RLS. Signup is
gated by a custom server-issued email OTP (`api/send-otp`, `api/verify-otp`, `api/_otpStore.js`,
`public.auth_otp`). Firestore + Storage are **still used** for exam history and syllabus files
(`src/firebase.js`, imported by five live modules, and `firestore.rules`) — intentionally not removed. Feedback is emailed
(`api/feedback.js`), not stored. Courses/Subjects/Questions are **static data**
(`src/data/mockData.js`). No leaderboard exists (nav link only, no route).

## Authentication state

✅ Email+password and Google (redirect + PKCE) via Supabase Auth; single `onAuthStateChange` owner;
session restored on refresh; forgot/reset password = Supabase `resetPasswordForEmail` →
`PASSWORD_RECOVERY` → `updateUser`, shared by students and admins; profiles created by the DB trigger
only; the client can write only its own `full_name`; no service-role key in the browser and the client
refuses to boot with one.

## Admin authentication state (Phase 1)

✅ **Implemented in code (uncommitted).** Flow: Supabase Auth → `auth.uid()` →
`resolveAuthorization()` → the caller's own `public.admins` row via the security-definer RPC
`public.admin_role_for_uid()` (no arguments, `search_path`-pinned, execute for `authenticated` only),
falling back to a self-read `select` only when that function is not deployed →
`deriveRole(row)`: `student` | `admin` | `superAdmin` (`is_super_admin`).
Role lives only in `AuthContext` (`role`, `isAdmin`, `isSuperAdmin`, `hasRole`, `adminProfile`,
`authorizationError`) and is re-resolved on login, Google return, refresh, signup and recovery;
cleared by logout/`SIGNED_OUT`. Fail-closed everywhere: a row for a different uid is discarded
(`ADMIN_UID_MISMATCH`), a failed lookup yields `student` + a visible `authorizationError`.
`public.students.role` is **no longer** an authorization source (owner-updatable column = privilege
escalation path); it is still returned on `studentData` as data. Nothing writes `public.admins`;
Google sign-in never auto-provisions staff; no admin password exists outside Supabase Auth;
no admin flag is stored in `localStorage`/`sessionStorage`.

⚠️ **Outstanding operator steps (not code issues):** apply
`supabase/migrations/20260925150000_admin_role_lookup.sql` and `…20260905120000_auth_otp.sql` to the
live project; set `OTP_PEPPER`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GMAIL_USER`,
`GMAIL_APP_PASSWORD` in Vercel production; insert the staff row for the existing admin's
`auth.users` id. Until either that function is applied or a self-read policy exists on `public.admins`, an admin session resolves to `student` (fail-closed, with `authorizationError` set).

## Phase status

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Real admin authentication (+ authorization resolution) | ✅ code-complete, tested, **uncommitted**; deployment steps above outstanding |
| 2 | Admin UI shell, role-aware navigation (Home→Dashboard, Subscriptions→Courses for admins), admin Dashboard (feedback Total/Seen/Remaining chart, spam users) | 📝 not started — no admin UI exists beyond `SyllabusAdmin` |
| 3 | Courses → Semester → Subjects → Questions admin UI (add/edit/update/remove subject & question) | 📝 not started (verified: no subject/question CRUD code, no such tables in migrations) |
| 4 | Leaderboard UI (student-scoped, Top 100 + own rank/percentile, admin all-boards + dependent filters) | 📝 not started (verified: no route/page/query) |
| 5 | Final admin integration / QA for both roles | 📝 not started |

## Completed earlier phases (context)

`ff828a5` Supabase auth + Google return leg + OTP moved to Postgres + CSP fix · `d8caee7`/`7f73d70`
safe-cleanup audit (net effect: 3 provably dead files removed; `@google/generative-ai` and
`canvas-confetti` kept and flagged) · delivered export bundle
`/home/user/export/PrepMaster_Final_Cleaned_Codebase.zip` (172 files, sha256
`aaf63780ccae79e8a3581a89b8327d362c4f8a46c8c346ea8b39b56a0982919b`) — regenerated from `7f73d70`,
i.e. it does **not** contain Phase 1.

## Important recent changes (Phase 1, for review)

- `src/utils/supabaseAuth.js`: +`resolveAuthorization`, `deriveRole`, `acceptAdminRow`,
  `ADMIN_LOOKUP_FUNCTION`, `ADMIN_UID_MISMATCH`, `ADMIN_COLUMNS`.
- `src/context/AuthContext.jsx`: `loadStudentProfile` → `loadIdentity` (profile **and** role in one
  owner, one uid claim, stale-answer guard); role memo; clears; `loadIdentity` used by
  signup-verify, password-recovery and `refreshStudentProfile`.
- New migration `20260925150000_admin_role_lookup.sql` (function + grants only: no table, column,
  policy or row changes; `notify pgrst`).
- Tests updated for the new authority + 35 new tests across 3 files; `supabaseMock` gained
  `rpc`/admins seams.
- `AUTH.md` §7 rewritten (admin status now from `public.admins`) + a deploy-checklist row.
- No page, component, route, Firebase, OTP, Vercel, env or dependency file was modified.

## Known issues / caveats (pre-existing unless marked)

1. Both migrations are **unapplied** to the live Supabase project (Phase 1 + OTP flows depend on them).
2. Vercel env vars listed above are missing in production → `/api/send-otp` 502 `store_unavailable`.
3. Firestore/Storage paths require a Firebase identity, so exam-history saves and syllabus admin
   writes fail for a Supabase session (`AUTH.md` §10). Not worked around on purpose.
4. `firestore.rules` still describes the old model (admin bootstrapped by editing `students/{uid}.role`
   in the console) — stale wording for authorization now that `public.admins` decides. Untouched.
5. `/leaderboards` and `/subscriptions` navbar links have no routes → `NotFound`.
6. `README.md` at the repo root contains an unresolved git merge-conflict marker block.
7. `AUTH.md` §9 says "12/IP"; code uses `MAX_IP_PER_WINDOW = 20` (code is correct).
8. `api/feedback.js` emails a hard-coded owner address; no feedback persistence exists.
9. 45 pre-existing ESLint problems (baseline); the only one in touched files is the long-standing
   `AuthContext.jsx` react-refresh note.
10. Sandbox limits: no `.env`, no live DB read access, `node_modules`/`dist` are pruned between
    sessions (`npm install` before running gates), and pushes have no credentials.
11. Minor hardening candidate (not applied in a docs task): the admin-lookup migration pins
    `search_path = public` where the OTP migration pins `public, pg_temp`.
12. ❓ `public.students` / `public.admins` exact DDL (PK/FK/`ON DELETE CASCADE`/identity/trigger/
    policies/grants) is **not verifiable from this repo** — no migration defines it.

## Next intended task

**Phase 2** — admin UI shell + role-aware navigation (admins: Home→Dashboard, Subscriptions→Courses;
other two options unchanged) + the admin Dashboard with the feedback
Total / Seen / **Remaining (= Total − Seen)** visualization and a spam-users list, reusing the existing
light-purple + dark-neutral language with restrained gold (`#ffb454` family) reserved for important,
selected and super-admin emphasis. No persistence changes, no `public.admins` write path, no auth
behaviour changes — the role plumbing from Phase 1 already feeds `hasRole`/`isAdmin`.

## Verification snapshot (re-run these before claiming anything)

```
cd global-exam-prep && npm install        # only if node_modules was pruned
npx vitest run     → 17 files / 216 tests passed   (2026-09-25)
npm run build      → built OK, dist = 74 files
npm run lint       → 45 problems (40 errors, 5 warnings) — unchanged baseline
```
Do not commit or push unless the owner explicitly asks.
