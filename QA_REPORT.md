# PrepMaster Final Syllabus Dataset — QA Report

Generated: 2026-10-20

## Overview

This report documents validation, counts, known limitations, warnings, and discrepancies for the Final PrepMaster Syllabus Dataset derived from `PrepMaster_Syllabus_Input_Cleaned.zip`.

## Input vs Output Reconciliation

- **Input subjects (input manifest):** 1949
- **Input subjects with syllabus content:** 1620
- **Input subjects without syllabus content:** 329
- **Input practical files:** 471
- **Input filename collisions disambiguated:** 182

- **Output subjects:** 1949
- **Output ready (usable):** 1620
- **Output missing_syllabus:** 329
- **Output subjects with practicals:** 471
- **Output filename collisions disambiguated:** 0

Counts reconcile exactly with input manifest. No removals.

## Folder Structure Validation

- Required structure: `<Department-or-Category>/<Course-or-Branch>/<Subject>.json`
- Semester folders found: 0 (expected 0) — PASS
- All subject files are under department/course-or-branch folders. No semester folders were created. Semester is stored as metadata inside each JSON.

## JSON Parsing Validation

- Every JSON file in output was validated for parsing during generation. All files passed `json.load()`.
- Total JSON files validated: 2421 (syllabus + practicals + manifest)

## Manifest Path Resolution

- Every `syllabus_file` and `practicals_file` path in `manifest.json` was checked to resolve to an existing file.
- Result: PASS (all paths resolve)

## Empty Practical Files Check

- Empty practical files found: 0 (expected 0) — PASS
- No empty practical files exist. Practical files were created only when meaningful, non-empty practical content exists.

## Missing Syllabus Check

- Subjects with `status: missing_syllabus`: 329
- All missing-syllabus subjects contain an empty `chapters: []` array. No fabricated chapter content was added.
- Example missing subjects:
  - `B_Tech/CSE_Artificial_Intelligence/01AI0801_Major_Project_2_Internship.json` — Major Project - 2/Internship (dept: B_Tech, branch: CSE_Artificial_Intelligence)
  - `B_Tech/CSE_Artificial_Intelligence/01AI1709_Major_Project_1.json` — Major Project – 1 (dept: B_Tech, branch: CSE_Artificial_Intelligence)
  - `B_Tech/CSE_Artificial_Intelligence/01CE2102_Computer_Workshop.json` — Computer Workshop (dept: B_Tech, branch: CSE_Artificial_Intelligence)
  - `B_Tech/CSE_Artificial_Intelligence_and_Data_Science/01AD0801_Major_Project_2_Internship.json` — Major Project - 2/Internship (dept: B_Tech, branch: CSE_Artificial_Intelligence_and_Data_Science)
  - `B_Tech/CSE_Artificial_Intelligence_and_Data_Science/01AI0801_01AI0801.json` — 01AI0801 (dept: B_Tech, branch: CSE_Artificial_Intelligence_and_Data_Science)

## Practical Files Existence Check

- Practical files exist only when meaningful practical content exists: 471 subjects with practicals.
- No empty practical arrays or dummy files were created.
- No empty practical/tutorial chapter placeholders were copied into syllabus JSON.

## Duplicate Detection

- Duplicate subject codes (same code in same course/branch): 30
  - ('B_Tech', 'Computer_Engineering', '01CR0503') appears 2 times
  - ('Law_Arts', 'BA_LLB_Hons', '10CR0701') appears 3 times
  - ('Law_Arts', 'BA_LLB_Hons', '10FL0204') appears 4 times
  - ('Law_Arts', 'BA_LLB_Hons', '10FL1605') appears 2 times
  - ('Law_Arts', 'BA_LLB_Hons', '10FL1606') appears 2 times
  - ('Law_Arts', 'B_Com_LLB_HONS', '10CR0701') appears 3 times
  - ('Law_Arts', 'B_Com_LLB_HONS', '10FL0204') appears 4 times
  - ('Law_Arts', 'B_Com_LLB_HONS', '10FL1605') appears 2 times
  - ('Law_Arts', 'B_Com_LLB_HONS', '10FL1606') appears 2 times
  - ('Management_Studies', 'BBA_Business_Analytics', '04BA0602') appears 2 times
  - ('Management_Studies', 'BBA_HONS', '04BB0301') appears 2 times
  - ('Management_Studies', 'BBA_HONS', '04CR0301') appears 2 times
  - ('Management_Studies', 'BBA_HONS', '04OE0008') appears 2 times
  - ('Management_Studies', 'BBA_HONS', '04SC0001') appears 3 times
  - ('Management_Studies', 'BBA_HONS', '04SC0002') appears 3 times
  - ('Management_Studies', 'BBA_HONS', '04SC0003') appears 3 times
  - ('Management_Studies', 'BBA_HONS', '04SC0004') appears 3 times
  - ('Management_Studies', 'BBA_HONS', '04SC0005') appears 3 times
  - ('Management_Studies', 'BBA_HONS', '04SC0006') appears 3 times
  - ('Management_Studies', 'BBA_HONS', '04SC0007') appears 3 times

