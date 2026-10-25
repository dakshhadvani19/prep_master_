# Test Rooms: Live Schema and Feature Contract

**Last verified:** 2026-10-25  
**Supabase project:** prepmaster (llqwtgwjlwgrftihtern)  
**Status:** Live database schema verified; UI/room lifecycle implementation is not yet complete.

This document separates the live database contract from the requested application behavior. Do not treat planned fields or flows as already implemented in Supabase.

## 1. Confirmed product rules

- Test Rooms are available only for MCQ exams. Theory exam types must not show a Test Room action or enter the Test Room flow.
- Maximum room size is 50 participants total, including the host.
- A room has a generated join code. There is no public/private room selector.
- The normal exam setup still determines department/course/subject/exam type/difficulty and whether questions come from AI generation or a user-uploaded PDF.
- For a room exam, generate or select the exam once, persist it as a compatible MCQ test, and point the room to its TestId. Every participant must receive the same source questions and underlying correct answers.
- The exam-choice UI should offer Start Exam and Test Room for eligible MCQ exams. Test Room opens a Create/Join choice; it should not immediately send the user into a room.
- Creating a room requires a timer duration. After successful creation, show the join code with copy support and an Enter Test Room action.
- The waiting lobby must make it clear that participants wait for the host to start. Show the joined participant roster with a distinct Host tag for the creator. Only the host can start the room.
- Joining must validate that the code resolves to a room, that the room is joinable/not started, that the user is not already present, and that the room has fewer than 50 participants. Enforce these checks atomically on the server/database, not only in the browser.
- The timer begins once when the host starts the room. Persist one authoritative start timestamp and duration so every participant sees the same deadline.
- The room lobby/attempt needs real-time updates for participant arrival and the host starting the test.

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

## 4. Schema and security gaps to resolve before feature implementation

These points were checked against the live database on 2026-10-25:

- The table has no columns for a join code, explicit host StudentId, timer duration, room state (waiting/started/finished), start timestamp, or finish timestamp. Add a deliberate migration or introduce a separate room-session table before implementing those behaviours. Do not overload RoomId as the join code.
- Row Level Security is enabled, but the live pg_policies query returned no policies for TestRooms.
- The live table grants query showed permissions for postgres and service_role, but no anon or authenticated table grants. Direct browser Supabase-client access is therefore not a ready-to-use room API. Do not add broad grants/policies as a shortcut.
- TestRooms is not in the supabase_realtime publication. A Postgres Changes subscription to this table will not work until the table is added to that publication. Alternatively, use an appropriately authorized Realtime Presence/Broadcast or a sanitized server-generated roster event.
- Answers, scores, and participant IDs belong to the room record. Do not expose whole room rows or the answer grid to participants during an active test. Only trusted server/database logic should validate submissions and store canonical answers/scores; the answer key must not be sent to participants before submission/end.
- Use a server-authoritative operation (for example, a carefully scoped Edge Function or database RPC) for room creation, atomic code lookup/join, participant cap enforcement, host-only start, timer transition, submission, and final scoring. Never ship a Supabase service-role key to the frontend. Design the access policies and function permissions together and verify them with signed-in-user tests.
- The live migration list did not show a migration specifically creating TestRooms; the current database structure should therefore be captured in a checked-in migration/schema source before future changes rely on it.

Supabase security references:
- [Securing the Data API: grants and RLS](https://supabase.com/docs/guides/api/securing-your-api)
- [Realtime Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)
- [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization)

## 5. Recommended creation/join/start flow

1. On the normal exam selection screen, show Test Room only when the chosen exam type is MCQ. Theory exams continue to show only their normal exam action.
2. Test Room opens a lightweight Create Test Room / Join Test Room modal.
3. Create flow reuses the selected course/subject/exam type/difficulty and Auto AI vs PDF source choice. Generate/select one MCQ exam, validate it, persist it to TestsData using the repository's explicit TestId rules, then create the room referencing that TestId. Prompt for timer duration before creation.
4. Generate a non-sequential join code independently from RoomId, enforce uniqueness in the database, and store the host's student identity and waiting state in the room/session schema.
5. Show the code with copy support. Enter Test Room navigates to the waiting lobby.
6. Join flow accepts the code and executes a server-side atomic lookup/check/append. Reject nonexistent codes, duplicate participation, full rooms, and rooms that have already started or finished.
7. Lobby updates the roster in real time, marks the creator as Host, and displays the waiting state. Only the validated host can start the room.
8. Start is an atomic host-authorized transition that records the server timestamp once. All participants use that same deadline; client clocks are display helpers, not the source of truth.
9. Each participant sees their own independently shuffled rendering, but every response maps back to the same canonical test. Submission/timeout must resolve to canonical question and option indexes before being scored and persisted.
10. Reveal results/review data only when the test's submission/finish policy allows it. Keep the database's participant ordering aligned across StudentId, all statistic arrays, and the first dimension of Answers.

## 6. Database verification record

Verified on 2026-10-25 in project llqwtgwjlwgrftihtern:

- public."TestRooms" exists; row count is 0.
- RLS enabled; no table-specific policies returned.
- One non-internal trigger: TestRooms_validate_before_write.
- FK: TestRooms.TestId → TestsData.TestId ON DELETE RESTRICT.
- Answers shape: participants × questions; question dimension constrained to 1–30 and must match the referenced saved test.
- Current supabase_realtime publication excludes TestRooms.
- Table privileges are currently only listed for postgres and service_role, not browser roles.
