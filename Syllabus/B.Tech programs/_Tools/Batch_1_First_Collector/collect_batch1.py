from __future__ import annotations

import csv
import hashlib
import re
import sys
import time
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse, unquote

import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "output"
PROGRAM_CSV = ROOT / "programs_batch1.csv"
BASE_FOLDER = OUT / "B.Tech programs"
REPORTS = OUT / "reports"
MANIFEST_PATH = REPORTS / "collection_manifest.csv"
MISSING_PATH = REPORTS / "missing_marwadi_pdfs.csv"
LOG_PATH = REPORTS / "run_log.txt"
ZIP_PATH = OUT / "Marwadi_BTech_Batch1_Actual_Files.zip"

COURSE_CODE_RE = re.compile(r"\b(01[A-Z]{2}[A-Z0-9]{4})\b", re.I)
SEM_RE = re.compile(r"(?:semester|sem)\s*[-_:#]*\s*0?([1-8])\b", re.I)
PDF_SUFFIX_RE = re.compile(r"\.pdf(?:$|[?#])", re.I)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/pdf,application/octet-stream;q=0.9,*/*;q=0.8",
}

@dataclass
class Program:
    name: str
    folder: str
    url: str


def read_programs() -> list[Program]:
    with PROGRAM_CSV.open("r", encoding="utf-8-sig", newline="") as f:
        return [Program(row["program"], row["folder"], row["page_url"]) for row in csv.DictReader(f)]


def session_with_retries() -> requests.Session:
    s = requests.Session()
    s.headers.update(HEADERS)
    try:
        from requests.adapters import HTTPAdapter
        from urllib3.util.retry import Retry
        retry = Retry(total=3, connect=3, read=3, backoff_factor=1.2,
                      status_forcelist=(429, 500, 502, 503, 504),
                      allowed_methods=frozenset(["GET", "HEAD"]))
        s.mount("https://", HTTPAdapter(max_retries=retry))
        s.mount("http://", HTTPAdapter(max_retries=retry))
    except Exception:
        pass
    return s


def timestamp() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def safe_name(s: str, limit: int = 120) -> str:
    s = re.sub(r"[<>:\\|?*\"/]+", "_", s)
    s = re.sub(r"\s+", " ", s).strip(" ._\t")
    return (s or "Untitled")[:limit].rstrip(" .")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def course_code_from(text: str, url: str = "") -> str:
    m = COURSE_CODE_RE.search(text or "") or COURSE_CODE_RE.search(url or "")
    return m.group(1).upper() if m else ""


def title_from_anchor(text: str, code: str) -> str:
    title = (text or "").strip()
    if code:
        title = re.sub(re.escape(code), "", title, flags=re.I)
    title = title.strip(" -–—()[]\t\n")
    title = re.sub(r"\s+", " ", title)
    return title or code or "Course syllabus"


def detect_semester(tag) -> str:
    """Use explicit markup/section labels only; never infer semester from course ID digits."""
    node = tag
    for _ in range(9):
        if node is None:
            break
        attrs = getattr(node, "attrs", {}) or {}
        attr_text = " ".join(
            str(v) for k, v in attrs.items()
            if any(key in k.lower() for key in ("semester", "sem", "tab", "panel", "title", "label", "id", "aria"))
        )
        # Prefer explicit attributes on the course's own panel/container.
        m = SEM_RE.search(attr_text)
        if m:
            return f"Semester_{int(m.group(1)):02d}"
        # A parent section is safe only if its text refers to exactly one semester.
        text = " ".join(node.stripped_strings) if hasattr(node, "stripped_strings") else ""
        matches = list(dict.fromkeys(SEM_RE.findall(text)))
        if len(matches) == 1 and len(text) < 25000:
            return f"Semester_{int(matches[0]):02d}"
        node = getattr(node, "parent", None)
    return "Semester_Not_Detected"


def is_allowed_pdf_url(url: str) -> bool:
    p = urlparse(url)
    return p.scheme in ("http", "https") and p.hostname and p.hostname.lower().endswith("marwadiuniversity.ac.in") and bool(PDF_SUFFIX_RE.search(p.path))


def is_pdf_response(resp: requests.Response, data: bytes) -> bool:
    ctype = (resp.headers.get("Content-Type") or "").lower()
    return data[:1024].lstrip().startswith(b"%PDF-") or "application/pdf" in ctype and data[:1024].lstrip().startswith(b"%PDF-")


def subject_links(soup: BeautifulSoup, page_url: str):
    seen = set()
    for a in soup.find_all("a", href=True):
        href = urljoin(page_url, a.get("href", "").strip())
        txt = " ".join(a.stripped_strings)
        code = course_code_from(txt, href)
        # The course pages use code-named PDFs. Ignore brochures and general PDFs.
        if not code or not is_allowed_pdf_url(href):
            continue
        key = (code, href)
        if key in seen:
            continue
        seen.add(key)
        yield {"code": code, "title": title_from_anchor(txt, code), "url": href,
               "semester": detect_semester(a), "anchor_text": txt}


def page_subject_codes(soup: BeautifulSoup):
    """Find course codes shown anywhere in the page, including entries without a PDF link."""
    result = {}
    for node in soup.find_all(string=COURSE_CODE_RE):
        text = " ".join(node.parent.stripped_strings) if node.parent else str(node)
        for code in COURSE_CODE_RE.findall(text):
            code = code.upper()
            title = re.sub(r"\s*\(?\s*" + re.escape(code) + r"\s*\)?\s*", " ", text, flags=re.I).strip()
            title = re.sub(r"\s+", " ", title)
            # Avoid recording an enclosing large section as the subject title.
            if len(title) > 140:
                title = "Listed subject (title extraction needs review)"
            result.setdefault(code, title or code)
    return result


def main() -> int:
    BASE_FOLDER.mkdir(parents=True, exist_ok=True)
    REPORTS.mkdir(parents=True, exist_ok=True)
    for p in (MANIFEST_PATH, MISSING_PATH, LOG_PATH, ZIP_PATH):
        if p.exists():
            p.unlink()

    session = session_with_retries()
    manifest: list[dict] = []
    missing: list[dict] = []
    logs: list[str] = [f"Started: {timestamp()}", "Policy: Marwadi PDFs first; no GTU substitution in this first collection pass."]

    for program in read_programs():
        print(f"\n[{program.name}]\n  Fetching official course page: {program.url}")
        program_folder = BASE_FOLDER / program.folder
        program_folder.mkdir(parents=True, exist_ok=True)
        try:
            page_resp = session.get(program.url, timeout=(15, 45))
            page_resp.raise_for_status()
            soup = BeautifulSoup(page_resp.content, "html.parser")
        except Exception as exc:
            message = f"PAGE_FETCH_FAILED: {type(exc).__name__}: {exc}"
            print(f"  ERROR: {message}")
            logs.append(f"{program.name}: {message}")
            missing.append({"program": program.name, "folder": program.folder, "subject_code": "",
                            "subject_title": "", "semester": "", "marwadi_page_url": program.url,
                            "marwadi_pdf_url": "", "status": "program_page_fetch_failed",
                            "fallback_priority": "GTU after manual verification; then other credible university"})
            continue

        links = list(subject_links(soup, program.url))
        code_titles = page_subject_codes(soup)
        linked_codes = {item["code"] for item in links}
        print(f"  Found {len(links)} linked syllabus PDF candidate(s); {len(code_titles)} course-code reference(s) on page.")
        logs.append(f"{program.name}: page HTTP {page_resp.status_code}; linked PDF candidates={len(links)}; found codes={len(code_titles)}")

        for item in links:
            sem_folder = item["semester"]
            target_dir = program_folder / sem_folder
            target_dir.mkdir(parents=True, exist_ok=True)
            filename = safe_name(f"{item['code']} - {item['title']}") + ".pdf"
            target = target_dir / filename
            record = {
                "program": program.name, "program_folder": program.folder,
                "semester_folder": sem_folder, "subject_code": item["code"],
                "subject_title": item["title"], "source_priority": "1 - Marwadi University official",
                "marwadi_page_url": program.url, "source_pdf_url": item["url"],
                "downloaded_at": "", "download_status": "", "local_relative_path": "", "sha256": "",
            }
            try:
                # Reuse only an already-valid PDF; no fake/empty files are accepted.
                if target.exists() and target.read_bytes().lstrip().startswith(b"%PDF-"):
                    data = target.read_bytes()
                    status = "already_downloaded_valid_pdf"
                else:
                    resp = session.get(item["url"], timeout=(20, 90), allow_redirects=True)
                    resp.raise_for_status()
                    data = resp.content
                    if not is_pdf_response(resp, data):
                        raise ValueError(f"Response was not a PDF (Content-Type={resp.headers.get('Content-Type')!r}, bytes={len(data)})")
                    target.write_bytes(data)
                    status = "downloaded_verified_pdf"
                record["downloaded_at"] = timestamp()
                record["download_status"] = status
                record["local_relative_path"] = str(target.relative_to(OUT)).replace("\\", "/")
                record["sha256"] = sha256_bytes(data)
                print(f"  OK  {item['code']} | {target.relative_to(OUT)}")
            except Exception as exc:
                record["downloaded_at"] = timestamp()
                record["download_status"] = f"failed: {type(exc).__name__}: {exc}"
                print(f"  FAIL {item['code']} | {exc}")
                missing.append({"program": program.name, "folder": program.folder, "subject_code": item["code"],
                                "subject_title": item["title"], "semester": item["semester"],
                                "marwadi_page_url": program.url, "marwadi_pdf_url": item["url"],
                                "status": "marwadi_link_download_failed", "fallback_priority": "Retry Marwadi; only then investigate GTU"})
            manifest.append(record)
            time.sleep(0.25)

        # Any syllabus code shown on the course page but without a detected direct PDF link needs review.
        for code, title in code_titles.items():
            if code not in linked_codes:
                missing.append({"program": program.name, "folder": program.folder, "subject_code": code,
                                "subject_title": title, "semester": "Semester_Not_Detected",
                                "marwadi_page_url": program.url, "marwadi_pdf_url": "",
                                "status": "listed_on_marwadi_page_no_direct_pdf_link_detected",
                                "fallback_priority": "1) recheck Marwadi; 2) GTU exact/closest syllabus; 3) other credible university"})

    # Write manifests with stable columns.
    manifest_fields = ["program", "program_folder", "semester_folder", "subject_code", "subject_title",
                       "source_priority", "marwadi_page_url", "source_pdf_url", "downloaded_at",
                       "download_status", "local_relative_path", "sha256"]
    with MANIFEST_PATH.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=manifest_fields); w.writeheader(); w.writerows(manifest)
    missing_fields = ["program", "folder", "subject_code", "subject_title", "semester", "marwadi_page_url",
                      "marwadi_pdf_url", "status", "fallback_priority"]
    # Deduplicate exact missing records.
    unique = {}
    for row in missing:
        unique[(row.get("program"), row.get("subject_code"), row.get("status"), row.get("marwadi_pdf_url"))] = row
    missing = list(unique.values())
    with MISSING_PATH.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=missing_fields); w.writeheader(); w.writerows(missing)

    downloads_ok = sum(1 for r in manifest if r["download_status"] in ("downloaded_verified_pdf", "already_downloaded_valid_pdf"))
    logs.append(f"Finished: {timestamp()}")
    logs.append(f"PDF rows recorded: {len(manifest)}; successfully verified PDFs: {downloads_ok}; items needing follow-up: {len(missing)}")
    LOG_PATH.write_text("\n".join(logs) + "\n", encoding="utf-8")

    # Zip output tree (actual files only, plus reports). Does not add placeholders.
    if ZIP_PATH.exists(): ZIP_PATH.unlink()
    with zipfile.ZipFile(ZIP_PATH, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for p in OUT.rglob("*"):
            if p.is_file() and p != ZIP_PATH:
                zf.write(p, p.relative_to(OUT))
    print("\n========== BATCH 1 SUMMARY ==========")
    print(f"Verified PDF files: {downloads_ok}")
    print(f"Course-PDF links encountered: {len(manifest)}")
    print(f"Items needing follow-up / GTU review: {len(missing)}")
    print(f"ZIP created: {ZIP_PATH}")
    print("Read output/reports/collection_manifest.csv and missing_marwadi_pdfs.csv.")
    return 0

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("Cancelled by user.")
        raise SystemExit(130)
