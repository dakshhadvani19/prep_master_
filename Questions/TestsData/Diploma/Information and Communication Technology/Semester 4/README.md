# Diploma Information and Communication Technology — Semester 4 Exam Bank v2

- [exam-bank-v2.json](./exam-bank-v2.json): canonical TestId-wise payload and metadata.
- [answer-review-v2.json](./answer-review-v2.json): review-only MCQ rationales and reuse decisions.
- [seed-all-v2.sql](./seed-all-v2.sql): staged transaction (180 INSERT statements).
- [manifest.json](./manifest.json): counts, rules and syllabus reuse outcomes.

## Exam design

- `isDepartmentalSubject=false`: Mid 1 = four 8-mark theory questions with model answers (first half syllabus); Mid 2 = 30 MCQs; ESE = four 8-mark theory questions with model answers.
- `isDepartmentalSubject=true`: Mid 1 = 30 MCQs (first half syllabus); Mid 2 = 30 MCQs; no ESE.
- Every available exam type has 12 variants: 4 Easy, 4 Medium, 4 Hard.

## Counts

- semester: 4
- subjects: 6
- nonDepartmentalSubjects: 3
- departmentalSubjects: 3
- examTypeBanks: 15
- totalTests: 180
- mcqTests: 108
- theoryTests: 72
- mcqQuestions: 3240
- theoryQuestions: 288
- mcqOptionEntries: 12960
- answerEntries: 3528
- reusedSubjects: 1
- newSubjectBanks: 5

Exact normalized subject-name matches with compatible exam flags are copied verbatim; payloads are not regenerated. The live table has only TestId, Questions, Options and Answers; subject/exam/difficulty mappings are in test_index. Theory uses Options=[] and model answers in Answers, so the consuming application must support both row formats. No database rows are inserted by file generation. This bank remains a draft pending academic review.


## ICT-specific policy
- No exams or TestIds for project subjects.
- Compatible exact-name duplicate subjects reuse source payloads verbatim.
- New generated content is a draft and needs academic review.
