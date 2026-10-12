#!/usr/bin/env python3
"""Collect Marwadi B.Tech subject syllabus PDFs; use only explicitly mapped GTU fallbacks."""
from __future__ import annotations

import csv
import hashlib
import html
import logging
import re
import shutil
import sys
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse, unquote

import requests
from bs4 import BeautifulSoup
from pypdf import PdfReader
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

BASE = Path(__file__).resolve().parent
OUTPUT = BASE / "run_output" / "B.Tech programs"  # temporary; canonical PDFs live in the shared library
PROGRAMS_DIR = OUTPUT
MANIFEST_DIR = PROGRAMS_DIR / "00_Manifests"
PROGRAM_CSV = BASE / "programs.csv"
GTU_MAP_CSV = BASE / "GTU_Fallback_Map.csv"
ZIP_PATH = BASE / "run_output" / "Marwadi_BTech_Syllabus_Collection.zip"
CACHE_DIR = BASE / ".marwadi_download_cache"  # retained between runs; never included in the ZIP
SEMESTERS = range(1, 9)
CODE_RE = re.compile(r"(?<![A-Za-z0-9])(?:\d{2}[A-Z]{2,3}[0-9A-Z]{4}|[A-Z]{2,3}[0-9]{4,6})(?![A-Za-z0-9])", re.I)
SEM_RE = re.compile(r"\bSEMESTER\b.{0,140}?\b([1-8])\b|\bSEM\s*[-:]?\s*([1-8])\b", re.I | re.S)

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36",
    "Accept": "text/html,application/pdf,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
})
retries = Retry(total=3, connect=3, read=3, backoff_factor=1.0,
                status_forcelist=[429, 500, 502, 503, 504], allowed_methods=["GET"],
                respect_retry_after_header=True)
SESSION.mount("https://", HTTPAdapter(max_retries=retries))
SESSION.mount("http://", HTTPAdapter(max_retries=retries))


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def clean_name(value: str, max_length: int = 120) -> str:
    value = html.unescape(value or "")
    value = re.sub(r"\s+", " ", value).strip()
    value = re.sub(r"[<>:\"/\\|?*\x00-\x1f]", "_", value)
    value = value.rstrip(" .")
    return (value[:max_length].rstrip(" .") or "unnamed")


def norm(value: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(value or "")).strip()


def load_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def write_csv(path: Path, rows: list[dict], fieldnames: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k, "") for k in fieldnames})


def source_label_for_subject(anchor_text: str, href: str) -> tuple[str, str]:
    text = norm(anchor_text)
    match = CODE_RE.search(text) or CODE_RE.search(unquote(urlparse(href).path))
    code = match.group(0).upper() if match else ""
    title = text
    if code:
        title = re.sub(re.escape(code), " ", title, flags=re.I)
        title = re.sub(r"[()\[\]{}|–—-]+", " ", title)
    title = re.sub(r"\s+", " ", title).strip(" -:;,.\t\n")
    return code, title or code or "Unlabelled subject"


def find_outline(soup: BeautifulSoup):
    # Prefer the section containing the visible Course Outline heading, but fall back safely.
    for node in soup.find_all(string=re.compile(r"Course\s+Outline", re.I)):
        parent = node.parent
        for _ in range(7):
            if parent is None:
                break
            text = norm(parent.get_text(" ", strip=True))
            if len(text) > 100 and ("SEM 1" in text.upper() or "SEMESTER 1" in text.upper()):
                return parent
            parent = parent.parent
    return soup.body or soup


def sem_target_map(outline) -> dict[str, int]:
    """Map tab panel element IDs to a semester using tab/button labels and ARIA attributes."""
    result: dict[str, int] = {}
    for el in outline.find_all(["a", "button", "li", "div", "span"]):
        label = norm(el.get_text(" ", strip=True))
        m = re.fullmatch(r"SEM(?:ESTER)?\s*[-:]?\s*([1-8])", label, flags=re.I)
        if not m:
            continue
        sem = int(m.group(1))
        targets = []
        for attr in ("href", "data-bs-target", "data-target", "aria-controls"):
            val = el.get(attr)
            if val:
                for part in str(val).split():
                    if "#" in part:
                        part = part.rsplit("#", 1)[-1]
                    part = part.strip("#")
                    if part and not part.startswith("javascript:"):
                        targets.append(part)
        # aria-controls can be a panel ID with no #
        for target in targets:
            target_el = outline.find(id=target)
            if target_el is None:
                continue
            result[target] = sem
            # Include descendants whose IDs encode sem; do not guess beyond this relationship.
            for descendant in target_el.find_all(id=True):
                result[str(descendant.get("id"))] = sem
    # Panels sometimes have conventional IDs even when the tab markup omits target attributes.
    for el in outline.find_all(id=True):
        ident = str(el.get("id", ""))
        m = re.search(r"(?:semester|sem)[-_]?(\d)", ident, re.I)
        if m and 1 <= int(m.group(1)) <= 8:
            result[ident] = int(m.group(1))
    return result


