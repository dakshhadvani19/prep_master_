# Leaderboard implementation

## Hierarchy filters and subject access

**Status as of 2026-10-30:** Hierarchical access checks are implemented. Phase 1's database result projection, Test Room integration, backfill, and per-subject Top 100 publisher are installed and live-verified. Ranking API/UI work remains outstanding.

### Filter sequence and access policy

1. **Department** — enabled only when a qualifying completed attempt exists in a course mapped to that department.
2. **Course** — enabled only when the verified completed-attempt feed includes a subject from that exact course.
3. **Semester** — enabled only when a qualifying completed attempt exists in that exact course and semester.
4. **Subject** — enabled only when the canonical `SubjectId`, `CourseId`, and semester all match a qualifying completed attempt.

The catalog can show locked options, but locked buttons are disabled and the navigation handlers independently reject them. This prevents direct interaction from bypassing a locked ancestor. During loading or an access verification error, student access fails closed. Administrator preview remains unrestricted. Changing an earlier filter clears downstream choices. Search inputs only narrow the currently displayed course or subject list. The UI is responsive, keyboard-focusable, and uses restrained violet and gold accents rather than a full-page gradient.

### Unlock policy

- A student unlocks a subject after a qualifying attempt is finalized with a submission timestamp, score, and positive maximum mark. Qualifying statuses are `submitted`, `auto_submitted`, `timed_out`, and `disconnected`; waiting/in-progress attempts and pre-start cancellations do not unlock a subject.
- The subject is identified by its canonical `public.Subjects.SubjectId`, not only by a display name or short code.
- A new attempt submits a numeric catalog SubjectId to the authenticated backend. The backend verifies that ID against `public.Subjects` and stores the related SubjectId, CourseId and Semester in `private.exam_attempts`. Those values are not trusted from the browser.
- The browser never queries the private schema. `POST /api/leaderboard-filters` verifies the current Supabase access token and calls the service-role-only `pm_leaderboard_completed_subjects` function for that user. The data contains that student's qualifying subject access only, not other students or scores.
- An API or database verification error fails closed: the subject remains locked until access can be rechecked.

### Legacy attempts

Attempts created before the canonical SubjectId field existed stored a short subject code and name but not the course or semester. The backfill assigned canonical IDs only where the code uniquely identifies one catalog subject: four existing completions were mapped to Basics of Accounting (BCA, semester 2) and Fundamentals of Machine Learning (Diploma CE, semester 6). The two old Calculus attempts remain unassigned because code 01ma0106 occurs in seven different courses; unlocking all or one of those courses would be an unsupported guess. New normal exams and Test Room attempts launched from canonical catalog subject routes carry a server-verified canonical SubjectId.

## Phase 1: result projection and published Top 100

### Source-of-truth flow

- **Normal exam:** the server-owned `private.exam_attempts` row supplies the finalized score, maximum marks, student, exam type, difficulty, completion timestamp, and canonical subject metadata.
- **Test Room:** earned marks are read from `public."TestRooms"."Points"[i]`, paired with `public."TestRooms"."StudentId"[i]` using `WITH ORDINALITY`. The participant is then matched to the private attempt through `core_room_id` and authenticated user ID. The private attempt supplies status, maximum marks, exam type, difficulty, timestamp, and canonical subject metadata. `public."TestAttempts"` is not counted as a second source.
- Only finalized, scored attempts with positive maximum marks and an exact canonical SubjectId/CourseId/semester catalog match are projected. `submitted`, `auto_submitted`, `disconnected`, and `timed_out` qualify. Waiting, in-progress, cancelled, unscored, unmapped, and ambiguous legacy attempts do not.
- `private.leaderboard_attempt_results` stores one normalized row per source attempt. `source_attempt_id` is the idempotency key, and PostgreSQL computes percentage from score divided by maximum marks.
- Database triggers keep the projection synchronized when normal attempts are finalized, Test Room arrays are written, a private attempt receives its `core_room_id`, or a source attempt is deleted. Existing eligible attempts are backfilled.

### Public snapshot semantics

- `public."Leaderboards"` contains one row per subject and at most 100 students. A unique index on `SubjectId` makes publication an upsert instead of allowing duplicate subject rows.
- The parallel arrays `StudentId`, `Points`, and `TotalTests` share the same ordering and length. `Points[i]` is the student's cumulative earned marks across all qualifying attempts for that subject; `TotalTests[i]` is the number of those attempts.
- Snapshot order is weighted percentage (sum of earned marks divided by sum of maximum marks), then cumulative earned marks, attempt count, and StudentId for deterministic ordering. This avoids treating a 5/5 attempt as equivalent to a 5/30 attempt merely because their raw points match.
- A strict 100-row cutoff is used for the published snapshot. Full rank calculation (including tied ranks), category filters, participants outside the Top 100, own-rank display, pagination, and the ranking UI/API are Phase 2 work. Detailed denominators and per-attempt filter metadata stay in the private projection.

### Phase 1 live verification

The production database migration `project_leaderboard_results_and_publish_top_100` is applied. The live backfill currently produced:

| Verification | Result |
|---|---:|
| Normal exam attempts projected | 0 |
| Test Room attempts projected | 4 |
| Total normalized results | 4 |
| Published subject snapshots | 2 |
| Duplicate source-attempt results | 0 |
| Submitted Test Room attempts excluded for ambiguous legacy subject metadata | 2 |
| Cancelled Test Room attempts excluded | 5 |
| Waiting Test Room attempts excluded | 7 |

Both published subjects have two aligned entries in each of the three arrays. A repeat projection and a no-op update to existing Test Room rows left the result counts unchanged, confirming idempotency and exercising the Test Room write trigger.

No eligible normal-exam attempt currently exists in this database, so the normal-exam projection trigger is installed but has not yet been runtime-tested against a real normal exam submission. It will be covered when Phase 1 receives a real normal-exam result.

### Security boundaries

The normalized result table and published leaderboard table remain unavailable to `anon` and `authenticated`. Projection and publisher functions live in the non-exposed `private` schema, pin an empty search path, and revoke direct execution from browser roles. Browser clients continue to use authenticated server endpoints; service-role credentials remain server-side only.

## What remains

Phase 2: build the secure ranking API and calculate overall/category-specific weighted percentages, competition ranks and ties, participant counts, Top X% / outside-Top-100 position, and the student's own rank. Then connect the existing leaderboard UI to real published snapshots and private supplemental metrics. No mock scores or ranks should be displayed.

## Previous hierarchy verification

- Live SQL smoke test: a temporary attempt was created, linked to catalog SubjectId `1001131010601`, submitted, and appeared in the server-side completed-subject feed with CourseId `1` and Semester `1`.
- Browser roles cannot execute the privileged leaderboard completed-subject RPC; only `service_role` can.
- The temporary smoke-test attempt, its private key, public attempt row, and public paper were deleted after verification.
- Regression tests cover completed-subject matching, ancestor-level locks, blocked direct navigation, access-verification failures, and unrestricted administrator preview. Repository CI/build checks remain required before release.
