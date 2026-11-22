# Mid-2 — MCQ / Objective Examination

Use this prompt for Mid-2 when the backend has verified that the selected subject/course permits this exam. Under the current canonical policy, Mid-2 is MCQ for both departmental and non-departmental subjects. If authoritative course policy explicitly differs, stop and flag the exception.

## Exam objective
Generate a balanced objective examination over the verified Mid-2 syllabus scope. Do not assume that Mid-2 repeats Mid-1's scope or that the exam covers the full syllabus unless the supplied course policy says so.

## Blueprint
- Exactly 30 MCQs.
- Exactly four distinct, non-empty options per question.
- Exactly one defensibly correct option per question.
- Exactly 30 zero-based answer indices: 0 = A, 1 = B, 2 = C, 3 = D.
- Balance correct answer positions; avoid predictable patterns.
- If the database contract requires flattened Options, output options in question order (four per question, 120 entries total after mapping).

## Question quality
- Cover the important concepts across the explicitly supplied eligible syllabus, using official unit weightage where available.
- Avoid duplicate/rephrased questions within the test, implausible distractors, unsupported claims and ambiguous stems.
- For numerical questions, verify the calculation, units and rounding and ensure the correct option matches the answer.
- Use application, interpretation, calculations, code or practical scenarios only when supported by the syllabus and selected difficulty.
- Do not add content merely to make the paper harder or longer.

## Output
Follow the exact output schema supplied by the backend. Include the correct answer key for backend scoring, but never expose it to the frontend during the attempt. Return only valid machine-readable JSON.
