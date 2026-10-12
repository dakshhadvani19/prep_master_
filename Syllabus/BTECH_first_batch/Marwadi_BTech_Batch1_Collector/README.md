# Marwadi B.Tech Syllabus Collector — Batch 1

## What this does

This is a local downloader, not a fake syllabus archive. Run it on a Windows PC with internet access; it visits the official Marwadi University page for the first five B.Tech programs, follows code-named course PDF links, verifies downloaded files begin with the PDF signature, records SHA-256 hashes, and creates a ZIP from the files that were actually retrieved.

Programs in this batch:
1. B.Tech Computer Engineering
2. B.Tech Computer Science and Engineering
3. B.Tech CSE Artificial Intelligence
4. B.Tech CSE Artificial Intelligence and Data Science
5. B.Tech CSE Artificial Intelligence and Machine Learning

## Run it

1. Extract the ZIP to a normal folder, e.g. `C:\Marwadi_BTech_Batch1_Collector`.
2. Ensure Python 3.10 or newer is available. If you already use Anaconda, open **Anaconda Prompt** in this folder.
3. Double-click `RUN_BATCH_1.bat`. If Windows cannot locate Python, run `python collect_batch1.py` from Anaconda Prompt after opening this folder.
4. Let it finish. The generated ZIP will be `output\Marwadi_BTech_Batch1_Actual_Files.zip`.
5. Upload that generated ZIP to this chat. Then the missing-item manifest can be reviewed and GTU fallback sources can be researched subject by subject.

## Source priority

- This first pass uses only direct course PDF links from official Marwadi pages.
- A link that errors, a response that is not a PDF, or a listed course with no detected direct PDF is reported—not replaced silently.
- No GTU or other-college PDF is automatically substituted by this first-pass collector. That is deliberate: source priority must be applied per subject after the Marwadi attempt is known.
- Semester is assigned only if the page markup explicitly indicates it. Otherwise the file is placed in `Semester_Not_Detected` and marked in the manifest rather than guessing from the course code.

## Output

- `output/B.Tech programs/<program>/<semester>/...pdf`
- `output/reports/collection_manifest.csv` — every attempted PDF link, source, status, path and SHA-256
- `output/reports/missing_marwadi_pdfs.csv` — links that failed or listed course codes with no direct PDF detected
- `output/reports/run_log.txt` — run summary
- `output/Marwadi_BTech_Batch1_Actual_Files.zip` — actual PDFs only plus the reports

## If downloads fail

If every download fails, do not treat the ZIP as completed work. Upload `output/reports/run_log.txt` and the CSV manifests here. The likely causes are network access, a university server restriction, or a website change, and the error details will let us choose the next route.