- These duplicates were **preserved** as separate records; no silent merging was performed. They are documented here for review.

- Apparent duplicate subject names (same name in same course/branch, case-insensitive): 78
  - ('Computer_Applications', 'Master_of_Computer_Applications', 'artificial intelligence') appears 2 times
  - ('Law_Arts', 'BA_LLB_Hons', 'criminology') appears 3 times
  - ('Law_Arts', 'BA_LLB_Hons', 'internship') appears 4 times
  - ('Law_Arts', 'BA_LLB_Hons', 'property law') appears 2 times
  - ('Law_Arts', 'BA_LLB_Hons', 'intellectual property law') appears 2 times
  - ('Law_Arts', 'BA_in_Socialogy_Psychology_Political_Science', 'science') appears 2 times
  - ('Law_Arts', 'B_Com_LLB_HONS', 'criminology') appears 3 times
  - ('Law_Arts', 'B_Com_LLB_HONS', 'internship') appears 4 times
  - ('Law_Arts', 'B_Com_LLB_HONS', 'property law') appears 2 times
  - ('Law_Arts', 'B_Com_LLB_HONS', 'intellectual property law') appears 2 times
  - ('Management_Studies', 'BBA', 'accounts executive') appears 2 times
  - ('Management_Studies', 'BBA', 'business correspondent / facilitator') appears 3 times
  - ('Management_Studies', 'BBA', 'career readiness program') appears 2 times
  - ('Management_Studies', 'BBA', 'credit processing officer') appears 3 times
  - ('Management_Studies', 'BBA', 'customer care executive domestic -voice') appears 3 times
  - ('Management_Studies', 'BBA', 'insurance agent') appears 3 times
  - ('Management_Studies', 'BBA', 'microfinance executive') appears 3 times
  - ('Management_Studies', 'BBA', 'mutual fund distributor') appears 3 times
  - ('Management_Studies', 'BBA', 'voice') appears 3 times
  - ('Management_Studies', 'BBA_Aviation', 'accounts executive') appears 3 times

- These are preserved as distinct records (often differentiated by semester or subject_code). No records were merged.

## Filename Collision Handling

- Filename collisions disambiguated in output: 0
- No filename collisions occurred beyond input's prior disambiguation (input had 182 collisions already handled).
- All filenames are filesystem-safe (alphanumeric, underscore, dash, dot only).

## Content Preservation & Cleaning

- Syllabus content wording and chapter order were preserved exactly from source.
- Only empty placeholders, whitespace-only entries, and duplicate empty headings were removed.
- No missing syllabus content, practicals, or topics were invented.
- No corrections were guessed for corrupted OCR text; uncertain text is reported below.

## Uncertain / Corrupted Source Text

- No obvious corrupted OCR markers (like `�`) were detected in the cleaned input.
- Input had already been normalized for whitespace and empty fragments.

## Warnings Summary

