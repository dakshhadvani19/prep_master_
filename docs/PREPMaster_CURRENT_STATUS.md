# PrepMaster — Current Status

Update this file after **every** Agent Mode task. Keep it short, factual, and code-verified.
Long-term rules and architecture live in `PREPMaster_PROJECT_CONTEXT.md` (same folder).

**Last updated:** 2026-09-26 (Phase 4 — leaderboard mock UI)
**Verified by:** reading the working tree, `npx vitest run` (20 files / 248 tests), `npm run build`, `npm run lint`.

## Repository state

| Item | Value |
| --- | --- |
| Git root / app dir | `/home/user/prep_master_` / `global-exam-prep/` |
| Branch | `main`, tracking `origin/main` |
| HEAD at last fetch | `78ab873` `feat(admin): add courses subjects and questions UI` |
| This session | Phase 4 UI + tests + docs. Do not include leftover `AUTH.md`. |

## Architecture snapshot (verified)

React 19 + Vite SPA. Identity/role = Supabase Auth → `auth.uid()` → `public.admins` lookup (Phase 1).
`/dashboard` is `DashboardSwitch`. Navbar is role-dependent. Feedback email-only. Student catalog is
static `mockData.js`. Admin catalog at `/admin/courses` is in-memory. Leaderboard at `/leaderboards`
is in-memory (`leaderboardMock.js`). No test-room/subscription implementation.

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
| 3 | Courses / Subjects / Questions UI | ✅ **UI complete, in-memory only.** |
| 4 | Leaderboard UI | ✅ **UI complete, in-memory only.** No schema, no API, no persistence. |
| 5 | Final admin integration / QA | 📝 not started |

## What Phase 4 implemented (UI)

- `/leaderboards` (`ProtectedRoute`) — guests go to Log in.
- Students: participating boards only, Top 100, own rank + percentile (even outside Top 100).
- Admins / super admins: all-boards view, Course → Semester → Subject dependent filters, name search.
- Super admin gets the same admin board — no extra leaderboard privileges.
- Mock overlay of the signed-in student onto seeded ranks. ER-shaped fields: points, tests, subject.
- Completion toast: `Preview ranks — no data was changed.`
- Student navbar (Home / Subscriptions) unchanged. No `public.admins` writes. No new migrations.

## What remains mock-only

Feedback store, spam list, staff add/remove/promote, catalog persistence, **leaderboard persistence**.
Student exam catalog is still `mockData.js`. No new tables.

## Next intended task

**Phase 5** — final admin integration / QA (not started). Do not start it from this status file.

## Verification snapshot

```
npx vitest run  → 20 files / 248 tests passed
npm run build   → built OK
npm run lint    → 43 errors / 5 warnings, pre-existing except Leaderboard.jsx
                  unused `motion` (same false-positive as AdminCourses / LandingPage).
                  Not cleaned (out of Phase 4 scope).
```

Do not commit or push unless the owner explicitly asks.
