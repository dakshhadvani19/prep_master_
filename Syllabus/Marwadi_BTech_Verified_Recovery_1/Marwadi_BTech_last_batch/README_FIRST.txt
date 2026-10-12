Marwadi B.Tech Verified Syllabus Recovery
=========================================

WHAT THIS PACKAGE DOES
  Recovers subject-wise syllabus PDFs for the unresolved B.Tech queue.
  Source order is strict: (1) Marwadi University official PDFs,
  (2) Gujarat Technological University official PDFs,
  (3) other official Indian university PDFs used only as comparable
  references — never labelled as Marwadi's own syllabus.

HOW TO RUN ON WINDOWS
  1. Extract this ZIP to a folder you can write to.
  2. Double-click RUN_RECOVERY.bat
  3. The batch file switches to its own directory, checks Python 3,
     installs requirements if needed, then runs recovery_runner.py.
  4. Leave the window open until it prints SUMMARY and asks you to
     press a key.

OPTIONAL LOCAL REUSE
  Edit collection_roots.txt and add one existing syllabus folder path
  per line. The runner also searches this package folder and its parent.
  It will not scan an entire drive. A local PDF is reused only after
  the same content checks as a download.

STATUS LABELS
  VERIFIED_MARWADI
      Official Marwadi PDF; title/code matched; file opens as PDF.
  VERIFIED_GTU_FALLBACK
      Official GTU PDF; subject matched; used only after Marwadi miss.
  VERIFIED_OTHER_UNIVERSITY_REFERENCE
      Official other-Indian-university PDF; HIGH or MEDIUM confidence
      topic match. This is a comparable reference, NOT Marwadi official.
  VERIFIED_LOCAL_REUSE
      Existing local PDF passed the same checks as a download.
  EXPANDED_GROUP
      Placeholder elective/open-elective row. Named options were
      expanded into their own rows. No group-level PDF is accepted.
  NEEDS_CONTENT_REVIEW
      File looks like a PDF but text/OCR could not confirm the subject.
  NO_VERIFIED_PUBLIC_PDF
      No qualifying official PDF was confirmed.
  NETWORK_UNVERIFIED
      Network errors after retries; not a confirmed 404/mismatch.

CONFIDENCE
  HIGH / MEDIUM may be accepted. LOW is never a successful replacement.

OUTPUTS
  Output/<Program>/<Semester>/<Code - Title>.pdf
  Reports/recovery_manifest.csv
  Reports/source_attempts.csv
  Reports/unresolved_subjects.csv
  Reports/SUMMARY.txt
  Reports/URL_VERIFICATION.txt
  Reports/PDF_VALIDATION.txt
  data/verified_source_map.csv
  Marwadi_BTech_Verified_Recovery_Package.zip  (written after the run)

The only guarantee is: a file labelled verified passed the HTTP, PDF
signature, size, parser, and content checks recorded in the reports.
This package does not claim every subject exists as a public PDF.
