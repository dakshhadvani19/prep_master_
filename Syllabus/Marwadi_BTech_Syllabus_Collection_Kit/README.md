# Marwadi University B.Tech Syllabus Collection Kit

## Current state of this ZIP

This is a **resumable collection toolkit and source inventory**, not yet a populated archive of original syllabus PDFs. The environment used to prepare it could inspect official webpages and find direct PDF links, but its download runtime could not retrieve the binary files. No fake or reconstructed PDFs have been added.

When run on a Windows computer with normal internet access, `run_collector.bat` attempts to collect the original PDFs linked from Marwadi University's official B.Tech program pages, preserve them under `B.Tech programs/<program>/Semester_01..Semester_08/`, and create a ZIP of the results.

## Required source order

1. Marwadi University PDF directly linked from the relevant official program page.
2. If that syllabus PDF is genuinely absent or unreachable after retries, use **GTU only** when a specific GTU PDF has been checked and entered into `GTU_Fallback_Map.csv` with a confidence label and topic-match notes.
3. Do not automatically substitute another university's curriculum. No alternate-university source is configured in this tool.

A temporary network failure or a website block should be recorded as an error, not treated as evidence that the syllabus does not exist. The collector reports failed URLs in CSV files. GTU mapping is intentionally not guessed from subject titles alone.

## Run on Windows

1. Extract the ZIP into a normal folder (for example, `Documents\Marwadi Syllabi`).
2. Ensure Python 3.10 or newer is installed and `py` works in Command Prompt.
3. Double-click `run_collector.bat` while internet is available.
4. When it completes, inspect `Marwadi_BTech_Syllabus_Collection\B.Tech programs\00_Manifests\`.
5. Open `collection_manifest.csv`, `missing_marwadi_pdfs.csv`, `source_page_status.csv`, and `gtu_fallback_needed.csv` to check results and gaps.
6. The script creates/refreshes `Marwadi_BTech_Syllabus_Collection.zip` next to the script.

The script is resumable: valid files already downloaded are kept, and missing files can be retried by running it again. It does not need Google Drive access or any API key.

## Folder layout

- `B.Tech programs/<program>/Semester_01` through `Semester_08`: original PDFs where semester can be verified.
- `B.Tech programs/<program>/Semester_Unknown`: only used if the document does not expose a semester and the page structure doesn't safely identify it. The script does not infer semesters from course-code digits.
- `B.Tech programs/00_Manifests`: CSV logs, source links, failed downloads, and the list of courses needing verified GTU fallback.

The 2025 Marwadi prospectus lists ECE Robotics and ECE IoT as programs, but a separate current course page for either was not confirmed in this research pass. They are included as folders and explicitly flagged rather than silently treated as current. `programs.csv` is editable; update it if Marwadi publishes separate official course pages.

## Safety and provenance

- Files are downloaded from the official Marwadi pages in `programs.csv`.
- Original source URLs are recorded.
- Files are checked for a PDF header before being saved.
- The same direct PDF URL may be downloaded once and copied into multiple program folders if official pages link to the same shared subject PDF.
- No source document is rewritten.
- A GTU fallback is only used if its exact PDF URL and mapping are added to `GTU_Fallback_Map.csv`; add only mappings you have reviewed.

## Troubleshooting

- `403`, `429`, `5xx`, or timeouts: rerun later; the script uses bounded retries and records unresolved failures.
- A subject appears in the webpage but has no PDF link: it can appear in `gtu_fallback_needed.csv` if its code is exposed as a link; confirm it against the official course page before mapping a GTU equivalent.
- `Semester_Unknown`: verify the semester field within the original PDF and move the file manually if needed. Do not infer semester from the subject-code digits.
- The current site may update URLs or course lists. The script rereads official pages on every run and logs the checked date.
