# Marwadi University B.Tech Syllabus Collection Kit

This is the middle-batch collector tool package. The canonical consolidated collection is in `../Programs/` and `../_PDF_Library/` relative to the parent root.

## Run on Windows

1. Ensure Python 3.10 or newer is available, then run `run_collector.bat` here.
2. Temporary results are generated below `run_output/`.
3. Review `run_output/B.Tech programs/00_Manifests/`, especially the collection manifest, missing-PDF report, source-page status, and GTU fallback queue.
4. Do not commit the temporary output or ZIP as another collection. Unique assets belong in the shared parent `_PDF_Library/`; program/semester associations belong in `_Catalogs/program_course_map.csv`.

## Source policy

Prefer direct PDFs from official Marwadi program pages. Use GTU only after a specific direct PDF and course match are reviewed and entered into `GTU_Fallback_Map.csv`. Network failures and blocked pages are not proof a syllabus does not exist, and another university's syllabus must not be substituted automatically.

The source catalog covers the 20 entries in `programs.csv`. ECE Robotics and ECE Internet of Things are marked prospectus-only because this source list did not confirm separate current course pages.

## Deduplication rule

Identical PDF bytes remain one file in the canonical `_PDF_Library/`. Preserve all program and semester associations in the course map; do not copy a shared syllabus into multiple program folders.
