# Test Room Reliability — Phase 1 Progress

**Date:** 2026-10-25  
**Scope:** Phase 1 (approximately the first half of the requested reliability work)  
**Working branch:** `main`

This is a continuation of the existing Test Room implementation, not a rewrite. Review the current code and this checklist before starting Phase 2.

## Phase 1 status

### Already implemented before this pass

- [x] Redis is the authoritative temporary room registry; no live room object is inserted into legacy `TestRooms` or `TestsData`.
- [x] The backend authenticates Supabase users, generates cryptographically random codes, validates room state, and authorizes host-only actions.
- [x] Redis Lua scripts atomically reserve room codes, cap the room at 50 participants including the host, and transition the room to started.
- [x] The server retains the answer key in `exam_attempt_keys`, excludes it from participant question payloads, and calculates scores server-side.
- [x] Per-user question snapshots, selected answers, attempt status, result counts, score, and end reason are stored in `exam_attempts`.
- [x] The dashboard reads the user's own persisted attempts; the server has an owner-checked answer-review endpoint.
- [x] The started-room join path rejects rejoining after disconnection.
- [x] Heartbeats, answer-save requests, explicit disconnect handling, TTLs and dashboard reconciliation exist.

### Completed in this Phase 1 pass

- [x] Added `exam_attempts.answer_revision BIGINT NOT NULL DEFAULT 0` with a non-negative constraint.
- [x] Applied Supabase migration `20261025104251_add_test_room_answer_revision` and verified the live column exists.
- [x] Made Redis answer updates accept only a newer revision.
- [x] Made durable Postgres answer updates compare-and-set on `answer_revision`, so an older, slower HTTP request cannot overwrite a newer saved selection.
- [x] Added an atomic Redis participant-close step before finalization. The accepted answer snapshot is closed before the final status/score is written, preventing late saves from being accepted after finalization.
- [x] Made reconciliation retry a terminal Redis snapshot if the matching database attempt is still marked in progress.
- [x] Changed submit and disconnect paths to carry the latest answer revision and removed a direct unversioned participant-answer overwrite.
- [x] Made answer selections send a save immediately, with the periodic heartbeat remaining as a retry for the latest snapshot.
- [x] Corrected the timeout classification so a disconnect after the deadline is recorded as timed out.
- [x] Added a SQL regression test demonstrating that a delayed lower-revision update cannot roll back a newer durable snapshot.

## Phase 1 verification still required

- [ ] Confirm the latest Vercel production build/deployment result for the final Phase 1 commit.
- [ ] Run `npm test`, `npm run lint`, and `npm run build` against this exact commit. These were not run locally in this session because the workspace could not clone GitHub (DNS resolution failure); do not assume they passed.
- [ ] Exercise the live flow with a host and participant in separate browser sessions.
- [ ] Test disconnect during save, hard tab/browser close, host disconnection, Redis failure, and temporary Supabase/Postgres failure. Confirm the last server-accepted answer snapshot and score appear in dashboard history.

## Phase 2 plan

Do not restart the architecture. Continue from the code and migration already present:

1. Fix issues found by Phase 1 build/test results.
2. Add/extend API-level and browser tests for concurrent saves/submits, duplicate actions, host/participant disconnects, deadline boundary, expired Redis state and reconciliation after database failures.
3. Verify dashboard history/review states for `submitted`, `timed_out`, and `disconnected`; make transient failures visible without implying data was saved when the API did not confirm it.
4. Run an end-to-end two-browser check on the deployed app and document any limits. A client choice that never reaches the server before the connection is lost cannot be guaranteed to survive; the guaranteed fallback is the last successfully accepted server snapshot.
5. Review room cleanup/TTL behavior and Upstash command usage under a full 50-person room.

## Files changed in Phase 1

- `global-exam-prep/api/test-room-session.js`
- `global-exam-prep/src/pages/TestRoomPage.jsx`
- `global-exam-prep/tests/test-room-persistence-sql.test.js`
- `global-exam-prep/supabase/migrations/20261025104251_add_test_room_answer_revision.sql`
- `docs/TEST_ROOMS_SCHEMA_AND_IMPLEMENTATION.md`

## Persistence boundaries

- Temporary room code, room status, timer and live membership remain in Redis with TTL.
- Durable per-user attempts and selected answers remain in `public.exam_attempts`.
- Correct answers remain in `public.exam_attempt_keys`, inaccessible to browser roles.
- The existing legacy `public."TestRooms"` and `public."TestsData"` tables are not used for this room-session registry.
