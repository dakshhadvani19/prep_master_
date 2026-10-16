# Diploma Chemical Engineering — Semester 3 Exam Bank v2

CourseId 46; 5 active subjects.

- [exam-bank-v2.json](./exam-bank-v2.json): test payloads and reuse audit.
- [seed-all-v2.sql](./seed-all-v2.sql): staged transaction.
- [manifest.json](./manifest.json): counts and format rules.

Non-departmental: Mid1/ESE have four 8-mark theory questions with answers; Mid2 has 30 MCQs. Departmental: Mid1/Mid2 have 30 MCQs, no ESE. Mid1 uses first-half syllabus. Every exam type has 12 variants (4 Easy, 4 Medium, 4 Hard). Reuse occurs only when syllabus topics match; new items need review. Database is unchanged.

- semester: 3
- subjects: 5
- reusedSubjects: 1
- newDraftSubjects: 4
- nonDepartmentalSubjects: 4
- departmentalSubjects: 1
- examTypeBanks: 14
- totalTests: 168
- mcqTests: 72
- theoryTests: 96
- mcqQuestions: 2160
- theoryQuestions: 384
- mcqOptionEntries: 8640
- answerEntries: 2544


## Reuse verification update (2026-10-16)

All marked-reuse subjects have now been compared against the corresponding Computer Engineering source bank by exam type, difficulty and occurrence. **Every matching variant now reuses the source Questions, Options and Answers arrays verbatim**; Chemical Engineering TestIds and subject metadata remain intact.

- Verified copied variants in this semester: 36
- Existing payloads corrected to exact source copies: 27
- Syllabus-matched subjects: MATHEMATICS-III

Same-name subjects with materially different syllabi remain Chemical Engineering-specific drafts instead of being copied wholesale. The database is unchanged; the SQL is a staged export.
