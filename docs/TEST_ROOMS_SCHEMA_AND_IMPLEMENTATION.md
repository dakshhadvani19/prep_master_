# Test Rooms: Live Schema and Feature Contract

**Last verified:** 2026-10-26  
**Supabase project:** prepmaster (llqwtgwjlwgrftihtern)  
**Status as of 2026-10-27:** Redis-backed Test Room API, private operational attempts, owner-checked review, monotonic answer-revision persistence, and room-aggregate persistence are implemented. Redis remains authoritative for active room state. Papers mirror to `public.TestsData`, student results to `public.TestAttempts`, and each room's participant IDs, scores, counts, and canonical answer grid to `public.TestRooms`. Answer keys and operational lifecycle details remain in the unexposed `private` schema.

This document separates the live database contract from the requested application behavior. Do not treat planned fields or flows as already implemented in Supabase.

## 1. Confirmed product rules

- Test Rooms are available only for MCQ exams. Theory exam types must not show a Test Room action or enter the Test Room flow.
- Maximum room size is 50 participants total, including the host.
- A room has a generated join code. There is no public/private room selector.
- Room URLs use `/test-rooms/:roomCode`. After room creation, the host is routed to the code URL; entering a code also routes joiners to that URL, and the host can copy a direct invite link.
- The homepage `Join Test Room` action opens the shared code-entry screen without requiring subject selection. A limited public preflight can distinguish malformed/unknown codes from started/ended rooms; actual joining and participant tracking still require sign-in. User-facing errors must never expose Redis, WebSocket, database, or credential details.
- Switching to another browser tab is allowed and does not finalize an attempt. When a started exam tab closes or navigates away, the client sends a best-effort disconnect; server heartbeats/reconciliation finalize the attempt if that event is missed. Started rooms reject all new joins, and a disconnected/submitted participant cannot rejoin.
- The creator may restore the host connection only while the room is still waiting, the signed-in user matches the Redis room owner, the host participant is still active, and the generated question set remains in that browser's route state. The server returns allowlisted host metadata and the attempt ID only; it does not return questions or the private answer key. A started or stale host attempt cannot be resumed.
- The normal exam setup still determines department/course/subject/exam type/difficulty and whether questions come from AI generation or a user-uploaded PDF.
- For a room exam, the host's generated paper is validated by `api/test-room-session.js`. Store room metadata, join code, deadline, participants and accepted answers in Redis with an absolute expiry. Persist each participant's operational attempt and final result in `private.exam_attempts`; keep the canonical key in `private.exam_attempt_keys`. Database triggers mirror the paper to `public.TestsData`, each student's result to `public.TestAttempts`, and room-level participant arrays/answer grid to `public.TestRooms`. Private link IDs connect these records. Never store active room state or join codes in public tables.
- The exam-choice UI should offer Start Exam and Test Room for eligible MCQ exams. Test Room opens a Create/Join choice; it should not immediately send the user into a room.
- Creating a room requires a timer duration. After successful creation, show the join code with copy support and an Enter Test Room action.
- The waiting lobby must make it clear that participants wait for the host to start. Show the joined participant roster with a distinct Host tag for the creator. Only the host can start the room.
- Joining must validate that the code resolves to a room, that the room is joinable/not started, that the user is not already present, and that the room has fewer than 50 participants. Enforce these checks atomically on the server/database, not only in the browser.
- The timer begins once when the host starts the room. Persist one authoritative start timestamp and duration so every participant sees the same deadline.
- The room lobby/attempt needs real-time updates for participant arrival and the host starting the test. Use authenticated private Supabase Realtime channels (`config.private: true`) with code-scoped SELECT/INSERT policies on `realtime.messages` for Broadcast and Presence. Never rely on public channels for Test Rooms. The site's HTML Content Security Policy must allow both `https://*.supabase.co` and `wss://*.supabase.co` in `connect-src`, because browser-enforced CSP evaluates WebSocket schemes separately from HTTPS. The waiting lobby also polls the authenticated `poll_lobby` API backed by Redis every three seconds. When Realtime is unavailable, participants can still join, the roster updates, and the host can start; started-room polling delivers the safe question set to participants. A Realtime failure must not undo a successful server-side start or submission.
- The backend generates the room code using a cryptographically secure random generator and verifies signed-in users against the live host Presence payload. The code is not stored in a database table or a serverless in-memory registry.

