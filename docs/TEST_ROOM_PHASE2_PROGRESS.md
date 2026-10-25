# Test Room Reliability — Phase 2 Progress

**Date:** 2026-10-25  
**Branch:** `main`  
**Scope:** Phase 2 (failure/race verification and targeted hardening)

## Implemented in this Phase 2 pass

- [x] Extracted finalization outcome into `resolveFinalization(action, deadlineAt, now)` and use it in the API. This makes manual submit, participant disconnect, host-marked disconnect, and deadline timeout use a single decision point.
- [x] Added deadline boundary tests: one millisecond before the deadline remains eligible for manual submission; exactly at the deadline is `timed_out`; after the deadline remains `timed_out`.
- [x] Added reason/status tests for submit, ordinary disconnect, and host-marked participant disconnect.
- [x] Added a persistence regression test that runs two finalizer-style updates against the same in-progress attempt and verifies the delayed second update cannot overwrite the first terminal status, score, or answers. This tests the same `status = 'in_progress'` compare-and-set guard used by the API.
- [x] Rechecked the dashboard reconcile helper: it catches reconciliation failures and returns an error object, so a failed reconciliation alone does not prevent the subsequent durable-attempt fetch. No change was needed there.

## Verification status

- [ ] Re-run the focused Test Room CI suite and production build for the Phase 2 commits.
- [ ] Confirm Vercel deployment status for the latest source commit.
- [ ] Run an actual host + participant two-browser session in the deployed environment.
- [ ] Exercise tab close, temporary network loss, Redis outage, Postgres outage after Redis snapshot closure, room expiry, host disappearance, and 50-participant capacity.
- [ ] Verify Dashboard history and answer review on deployed data for `submitted`, `timed_out`, and `disconnected`.

## Known limits

Automated unit/SQL tests do not prove that browser lifecycle events or live Redis/Supabase failures behave correctly in production. No claim of a completed live E2E test should be made until it has been exercised against a deployed app. A browser selection is only guaranteed durable after the server has accepted it; the fallback on abrupt loss is the last accepted snapshot.

## Relevant commits

- API finalization decision: `078db4b24929305afdd6060a034abedf17e39a8f`
- Deadline boundary tests: `8643f213c5c67f703272403050bec62fb472d116`
- Duplicate finalizer persistence test: `a4755fd563fc21f3df90d818a7a6c2929a147c92`

