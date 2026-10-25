# Test Rooms: Live Schema and Feature Contract

**Last verified:** 2026-10-25  
**Supabase project:** prepmaster (llqwtgwjlwgrftihtern)  
**Status:** Live database schema verified; temporary frontend/Realtime implementation is in progress. The feature deliberately does not write room-session data to database tables.

This document separates the live database contract from the requested application behavior. Do not treat planned fields or flows as already implemented in Supabase.

## 1. Confirmed product rules

- Test Rooms are available only for MCQ exams. Theory exam types must not show a Test Room action or enter the Test Room flow.
- Maximum room size is 50 participants total, including the host.
- A room has a generated join code. There is no public/private room selector.
- The normal exam setup still determines department/course/subject/exam type/difficulty and whether questions come from AI generation or a user-uploaded PDF.
- For a room exam, generate the MCQ paper once in the host's active browser flow. Do not write the join code, host/session metadata, generated paper, timer, answers, or room state to database tables for this temporary feature. Send only a student-safe question copy through Realtime Broadcast; keep the answer key in the host's in-memory canonical question set.
- The exam-choice UI should offer Start Exam and Test Room for eligible MCQ exams. Test Room opens a Create/Join choice; it should not immediately send the user into a room.
- Creating a room requires a timer duration. After successful creation, show the join code with copy support and an Enter Test Room action.
- The waiting lobby must make it clear that participants wait for the host to start. Show the joined participant roster with a distinct Host tag for the creator. Only the host can start the room.
- Joining must validate that the code resolves to a room, that the room is joinable/not started, that the user is not already present, and that the room has fewer than 50 participants. Enforce these checks atomically on the server/database, not only in the browser.
- The timer begins once when the host starts the room. Persist one authoritative start timestamp and duration so every participant sees the same deadline.
- The room lobby/attempt needs real-time updates for participant arrival and the host starting the test.
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

The user-selected behavior is explicitly ephemeral. Do not create a migration to add join codes, host IDs, timer duration, status, timestamps, or participant session state, and do not add any of those values to `public."TestRooms"` or another database table for this feature.

- **Backend API — Vercel:** `api/test-room-code.js` generates a random 10-character code using `node:crypto`. It checks the Supabase Auth access token and validates an entered code by subscribing to the matching live Realtime channel and inspecting host Presence. The backend returns a server timestamp for the host-only start operation. It does not write the code or session to Postgres or keep an in-process map of rooms.
- **Live room state — Supabase Realtime Presence/Broadcast:** The host advertises a temporary presence payload containing the code, host identity/display name, subject/exam labels, difficulty, timer duration, status, question count, and start timestamp. Participant identities and the live roster also exist in Presence. The host shares a student-safe question payload over Broadcast and receives participant answers for scoring. These messages are not durable records.
- **Browser memory — React/router state:** The generated question set and correct-answer key stay in the host's current page state/router state. Each participant holds their own shuffled display model and answers in React state. Do not put room secrets/answer keys in localStorage, sessionStorage, URL query strings, or participant broadcasts.
- **No database writes:** This implementation does not insert rows into `TestRooms` or `TestsData`. The existing `TestRooms` table remains a separate legacy/persistent schema; its existing trigger and answer-grid structure do not define the persistence model for this temporary feature.
- **Realtime privacy:** Use random high-entropy codes, sign-in checks at the API, host-only server-authorized start, and allowlisted data in API responses. Do not include the answer key in the room Presence payload or student-safe Broadcast. Since Presence/Broadcast room state is ephemeral and the channel is identified by its code, anyone who obtains the code may be able to observe channel metadata or attempt to join; do not transmit answer keys or other secrets on that channel.
- **Capacity:** The 50-participant limit is enforced by the host's join-request handler and tracked/reserved identities in memory. Because no database is allowed for a durable atomic lock, this temporary model is best suited to ordinary rooms with one stable host browser; host disconnect ends the room.
- **Lifecycle:** Room code verification succeeds only while the host's expected Presence payload exists. Reloading/closing the host page, losing its Realtime connection for long enough, or navigating away removes the temporary session. There is no recovery of a room after host disconnect and no historic room results.

Supabase references for the transient transport:
- [Realtime Presence](https://supabase.com/docs/guides/realtime/presence)
- [Realtime Broadcast](https://supabase.com/docs/guides/realtime/broadcast)

## 5. Creation/join/start flow

1. The normal subject configuration screen shows Test Room only for MCQ exams. Theory exams keep the normal exam flow.
2. Test Room opens a Create Test Room / Join Test Room choice. It does not immediately navigate to a room.
3. The create path reuses the selected subject, MCQ exam type, difficulty and Auto AI vs file-upload mode. After generation, validate the 30 four-option questions and answer indexes. Pass the question set to the temporary create page through React Router state; do not save the new room paper to database tables.
4. The backend issues a random code. The host then publishes the code and host metadata through Realtime Presence. The share page displays the code with copy support and an Enter Test Room action.
5. Join path asks for the code. `api/test-room-code.js` checks the signed-in user's token and verifies that matching host Presence is live, waiting, and has a valid code. No database query is used as a room registry.
6. After the backend pre-check, the joiner sends a live join request. The host checks duplicate membership, room state, and the 50-person cap before accepting and tracking the participant. The host's handler reserves a slot before replying, reducing simultaneous-join overbooking.
7. The waiting lobby renders a subtle animated live roster and labels the creator **Host**. Only the host sees the Start Test Room action.
8. Starting calls the backend API. It validates that the caller is the active host and returns a single server timestamp; the host publishes status/start time through Presence. Every client calculates its deadline from the same server timestamp with a client clock-offset estimate.
9. Each participant independently shuffles the same question set and independently shuffles each question's own options. Keep each option attached to its source question. When selected, map the option to its original zero-based index and place the answer at its original question index. Displayed A/B/C/D labels are never canonical indexes by themselves.
10. The host scores submitted canonical answer arrays using the host-only answer key and returns only the submitting participant's result via Broadcast. A participant never receives the answer key before results. Results are temporary and are not written to history/database in this implementation.
11. If the host disconnects, the room closes; there is no room recovery because no durable room session exists. The UI explains this limitation.

## 6. Database verification record

Verified on 2026-10-25 in project llqwtgwjlwgrftihtern:

- public."TestRooms" exists; row count is 0.
- RLS enabled; no table-specific policies returned.
- One non-internal trigger: TestRooms_validate_before_write.
- FK: TestRooms.TestId → TestsData.TestId ON DELETE RESTRICT.
- Answers shape: participants × questions; question dimension constrained to 1–30 and must match the referenced saved test.
- Current supabase_realtime publication excludes TestRooms.
- Table privileges are currently only listed for postgres and service_role, not browser roles.
