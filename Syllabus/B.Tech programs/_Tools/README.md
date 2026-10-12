# B.Tech collection tools and audit records

This folder retains all three batch collectors, their configuration and tests, and the original audit reports. The PDFs from those runs have been consolidated under the parent folder's shared `_PDF_Library`; the program indexes link to those unique files.

## Tool packages

- `Batch_1_First_Collector/` — first five B.Tech program pages plus the original manifest and missing-PDF reports.
- `Batch_2_Official_Collector/` — official-page collector and source catalog for all 20 program entries. Its checked-in run generated source/template structure but no actual PDFs.
- `Batch_3_Verified_Recovery/` — targeted recovery tool with source inputs, tests, validation report, and recovery manifest.

## Avoiding duplicates

The canonical PDF store is `../_PDF_Library/`. Each distinct PDF content appears once; program indexes link to it. Generated collector output folders and ZIP archives are ignored by Git. Do not commit raw output folders as a second syllabus collection. Review new files against the library and update the catalogs only after deduplicating.
