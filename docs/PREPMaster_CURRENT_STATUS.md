# PrepMaster — Current Status

Update this file after **every** Agent Mode task. Keep it short, factual, and code-verified.
Long-term rules and architecture live in `PREPMaster_PROJECT_CONTEXT.md` (same folder).

**Last updated:** 2026-09-25 (GitHub reconciliation + commit; push still waiting on a credential)
**Verified by:** reading the working tree, running `npx vitest run` / `npm run build` / `npm run lint`,
and fetching `origin/main`. Nothing here is inferred from chat history.

## Repository state

| Item | Value |
| --- | --- |
| Git root / app dir | `/home/user/prep_master_` / `global-exam-prep/` |
| Branch | `main` (clean tree) |
| HEAD | the merge commit `chore(repo): merge GitHub main (strength-ring removal) …` on top of `9b9fadf` (docs) and `210748a` (Phase 1) |
| `origin` | `https://github.com/dakshhadvani19/prep_master_.git` (HTTPS; was re-added locally — `.git/config` is not snapshotted by this sandbox) |
| Remote tip at last fetch | `2ca9fe8` — now an **ancestor** of local `main`, so `git push origin main` is a clean fast-forward |
| Push status | **not pushed.** No credential exists in this sandbox: `git push` → `fatal: could not read Username for 'https://github.com': terminal prompts disabled` (exit 128). No `gh`, no `~/.ssh`, no `~/.git-credentials`, no token env var. Network itself is fine (anonymous fetch works) |

### What was committed

| Commit | Contents |
| --- | --- |
| `210748a` `feat(auth): resolve admin status from public.admins via auth.uid() (Phase 1)` | the whole Phase 1 code + migration + 35 tests + `AUTH.md` §7 |
| `9b9fadf` `docs: add repo-backed project context and current-status files` | `docs/` |
| merge commit | `origin/main`'s 6 commits brought in, plus the two follow-ups below |

The merge was **textually clean** and brought in exactly three paths: `SRS/SRS_last_updated_print.pdf`
(new), `firestore.rules` (**whitespace-only** rewrite — `diff -w` shows 0 changes, no policy effect),
and `Signup.jsx` (their `2ca9fe8` "Remove password strength counter"). Follow-ups made in the same
commit because their edit left the tree in a broken state:

- `src/pages/Signup.jsx`: dropped the two locals their ring removal left unused (`pct`, `color`) — they
  were 2 **new** ESLint errors. Lint is back to the 45-problem baseline.
- `tests/auth-strength-ring.test.js` → **renamed** `tests/auth-strength-meter.test.js` and rewritten:
  the old file asserted the ring markup their commit deleted, so GitHub's `main` currently fails its
  own suite (2 tests). The new file pins the owner's decision instead: the requirement list with
  `CheckCircle2`/`AlertCircle` ticks, the ring **absent**, `--ring-track` still declared (the OTP
  countdown ring paints with it), and the unchanged `checkPasswordStrength()` contract.
- Dead `.strength-ring*` rules stay in `Auth.css` deliberately (inert without markup; adjacent shared
  tokens are still needed).

## Architecture snapshot (verified)

React 19 + Vite SPA (`BrowserRouter`, lazy routes, manual vendor chunks, brotli+gzip). Identity and
role resolution are Supabase (`src/supabase.js`, `src/utils/supabaseAuth.js`,
`src/context/AuthContext.jsx`). Profiles/authorization are Postgres tables `public.students` /
`public.admins` behind RLS. Signup is gated by a custom server-issued email OTP (`api/send-otp`,
`api/verify-otp`, `api/_otpStore.js`, `public.auth_otp`). Firestore + Storage are **still used** for
exam history and syllabus files (`src/firebase.js`, imported by five live modules, plus
`firestore.rules`) — intentionally not removed. Feedback is emailed (`api/feedback.js`), not stored.
Courses/Subjects/Questions are **static data** (`src/data/mockData.js`). No leaderboard exists (nav
link only, no route). The password meter is now the tick-mark checklist only.

## Authentication state

✅ Email+password and Google (redirect + PKCE) via Supabase Auth; one `onAuthStateChange` owner;
session restored on refresh; forgot/reset = Supabase `resetPasswordForEmail` → `PASSWORD_RECOVERY` →
`updateUser`, shared by students and admins; profiles created by the DB trigger only; the client can
write only its own `full_name`; no service-role key in the browser and the client refuses to boot with one.

## Admin authentication state (Phase 1)

