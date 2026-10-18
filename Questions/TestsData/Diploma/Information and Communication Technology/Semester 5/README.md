# Diploma Information and Communication Technology — Semester 5 Exam Bank v2

- [exam-bank-v2.json](./exam-bank-v2.json): canonical TestId-wise payload and metadata.
- [answer-review-v2.json](./answer-review-v2.json): review-only MCQ rationales and reuse decisions.
- [seed-all-v2.sql](./seed-all-v2.sql): staged transaction (456 INSERT statements).
- [manifest.json](./manifest.json): counts, rules and syllabus reuse outcomes.

## Exam design

- `isDepartmentalSubject=false`: Mid 1 = four 8-mark theory questions with model answers (first half syllabus); Mid 2 = 30 MCQs; ESE = four 8-mark theory questions with model answers.
- `isDepartmentalSubject=true`: Mid 1 = 30 MCQs (first half syllabus); Mid 2 = 30 MCQs; no ESE.
- Every available exam type has 12 variants: 4 Easy, 4 Medium, 4 Hard.

## Counts

- semester: 5
- subjects: 13
- nonDepartmentalSubjects: 12
- departmentalSubjects: 1
- examTypeBanks: 38
- totalTests: 456
- mcqTests: 168
- theoryTests: 288
- mcqQuestions: 5040
- theoryQuestions: 1152
- mcqOptionEntries: 20160
- answerEntries: 6192
- reusedSubjects: 0
- newSubjectBanks: 13

Same-title subjects are reused only when their syllabus aligns. The live table has only TestId, Questions, Options and Answers; subject/exam/difficulty mappings are in test_index. Theory uses Options=[] and model answers in Answers, so the consuming application must support both row formats. No database rows are inserted by file generation. This bank remains a draft pending academic review.


ICT rule: project subjects are excluded completely. Generated question pools and model answers are drafts pending academic QA.
