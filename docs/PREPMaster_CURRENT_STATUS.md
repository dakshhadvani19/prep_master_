# PrepMaster — Current Status

Update this file after **every** Agent Mode task. Keep it short, factual, and code-verified.
Long-term rules and architecture live in `PREPMaster_PROJECT_CONTEXT.md` (same folder).

**Last updated:** 2026-09-26 (Phase 2 — admin UI shell + role-aware navigation + Admin Dashboard)
**Verified by:** reading the working tree, `npx vitest run` (18 files / 227 tests), `npm run build`.

## Repository state

| Item | Value |
| --- | --- |
| Git root / app dir | `/home/user/prep_master_` / `global-exam-prep/` |
| Branch | `main`, tracking `origin/main` |
| HEAD at last fetch | `4804603` `docs: update SRS and sync current codebase` |
| This session | **not committed, not pushed.** Phase 2 UI + docs in the workspace |

## Architecture snapshot (verified)

React 19 + Vite SPA. Identity/role = Supabase Auth → `auth.uid()` → `public.admins` lookup (Phase 1).
`/dashboard` is `DashboardSwitch`: students keep `Dashboard.jsx`; admin / superAdmin get
`AdminDashboard.jsx`. Navbar is role-dependent. Feedback email-only. Catalog is static
`mockData.js`. No leaderboard/test-room/subscription implementation.

## Authentication state

Unchanged from Phase 1. Same Supabase Auth for students and admins. This phase did **not**
modify OTP, Google OAuth, password recovery, the admin-role RPC, or migrations.

## Admin authentication state (Phase 1)

✅ Code-complete. Operator steps still outstanding (apply both migrations, Vercel env, insert
staff row). Until then an admin session fail-closes to `student`.

## Phase status

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Real admin authentication + authorization resolution | ✅ implemented (live apply/insert outstanding) |
| 2 | Admin UI shell + role-aware navigation + Admin Dashboard | ✅ **UI complete, mock-only beyond auth.** Persistence not started. |
| 3 | Courses / Subjects / Questions UI | 📝 not started (`/admin/courses` is a structure placeholder) |
| 4 | Leaderboard UI | 📝 not started (dashboard card + navbar link only) |
| 5 | Final admin integration / QA | 📝 not started |

## What Phase 2 implemented (UI)

- Role-aware navbar: guests/students keep Home + Subscriptions; admins see Dashboard + Courses + Leaderboards + Feedback.
- Authenticated admins have no Home: `/` → `/dashboard`. Logo → `/dashboard`.
- Admin Dashboard: Overview, Feedback overview (Total / Seen / Remaining = Total − Seen, CSS donut), preview feedback actions, Spam users structure, Courses / Leaderboard / Syllabus entry cards.
- Super Admin only (`isSuperAdmin`): Add Admin, Remove Admin, Add Super Admin mock modals — **no DB writes**.
- `/admin/courses` placeholder: Course → Semester → Subjects → Questions + anticipated Add/Edit/Update/Remove buttons (Phase 3 notices).

## What remains mock-only

Feedback counts and rows, spam list, staff add/remove/promote, subject/question CRUD, leaderboard data. No new tables. No `public.admins` writes. No API calls from the new UI.

## Next intended task

**Phase 3** — Courses / Subjects / Questions mock UI (real CRUD still not authorised unless a later task says so). Do not start it from this status file.

## Verification snapshot

```
npx vitest run  → 18 files / 227 tests passed
npm run build   → built OK
```

Do not commit or push unless the owner explicitly asks.
