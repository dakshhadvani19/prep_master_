# Diploma Chemical Engineering — Semester 1 Exam Bank v2

CourseId 46; 8 active subjects.

## Canonical files
- [exam-bank-v2.json](./exam-bank-v2.json): payloads, exam mapping, source-syllabus match audit.
- [seed-all-v2.sql](./seed-all-v2.sql): staged TestsData transaction.
- [manifest.json](./manifest.json): counts and rules.

## Exam rules
- `isDepartmentalSubject=false`: Mid1 = four 8-mark theory questions and answers, first half syllabus only; Mid2 = 30 MCQs; ESE = four 8-mark theory questions and answers.
- `isDepartmentalSubject=true`: Mid1/Mid2 = 30 MCQs; Mid1 only first half; no ESE.
- Each existing exam type has 12 variants: 4 Easy, 4 Medium, 4 Hard.

## Reuse policy
Verified CE source payloads have now been copied verbatim where matched syllabus units/topics meet the threshold; only the target TestId and metadata are remapped. 5 subjects were reused; rejected candidates were drafted against their own syllabus. See reuseAudit in the JSON.

## Counts
- semester: 1
- subjects: 8
- reusedSubjects: 0
- newDraftSubjects: 8
- nonDepartmentalSubjects: 5
- departmentalSubjects: 3
- examTypeBanks: 21
- totalTests: 252
- mcqTests: 132
- theoryTests: 120
- mcqQuestions: 3960
- theoryQuestions: 480
- mcqOptionEntries: 15840
- answerEntries: 4440

The database is unchanged. Recheck TestId collisions before running SQL. New draft questions and answers need a content QA pass. Theory rows are indicated by `Options=[]`.


## Reuse verification update (2026-10-16)

All marked-reuse subjects have now been compared against the corresponding Computer Engineering source bank by exam type, difficulty and occurrence. **Every matching variant now reuses the source Questions, Options and Answers arrays verbatim**; Chemical Engineering TestIds and subject metadata remain intact.

- Verified copied variants in this semester: 156
- Existing payloads corrected to exact source copies: 117
- Syllabus-matched subjects: BHARATIYA KNOWLEDGE SYSTEM; COMMUNICATION SKILLS; COMPUTER FUNDAMENTAL SKILL; INDIAN CONSTITUTION; MATHEMATICS-I

Same-name subjects with materially different syllabi remain Chemical Engineering-specific drafts instead of being copied wholesale. The database is unchanged; the SQL is a staged export.