- Total warnings: 108
- Duplicate subject_code ('B_Tech', 'Computer_Engineering', '01CR0503') appears 2 times
- Duplicate subject_code ('Law_Arts', 'BA_LLB_Hons', '10CR0701') appears 3 times
- Duplicate subject_code ('Law_Arts', 'BA_LLB_Hons', '10FL0204') appears 4 times
- Duplicate subject_code ('Law_Arts', 'BA_LLB_Hons', '10FL1605') appears 2 times
- Duplicate subject_code ('Law_Arts', 'BA_LLB_Hons', '10FL1606') appears 2 times
- Duplicate subject_code ('Law_Arts', 'B_Com_LLB_HONS', '10CR0701') appears 3 times
- Duplicate subject_code ('Law_Arts', 'B_Com_LLB_HONS', '10FL0204') appears 4 times
- Duplicate subject_code ('Law_Arts', 'B_Com_LLB_HONS', '10FL1605') appears 2 times
- Duplicate subject_code ('Law_Arts', 'B_Com_LLB_HONS', '10FL1606') appears 2 times
- Duplicate subject_code ('Management_Studies', 'BBA_Business_Analytics', '04BA0602') appears 2 times
- Duplicate subject_code ('Management_Studies', 'BBA_HONS', '04BB0301') appears 2 times
- Duplicate subject_code ('Management_Studies', 'BBA_HONS', '04CR0301') appears 2 times
- Duplicate subject_code ('Management_Studies', 'BBA_HONS', '04OE0008') appears 2 times
- Duplicate subject_code ('Management_Studies', 'BBA_HONS', '04SC0001') appears 3 times
- Duplicate subject_code ('Management_Studies', 'BBA_HONS', '04SC0002') appears 3 times
- Duplicate subject_code ('Management_Studies', 'BBA_HONS', '04SC0003') appears 3 times
- Duplicate subject_code ('Management_Studies', 'BBA_HONS', '04SC0004') appears 3 times
- Duplicate subject_code ('Management_Studies', 'BBA_HONS', '04SC0005') appears 3 times
- Duplicate subject_code ('Management_Studies', 'BBA_HONS', '04SC0006') appears 3 times
- Duplicate subject_code ('Management_Studies', 'BBA_HONS', '04SC0007') appears 3 times
- Duplicate subject_code ('Management_Studies', 'BBA_HONS', '04SC0008') appears 3 times
- Duplicate subject_code ('Management_Studies', 'B_Com', '04BC0206') appears 2 times
- Duplicate subject_code ('Management_Studies', 'MBA', '04MB0231') appears 2 times
- Duplicate subject_code ('Management_Studies', 'MBA', '04MB0303') appears 2 times
- Duplicate subject_code ('Management_Studies', 'MBA', '04MB0337') appears 2 times
- Duplicate subject_code ('Management_Studies', 'MBA', '04MB0343') appears 2 times
- Duplicate subject_code ('Management_Studies', 'MBA', '04MB0350') appears 2 times
- Duplicate subject_code ('Science_Pharmacy', 'B_Pharm', '13OE0002') appears 3 times
- Duplicate subject_code ('Science_Pharmacy', 'B_Pharm', '13OE0003') appears 3 times
- Duplicate subject_code ('Science_Pharmacy', 'B_Pharm', '13PH0803') appears 3 times
- ... and 78 more warnings (see manifest.json warnings_summary)

## Validation Checklist (Required)

1. ✅ Every JSON file parses.
2. ✅ Every manifest path resolves to an existing file.
3. ✅ No semester directories exist.
4. ✅ No empty practical files exist.
5. ✅ Missing-syllabus subjects contain no fabricated chapter content.
6. ✅ Practical files exist only when meaningful practical content exists.
7. ✅ Duplicate records, filename collisions, missing content, and uncertain source text are reported.
8. ✅ Final counts reconcile with input manifest, with removals/discrepancies explained (none removed beyond cleaning).

## Deliverables in ZIP

1. Department/course-or-branch subject JSON files (`<Department>/<CourseOrBranch>/<Subject>.json`)
   - Count: 1949
2. Meaningful practical JSON files (`<Subject>_practicals.json`)
   - Count: 471
3. Root `manifest.json` (lists every subject with metadata, paths, status, source, totals)
4. Root `QA_REPORT.md` (this file)

## Known Limitations

- Semester values are `null` for many subjects (1820+ records) where source did not specify semester; this is preserved as null per input.
- Subject codes are `null` for many Law & Arts, Management Studies, and Science/Pharmacy records where source had no code; preserved as null.
- Subject IDs are `null` for all records (source input had no subject_id; where available in external DB it was not part of cleaned input and not inferred).
- Source field contains `source_pdf` or `source_syllabus_path` from input manifest where available; for Diploma and Other_Departments this is populated, else null.
- Practicals are preserved only where input had non-empty practical entries; no new practicals were inferred from subject names.

## Reproducibility

- Input: `PrepMaster_Syllabus_Input_Cleaned.zip` (1949 subjects, 471 practicals)
- Output: `PrepMaster_Final_Syllabus_Dataset` (1949 syllabus files, 471 practical files)
- Transformation completed without external research or official-PDF audit, prioritizing completion and validation from supplied ZIP.
