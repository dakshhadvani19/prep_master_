# Diploma Information and Communication Technology — Semester 6 Exam Bank v2

- [exam-bank-v2.json](./exam-bank-v2.json): canonical TestId-wise payload and metadata.
- [answer-review-v2.json](./answer-review-v2.json): review-only MCQ rationales and reuse decisions.
- [seed-all-v2.sql](./seed-all-v2.sql): staged transaction (396 INSERT statements).
- [manifest.json](./manifest.json): counts, rules and syllabus reuse outcomes.

## Exam design

- `isDepartmentalSubject=false`: Mid 1 = four 8-mark theory questions with model answers (first half syllabus); Mid 2 = 30 MCQs; ESE = four 8-mark theory questions with model answers.
- `isDepartmentalSubject=true`: Mid 1 = 30 MCQs (first half syllabus); Mid 2 = 30 MCQs; no ESE.
- Every available exam type has 12 variants: 4 Easy, 4 Medium, 4 Hard.

## Counts

- semester: 6
- subjects: 11
- nonDepartmentalSubjects: 11
- departmentalSubjects: 0
- examTypeBanks: 33
- totalTests: 396
- mcqTests: 132
- theoryTests: 264
- mcqQuestions: 3960
- theoryQuestions: 1056
- mcqOptionEntries: 15840
- answerEntries: 5016
- reusedSubjects: 0
- newSubjectBanks: 11

Same-title subjects are reused only when their syllabus aligns. The live table has only TestId, Questions, Options and Answers; subject/exam/difficulty mappings are in test_index. Theory uses Options=[] and model answers in Answers, so the consuming application must support both row formats. No database rows are inserted by file generation. This bank remains a draft pending academic review.


ICT rule: Project-II and all other Project-title subjects are excluded completely. All newly generated items are draft content pending academic QA.