✅ **In `main`.** Supabase Auth → `auth.uid()` → `resolveAuthorization()` → the caller's own
`public.admins` row via the security-definer RPC `public.admin_role_for_uid()` (no arguments,
`search_path`-pinned, execute for `authenticated` only), falling back to a self-read `select` only
when that function is not deployed → `deriveRole(row)`: `student` | `admin` | `superAdmin`
(`is_super_admin`). Role lives only in `AuthContext` (`role`, `isAdmin`, `isSuperAdmin`, `hasRole`,
`adminProfile`, `authorizationError`), re-resolved on login, the Google return leg, refresh, signup
completion and password recovery, cleared on logout/`SIGNED_OUT`. Fail-closed: a row for another uid
is discarded (`ADMIN_UID_MISMATCH`); a failed lookup yields `student` + a visible
`authorizationError`. `public.students.role` is no longer an authorization source. Nothing writes
`public.admins`; Google sign-in never auto-provisions staff.

⚠️ **Outstanding operator steps (not code issues):** apply
`supabase/migrations/20260925150000_admin_role_lookup.sql` and `…20260905120000_auth_otp.sql` to the
live project; set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OTP_PEPPER`, `GMAIL_USER`,
`GMAIL_APP_PASSWORD` in Vercel production; insert the staff row for the existing admin's
`auth.users` id. Until either the function exists or a self-read policy is added, an admin session
resolves to `student` (fail-closed).

## Phase status

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Real admin authentication + authorization resolution | ✅ committed on `main`, tested; deployment steps above outstanding |
| 2 | Admin UI shell, role-aware nav (admins: Home→Dashboard, Subscriptions→Courses), admin Dashboard (feedback Total/Seen/Remaining chart, spam users) | 📝 not started — no admin UI beyond `SyllabusAdmin` |
| 3 | Courses → Semester → Subjects → Questions admin UI (add/edit/update/remove) | 📝 not started (verified: no CRUD code, no such tables) |
| 4 | Leaderboard UI (student-scoped, Top 100 + own rank/percentile, admin all-boards + dependent filters) | 📝 not started (verified: no route/page/query) |
| 5 | Final admin integration / QA for both roles | 📝 not started |

## Known issues / caveats (pre-existing unless marked)

1. **The push is not done** — needs a PAT/SSH key in this sandbox, or run `git push origin main` where
   the owner's GitHub login works. Local `main` is already fast-forwardable onto `2ca9fe8`.
2. Both migrations are **unapplied** to the live Supabase project.
3. Vercel env vars listed above are missing in production → `/api/send-otp` 502 `store_unavailable`.
4. Firestore/Storage paths need a Firebase identity, so exam-history saves and syllabus admin writes
   fail for a Supabase session (`AUTH.md` §10). Deliberately not worked around.
5. `firestore.rules` still describes the old student-role model in its comments; content is
   otherwise identical to GitHub's (whitespace-only difference now).
6. `/leaderboards` and `/subscriptions` navbar links have no routes → `NotFound`.
7. `README.md` at the repo root contains an unresolved git merge-conflict marker block.
8. `AUTH.md` §9 says "12/IP"; `api/_otpStore.js` uses `MAX_IP_PER_WINDOW = 20` (code is correct).
9. `api/feedback.js` emails a hard-coded owner address; no feedback persistence exists.
10. 45 pre-existing ESLint problems (baseline, unchanged by this work); the only one in touched files
    is the long-standing `AuthContext.jsx` react-refresh note.
11. Sandbox: no `.env`, no live DB read access, `node_modules`/`dist` may be pruned between sessions
    (`npm install` first), `.git/config` is not snapshotted (re-add `origin` after a fresh session).
12. Minor hardening candidate: the admin-lookup migration pins `search_path = public` where the OTP
    migration pins `public, pg_temp`.
13. ❓ `public.students` / `public.admins` exact DDL (PK/FK/`ON DELETE CASCADE`/identity/trigger/
    policies/grants) is **not verifiable from this repo** — no migration defines it.
14. GitHub's own `main` (`2ca9fe8`) left a red test suite and 2 new lint errors; fixed as part of the
    merge commit, so `main` here is green — pushing it also fixes the repo on GitHub.

## Next intended task

First: complete the push (credential needed). Then **Phase 2** — admin UI shell + role-aware
navigation (admins: Home→Dashboard, Subscriptions→Courses; other options unchanged) + the admin
Dashboard with feedback Total / Seen / **Remaining (= Total − Seen)** visualization and a spam-users
list, reusing the existing light-purple + dark-neutral language with restrained gold (`#ffb454`
family) reserved for important, selected and super-admin emphasis. No persistence changes, no
`public.admins` write path, no auth-behaviour changes — Phase 1 already feeds `hasRole`/`isAdmin`.

## Verification snapshot (re-run these before claiming anything)

```
cd global-exam-prep && npm install        # only if node_modules was pruned
npx vitest run     → 17 files / 218 tests passed   (2026-09-25, post-merge)
npm run build      → built OK, dist = 74 files
npm run lint       → 45 problems (40 errors, 5 warnings) — baseline
git status --porcelain && git log --oneline -3
```
Do not commit or push unless the owner explicitly asks (this session they did, for both).
