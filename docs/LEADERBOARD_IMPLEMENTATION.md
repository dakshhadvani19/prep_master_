# Leaderboard implementation

## Phase 1 — hierarchy filters and subject access

**Status as of 2026-10-27:** Phase-1 filtering is implemented; database migrations are applied and smoke-tested. Ranking rows are intentionally not part of this phase.

### Filter sequence

1. **Department** — the six student-catalog groups from `src/data/catalogDomains.js`.
2. **Course** — loaded from the live `public.Courses` table and limited using `src/data/courseMapping.json`, because the public schema has no department column.
3. **Semester** — derived from live `public.Subjects.Semester` rows for the chosen course.
4. **Subject** — live catalog subjects for the selected course and semester.

Changing an earlier filter clears downstream choices. Search inputs only narrow the currently displayed course or subject list. The UI is responsive, keyboard-focusable, and uses restrained violet and gold accents rather than a full-page gradient.

### Unlock policy

- A student unlocks a subject after a qualifying attempt is **submitted/auto-submitted**, has a submission timestamp, has a score, and has a positive maximum mark.
- The subject is identified by its canonical `public.Subjects.SubjectId`, not only by a display name or short code.
- A new attempt submits a numeric catalog SubjectId to the authenticated backend. The backend verifies that ID against `public.Subjects` and stores the related SubjectId, CourseId and Semester in `private.exam_attempts`. Those values are not trusted from the browser.
- The browser never queries the private schema. `POST /api/leaderboard-filters` verifies the current Supabase access token and calls the service-role-only `pm_leaderboard_completed_subjects` function for that user. The data contains that student's qualifying subject access only, not other students or scores.
- An API or database verification error fails closed: the subject remains locked until access can be rechecked.

### Legacy attempts

Attempts created before the canonical SubjectId field existed stored a short subject code and name but not the course or semester. The backfill assigned canonical IDs only where the code uniquely identifies one catalog subject: four existing completions were mapped to Basics of Accounting (BCA, semester 2) and Fundamentals of Machine Learning (Diploma CE, semester 6). The two old Calculus attempts remain unassigned because code 01ma0106 occurs in seven different courses; unlocking all or one of those courses would be an unsupported guess. New normal exams and Test Room attempts launched from canonical catalog subject routes carry a server-verified canonical SubjectId.

### What is deliberately deferred

The private `leaderboard_attempt_results` projection currently has no populated ranking feed. Phase 1 does **not** display mock ranks, fabricated scores, a podium, or percentages. The next phase must populate/validate the private result projection from finalized attempts and implement ranking calculations, tie handling, pagination, own-rank display, and the visual results table against real data.

### Verification

- Live SQL smoke test: a temporary attempt was created, linked to catalog SubjectId `1001131010601`, submitted, and appeared in the server-side completed-subject feed with CourseId `1` and Semester `1`.
- Browser roles cannot execute the two privileged leaderboard RPCs; only `service_role` can.
- The temporary smoke-test attempt, its private key, public attempt row, and public paper were deleted after verification.
- Automated regression tests were updated, but a local full test/build run still needs to be executed.
