# Law & Arts syllabus collection cleanup

Updated: 2026-10-12  
Scope: `Syllabus/Law_Arts_Recovery_Kit_1/Law_Arts_Syllabus_Recovery_Kit/`

## Current retained collection

- The pre-cleanup collection contained 154 downloaded PDF files (run dated 2026-10-11).
- The current `law-arts` catalog has 229 subject occurrences across 149 normalized title groups.
- This cleanup retains 130 distinct PDF files corresponding to titles still present in the current catalog.
- 24 PDF files tied to archived/removed catalog titles were removed from the active collection (about 5.51 MiB).
- 33 current subject occurrences across 19 title groups remain `NETWORK_UNVERIFIED_RETRY`. Those subjects were not deleted from the catalog; no local PDF is claimed for them.

## Why PDFs were removed

The prior audit archived the listed source titles because they were fragments, ambiguous common-word labels, code/scope mismatches, duplicate-content false positives, or otherwise did not provide a dependable one-to-one mapping to the active subject. After that catalog cleanup, these PDFs no longer belong in the current active collection. This does **not** imply that a corresponding syllabus does not exist externally.

- `Democracy in India [d484a5c8e5b4].pdf` — archived/removed subject title; TITLE_OVERLAP_ONLY_MANUAL_REVIEW.
- `HOUSE 1 COURT I) 4 WEEKS [979f7f15ea7c].pdf` — archived/removed subject title; TITLE_OVERLAP_ONLY_MANUAL_REVIEW.
- `HOUSE 2) 4 WEEKS [0e00f22b6950].pdf` — archived/removed subject title; TITLE_OVERLAP_ONLY_MANUAL_REVIEW.
- `Differences [06bc183f042c].pdf` — archived/removed subject title; CATALOG_TITLE_FRAGMENT_REPAIR.
- `environment [c6e454d960df].pdf` — archived/removed subject title; CATALOG_TITLE_FRAGMENT_REPAIR.
- `GOVERNANCE [56b8e6bb9574].pdf` — archived/removed subject title; CATALOG_TITLE_FRAGMENT_REPAIR.
- `III) [425ffc1422dc].pdf` — archived/removed subject title; CATALOG_TITLE_FRAGMENT_REPAIR.
- `INDICATIONS - Intellectual Property Law [2f0cdaecbc87].pdf` — archived/removed subject title; CATALOG_TITLE_FRAGMENT_REPAIR.
- `INTERFACE [5ea2d81a89e0].pdf` — archived/removed subject title; CATALOG_TITLE_FRAGMENT_REPAIR.
- `MOTOR VEHICLE ACT,1988 [6b388a3326b2].pdf` — archived/removed subject title; CATALOG_TITLE_FRAGMENT_REPAIR.
- `POLITICS [4c5fd84e89ed].pdf` — archived/removed subject title; CATALOG_TITLE_FRAGMENT_REPAIR.
- `PRACTICES) [9e53df54c26b].pdf` — archived/removed subject title; CATALOG_TITLE_FRAGMENT_REPAIR.
- `& PROSPECTS [520b17191a8c].pdf` — archived/removed subject title; CATALOG_TITLE_FRAGMENT_REPAIR.
- `RELATIONS [9649007e163d].pdf` — archived/removed subject title; CATALOG_TITLE_FRAGMENT_REPAIR.
- `SERVICES [3e7aaa79601a].pdf` — archived/removed subject title; CATALOG_TITLE_FRAGMENT_REPAIR.
- `SYSTEM [317f1e761f2f].pdf` — archived/removed subject title; CATALOG_TITLE_FRAGMENT_REPAIR.
- `THOUGHT [af93b3913b93].pdf` — archived/removed subject title; CATALOG_TITLE_FRAGMENT_REPAIR.
- `FINANCIAL ACCOUNTING [16d98d0e1685].pdf` — archived/removed subject title; DUPLICATE_COURSE_SCOPE_REVIEW.
- `PRINCIPLES OF MARKETING [a88ddc633b2c].pdf` — archived/removed subject title; DUPLICATE_COURSE_SCOPE_REVIEW.
- `II) [3918373cf555].pdf` — archived/removed subject title; DUPLICATE_CONTENT_FALSE_POSITIVE_REVIEW.
- `world [7c211433f020].pdf` — archived/removed subject title; DUPLICATE_CONTENT_FALSE_POSITIVE_REVIEW.
- `LAW [c660f2f32daf].pdf` — archived/removed subject title; POTENTIAL_FALSE_POSITIVE_COMMON_WORD.
- `National cadet corps-3 [940c0d8c31b7].pdf` — archived/removed subject title; TITLE_MATCH_CODE_UNCONFIRMED.
- `Psychology [03eef13b7003].pdf` — archived/removed subject title; TITLE_MATCH_CODE_UNCONFIRMED.

Two filenames were also confirmed as exact duplicate Git blobs: `II) [3918373cf555].pdf` is byte-identical to the canonical `ECONOMICS II [aabcee025a32].pdf`, and `world [7c211433f020].pdf` is byte-identical to `Religion and world politics [1a2a79976f0b].pdf`. The fragment-named copies were removed; canonical files were retained.

## Generated outputs pruned

Removed redundant first-pass or verbose transient outputs:
- `duplicate_subject_titles_initial.csv`
- `unique_download_list_initial.csv`
- `run_log.txt`
- `source_attempts.csv`

The final validation report, duplicate/scope report, source catalog snapshot, occurrence report, failed titles and network failures are retained for provenance and retry work.

## Use for development and question generation

- Use `Output/ACTIVE_PDF_MANIFEST.csv` as the current occurrence-to-PDF index. It has one row per current subject/course/semester, and leaves `pdf_path` blank where no local PDF is available.
- `PDF_PRESENT_TITLE_LEVEL_VERIFIED` means the title-level PDF check passed. It is not a substitute for checking code and semester scope when the same title appears across programs.
- `NETWORK_UNVERIFIED_RETRY_NO_LOCAL_PDF` indicates a source-access failure, not absence of a syllabus.
- Other CSVs from the original run are historical run reports and may reference PDFs removed by this curation.
- No source subject records, Supabase rows, production files, or live website settings were changed by this cleanup.