## 2. Live public."TestRooms" schema

The table exists and currently has 0 rows. It has RLS enabled, a validation trigger, and a foreign key to public."TestsData".

| Column | Live type | Verified behavior |
| --- | --- | --- |
| RoomId | BIGINT | Primary key; GENERATED ALWAYS AS IDENTITY. This is a database row ID, not a suitable user-facing join code. |
| TestId | BIGINT | Required FK to TestsData.TestId; ON DELETE RESTRICT. |
| StudentId | BIGINT[] | Ordered participant IDs. Must be one-dimensional, 1–50 entries, lower bound 1, no nulls or duplicate student IDs; the trigger confirms each ID exists in Students. |
| Points | SMALLINT[] | One result value per participant in the same position as StudentId; values are validated to 0–255 by the trigger. |
| Difficulty | VARCHAR(10) | Required; limited to easy, medium, or hard. |
| Correct | SMALLINT[] | One correct-answer count per participant. |
| InCorrect | SMALLINT[] | One incorrect-answer count per participant. |
| Attempted | SMALLINT[] | One attempted count per participant. |
| Unattempted | SMALLINT[] | One unanswered count per participant. |
| Answers | SMALLINT[][] | Native two-dimensional answer grid: first dimension is participant order; second dimension is canonical saved-test question order. Each cell is 0–3 for the canonical saved option index, or NULL for unanswered. |

The FK target public."TestsData" has these required columns: TestId BIGINT (manually supplied; no identity/default), Questions JSONB[], Options JSONB[], and Answers JSONB[]. The current exam specification uses 30 MCQs, four options per question, and zero-based original answer indexes. The live TestRooms_validate_before_write trigger validates a room's saved test as 1–30 MCQs, requires exactly four flattened option entries per question, validates original answer keys to 0–3, checks answer-grid dimensions, and derives/checks each participant's statistics from the submitted grid.

The table-level validation trigger is TestRooms_validate_before_write, which calls public.validate_testrooms_before_write(). It validates participant IDs and duplicates, array shapes/order, the referenced MCQ test, answer values, and score/count consistency. It does not implement join codes, room lifecycle, host permissions, join/start timing, or a realtime participant roster.

## 3. Critical frontend shuffle contract

Question and option shuffling is per participant and may change both the question order and the displayed A/B/C/D labels. It must not change the meaning of any answer or persist the visible labels as canonical indexes.

1. Preserve a stable identity for every source question. Where the stored JSON does not provide a stable questionId, use its immutable original index within TestsData.Questions for that saved test.
2. Preserve each option's original zero-based index within its own question. The option's stable identity is the pair (source question identity, original option index). Never detach an option from its source question.
3. Build a display-only shuffled view. Shuffle the question objects and each question's four option objects independently, carrying their original identities along with the text. Do not shuffle the flattened TestsData.Options array across question boundaries.
4. When a participant selects a displayed option, map the display selection back to its original option index and original question identity. Store it in the canonical answer grid at Answers[participantPosition][canonicalQuestionPosition] with the original option index 0–3. Do not store the displayed A/B/C/D index directly if it differs from the original index.
5. Keep the question total unchanged. A shuffled question must appear exactly once per participant and retain its own original four options and answer-key mapping.
6. Validate this mapping with fixtures where the correct option moves across display labels and questions appear in different positions. For example, a correct source option at original index 0 may render as option C; the saved answer is still 0 after mapping, not 2.

This matches the current trigger, which compares each Answers[participant][canonicalQuestion] cell to TestsData.Answers[canonicalQuestion]. The trigger expects canonical saved-test order and original option indexes, not display order or displayed letter labels.

## 4. Persistence boundary and temporary-session architecture

The live room/session registry remains ephemeral in Redis; a permanent join-code registry is not stored in the database. Operational records and answer keys remain in `private.exam_attempts` and `private.exam_attempt_keys`. Each paper mirrors to `public.TestsData`, each student result to `public.TestAttempts`, and each room aggregate to `public.TestRooms`. Private `core_test_id`, `core_attempt_id`, and `core_room_id` fields preserve these relationships. Active metadata and the live roster remain in Redis.

