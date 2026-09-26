# PrepMaster — Current Status

Update this file after **every** Agent Mode task. Keep it short, factual, and code-verified.
Long-term rules and architecture live in `PREPMaster_PROJECT_CONTEXT.md` (same folder).

**Last updated:** 2026-09-26 (Phase 3 — admin Courses / Subjects / Questions mock UI)
**Verified by:** reading the working tree, `npx vitest run` (19 files / 238 tests), `npm run build`.

## Repository state

| Item | Value |
| --- | --- |
| Git root / app dir | `/home/user/prep_master_` / `global-exam-prep/` |
| Branch | `main`, tracking `origin/main` |
| HEAD at last fetch | `2d4e10e` `Merge remote-tracking branch 'origin/main'` (Phase 2 `1dfd8f8` + `cb5ea6f` search_path) |
| This session | **not committed, not pushed.** Phase 3 UI + tests + docs in the workspace. Do not include leftover `AUTH.md`. |

## Architecture snapshot (verified)

React 19 + Vite SPA. Identity/role = Supabase Auth → `auth.uid()` → `public.admins` lookup (Phase 1).
`/dashboard` is `DashboardSwitch`. Navbar is role-dependent. Feedback email-only. Student catalog is
static `mockData.js`. Admin catalog at `/admin/courses` is **in-memory** (`AdminCourses.jsx` seed).
No leaderboard/test-room/subscription implementation.

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
| 3 | Courses / Subjects / Questions UI | ✅ **UI complete, in-memory only.** No schema, no API, no persistence. |
| 4 | Leaderboard UI | 📝 not started (dashboard card + navbar link only) |
| 5 | Final admin integration / QA | 📝 not started |

## What Phase 3 implemented (UI)

- `/admin/courses` (`ProtectedRoute requiredRole="admin"`) is a catalog, not a placeholder.
- Hierarchy: Course → Semester → Subjects → Questions with dependent selection.
- Mock Add / Edit / Update / Remove for **Courses**, **Subjects**, and **Questions**.
- Semesters: list/select from the course Sems list only (no semester CRUD).
- Edit Subject / Edit Question include Choose course (and subject).
- Question fields follow TestsData + `questionGenerator.js`: objective `text` / `options[]` / `answer`;
  subjective `text` / `marks`. No invented difficulty/tags/explanations.
- Completion toast: `Preview only — no data was changed.` Destructive confirm stays professional.
- Distinct hover per object (course shine, semester lift, subject slide+bar, question gold underline).
- Student navbar (Home / Subscriptions) unchanged. No `public.admins` writes. No new migrations.

## What remains mock-only

Feedback counts and rows, spam list, staff add/remove/promote, **catalog persistence**, leaderboard
data. Student exam catalog is still `mockData.js`. No new tables.

## Next intended task

**Phase 4** — Leaderboard UI (not started). Do not start it from this status file.

## Verification snapshot

```
npx vitest run  → 19 files / 238 tests passed
npm run build   → built OK
```

Do not commit or push unless the owner explicitly asks.
