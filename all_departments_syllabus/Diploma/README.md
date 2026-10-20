# Diploma Syllabus Dataset

This directory contains verified Diploma syllabus and practical JSON files extracted from
`PrepMaster_Final_Syllabus_Dataset.zip` (the validated final syllabus dataset).

## Directory Structure

```
Diploma/
├── README.md
├── Chemical_Engineering/
│   ├── <Subject_Code>_<Subject_Name>.json
│   └── <Subject_Code>_<Subject_Name>_practicals.json   (only when practicals exist)
├── Civil_Engineering/
├── Computer_Engineering/
├── Electrical_Engineering/
├── Information_and_Communication_Technology/
└── Mechanical_Engineering/
```

Each subject file follows the schema:

```json
{
  "schema_version": "1.0",
  "status": "ready",
  "subject": {
    "name": "Subject Name",
    "subject_code": "09CH2102",
    "subject_id": null,
    "department": "Diploma",
    "course_or_branch": "Chemical Engineering",
    "semester": 2,
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

Practical files (`*_practicals.json`) are sibling files included only when meaningful,
non-empty practical content exists:

```json
{
  "schema_version": "1.0",
  "subject": { ... },
  "practicals": [
    {
      "practical_number": 1,
      "title": "Experiment-1",
      "content": ["description line 1", "description line 2"]
    }
  ]
}
```

## Counts

| Branch | Subjects | Practical Files |
|--------|----------|-----------------|
| Chemical Engineering | 38 | 31 |
| Civil Engineering | 41 | 34 |
| Computer Engineering | 39 | 30 |
| Electrical Engineering | 42 | 24 |
| Information and Communication Technology | 43 | 26 |
| Mechanical Engineering | 38 | 31 |
| **Total** | **241** | **176** |

- Total JSON files: **417** (241 syllabus + 176 practicals)
- Branches: **6**
- All subjects have status `ready` with non-empty `chapters` arrays
- All practical files have non-empty `practicals` arrays
- No `missing_syllabus` entries in this Diploma subset

## Validation

All 417 files passed structural validation:

- Every file parses as valid JSON
- Every subject has non-empty `chapters` array
- Every chapter has a `chapter_name` and non-empty `content` array
- Every practical file has a non-empty `practicals` array
- All files are placed under the correct `Diploma/<Branch>/` directory
- Content, chapter order, topic wording, metadata, subject codes, and practical
  content are preserved exactly from the source ZIP — no merging, renaming, or
  modification of records

## Source

Extracted from `PrepMaster_Final_Syllabus_Dataset.zip`, which is derived from
`PrepMaster_Syllabus_Input_Cleaned.zip`. The ZIP, `manifest.json`, and `QA_REPORT.md`
are retained at the repository root.

> **Note:** Structural validation confirms file integrity and schema conformance.
> It does not establish exact agreement with official source PDFs. Syllabus content
> is preserved as-is from the validated dataset without modification.