def nearest_semester(anchor, outline, target_map: dict[str, int]) -> int | None:
    node = anchor
    for _ in range(12):
        if node is None or node == outline.parent:
            break
        ident = node.get("id") if hasattr(node, "get") else None
        if ident and str(ident) in target_map:
            return target_map[str(ident)]
        classes = node.get("class", []) if hasattr(node, "get") else []
        for c in classes:
            m = re.search(r"(?:semester|sem)[-_]?(\d)", str(c), re.I)
            if m and 1 <= int(m.group(1)) <= 8:
                return int(m.group(1))
        node = node.parent if hasattr(node, "parent") else None
    return None


def extract_page_subjects(page_url: str, html_text: str, program_name: str, folder_name: str):
    soup = BeautifulSoup(html_text, "html.parser")
    outline = find_outline(soup)
    target_map = sem_target_map(outline)
    rows = []
    seen = set()
    # Include course-coded links whether linked to a PDF or rendered without a PDF link.
    for anchor in outline.find_all("a", href=True):
        href = urljoin(page_url, anchor.get("href", "").strip())
        text = norm(anchor.get_text(" ", strip=True))
        code, title = source_label_for_subject(text, href)
        if not code:
            continue
        is_pdf = urlparse(href).path.lower().endswith(".pdf")
        # Avoid treating brochure/prospectus links as subject PDFs; a course code must be present.
        sem_hint = nearest_semester(anchor, outline, target_map)
        key = (code, href if is_pdf else "no-pdf-link", sem_hint)
        if key in seen:
            continue
        seen.add(key)
        rows.append({
            "program_name": program_name,
            "program_folder": folder_name,
            "semester_hint": str(sem_hint or ""),
            "subject_code": code,
            "subject_name": title,
            "source_page_url": page_url,
            "subject_url": href if is_pdf else "",
            "link_status": "pdf_link_found" if is_pdf else "subject_code_link_no_pdf",
            "checked_at_utc": utc_now(),
        })
    return soup, rows


def pdf_metadata(path: Path) -> tuple[int | None, str]:
    try:
        reader = PdfReader(str(path), strict=False)
        chunks = []
        for page in reader.pages[:3]:
            try:
                chunks.append(page.extract_text() or "")
            except Exception:
                pass
        text = norm(" ".join(chunks))
        # Do not infer the semester from the course code. Only use a semester field in document text.
        m = SEM_RE.search(text)
        semester = None
        if m:
            val = next((g for g in m.groups() if g), None)
            if val:
                n = int(val)
                if n in SEMESTERS:
                    semester = n
        # Return useful text for logs/debugging, not a rewritten source.
        return semester, text[:2400]
    except Exception as exc:
        return None, f"PDF text extraction failed: {exc}"


def file_sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def ensure_tree(programs: list[dict[str, str]]) -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    PROGRAMS_DIR.mkdir(parents=True, exist_ok=True)
    MANIFEST_DIR.mkdir(parents=True, exist_ok=True)
    for p in programs:
        pdir = PROGRAMS_DIR / p["folder_name"]
        for sem in SEMESTERS:
            sdir = pdir / f"Semester_{sem:02d}"
            sdir.mkdir(parents=True, exist_ok=True)
            note = sdir / "_folder_info.txt"
            if not any(x.is_file() and x.name != "_folder_info.txt" for x in sdir.iterdir()) and not note.exists():
                note.write_text("Original syllabus PDFs will be placed here after collection.\n", encoding="utf-8")
        unknown = pdir / "Semester_Unknown"
        unknown.mkdir(parents=True, exist_ok=True)
        (unknown / "_folder_info.txt").write_text(
            "Files go here only if the semester cannot be confirmed from the source PDF/page. Do not infer semester from course-code digits.\n",
            encoding="utf-8"
        )


def make_session_get(url: str, timeout: int = 35):
    response = SESSION.get(url, timeout=timeout, allow_redirects=True)
    response.raise_for_status()
    return response


