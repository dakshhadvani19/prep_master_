# Test Room Reliability — Phase 2 Progress

**Date:** 2026-10-26  
**Branch:** `main`  
**Scope:** Phase 2 (failure/race verification and targeted hardening)

## Implemented in this Phase 2 pass

- [x] Extracted finalization outcome into `resolveFinalization(action, deadlineAt, now)` and use it in the API. This makes manual submit, participant disconnect, host-marked disconnect, and deadline timeout use a single decision point.
- [x] Added deadline boundary tests: one millisecond before the deadline remains eligible for manual submission; exactly at the deadline is `timed_out`; after the deadline remains `timed_out`.
- [x] Added reason/status tests for submit, ordinary disconnect, and host-marked participant disconnect.
- [x] Added a persistence regression test that runs two finalizer-style updates against the same in-progress attempt and verifies the delayed second update cannot overwrite the first terminal status, score, or answers. This tests the same `status = 'in_progress'` compare-and-set guard used by the API.
- [x] Rechecked the dashboard reconcile helper: it catches reconciliation failures and returns an error object, so a failed reconciliation alone does not prevent the subsequent durable-attempt fetch. No change was needed there.
- [x] Routed created rooms and code-based joins through `/test-rooms/:roomCode`, keeping the code in the address bar and adding a copy-invite-link action.
- [x] Kept tab switching separate from disconnection handling: no visibility-change penalty is applied; closing/leaving a started test triggers best-effort disconnect finalization, backed by server heartbeat/reconciliation.
- [x] Kept the backend as the authority for room joining: only waiting rooms accept joins; verification and join actions reject started rooms, and start/join state changes retain the atomic Redis guard.
- [x] Added an explicit host-session guard so a fresh page mount cannot resume the host from the join-code URL.
- [x] Added a unit test for waiting/started/ended room joinability.

## Verification status

- [ ] Re-run focused Test Room tests, full Vitest, ESLint, production build, and confirm Vercel deployment for the latest 2026-10-26 URL/lifecycle changes.
- [ ] Browser-level verification remains required: switch tabs during a started room, close/reopen a participant tab, try opening the code URL after the host starts, and verify no new participant is admitted after start.

- [x] Focused Test Room regression CI passed on source commit `a4755fd563fc21f3df90d818a7a6c2929a147c92` (workflow run [40187723249](https://github.com/dakshhadvani19/prep_master_/actions/runs/40187723249)).
- [x] Vite production build passed on the same source commit (job `121151963365`).
- [ ] Confirm Vercel deployment status for the latest source commit; its status was still `pending` at the last check.
- [ ] Run an actual host + participant two-browser session in the deployed environment.
- [ ] Exercise tab close, temporary network loss, Redis outage, Postgres outage after Redis snapshot closure, room expiry, host disappearance, and 50-participant capacity.
- [ ] Verify Dashboard history and answer review on deployed data for `submitted`, `timed_out`, and `disconnected`.

## Overall CI status

The focused Test Room job and production build passed. The same workflow's repository-wide ESLint and full Vitest jobs failed; the full Vitest failures are in other auth/profile/catalog test areas, and the lint job reports issues outside the focused Test Room files. Do not describe the whole repository CI as green. The result can be checked in [workflow run 40187723249](https://github.com/dakshhadvani19/prep_master_/actions/runs/40187723249).

## Known limits

Automated unit/SQL tests do not prove that browser lifecycle events or live Redis/Supabase failures behave correctly in production. No claim of a completed live E2E test should be made until it has been exercised against a deployed app. A browser selection is only guaranteed durable after the server has accepted it; the fallback on abrupt loss is the last accepted snapshot.

## Relevant commits

- API finalization decision: `078db4b24929305afdd6060a034abedf17e39a8f`
- Deadline boundary tests: `8643f213c5c67f703272403050bec62fb472d116`
- Duplicate finalizer persistence test: `a4755fd563fc21f3df90d818a7a6c2929a147c92`

