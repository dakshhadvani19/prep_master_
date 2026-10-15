# Diploma Computer Engineering — Semester 3 Exam Bank v2

Canonical exam-type-aware bank for 6 active Semester 3 subjects (CourseId 44).

- [exam-bank-v2.json](./exam-bank-v2.json): canonical test rows and metadata.
- [seed-all-v2.sql](./seed-all-v2.sql): staged transaction.
- [manifest.json](./manifest.json): counts and rules.

## Exam rules

- `isDepartmentalSubject=false`: Mid 1 = four theory questions × 8 marks with model answers (first half syllabus); Mid 2 = 30 MCQs; ESE = four theory questions × 8 marks with model answers.
- `isDepartmentalSubject=true`: Mid 1 = 30 MCQs (first half); Mid 2 = 30 MCQs; no ESE.
- Each available exam type has 12 variants: 4 Easy, 4 Medium, 4 Hard.

## Counts

- semester: 3
- subjects: 6
- nonDepartmentalSubjects: 5
- departmentalSubjects: 1
- examTypeBanks: 17
- totalTests: 204
- mcqTests: 84
- theoryTests: 120
- mcqQuestions: 2520
- theoryQuestions: 480
- mcqOptionEntries: 10080
- answerEntries: 3000

TestsData has only TestId, Questions, Options and Answers. Other metadata is in test_index. Theory rows have Options=[] and model answers in Answers; the application must support both formats. This is an uninserted draft: verify IDs and review answers/options before production.
