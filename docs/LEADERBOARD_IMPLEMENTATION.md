# Leaderboard implementation

## Hierarchy filters and subject access

**Status as of 2026-10-27:** Hierarchical access checks are implemented; database migrations are applied and smoke-tested. Ranking rows are not yet populated from verified exam results.

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

### What is deliberately deferred

The private `leaderboard_attempt_results` projection currently has no populated ranking feed. Phase 1 does **not** display mock ranks, fabricated scores, a podium, or percentages. Future ranking work must populate/validate the private result projection from finalized attempts and implement ranking calculations, tie handling, pagination, own-rank display, and the visual results table against real data.

### Verification

- Live SQL smoke test: a temporary attempt was created, linked to catalog SubjectId `1001131010601`, submitted, and appeared in the server-side completed-subject feed with CourseId `1` and Semester `1`.
- Browser roles cannot execute the two privileged leaderboard RPCs; only `service_role` can.
- The temporary smoke-test attempt, its private key, public attempt row, and public paper were deleted after verification.
- Automated regression tests were updated, but a local full test/build run still needs to be executed.
