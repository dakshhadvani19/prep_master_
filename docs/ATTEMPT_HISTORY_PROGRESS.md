# Persisted Attempt History and Answer Review

**Last updated:** 2026-10-31  
**Branch:** `main`  
**Status:** Source implementation and focused regression tests added. Automated execution and deployment verification remain to be checked.

## Requested behavior

The student Performance History page and Answer Review route use only durable normal-exam attempts and Test Room participant attempts. Browser-local history is not a source, fallback, or review store. Test Room attempts carry a distinct purple **Test Room** label at the top-right of their dashboard cards and review header.

## Data contract and source of truth

- Normal exams use per-student `private.exam_attempts` rows with `attempt_type = 'exam'`. The authenticated endpoint is `POST /api/exam-attempts` with `action: 'list'`.
- Test Room participants use per-student `private.exam_attempts` rows with `attempt_type = 'test_room'`. The authenticated endpoint is `POST /api/test-room-session` with `action: 'list_my_attempts'`.
- Both endpoints derive ownership from the verified Supabase Auth bearer token and call the private attempt-data RPC with the authenticated user ID. No client-supplied UID is accepted.
- The Test Room list response is explicitly allowlisted. It includes the attempt ID, subject/exam metadata, saved questions and answers, score/counts, status, and timestamps. It excludes the room join code, user ID, room role, answer revision, and answer key.
- `public.TestAttempts` remains the ERD-facing mirror of per-student results. `public.TestRooms` remains a room-level aggregate, not the source for individual question snapshots/reviews. The implementation therefore reads the authoritative owner-scoped per-student attempts and does not alter the public schema.
- Test Room reconciliation is still run before the dashboard requests the room-attempt list so abandoned sessions can be finalized.

## Dashboard and performance behavior

- History cards are built only from the two attempt lists above and are sorted by attempt timestamp.
- Waiting/cancelled Test Room rows and cancelled normal-exam rows are excluded from the student history list.
- The Performance overview is calculated from finalized scored attempts in those same lists. It does not fetch `/api/dashboard-performance` or another separate leaderboard summary.
- Review links carry an `attemptType` query parameter so ReviewPage calls the matching owner-checked endpoint.
- Older direct review links without that parameter try only the two persisted attempt-review endpoints.

## Browser-local history removal

- `ExamPortal.jsx` no longer writes completed exams to browser storage.
- `Dashboard.jsx` no longer reads local history or falls back to it on API errors; it removes the legacy per-user and anonymous `prepmaster_exam_history_v1` keys when the signed-in student opens the dashboard.
- `AuthContext.jsx` removes the retired per-user history key on logout.
- `ReviewPage.jsx` no longer looks up local records, performs timestamp matching, or renders local question snapshots.
- `examHistoryStorage.js` is removed after its application imports are retired.

## UI

- A reusable `AttemptSourceBadge` component appears on dashboard cards and the Answer Review header.
- The badge uses a restrained purple surface, light-violet text, a subtle border, and compact typography. It appears only for `attemptType = 'test_room'`; normal exam cards/reviews do not display it.

## Tests added/updated

- Test Room API allowlist test checks that student attempt summaries omit `user_id`, `room_code`, `room_role`, and `answer_revision`.
- Dashboard tests cover both persisted attempt sources, Test Room card labelling, source-specific review links, legacy localStorage cleanup, and the no-local-fallback error state.
- Review-page tests cover source-directed normal and Test Room loading and verify that only the selected endpoint is called for typed links.

## Verification

- [ ] Run focused Vitest files: `tests/testRoomSessionApi.test.js`, `tests/dashboard-performance.test.jsx`, and `tests/review-page-attempt-source.test.jsx`.
- [ ] Run full `npm run test`, `npm run lint`, and `npm run build`.
- [ ] Smoke-test with a signed-in account that has both a normal exam attempt and a Test Room participant attempt; verify labels, sorting, score totals, and both review flows.
- [ ] Check GitHub Actions and Vercel deployment status for the committed revision.
- Repository files were edited through GitHub repository APIs. Local Vite/browser execution has not yet been performed.

## Compatibility and schema notes

No Supabase schema, RLS policy, public ERD table, question-generation rule, or Test Room lifecycle behavior is changed by this task. The Test Room list endpoint reuses the existing private attempt storage and authenticated API architecture.
