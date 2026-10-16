# Diploma Chemical Engineering — Semester 2 Exam Bank v2

CourseId 46; 7 active subjects.

- [exam-bank-v2.json](./exam-bank-v2.json): question data, mappings and reuse audit.
- [seed-all-v2.sql](./seed-all-v2.sql): staged TestsData insert transaction.
- [manifest.json](./manifest.json): counts and exam rules.

## Structure
- `isDepartmentalSubject=false`: Mid1: four 8-mark theory questions with answers (first half syllabus); Mid2: 30 MCQs; ESE: four 8-mark theory questions with answers.
- `isDepartmentalSubject=true`: Mid1 and Mid2: 30 MCQs each; no ESE. Mid1 covers first half only.
- Every exam type has 12 variants: 4 Easy, 4 Medium, 4 Hard.

## Reuse
Existing CE rows are copied without rewriting Questions/Options/Answers only when syllabus topic alignment passes verification. See `reuseAudit` in the JSON. The table remains unchanged; review fresh draft questions before running SQL. Theory is identified by `Options=[]`.

## Counts
- semester: 2
- subjects: 7
- reusedSubjects: 4
- newDraftSubjects: 3
- nonDepartmentalSubjects: 4
- departmentalSubjects: 3
- examTypeBanks: 18
- totalTests: 216
- mcqTests: 120
- theoryTests: 96
- mcqQuestions: 3600
- theoryQuestions: 384
- mcqOptionEntries: 14400
- answerEntries: 3984


## Reuse verification update (2026-10-16)

All marked-reuse subjects have now been compared against the corresponding Computer Engineering source bank by exam type, difficulty and occurrence. **Every matching variant now reuses the source Questions, Options and Answers arrays verbatim**; Chemical Engineering TestIds and subject metadata remain intact.

- Verified copied variants in this semester: 132
- Existing payloads corrected to exact source copies: 99
- Syllabus-matched subjects: ENGINEERING DRAWING; ENVIRONMENT CONSERVATION & DISASTER MANAGEMENT; INTEGRATED PERSONALITY DEVELOPMENT COURSE-I; MATHEMATICS-II

Same-name subjects with materially different syllabi remain Chemical Engineering-specific drafts instead of being copied wholesale. The database is unchanged; the SQL is a staged export.
