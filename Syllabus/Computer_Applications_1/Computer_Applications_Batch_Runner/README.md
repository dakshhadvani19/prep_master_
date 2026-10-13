# Computer Applications syllabus batch runner (BCA + MCA)

This package replaces the earlier 56-occurrence collection approach, which was based on the old `mockData.js` snapshot (BCA 05BC11xx–05BC17xx and MCA legacy codes). The current Marwadi University pages show a newer BCA (Hons.) scheme and a different MCA scheme.

## Run on Windows

1. Extract this ZIP to a normal folder.
2. Double-click `run_computer_applications.bat`.
3. Keep the terminal open until it finishes. It downloads official source pages, individual syllabus PDFs linked from those pages, and the official programme-guide/master-syllabus PDFs.
4. Check `output\download_report.csv`, `output\subject_inventory.csv`, and `output\RUN_SUMMARY.txt`.

Python 3.10+ is recommended. The batch file installs dependencies from `requirements.txt`.

## What it does

- Reads the live official Marwadi BCA and MCA course pages on each run.
- Captures subject codes/titles from the current pages; includes a bundled seed inventory so known current entries are not lost if a page's HTML layout changes.
- Downloads directly linked individual PDFs.
- Searches Marwadi University's official WordPress media endpoint for PDFs when a subject is listed but has no direct PDF link.
- Downloads the official BCA programme guide and MCA programme-structure PDF as coverage backups.
- Checks PDF signature, parseability, page count, and extractable text.
- Keeps uncertain matches and failures in the report rather than silently marking them verified.
- Does not delete or modify your GitHub repository or Supabase database.

## Important limitation

No downloader can guarantee that the university publishes a separate individual PDF for every subject, or that the university website is always online. This runner always attempts the live official sources and preserves the complete programme-guide PDFs as a fallback. A subject with no public individual PDF is marked `NO_INDIVIDUAL_PDF_FOUND`; it is not silently dropped. Do not treat that status as proof the subject does not exist.

## Official sources configured

- BCA: https://www.marwadiuniversity.ac.in/bachelor-of-computer-application-bca-hons-colleges-in-rajkot/
- MCA: https://www.marwadiuniversity.ac.in/mca-master-of-computer-application/
- BCA programme guide: https://marwadiuniversity.online/wp-content/uploads/2025/02/BCA-Programme-Guide-Final.pdf
- MCA programme structure: https://marwadiuniversity.online/wp-content/uploads/2025/02/MCA_Syllabus-and-Programme-Structure.pdf

This is configured for Marwadi University because the supplied collection ZIP and the earlier reports were based on Marwadi sources. It is not a generic all-university BCA/MCA syllabus collector.
