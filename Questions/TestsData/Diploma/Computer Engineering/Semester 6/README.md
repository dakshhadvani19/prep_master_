# Diploma Computer Engineering — Semester 6 Exam Bank v2

Canonical exam-aware bank for 5 active Semester 6 subjects (CourseId 44).

- [exam-bank-v2.json](./exam-bank-v2.json): canonical test rows and metadata.
- [seed-all-v2.sql](./seed-all-v2.sql): staged insert transaction.
- [manifest.json](./manifest.json): counts and exam rules.

## Exam rules

- `isDepartmentalSubject=false`: Mid 1 = four theory questions × 8 marks with model answers, limited to the first 50% of the syllabus; Mid 2 = 30 MCQs; ESE = four theory questions × 8 marks with model answers.
- `isDepartmentalSubject=true`: Mid 1 = 30 MCQs limited to the first 50% of the syllabus; Mid 2 = 30 MCQs; no ESE.
- Every generated exam type has 12 variants: 4 Easy, 4 Medium and 4 Hard.

## Counts

- semester: 6
- subjects: 5
- nonDepartmentalSubjects: 3
- departmentalSubjects: 2
- examTypeBanks: 13
- totalTests: 156
- mcqTests: 84
- theoryTests: 72
- mcqQuestions: 2520
- theoryQuestions: 288
- mcqOptionEntries: 10080
- answerEntries: 2808

The live table has only TestId, Questions, Options and Answers. Exam metadata is stored in JSON test_index. Theory rows use an empty Options array and store the model answers in Answers, so the consuming app must branch by format. The SQL is staged only; the current database remains unchanged. Review the question content before production insertion.