- **Backend API — Vercel:** `api/test-room-session.js` checks the Supabase Auth access token, reserves a cryptographically random 10-character code atomically, and stores room state using the Upstash Redis REST API. It authorizes create/join/start/heartbeat/answer-save/submit/disconnect/review actions server-side. It never trusts client-supplied scores; scoring is recalculated on the backend from the private answer key.
- **Live notifications — Supabase Realtime Presence/Broadcast:** Realtime drives the live roster and notifies connected pages when the host starts or participants arrive/submit. Server-side Redis state and Supabase attempt rows are authoritative; client Broadcast messages are not authoritative for persisted answers or scores. Participant-facing question payloads omit the answer key.
- **Browser state:** React holds the display model and current question position for rendering. Answers are sent to the backend after each selection (debounced) and again through periodic heartbeats. The backend stores the accepted answer snapshot in Redis and `private.exam_attempts`, which automatically synchronizes the ERD-facing `public.TestAttempts` row. The canonical key stays in `private.exam_attempt_keys`; do not put it in browser storage, route state, or active Realtime payloads.
- **Out-of-order answer protection:** each answer/heartbeat carries a monotonically increasing revision. Redis Lua scripts only accept a newer revision, and the durable `exam_attempts.answer_revision` compare-and-set only updates a row when the stored revision is lower. Finalization atomically closes the Redis participant snapshot first, then writes the accepted answers, revision, status and server-calculated score to Postgres. If the Postgres write fails after closure, dashboard/room reconciliation retries from the closed snapshot rather than reopening answer writes.
- **Persistence boundary:** Do not write the live room registry or join code to `public.TestRooms`. Persist operational attempts in `private.exam_attempts`, including question snapshots, accepted answers, status, scores and counts; keep the key in `private.exam_attempt_keys`. The private tables are accessed through server-side RPCs. Papers mirror to `public.TestsData`, student results to `public.TestAttempts`, and room aggregates to `public.TestRooms`. The existing ERD table structures are unchanged. The empty `exam_grades` table was removed; private attempts remain authoritative for reviews.
- **Realtime privacy:** Use random high-entropy codes, sign-in checks at the API, host-only server-authorized start, and allowlisted data in API responses. Do not include the answer key in the room Presence payload or student-safe Broadcast. Since Presence/Broadcast room state is ephemeral and the channel is identified by its code, anyone who obtains the code may be able to observe channel metadata or attempt to join; do not transmit answer keys or other secrets on that channel.
- **Capacity:** Redis Lua scripts atomically reserve room codes and participant slots; the backend enforces the 50-person total including the host across serverless instances. A short per-room Redis lease prevents every heartbeat from scanning the entire roster at once.
- **Lifecycle/disconnect:** A room's Redis state expires after its TTL. Once the room has started, further joining is rejected. A heartbeat timeout or explicit disconnect finalizes the user's attempt using the last server-accepted answer snapshot, then persists its score/status in `exam_attempts`; reconnecting does not resume or rejoin a started test. Dashboard reconciliation finalizes abandoned in-progress attempts after the heartbeat grace period. An answer that never reached the server before connectivity was lost cannot be guaranteed; the latest successfully synced snapshot is preserved.