def load_gtu_map() -> list[dict[str, str]]:
    return load_csv(GTU_MAP_CSV)


def find_gtu_map(mapping: list[dict[str, str]], folder: str, sem: str, code: str, title: str):
    title_norm = norm(title).casefold()
    for row in mapping:
        if norm(row.get("program_folder", "")).casefold() != norm(folder).casefold():
            continue
        if norm(row.get("semester", "")) != norm(sem):
            continue
        if code and norm(row.get("marwadi_subject_code", "")).casefold() == code.casefold():
            return row
        if not code and norm(row.get("marwadi_subject_name", "")).casefold() == title_norm:
            return row
    return None


def download_pdf(url: str, dest: Path) -> tuple[bool, str]:
    try:
        resp = make_session_get(url, timeout=60)
        content = resp.content
        if not content.startswith(b"%PDF-"):
            return False, f"Response was not a PDF (HTTP {resp.status_code}; content-type={resp.headers.get('Content-Type','')})"
        dest.parent.mkdir(parents=True, exist_ok=True)
        temp = dest.with_suffix(dest.suffix + ".part")
        temp.write_bytes(content)
        # Recheck local bytes before atomic replace.
        if not temp.read_bytes().startswith(b"%PDF-"):
            temp.unlink(missing_ok=True)
            return False, "Downloaded bytes failed PDF header re-check"
        temp.replace(dest)
        return True, f"HTTP {resp.status_code}; {len(content)} bytes"
    except Exception as exc:
        return False, f"{type(exc).__name__}: {exc}"


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    programs = load_csv(PROGRAM_CSV)
    if not programs:
        logging.error("No programs were found in programs.csv")
        return 2
    ensure_tree(programs)
    gtu_map = load_gtu_map()
    page_status: list[dict] = []
    all_courses: list[dict] = []
    manifest: list[dict] = []
    gtu_needed: list[dict] = []
    failures: list[dict] = []
    url_cache: dict[str, tuple[bool, str, bytes | None, int | None, str]] = {}
    total_links = 0

    for idx, p in enumerate(programs, 1):
        name = p.get("program_name", "").strip()
        folder = p.get("folder_name", "").strip()
        page_url = p.get("official_program_url", "").strip()
        if not page_url:
            status = "no_current_program_page_confirmed"
            note = p.get("notes", "")
            page_status.append({"program_name": name, "program_folder": folder, "url": "", "status": status, "note": note, "checked_at_utc": utc_now()})
            failures.append({"program_name": name, "program_folder": folder, "semester": "", "subject_code": "", "subject_name": "", "source_url": "", "status": status, "details": note, "checked_at_utc": utc_now()})
            logging.warning("[%d/%d] %s: no dedicated current official page configured", idx, len(programs), name)
            continue
        logging.info("[%d/%d] Reading %s", idx, len(programs), name)
        try:
            resp = make_session_get(page_url)
            _, courses = extract_page_subjects(resp.url, resp.text, name, folder)
            page_courses = [c for c in courses if c["link_status"] == "pdf_link_found"]
            page_status.append({
                "program_name": name, "program_folder": folder, "url": page_url,
                "status": "ok" if page_courses else "page_loaded_no_subject_pdf_links_detected",
                "http_status": resp.status_code, "pdf_link_count": len(page_courses),
                "course_code_link_count": len(courses), "note": "",
                "checked_at_utc": utc_now()
            })
            all_courses.extend(courses)
            if not page_courses:
                failures.append({"program_name": name, "program_folder": folder, "semester": "", "subject_code": "", "subject_name": "", "source_url": page_url, "status": "no_subject_pdf_links_detected", "details": "Page was reachable, but the collector could not identify code-labelled subject PDF links. Review the course page manually.", "checked_at_utc": utc_now()})

            # Keep page order; dedupe within the same program by code and source URL.
            local_seen = set()
            for course in page_courses:
                key = (course["subject_code"], course["subject_url"])
                if key in local_seen:
                    continue
                local_seen.add(key)
                total_links += 1
                code = course["subject_code"]
                title = course["subject_name"] or code
                sem_hint = course["semester_hint"]
                url = course["subject_url"]
                # Download the source PDF once per URL; reuse its unmodified bytes for other official program pages.
                if url in url_cache:
                    ok, message, cached_bytes, pdf_sem, pdf_text = url_cache[url]
                else:
                    cache_path = CACHE_DIR / (hashlib.sha256(url.encode("utf-8")).hexdigest() + ".pdf")
                    if cache_path.exists() and cache_path.read_bytes().startswith(b"%PDF-"):
                        ok, message = True, "reused cached verified PDF"
                        pdf_sem, pdf_text = pdf_metadata(cache_path)
                        cached_bytes = cache_path.read_bytes()
                    else:
                        ok, message = download_pdf(url, cache_path)
                        cached_bytes = cache_path.read_bytes() if ok else None
                        pdf_sem, pdf_text = pdf_metadata(cache_path) if ok else (None, "")
                    url_cache[url] = (ok, message, cached_bytes, pdf_sem, pdf_text)
                semester = int(sem_hint) if sem_hint and sem_hint.isdigit() and 1 <= int(sem_hint) <= 8 else pdf_sem
                sem_label = f"Semester_{semester:02d}" if semester else "Semester_Unknown"
                file_name = clean_name(f"{code} - {title}") + ".pdf"
                dest = PROGRAMS_DIR / folder / sem_label / file_name
                status = "downloaded_from_marwadi"
                used_url = url
                details = message
                if ok and cached_bytes:
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    if not dest.exists() or not dest.read_bytes().startswith(b"%PDF-"):
                        dest.write_bytes(cached_bytes)
                    # Remove the folder note when real content arrives.
                    (dest.parent / "_folder_info.txt").unlink(missing_ok=True)
                    digest = hashlib.sha256(cached_bytes).hexdigest()
                    sem_from_pdf, _ = pdf_metadata(dest)
                    manifest.append({
                        "program_name": name, "program_folder": folder,
                        "semester": str(semester or "Unknown"), "subject_code": code,
                        "subject_name": title, "source_priority": "Marwadi official page",
                        "source_page_url": page_url, "source_pdf_url": url,
                        "local_file": str(dest.relative_to(OUTPUT)), "sha256": digest,
                        "status": status, "details": f"{details}; PDF semester metadata={'found' if sem_from_pdf else 'not found'}",
                        "checked_at_utc": utc_now()
                    })
                else:
                    status = "marwadi_pdf_download_failed"
                    gtu = find_gtu_map(gtu_map, folder, sem_hint or "", code, title)
                    if gtu and gtu.get("gtu_pdf_url", "").strip() and gtu.get("topic_match_notes", "").strip():
                        gtu_url = gtu["gtu_pdf_url"].strip()
                        gtu_dest = PROGRAMS_DIR / folder / (f"Semester_{int(sem_hint):02d}" if sem_hint.isdigit() and int(sem_hint) in SEMESTERS else "Semester_Unknown") / (clean_name(f"{code} - {title} [GTU fallback]") + ".pdf")
                        gtu_ok, gtu_msg = download_pdf(gtu_url, gtu_dest)
                        if gtu_ok:
                            sem_gtu, txt_gtu = pdf_metadata(gtu_dest)
                            manifest.append({
                                "program_name": name, "program_folder": folder,
                                "semester": str(sem_gtu or sem_hint or "Unknown"), "subject_code": code,
                                "subject_name": title, "source_priority": "GTU verified fallback",
                                "source_page_url": page_url, "source_pdf_url": gtu_url,
                                "local_file": str(gtu_dest.relative_to(OUTPUT)), "sha256": file_sha256(gtu_dest),
                                "status": "downloaded_from_gtu_fallback",
                                "details": f"Marwadi attempt failed ({message}); mapping confidence={gtu.get('match_confidence','')}; {gtu.get('topic_match_notes','')}; {gtu_msg}",
                                "checked_at_utc": utc_now()
                            })
                            (gtu_dest.parent / "_folder_info.txt").unlink(missing_ok=True)
                            continue
                        details += f"; GTU fallback also failed: {gtu_msg}"
                    gtu_needed.append({
                        "program_name": name, "program_folder": folder,
                        "semester": sem_hint or "", "marwadi_subject_code": code,
                        "marwadi_subject_name": title, "marwadi_source_pdf_url": url,
                        "marwadi_failure": message,
                        "required_next_step": "Check Marwadi source; if genuinely unavailable, find and verify a GTU syllabus with matching semester/topics and add it to GTU_Fallback_Map.csv.",
                        "checked_at_utc": utc_now()
                    })
                    failures.append({"program_name": name, "program_folder": folder, "semester": sem_hint or "", "subject_code": code, "subject_name": title, "source_url": url, "status": status, "details": details, "checked_at_utc": utc_now()})
        except Exception as exc:
            page_status.append({"program_name": name, "program_folder": folder, "url": page_url, "status": "page_fetch_failed", "http_status": "", "pdf_link_count": 0, "course_code_link_count": 0, "note": f"{type(exc).__name__}: {exc}", "checked_at_utc": utc_now()})
            failures.append({"program_name": name, "program_folder": folder, "semester": "", "subject_code": "", "subject_name": "", "source_url": page_url, "status": "page_fetch_failed", "details": f"{type(exc).__name__}: {exc}", "checked_at_utc": utc_now()})
            logging.error("Failed on %s: %s", name, exc)
        # Polite pacing between program pages.
        time.sleep(0.4)

    # Any subject-coded links without a PDF should be visible for manual verification, not silently ignored.
    for course in all_courses:
        if course["link_status"] == "subject_code_link_no_pdf":
            gtu_needed.append({
                "program_name": course["program_name"], "program_folder": course["program_folder"],
                "semester": course["semester_hint"], "marwadi_subject_code": course["subject_code"],
                "marwadi_subject_name": course["subject_name"], "marwadi_source_pdf_url": course["source_page_url"],
                "marwadi_failure": "Subject code/link was listed but it did not point directly to a PDF.",
                "required_next_step": "Verify whether an official Marwadi PDF exists elsewhere on the official site. Only then investigate GTU fallback.",
                "checked_at_utc": utc_now()
            })

    # Use stable field sets so reports can be opened easily in Excel.
    write_csv(MANIFEST_DIR / "collection_manifest.csv", manifest,
              ["program_name", "program_folder", "semester", "subject_code", "subject_name", "source_priority", "source_page_url", "source_pdf_url", "local_file", "sha256", "status", "details", "checked_at_utc"])
    write_csv(MANIFEST_DIR / "missing_marwadi_pdfs.csv", failures,
              ["program_name", "program_folder", "semester", "subject_code", "subject_name", "source_url", "status", "details", "checked_at_utc"])
    write_csv(MANIFEST_DIR / "gtu_fallback_needed.csv", gtu_needed,
              ["program_name", "program_folder", "semester", "marwadi_subject_code", "marwadi_subject_name", "marwadi_source_pdf_url", "marwadi_failure", "required_next_step", "checked_at_utc"])
    write_csv(MANIFEST_DIR / "source_page_status.csv", page_status,
              ["program_name", "program_folder", "url", "status", "http_status", "pdf_link_count", "course_code_link_count", "note", "checked_at_utc"])
    write_csv(MANIFEST_DIR / "discovered_course_links.csv", all_courses,
              ["program_name", "program_folder", "semester_hint", "subject_code", "subject_name", "source_page_url", "subject_url", "link_status", "checked_at_utc"])

    # Copy editable source config into output for provenance.
    shutil.copy2(PROGRAM_CSV, MANIFEST_DIR / "programs_used.csv")
    if GTU_MAP_CSV.exists():
        shutil.copy2(GTU_MAP_CSV, MANIFEST_DIR / "gtu_fallback_map_used.csv")

    # Add top-level README to generated output as well.
    readme = BASE / "README.md"
    if readme.exists():
        shutil.copy2(readme, OUTPUT / "README.md")
    with zipfile.ZipFile(ZIP_PATH, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        # Keep the requested folder at the archive root, alongside the reusable collection tools.
        for tool_name in ["README.md", "SOURCES_AND_RESEARCH_NOTES.md", "programs.csv", "GTU_Fallback_Map.csv", "GTU_Fallback_Map_GUIDE.txt", "requirements.txt", "run_collector.bat", "build_syllabus_archive.py"]:
            tool_path = BASE / tool_name
            if tool_path.exists():
                zf.write(tool_path, tool_path.name)
        for path in sorted(OUTPUT.rglob("*")):
            if path.is_file():
                zf.write(path, path.relative_to(BASE))

    logging.info("Finished: %s direct PDF links seen", total_links)
    logging.info("Original PDFs recorded: %s", len(manifest))
    logging.info("Failures/missing links: %s; GTU mappings needed: %s", len(failures), len(gtu_needed))
    logging.info("Archive: %s", ZIP_PATH)
    logging.info("Read reports in %s", MANIFEST_DIR)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        logging.error("Stopped by user. Run again to resume; already downloaded PDFs are retained.")
        sys.exit(130)
