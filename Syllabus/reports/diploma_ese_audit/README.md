# Diploma Studies ESE / Departmental Subject Audit

**Audit date:** 2026-10-13  
**Scope:** The six active Diploma programs in Supabase, CourseIds 44–49. No other departments were modified.

## Decision rule

- `isDepartmentalSubject = true`: the extracted official syllabus scheme specifies ESE marks of zero.
- `isDepartmentalSubject = false`: the extracted official syllabus scheme specifies positive ESE marks.
- `UNRESOLVED`: the PDF assessment scheme is missing/ambiguous or the source PDF's subject code/title mapping is flagged for review. Such rows are not counted as audited decisions.

## Results

| Diploma program | CourseId | Active subjects | Audited | ESE = 0 → true | ESE > 0 → false | Unresolved |
|---|---:|---:|---:|---:|---:|---:|
| Computer Engineering | 44 | 39 | 39 | 14 | 25 | 0 |
| Mechanical Engineering | 45 | 38 | 38 | 12 | 26 | 0 |
| Chemical Engineering | 46 | 38 | 38 | 13 | 25 | 0 |
| Electrical Engineering | 47 | 42 | 42 | 12 | 30 | 0 |
| Civil Engineering | 48 | 41 | 41 | 15 | 26 | 0 |
| Information and Communication Technology | 49 | 43 | 36 | 10 | 26 | 7 |
| **Total** | — | **241** | **234** | **76** | **158** | **7** |

## Unresolved subjects — do not infer their status

The seven ICT subjects below require direct PDF review or a corrected source mapping:

- Data Communication and Networking (09CT0404): extracted scheme missing.
- Engineering Mathematics (09MA1401): extracted scheme missing.
- Engineering Electromagnetics (09CT0511): extracted scheme missing.
- Game Development (09CT0514): source PDF/title mapping flagged for review.
- Optical and Satellite Communication (09CT0506): source PDF/title mapping flagged for review; extracted scheme missing.
- Cyber Security (09CT0610): extracted assessment table has an ambiguous column layout.
- Project-II (09CT0602): source PDF/title mapping flagged for review.

Their current database values are not audited conclusions. They currently read `false`; treat these as existing/default values until the source evidence resolves them. Do not use these seven rows as confirmed classifications in downstream logic.

## Per-program evidence files

Each CSV includes the subject ID, course/semester, official subject code, ESE marks when reliably extracted, resulting Boolean decision, audit status, reason, source JSON path, PDF URL/path, and extracted scheme text.

- `diploma_computer_engineering.csv`
- `diploma_mechanical_engineering.csv`
- `diploma_chemical_engineering.csv`
- `diploma_electrical_engineering.csv`
- `diploma_civil_engineering.csv`
- `diploma_information_and_communication_technology.csv`

Folder: `Syllabus/reports/diploma_ese_audit/`

## Implementation note

Only the Diploma programs listed above were updated. The audit uses extracted scheme text from the repository's semester JSON files; unresolved rows are explicitly retained for manual PDF verification. A successful Boolean write alone is not evidence that an ambiguous source was interpreted correctly.