Supabase references for the transient transport:
- [Realtime Presence](https://supabase.com/docs/guides/realtime/presence)
- [Realtime Broadcast](https://supabase.com/docs/guides/realtime/broadcast)

## 5. Creation/join/start flow

1. The normal subject configuration screen shows Test Room only for MCQ exams. Theory exams keep the normal exam flow.
2. When React Router transitions to /test-rooms/:roomCode, the creator route may remount the page component. Resume the host only through the authenticated 'host_resume' API action, which checks room ownership and permits waiting rooms only. A missing route-state question set or a room that has started must not be resumed as host.
2. Test Room opens a Create Test Room / Join Test Room choice. It does not immediately navigate to a room.
3. The create path reuses the selected subject, MCQ exam type, difficulty and Auto AI vs file-upload mode. After generation, validate the 30 four-option questions and answer indexes. Pass the question set to the temporary create page through React Router state; the server stores the private attempt/key and mirrors the paper and aggregate to the public ERD tables.
4. The backend reserves a random code in Redis and creates the host's durable attempt. The host route becomes `/test-rooms/:roomCode`, so the join code stays visible in the address bar. The share page supports copying both the code and direct invite URL.
5. Join path accepts a code or direct invite URL. Entering a code navigates to `/test-rooms/:roomCode`; `api/test-room-session.js` verifies the signed-in user's token and checks Redis for a waiting room. Redis—not Presence—is the room registry. Once started, the URL remains visible but server verification and join actions reject new participants.
6. The joiner requests host admission through Realtime, then the backend atomically validates the waiting state and reserves a slot in Redis. It rejects duplicate/closed attempts and writes the student's `exam_attempts` row before returning a safe question copy.
7. The waiting lobby renders a subtle animated live roster and labels the creator **Host**. Only the host sees the Start Test Room action.
8. Starting calls the backend API. It validates the host, atomically marks the Redis room started, stores a server timestamp/deadline, and advances waiting attempt rows to `in_progress`. All clients derive the visible countdown from the shared deadline.
9. Each participant independently shuffles the same question set and independently shuffles each question's own options. Keep each option attached to its source question. When selected, map the option to its original zero-based index and place the answer at its original question index. Displayed A/B/C/D labels are never canonical indexes by themselves.
10. The server calculates scores using the private canonical answer key and finalizes the attempt row. Broadcast is for live UI refresh only; the dashboard/review reads durable `exam_attempts` data and retrieves answer keys through an owner-checked backend review endpoint after finalization.
11. A disconnected participant cannot rejoin a started test. Their last server-accepted answers and finalized score/status remain available on the dashboard even after Redis room metadata expires. A disconnected host's own attempt is reconciled too; an ended attempt is not resumed.

## 6. Database verification record

Verified on 2026-10-25 in project llqwtgwjlwgrftihtern:

- public."TestRooms" exists; 13 aggregate rows were verified after the phase-2 backfill. The private attempts for each room share one `core_room_id`.
- RLS enabled; no table-specific policies returned.
- One non-internal trigger: TestRooms_validate_before_write.
- FK: TestRooms.TestId → TestsData.TestId ON DELETE RESTRICT.
- Answers shape: participants × questions; question dimension constrained to 1–30 and must match the referenced saved test.
- Current supabase_realtime publication excludes TestRooms.
- Table privileges on legacy `TestRooms` are currently only listed for postgres and service_role, not browser roles.
- `private.exam_attempts` has RLS enabled and now includes private links `core_test_id → public.TestsData.TestId` and `core_attempt_id → public.TestAttempts.AttemptId`, in addition to `answer_revision`. Browser roles have no direct schema/table privileges; ordinary exam and Test Room operations go through authenticated server APIs and the service-role-only persistence RPC.
- `public.exam_grades` was removed on 2026-10-27 because it was empty and duplicated result fields already stored on `private.exam_attempts`.
- `private.exam_attempt_keys` exists with 3 columns and RLS enabled. Browser roles cannot access the schema or table; answer-key reads/writes are restricted to server-side RPCs.
- The partial unique index `exam_attempts_room_user_unique` on `private.exam_attempts` prevents duplicate Test Room attempts for the same user and room code. Verification on 2026-10-27 found 13 public `TestsData` papers, 18 `TestAttempts` rows, and 13 `TestRooms` aggregates. All 18 private room attempts are linked; key arrays and answer counts validate. A two-participant smoke test confirmed answer saves and final scores update the room aggregate.
- The repository migration filenames match the live migration versions `20261025095212`, `20261025095445`, `20261025095507`, and `20261025104251`.
- Regression tests now also cover the durable compare-and-set rule that prevents a delayed older answer write from overwriting a newer snapshot. The current Vercel status and automated test completion must be checked against the latest commit before treating this as release-verified. A local build/test run was unavailable in this session because the workspace could not clone GitHub (DNS resolution failure).
