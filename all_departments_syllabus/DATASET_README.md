# PrepMaster Final Syllabus Dataset — Individual JSON Files

This directory contains the complete verified syllabus dataset extracted from
`PrepMaster_Final_Syllabus_Dataset.zip` as individually accessible JSON files,
organized by department and branch/course.

## Directory Structure

```
B_Tech/
  <Branch_Name>/
    <Subject_Code>_<Subject_Name>.json
    <Subject_Code>_<Subject_Name>_practicals.json   (only when practicals exist)
Computer_Applications/
  ...
Diploma/
  ...
Law_Arts/
  ...
Management_Studies/
  ...
Science_Pharmacy/
  ...
```

## Department Summary

| Department | Subjects | Practical Files | Total Files |
|------------|----------|-----------------|-------------|
| B_Tech | 313 | 236 | 549 |
| Computer_Applications | 77 | 18 | 95 |
| Diploma | 241 | 176 | 417 |
| Law_Arts | 225 | 4 | 229 |
| Management_Studies | 795 | 1 | 796 |
| Science_Pharmacy | 298 | 36 | 334 |
| **Total** | **1,949** | **471** | **2,420** |

Each subject file follows the schema:

```json
{
  "schema_version": "1.0",
  "status": "ready",
  "subject": {
    "name": "Subject Name",
    "subject_code": "09CH2102",
    "subject_id": null,
    "department": "B.Tech",
    "course_or_branch": "CSE Artificial Intelligence",
    "semester": 1,
    "source": "..."
  },
  "chapters": [
    {
      "chapter_number": 1,
      "chapter_name": "Chapter Name",
      "content": ["line 1", "line 2"]
    }
  ]
}
```

Subjects with `status: "missing_syllabus"` have an empty `chapters: []` array — no content is fabricated.

Practical files (`*_practicals.json`) are sibling files included only when meaningful, non-empty practical content exists:

```json
{
  "schema_version": "1.0",
  "subject": { ... },
  "practicals": [
    {
      "practical_number": 1,
      "title": "Experiment-1",
      "content": ["description line 1"]
    }
  ]
}
```

## File Naming

- Filenames are filesystem-safe (derived from the source ZIP)
- Original subject names are preserved inside each JSON
- Duplicate subject codes and names are preserved as separate records (30 duplicate code groups, 78 duplicate name groups documented in `QA_REPORT.md`)
- No semester folders exist — semester is stored as metadata inside each JSON

## Validation

All 2,420 JSON files passed structural validation:

- Every file parses as valid JSON
- Every `ready` subject has a non-empty `chapters` array
- Every chapter has a `chapter_name` and non-empty `content` array
- Every practical file has a non-empty `practicals` array
- All files are placed under the correct department/branch directory
- Content, chapter order, topic wording, metadata, subject codes, and practical
  content are preserved exactly from the source ZIP — no merging, renaming, or
  modification of records

## Source Files (retained at repository root)

- `PrepMaster_Final_Syllabus_Dataset.zip` — complete dataset archive (2.9 MB)
- `manifest.json` — per-subject index with totals, duplicates, and warnings
- `QA_REPORT.md` — validation report and known limitations

> **Note:** Structural validation confirms file integrity and schema conformance.
> It does not establish exact agreement with official source PDFs. Syllabus
> content is preserved as-is from the validated dataset without modification.