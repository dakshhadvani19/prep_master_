# Diploma Computer Engineering — Semester 4 Exam Bank v2

Canonical exam-aware bank for 6 active Semester 4 subjects (CourseId 44).

- [exam-bank-v2.json](./exam-bank-v2.json): canonical test rows and metadata.
- [seed-all-v2.sql](./seed-all-v2.sql): staged transaction.
- [manifest.json](./manifest.json): counts and rules.

## Exam rules

- `isDepartmentalSubject=false`: Mid 1 = four 8-mark theory questions with model answers, restricted to the first half; Mid 2 = 30 MCQs; ESE = four 8-mark theory questions with model answers.
- `isDepartmentalSubject=true`: Mid 1 = 30 MCQs, restricted to the first half; Mid 2 = 30 MCQs; no ESE.
- Every available exam type has 12 variants: 4 Easy, 4 Medium, 4 Hard.

## Counts

- semester: 4
- subjects: 6
- nonDepartmentalSubjects: 4
- departmentalSubjects: 2
- examTypeBanks: 16
- totalTests: 192
- mcqTests: 96
- theoryTests: 96
- mcqQuestions: 2880
- theoryQuestions: 384
- mcqOptionEntries: 11520
- answerEntries: 3264

TestsData has only TestId, Questions, Options and Answers. Additional metadata is stored in test_index. Theory rows use Options=[] and model answers in Answers, so the consuming application must support both formats. This is an uninserted draft and requires content review before production.
