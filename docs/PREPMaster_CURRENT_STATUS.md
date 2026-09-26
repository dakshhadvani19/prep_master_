# PrepMaster — Current Status

Update this file after **every** Agent Mode task. Keep it short, factual, and code-verified.
Long-term rules and architecture live in `PREPMaster_PROJECT_CONTEXT.md` (same folder).

**Last updated:** 2026-09-26 (Phase 5 — staff RPC + overflow QA; **not committed**)
**Verified by:** reading the working tree, `npx vitest run` (22 files / 258 tests), `npm run build`, eslint on files this pass touched (pre-existing AdminDashboard unused-`motion` + react-refresh errors left alone).

## Repository state

| Item | Value |
| --- | --- |
| Git root / app dir | `/home/user/prep_master_` / `global-exam-prep/` |
| Branch | `main`, tracking `origin/main` |
| Last pushed HEAD | `285d458ce4e968cba3d42ecd7cfceea4865bc662` `feat(ui): animate admin command orrery` |
| Working tree | **dirty, not committed** (owner: do not commit / do not push unless asked) |
| Dirty paths | Phase 5 staff RPC + CSS overflow, tests, this status file, PROJECT_CONTEXT staff-write notes |

## Architecture snapshot (verified)

Unchanged stack. React 19 + Vite SPA. Auth/role = Supabase Auth → `public.admins` via `admin_role_for_uid()`. Catalog, leaderboard, feedback store, and spam remain in-memory / email mocks — **no tables invented**. Staff writes now have a repo SQL function; it is **not** applied on the live project until the operator runs it.

## Authentication state

Unchanged. OTP, Google OAuth, password recovery, Firebase, RLS grants on tables — not modified. Role owner remains AuthContext + `deriveRole`. No password column on `public.admins`. No client INSERT/UPDATE/DELETE on `public.admins`.

## Phase status

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Real admin authentication + authorization resolution | ✅ implemented (live apply/insert outstanding) |
| 2 | Admin UI shell + role-aware navigation + Admin Dashboard | ✅ UI complete |
| 3 | Courses / Subjects / Questions UI | ✅ UI complete, in-memory only |
| 4 | Leaderboard UI | ✅ UI complete, in-memory only |
| 5 | Final admin integration / QA | ⚠️ **in repo, not complete** — staff RPC wired; catalog/leaderboard/feedback still mocked; live staff SQL unapplied |

## What this pass did

Phase 5 (authorized), no redesign:

- Super-admin staff path: `public.manage_admin_staff(p_action, p_email, p_full_name)` in `supabase/migrations/20260926180000_manage_admin_staff.sql`. Actions `add` / `remove` / `add_super`. Caller is `auth.uid()`. Standard admin and student get `42501`. Add requires an existing `auth.users` email (`no_auth_user` otherwise). Cannot remove self. Execute granted to `authenticated` only. Table grants unchanged.
- App: `manageAdminStaff()` in `src/utils/supabaseAuth.js`; Admin Dashboard Confirm calls that RPC. Never writes `public.admins` from the client. The staff list in the Remove modal is still the preview roster (no list RPC / no catalog table).
- Routing/roles: existing ProtectedRoute + DashboardSwitch unchanged; student blocked from `/admin/*`; staff nav from AuthContext `isAdmin`; super-admin-only staff buttons.
- Geometry: overflow-x clip + wrap/ellipsis on admin dashboard, catalog titles/questions, leaderboard names/filters; staff modal and catalog drawer max-height. Gold CTA underline **not** restored. No strength ring. Landing Google CTA stays commented.
- Honest blockers: no in-repo DDL for courses/subjects/questions/leaderboards/feedbacks — those UIs stay mock. Feedback still `/api/feedback` email. Semesters remain selection-only.

## Next intended task

Operator: apply `20260925150000_admin_role_lookup.sql` (if not already) and `20260926180000_manage_admin_staff.sql` on the live project. Catalog/leaderboard/feedback persistence needs real DDL (ask, don’t invent). Commit/push only if the owner asks.

## Verification snapshot

```
npx vitest run  → 22 files / 258 tests passed
npm run build   → built OK (pre-existing circular vendor chunk + large-chunk warnings)
eslint (this pass) → no new errors; AdminDashboard.jsx still has pre-existing unused `motion` + react-refresh
```
