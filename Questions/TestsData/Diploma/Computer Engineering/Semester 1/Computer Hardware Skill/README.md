# Computer Hardware Skill — TestsData-ready bank

- CourseId 44; SubjectId 44000935210301; Semester 1.
- 12 tests × 10 MCQs = 120 questions. Tests 01–04 Easy, 05–08 Medium, 09–12 Hard.
- Test JSON contains exactly TestId, Questions, Options, Answers for the current table. Options are flattened A-D by question; Answers are zero-based indices.
- Manifest maps occurrence/difficulty; answer-review.json is QA-only; seed.sql inserts all records transactionally without ON CONFLICT.
- Source coverage: computer organization, motherboard/CPU/memory/BIOS, connectors/power, OS installations, peripherals, keyboard/mouse/monitor/printer/speaker/microphone, magnetic/optical/flash storage, disk capacity/access/transfer, partition/format/upgrade, laptop battery/power/ports/graphics.
- Structural validation passed: 12 unique IDs, 4 tests per difficulty, 10 Questions/40 Options/10 Answers per test, unique non-empty options, valid answer indices, unique stems, BIGINT range. Technical/distractor final review is still recommended before inserting.
