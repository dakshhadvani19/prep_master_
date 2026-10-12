#!/usr/bin/env python3
"""Marwadi B.Tech verified syllabus recovery.

Discovers official public PDFs, validates them, and writes honest reports.
A verified status is assigned only after HTTP + PDF + content checks pass.
"""
from __future__ import annotations

import csv
import hashlib
import io
import os
import re
import sys
import time
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urljoin, urlparse

# ---------------------------------------------------------------------------
# Optional third-party imports (installed by RUN_RECOVERY.bat)
# ---------------------------------------------------------------------------
try:
    import requests
    from bs4 import BeautifulSoup
    from pypdf import PdfReader
except ImportError as exc:  # pragma: no cover
    print("Missing dependency:", exc)
    print("Run: python -m pip install -r requirements.txt")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
OUTPUT = ROOT / "Output"
REPORTS = ROOT / "Reports"
TARGETS_CSV = DATA / "subject_targets.csv"
CATALOG_CSV = DATA / "source_catalog.csv"
PREV_MANIFEST = DATA / "previous_recovery_manifest.csv"
COLLECTION_ROOTS = ROOT / "collection_roots.txt"

USER_AGENT = (
    "Mozilla/5.0 (compatible; MarwadiSyllabusRecovery/1.0; "
    "+educational-archive; contact=local-run)"
)
TIMEOUT = 25
MAX_RETRIES = 3
RETRY_SLEEP = 1.5
MIN_PDF_BYTES = 800
MAX_PDF_BYTES = 80 * 1024 * 1024
TRANSIENT_STATUS = {408, 425, 429, 500, 502, 503, 504}

MARWADI_HOSTS = {"www.marwadiuniversity.ac.in", "marwadiuniversity.ac.in"}
GTU_HOSTS = {
    "www.gtu.ac.in",
    "gtu.ac.in",
    "old26.gtu.ac.in",
    "syllabus.gtu.ac.in",
    "files.gtu.ac.in",
}
OTHER_HOSTS = {
    "www.nitkkr.ac.in",
    "nitkkr.ac.in",
    "www.coeptech.ac.in",
    "coeptech.ac.in",
    "jcboseust.ac.in",
    "www.jcboseust.ac.in",
    "vtu.ac.in",
    "www.vtu.ac.in",
    "jntuhces.ac.in",
    "www.jntuhces.ac.in",
    "jmi.ac.in",
    "www.jmi.ac.in",
    "dbatu.ac.in",
    "www.dbatu.ac.in",
}

PROGRAM_PAGES = {
    "B.Tech Information Technology": [
        "https://www.marwadiuniversity.ac.in/btech-in-information-technology-colleges/",
    ],
    "B.Tech Mechanical Engineering Robotics and Automation": [
        "https://www.marwadiuniversity.ac.in/mechanical-engineering-robotics-automation/",
    ],
    "B.Tech Mechanical Engineering AI and ML": [
        "https://www.marwadiuniversity.ac.in/mechanical-ai-ml/",
    ],
    "B.Tech Information and Communication Technology": [
        "https://www.marwadiuniversity.ac.in/information-communication-technology-engineering-b-tech-ict/",
    ],
    "B.Tech CSE Cyber Security": [
        "https://www.marwadiuniversity.ac.in/btech-computer-science-and-engineering-cyber-security/",
    ],
    "B.Tech Electronics and Communication Engineering": [
        "https://www.marwadiuniversity.ac.in/electronics-and-communication-engineering-btech/",
    ],
    "B.Tech ECE Artificial Intelligence and Machine Learning": [
        "https://www.marwadiuniversity.ac.in/electronics-and-communication-engineering-ai-mlbtech/",
    ],
    "B.Tech Bioinformatics": [
        "https://www.marwadiuniversity.ac.in/btech-bioinformatics-colleges/",
    ],
}

COURSE_CODE_RE = re.compile(r"(?:01|05|06)[A-Z]{2}\d{4}", re.I)

GROUP_PATTERNS = (
    r"^program elective",
    r"^department elective",
    r"^open elective",
    r"^departmental elective",
    r"^professional elective",
    r"^elective[- ]?\d*$",
)
STOPWORDS = {
    "and", "the", "of", "in", "to", "for", "a", "an", "on", "with", "by",
    "using", "introduction", "fundamentals", "basic", "engineering",
}

STATUS_VERIFIED_MARWADI = "VERIFIED_MARWADI"
STATUS_VERIFIED_GTU = "VERIFIED_GTU_FALLBACK"
STATUS_VERIFIED_OTHER = "VERIFIED_OTHER_UNIVERSITY_REFERENCE"
STATUS_LOCAL = "VERIFIED_LOCAL_REUSE"
STATUS_EXPANDED = "EXPANDED_GROUP"
STATUS_REVIEW = "NEEDS_CONTENT_REVIEW"
STATUS_NONE = "NO_VERIFIED_PUBLIC_PDF"
STATUS_NET = "NETWORK_UNVERIFIED"
STATUS_NET_BLOCKED = "NOT_RUN_NETWORK_UNAVAILABLE"


# ---------------------------------------------------------------------------
# Pure helpers (unit-tested)
# ---------------------------------------------------------------------------
def normalize_text(value: str) -> str:
    value = (value or "").lower()
    value = value.replace("&", " and ")
    value = re.sub(r"[^a-z0-9]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def tokens(value: str) -> set[str]:
    return {t for t in normalize_text(value).split() if t and t not in STOPWORDS and len(t) > 2}


def is_group_heading(title: str, code: str = "") -> bool:
    n = normalize_text(title)
    if any(re.search(p, n) for p in GROUP_PATTERNS):
        return True
    return False


def host_of(url: str) -> str:
    return (urlparse(url).hostname or "").lower()


def host_tier(url: str) -> str:
    h = host_of(url)
    if h in MARWADI_HOSTS:
        return "marwadi"
    if h in GTU_HOSTS:
        return "gtu"
    if h in OTHER_HOSTS:
        return "other"
    return "unofficial"


def is_official_host(url: str) -> bool:
    return host_tier(url) in {"marwadi", "gtu", "other"}


def should_retry(status: int | None, exc: Exception | None) -> bool:
    if exc is not None:
        return True
    if status is None:
        return True
    return status in TRANSIENT_STATUS


def is_pdf_magic(data: bytes) -> bool:
    return bool(data) and data[:5] == b"%PDF-"


def sanitize_filename(name: str, max_len: int = 120) -> str:
    name = re.sub(r'[<>:"/\\|?*]', "_", name)
    name = re.sub(r"\s+", " ", name).strip(" .")
    if not name:
        name = "unnamed"
    return name[:max_len]


def semester_folder(sem: str) -> str:
    s = (sem or "").strip()
    if not s or s.lower() in {"unknown", "not_detected", "semester_unknown", "n/a"}:
        return "Semester_Unknown"
    digits = re.sub(r"\D", "", s)
    if digits:
        return f"Semester_{int(digits)}"
    return sanitize_filename(s)


def program_folder(program: str) -> str:
    return sanitize_filename(program or "Unknown_Program")


def extract_course_codes(text: str) -> set[str]:
    return {m.upper() for m in COURSE_CODE_RE.findall(text or "")}


def is_placeholder_code(code: str) -> bool:
    c = (code or "").upper()
    return (not c) or ("X" in c) or c.startswith("AU")


def match_confidence(title: str, code: str, haystack: str, url: str = "") -> tuple[str, str]:
    """Return (HIGH|MEDIUM|LOW, reason). LOW is never an accepted replacement."""
    url_l = (url or "").lower()
    if "branch.aspx" in url_l or "syllabus/branch" in url_l:
        return "LOW", "gtu_branch_index_not_a_pdf"
    hay_raw = (haystack or "") + " " + (url or "")
    hay = normalize_text(hay_raw)
    code_n = normalize_text(code).replace(" ", "").upper()
    title_n = normalize_text(title)
    reasons = []
    found_codes = extract_course_codes(hay_raw)
    if code_n and not is_placeholder_code(code) and found_codes:
        if code_n not in found_codes:
            return "LOW", f"different_course_code_in_source:{','.join(sorted(found_codes))}"
        reasons.append("course_code_in_document_or_url")
        code_hit = True
    else:
        code_hit = bool(code_n and not is_placeholder_code(code) and code_n in hay.replace(" ", "").upper())
        if code_hit:
            reasons.append("course_code_in_document_or_url")
    title_tokens = tokens(title)
    hay_tokens = set(hay.split())
    overlap = title_tokens & hay_tokens
    ratio = len(overlap) / max(1, len(title_tokens)) if title_tokens else 0.0
    if title_tokens:
        reasons.append(f"title_token_overlap={ratio:.2f}")
    phrase = bool(title_n and title_n in hay)
    if phrase:
        reasons.append("full_title_phrase")
    reason = ";".join(reasons) or "no_token_overlap"
    # Exact subject: code match plus title support, or full title phrase
    # with no conflicting course code.
    if code_hit and (phrase or ratio >= 0.45):
        return "HIGH", reason
    if code_hit:
        return "MEDIUM", reason
    if phrase and ratio >= 0.7 and not found_codes:
        return "MEDIUM", reason
    return "LOW", reason


def parse_semester_map(html: str) -> dict[str, str]:
    """Map course codes to semester from official program-page tab panels.

    Marwadi pages list SEM 1–8 as tab buttons first, then panel bodies.
    Walking the whole DOM in order therefore ends on SEM 8 and must not
    be used. Bind each panel id from a.tab-link[data-tab] instead.
    """
    mapping: dict[str, str] = {}
    if not html:
        return mapping
    soup = BeautifulSoup(html, "html.parser")

    def _remember(code: str, title: str, sem: str) -> None:
        code = code.upper()
        mapping[code] = sem
        tn = normalize_text(title)
        if tn:
            mapping[f"{code}|{tn}"] = sem

    for tab in soup.select("a.tab-link[data-tab]"):
        label = tab.get_text(" ", strip=True)
        sem_m = re.search(r"\bSEM(?:ESTER)?\s*[-:]?\s*([1-8])\b", label, re.I)
        if not sem_m:
            continue
        sem = sem_m.group(1)
        panel = soup.find(id=tab.get("data-tab"))
        if panel is None:
            continue
        for link in panel.find_all("a"):
            text = link.get_text(" ", strip=True)
            code_m = re.search(r"\b(01[A-Z]{2}\d{4}|AU\d{4}|01[A-Z]{2}X+)\b", text, re.I)
            if not code_m:
                continue
            code = code_m.group(1)
            title = re.sub(r"\s*\([^)]*\)\s*$", "", text)
            title = re.sub(r"\b" + re.escape(code) + r"\b", "", title, flags=re.I)
            _remember(code, title, sem)

    if mapping:
        return mapping

    # Fallback: sequential headings only when tab panels are absent.
    current_sem = ""
    for el in soup.find_all(["h1", "h2", "h3", "h4", "h5", "a"]):
        text = el.get_text(" ", strip=True)
        if el.name in {"h1", "h2", "h3", "h4", "h5"}:
            sem_m = re.search(r"\bSEM(?:ESTER)?\s*[-:]?\s*([1-8])\b", text, re.I)
            if sem_m and len(text) < 40:
                current_sem = sem_m.group(1)
            continue
        if not current_sem:
            continue
        code_m = re.search(r"\b(01[A-Z]{2}\d{4}|AU\d{4})\b", text, re.I)
        if code_m:
            _remember(code_m.group(1), text, current_sem)
    return mapping


def extract_pdf_links(html: str, base_url: str) -> list[str]:
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    urls = []
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if href in {"#", "/", ""}:
            continue
        full = urljoin(base_url, href)
        if ".pdf" in full.lower():
            urls.append(full)
    return list(dict.fromkeys(urls))


def extract_elective_options(html: str, group_title: str) -> list[tuple[str, str]]:
    """Return (code, title) options listed under a named elective group heading."""
    if not html:
        return []
    soup = BeautifulSoup(html, "html.parser")
    needle = normalize_text(group_title)
    options: list[tuple[str, str]] = []
    headings = soup.find_all(["h2", "h3", "h4", "h5", "strong", "b"])
    for h in headings:
        ht = normalize_text(h.get_text(" ", strip=True))
        if not ht:
            continue
        if needle not in ht and ht not in needle:
            continue
        # Collect following sibling links until next similar heading.
        for sib in h.next_siblings:
            name = getattr(sib, "name", None)
            if name in {"h2", "h3", "h4", "h5"}:
                break
            nodes = []
            if name == "a":
                nodes = [sib]
            elif getattr(sib, "find_all", None):
                nodes = sib.find_all("a")
            for a in nodes:
                text = a.get_text(" ", strip=True)
                code_m = re.search(r"\b(01[A-Z]{2}\d{4}|AU\d{4})\b", text, re.I)
                if not code_m:
                    continue
                code = code_m.group(1).upper()
                title = re.sub(r"\s*\([^)]*\)\s*", " ", text).strip()
                title = re.sub(r"\b" + re.escape(code) + r"\b", "", title, flags=re.I).strip(" -")
                if title:
                    options.append((code, title))
                if len(options) >= 8:
                    return options
    return options


def classify_pdf_open(data: bytes) -> tuple[bool, str, str]:
    """Return (ok, text, error)."""
    if not is_pdf_magic(data):
        head = data[:80].decode("latin-1", errors="replace")
        return False, "", f"not_pdf_magic head={head!r}"
    if len(data) < MIN_PDF_BYTES:
        return False, "", f"too_small bytes={len(data)}"
    if len(data) > MAX_PDF_BYTES:
        return False, "", f"too_large bytes={len(data)}"
    try:
        reader = PdfReader(io.BytesIO(data))
        n = len(reader.pages)
        if n < 1:
            return False, "", "zero_pages"
        texts = []
        for i, page in enumerate(reader.pages[:40]):
            try:
                t = page.extract_text() or ""
            except Exception:
                t = ""
            texts.append(t)
        blob = "\n".join(texts)
        return True, blob, f"pages={n}"
    except Exception as exc:
        return False, "", f"parser_error:{exc}"


def page_range_for_match(data: bytes, title: str, code: str) -> str:
    try:
        reader = PdfReader(io.BytesIO(data))
    except Exception:
        return ""
    hits = []
    code_n = normalize_text(code).replace(" ", "")
    title_n = normalize_text(title)
    for i, page in enumerate(reader.pages[:80], start=1):
        try:
            t = normalize_text(page.extract_text() or "")
        except Exception:
            continue
        if (code_n and code_n in t.replace(" ", "")) or (title_n and title_n in t):
            hits.append(i)
    if not hits:
        return ""
    return f"{min(hits)}-{max(hits)}"


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------
class HttpClient:
    def __init__(self) -> None:
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": USER_AGENT, "Accept": "*/*"})
        self.network_ok = True
        self.probed = False

    def request(
        self,
        url: str,
        *,
        method: str = "GET",
        stream: bool = False,
        retries: int = MAX_RETRIES,
    ) -> dict[str, Any]:
        last: dict[str, Any] = {
            "ok": False,
            "status": None,
            "final_url": url,
            "content": b"",
            "error": "",
            "attempts": 0,
        }
        for attempt in range(1, retries + 1):
            last["attempts"] = attempt
            try:
                resp = self.session.request(
                    method,
                    url,
                    timeout=TIMEOUT,
                    allow_redirects=True,
                    stream=stream,
                )
                content = b""
                if method == "GET" and not stream:
                    content = resp.content or b""
                elif method == "GET" and stream:
                    content = resp.raw.read(MAX_PDF_BYTES + 1, decode_content=True)
                last = {
                    "ok": 200 <= resp.status_code < 300,
                    "status": resp.status_code,
                    "final_url": str(resp.url),
                    "content": content,
                    "error": "",
                    "attempts": attempt,
                    "content_type": resp.headers.get("Content-Type", ""),
                }
                self.probed = True
                self.network_ok = True
                if last["ok"] or not should_retry(resp.status_code, None):
                    return last
            except requests.RequestException as exc:
                last = {
                    "ok": False,
                    "status": None,
                    "final_url": url,
                    "content": b"",
                    "error": f"{type(exc).__name__}:{exc}",
                    "attempts": attempt,
                }
                self.probed = True
                if attempt >= retries:
                    # Distinguish total network failure after first probe attempts.
                    if "Failed to establish" in str(exc) or "NameResolution" in str(exc):
                        self.network_ok = False
                    return last
            time.sleep(RETRY_SLEEP * attempt)
        return last


# ---------------------------------------------------------------------------
# Runner
# ---------------------------------------------------------------------------
class RecoveryRunner:
    def __init__(self, root: Path | None = None) -> None:
        self.root = root or ROOT
        self.data = self.root / "data"
        self.output = self.root / "Output"
        self.reports = self.root / "Reports"
        self.http = HttpClient()
        self.page_cache: dict[str, dict[str, Any]] = {}
        self.attempts: list[dict[str, str]] = []
        self.manifest: list[dict[str, str]] = []
        self.page_html: dict[str, str] = {}
        self.sem_maps: dict[str, dict[str, str]] = {}
        self.wp_cache: dict[str, list[dict[str, str]]] = {}
        self._catalog: list[dict[str, str]] | None = None
        self._prev_urls: list[str] | None = None
        self._index_pdfs: dict[str, list[str]] = {}
        self._remote_cache: dict[tuple[str, str, str], dict[str, Any] | None] = {}

    def log_attempt(self, row: dict[str, str], **kw: str) -> None:
        rec = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "course_code": row.get("course_code", ""),
            "subject_title": row.get("subject_title", ""),
            "program_name": row.get("program_name", ""),
            **kw,
        }
        self.attempts.append(rec)

    def load_targets(self) -> list[dict[str, str]]:
        path = self.data / "subject_targets.csv"
        with path.open(newline="", encoding="utf-8-sig") as f:
            rows = list(csv.DictReader(f))
        out = []
        seen = set()
        for raw in rows:
            r = dict(raw)
            if not r.get("program_name"):
                r["program_name"] = (r.get("program") or "").strip()
            if not r.get("course_code"):
                r["course_code"] = (r.get("subject_code") or "").strip()
            r["subject_title"] = (r.get("subject_title") or "").strip()
            r["semester"] = (r.get("semester") or "").strip()
            r["marwadi_page_url"] = (r.get("marwadi_page_url") or "").strip()
            r["previous_gtu_candidate_url"] = (r.get("previous_gtu_candidate_url") or "").strip()
            key = (
                r["program_name"],
                r["course_code"].upper(),
                normalize_text(r["subject_title"]),
            )
            if key in seen:
                continue
            seen.add(key)
            out.append(r)
        return out

    def load_catalog(self) -> list[dict[str, str]]:
        if self._catalog is not None:
            return self._catalog
        path = self.data / "source_catalog.csv"
        if not path.exists():
            self._catalog = []
            return self._catalog
        with path.open(newline="", encoding="utf-8-sig") as f:
            self._catalog = list(csv.DictReader(f))
        return self._catalog

    def load_previous_urls(self) -> list[str]:
        if self._prev_urls is not None:
            return self._prev_urls
        urls = []
        prev = self.data / "previous_recovery_manifest.csv"
        if prev.exists():
            with prev.open(newline="", encoding="utf-8-sig") as f:
                for r in csv.DictReader(f):
                    for k in ("source_url", "final_url", "candidate_url"):
                        u = (r.get(k) or "").strip()
                        if u.startswith("http"):
                            urls.append(u)
        q = self.data / "unresolved_gtu_review_queue.csv"
        if q.exists():
            with q.open(newline="", encoding="utf-8-sig") as f:
                for r in csv.DictReader(f):
                    for k, v in r.items():
                        if v and str(v).startswith("http"):
                            urls.append(str(v).strip())
        self._prev_urls = list(dict.fromkeys(urls))
        return self._prev_urls

    def collection_dirs(self) -> list[Path]:
        dirs = [self.root]
        if COLLECTION_ROOTS.exists():
            for line in COLLECTION_ROOTS.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                # Refuse full-drive scans.
                if re.fullmatch(r"[A-Za-z]:\\?", line) or line in {"/", "/home", "/home/user"}:
                    continue
                p = Path(line)
                if p.is_dir():
                    dirs.append(p)
        return [d for d in dirs if d.exists()]

    def fetch_html(self, url: str) -> str:
        if url in self.page_html:
            return self.page_html[url]
        res = self.http.request(url)
        text = ""
        if res["ok"] and res["content"]:
            ctype = (res.get("content_type") or "").lower()
            if "pdf" in ctype or is_pdf_magic(res["content"]):
                text = ""
            else:
                text = res["content"].decode("utf-8", errors="replace")
        self.page_html[url] = text
        return text

    def program_html(self, program: str, extra_url: str = "") -> str:
        chunks = []
        urls = []
        if extra_url:
            urls.append(extra_url)
        urls.extend(PROGRAM_PAGES.get(program, []))
        seen = set()
        for url in urls:
            if not url or url in seen:
                continue
            seen.add(url)
            html = self.fetch_html(url)
            if html:
                chunks.append(html)
                parsed = parse_semester_map(html)
                merged = self.sem_maps.get(program, {})
                merged.update(parsed)
                self.sem_maps[program] = merged
        return "\n".join(chunks)

    def resolve_semester(self, row: dict[str, str]) -> str:
        program = row.get("program_name", "")
        code = (row.get("course_code") or "").upper()
        title_n = normalize_text(row.get("subject_title", ""))
        html = self.program_html(program, row.get("marwadi_page_url") or "")
        if program not in self.sem_maps:
            self.sem_maps[program] = parse_semester_map(html)
        sm = self.sem_maps.get(program, {})
        if f"{code}|{title_n}" in sm:
            return sm[f"{code}|{title_n}"]
        if code in sm:
            return sm[code]
        csv_sem = (row.get("semester") or "").strip()
        if csv_sem and csv_sem.lower() not in {
            "unknown",
            "semester_unknown",
            "not_detected",
            "semester_not_detected",
            "n/a",
            "",
        }:
            digits = re.sub(r"\D", "", csv_sem)
            return digits or csv_sem
        return ""

    def wp_media_search(self, query: str) -> list[dict[str, str]]:
        q = (query or "").strip()
        if not q:
            return []
        if q in self.wp_cache:
            return self.wp_cache[q]
        url = (
            "https://www.marwadiuniversity.ac.in/wp-json/wp/v2/media"
            f"?search={requests.utils.quote(q)}&per_page=20"
        )
        res = self.http.request(url)
        items: list[dict[str, str]] = []
        if res["ok"] and res["content"]:
            try:
                data = res["content"].decode("utf-8", errors="replace")
                import json

                arr = json.loads(data)
                if isinstance(arr, list):
                    for it in arr:
                        src = it.get("source_url") or ""
                        title = ((it.get("title") or {}).get("rendered")) or ""
                        mime = it.get("mime_type") or ""
                        if src:
                            items.append({"url": src, "title": title, "mime": mime})
            except Exception:
                items = []
        self.wp_cache[q] = items
        return items

    def url_looks_relevant(self, row: dict[str, str], url: str) -> bool:
        title = row.get("subject_title") or ""
        code = row.get("course_code") or ""
        u = (url or "").lower()
        if any(x in u for x in ("fee", "flyer", "hostel", "calendar", "admission", "placement")):
            return False
        conf, reason = match_confidence(title, code, url, url)
        if "different_course_code" in reason:
            return False
        code_n = normalize_text(code).replace(" ", "")
        url_n = normalize_text(url).replace(" ", "")
        if code_n and not is_placeholder_code(code) and code_n in url_n:
            return True
        t = tokens(title)
        un = set(normalize_text(url).split())
        if t and len(t & un) >= max(1, min(2, len(t))):
            return True
        return False

    def index_pdfs(self, tier: str) -> list[str]:
        if tier in self._index_pdfs:
            return self._index_pdfs[tier]
        pages = []
        for c in self.load_catalog():
            u = (c.get("base_url") or c.get("url") or c.get("source_url") or "").strip()
            if u and host_tier(u) == tier:
                pages.append(u)
        pdfs: list[str] = []
        for page in pages:
            if page.lower().endswith(".pdf"):
                pdfs.append(page)
                continue
            html = self.fetch_html(page)
            pdfs.extend(extract_pdf_links(html, page))
        self._index_pdfs[tier] = list(dict.fromkeys(pdfs))
        return self._index_pdfs[tier]

    def marwadi_candidates(self, row: dict[str, str]) -> list[str]:
        urls: list[str] = []
        program = row.get("program_name", "")
        code = (row.get("course_code") or "").strip()
        title = row.get("subject_title") or ""
        html = self.program_html(program, row.get("marwadi_page_url") or "")
        base = row.get("marwadi_page_url") or (PROGRAM_PAGES.get(program, [""]) or [""])[0]
        for u in extract_pdf_links(html, base):
            if self.url_looks_relevant(row, u):
                urls.append(u)
        queries = [code]
        code_hits = self.wp_media_search(code) if code else []
        for it in code_hits:
            src = it["url"]
            mime = (it.get("mime") or "").lower()
            if ("pdf" in mime or src.lower().endswith(".pdf")) and self.url_looks_relevant(row, src):
                urls.append(src)
        if not any(self.url_looks_relevant(row, u) for u in urls) and title:
            queries.append(title)
            for it in self.wp_media_search(title):
                src = it["url"]
                mime = (it.get("mime") or "").lower()
                if ("pdf" in mime or src.lower().endswith(".pdf")) and self.url_looks_relevant(row, src):
                    urls.append(src)
        # Keep only Marwadi hosts; program-page PDF list may include fee flyers.
        urls = [u for u in urls if host_tier(u) == "marwadi"]
        return list(dict.fromkeys(urls))

    def catalog_candidates(self, row: dict[str, str], tier: str) -> list[str]:
        catalog = self.load_catalog()
        urls = []
        code = (row.get("course_code") or "").upper()
        title_n = normalize_text(row.get("subject_title", ""))
        for c in catalog:
            src = (c.get("base_url") or c.get("url") or c.get("source_url") or "").strip()
            if not src.startswith("http"):
                continue
            if host_tier(src) != tier:
                continue
            note = normalize_text(
                " ".join(str(c.get(k, "")) for k in c.keys())
            )
            if code and code.lower() in note:
                urls.append(src)
            elif title_n and any(t in note for t in tokens(row.get("subject_title") or "") if len(t) > 4):
                urls.append(src)
            else:
                # Generic branch/program page: discovery only, later filtered.
                if src.lower().endswith(".pdf"):
                    continue
                urls.append(src)
        return list(dict.fromkeys(urls))

    def previous_candidates(self, row: dict[str, str], tier: str) -> list[str]:
        code = (row.get("course_code") or "").upper()
        title_n = normalize_text(row.get("subject_title", ""))
        out = []
        for u in self.load_previous_urls():
            if host_tier(u) != tier:
                continue
            n = normalize_text(u)
            if code and code.lower() in n:
                out.append(u)
            elif title_n and title_n.replace(" ", "") in n.replace(" ", ""):
                out.append(u)
        return list(dict.fromkeys(out))

    def discover_from_index_pages(self, pages: list[str], row: dict[str, str]) -> list[str]:
        """Follow official HTML indexes; collect PDF hrefs that match the subject."""
        found = []
        code = (row.get("course_code") or "").upper()
        title = row.get("subject_title") or ""
        for page in pages:
            if page.lower().endswith(".pdf"):
                found.append(page)
                continue
            html = self.fetch_html(page)
            if not html:
                self.log_attempt(
                    row,
                    source_url=page,
                    http_status=str(self.http.session and ""),
                    result="index_not_html_or_empty",
                )
                continue
            for u in extract_pdf_links(html, page):
                conf, reason = match_confidence(title, code, u, u)
                if conf in {"HIGH", "MEDIUM"}:
                    found.append(u)
                else:
                    self.log_attempt(
                        row,
                        source_url=u,
                        result="index_pdf_low_match",
                        notes=reason,
                    )
        return list(dict.fromkeys(found))

    def local_candidates(self, row: dict[str, str]) -> list[Path]:
        code = (row.get("course_code") or "").upper()
        title_n = normalize_text(row.get("subject_title", ""))
        hits: list[Path] = []
        for base in self.collection_dirs():
            # Bounded walk: depth 4, skip huge trees.
            for dirpath, dirnames, filenames in os.walk(base):
                rel = Path(dirpath).relative_to(base) if Path(dirpath) != base else Path(".")
                if len(rel.parts) > 4:
                    dirnames[:] = []
                    continue
                dirnames[:] = [
                    d
                    for d in dirnames
                    if d not in {".git", "node_modules", "__pycache__", ".venv", "Output", "Reports"}
                    and not d.startswith(".")
                ]
                for fn in filenames:
                    if not fn.lower().endswith(".pdf"):
                        continue
                    nn = normalize_text(fn)
                    if code and code.lower() in nn:
                        hits.append(Path(dirpath) / fn)
                    elif title_n and all(t in nn for t in list(tokens(title_n))[:3]):
                        hits.append(Path(dirpath) / fn)
                if len(hits) >= 20:
                    return hits
        return hits

    def validate_remote(
        self, row: dict[str, str], url: str, expected_tier: str
    ) -> dict[str, Any] | None:
        title = row.get("subject_title") or ""
        code = row.get("course_code") or ""
        cache_key = (url, code.upper(), normalize_text(title), expected_tier)
        if cache_key in self._remote_cache:
            return self._remote_cache[cache_key]

        def store(val: dict[str, Any] | None) -> dict[str, Any] | None:
            self._remote_cache[cache_key] = val
            return val

        res = self.http.request(url)
        status = res.get("status")
        final = res.get("final_url") or url
        err = res.get("error") or ""
        if status is None:
            self.log_attempt(
                row,
                source_url=url,
                final_url=final,
                http_status="",
                result="network_error",
                notes=err,
            )
            return store({"network_error": True, "url": url, "error": err})
        if status == 404:
            self.log_attempt(
                row,
                source_url=url,
                final_url=final,
                http_status="404",
                result="http_404",
            )
            return store(None)
        if not res["ok"]:
            self.log_attempt(
                row,
                source_url=url,
                final_url=final,
                http_status=str(status),
                result="http_not_ok",
                notes=err,
            )
            return store(None)
        if not is_official_host(final):
            self.log_attempt(
                row,
                source_url=url,
                final_url=final,
                http_status=str(status),
                result="redirected_off_official_host",
            )
            return store(None)
        tier = host_tier(final)
        if expected_tier == "marwadi" and tier != "marwadi":
            self.log_attempt(
                row,
                source_url=url,
                final_url=final,
                http_status=str(status),
                result="not_marwadi_host",
            )
            return store(None)
        data = res["content"]
        ok, text, detail = classify_pdf_open(data)
        if not ok:
            self.log_attempt(
                row,
                source_url=url,
                final_url=final,
                http_status=str(status),
                result="not_valid_pdf",
                notes=detail,
            )
            return store(None)
        hay = text + " " + final + " " + url
        conf, reason = match_confidence(title, code, hay, final)
        if conf == "LOW":
            self.log_attempt(
                row,
                source_url=url,
                final_url=final,
                http_status=str(status),
                result="content_mismatch_low",
                notes=reason,
                sha256=hashlib.sha256(data).hexdigest(),
            )
            return store({
                "needs_review": True,
                "url": url,
                "final_url": final,
                "data": data,
                "text": text,
                "confidence": conf,
                "reason": reason,
                "detail": detail,
                "tier": tier,
            })
        sha = hashlib.sha256(data).hexdigest()
        pr = page_range_for_match(data, title, code)
        self.log_attempt(
            row,
            source_url=url,
            final_url=final,
            http_status=str(status),
            result="accepted_candidate",
            notes=f"{reason};{detail};pages={pr}",
            sha256=sha,
        )
        return store({
            "url": url,
            "final_url": final,
            "data": data,
            "text": text,
            "confidence": conf,
            "reason": reason,
            "detail": detail,
            "tier": tier,
            "sha256": sha,
            "page_range": pr,
            "http_status": status,
        })

    def validate_local(self, row: dict[str, str], path: Path) -> dict[str, Any] | None:
        try:
            data = path.read_bytes()
        except OSError as exc:
            self.log_attempt(row, source_url=str(path), result="local_unreadable", notes=str(exc))
            return None
        ok, text, detail = classify_pdf_open(data)
        if not ok:
            self.log_attempt(row, source_url=str(path), result="local_not_pdf", notes=detail)
            return None
        conf, reason = match_confidence(
            row.get("subject_title") or "",
            row.get("course_code") or "",
            text + " " + path.name,
            str(path),
        )
        if conf == "LOW":
            self.log_attempt(row, source_url=str(path), result="local_low_match", notes=reason)
            return None
        return {
            "url": str(path),
            "final_url": str(path),
            "data": data,
            "text": text,
            "confidence": conf,
            "reason": reason,
            "detail": detail,
            "tier": "local",
            "sha256": hashlib.sha256(data).hexdigest(),
            "page_range": page_range_for_match(
                data, row.get("subject_title") or "", row.get("course_code") or ""
            ),
            "http_status": "local",
        }

    def save_pdf(self, row: dict[str, str], sem: str, data: bytes) -> Path:
        prog = program_folder(row.get("program_name", ""))
        folder = self.output / prog / semester_folder(sem)
        folder.mkdir(parents=True, exist_ok=True)
        code = (row.get("course_code") or "NA").strip()
        title = sanitize_filename(row.get("subject_title") or "untitled")
        path = folder / f"{code} - {title}.pdf"
        path.write_bytes(data)
        return path

    def empty_manifest(
        self, row: dict[str, str], sem: str, status: str, notes: str
    ) -> dict[str, str]:
        return {
            "program_name": row.get("program_name", ""),
            "course_code": row.get("course_code", ""),
            "subject_title": row.get("subject_title", ""),
            "semester": semester_folder(sem),
            "status": status,
            "source_tier": "",
            "source_url": "",
            "final_url": "",
            "http_status": "",
            "file_bytes": "",
            "sha256": "",
            "confidence": "",
            "page_range": "",
            "output_path": "",
            "notes": notes[:800],
        }

    def accept_manifest(
        self,
        row: dict[str, str],
        sem: str,
        status: str,
        hit: dict[str, Any],
        path: Path,
    ) -> dict[str, str]:
        return {
            "program_name": row.get("program_name", ""),
            "course_code": row.get("course_code", ""),
            "subject_title": row.get("subject_title", ""),
            "semester": semester_folder(sem),
            "status": status,
            "source_tier": hit.get("tier", ""),
            "source_url": hit.get("url", ""),
            "final_url": hit.get("final_url", ""),
            "http_status": str(hit.get("http_status", "")),
            "file_bytes": str(len(hit.get("data") or b"")),
            "sha256": hit.get("sha256", ""),
            "confidence": hit.get("confidence", ""),
            "page_range": hit.get("page_range", ""),
            "output_path": str(path.relative_to(self.root)),
            "notes": f"{hit.get('reason','')}; {hit.get('detail','')}"[:800],
        }

    def process_row(self, row: dict[str, str], extra_rows: list[dict[str, str]]) -> dict[str, str]:
        title = row.get("subject_title") or ""
        code = row.get("course_code") or ""
        sem = self.resolve_semester(row)
        html = self.program_html(row.get("program_name", ""), row.get("marwadi_page_url") or "")

        if is_group_heading(title, code):
            opts = extract_elective_options(html, title)
            notes = []
            existing = {
                (r.get("course_code", "").upper(), normalize_text(r.get("subject_title", "")))
                for r in extra_rows
            }
            for oc, ot in opts:
                key = (oc.upper(), normalize_text(ot))
                notes.append(f"{oc}:{ot}")
                if key not in existing:
                    extra_rows.append(
                        {
                            **row,
                            "course_code": oc,
                            "subject_title": ot,
                            "semester": sem,
                            "_expanded_from": title,
                        }
                    )
                    existing.add(key)
            note = "expanded_options=" + " | ".join(notes) if notes else "no_named_options_on_official_page"
            self.log_attempt(row, result="group_heading", notes=note)
            return self.empty_manifest(row, sem, STATUS_EXPANDED, note)

        network_errors = 0
        review_hit: dict[str, Any] | None = None

        # Local reuse first (same validation).
        for p in self.local_candidates(row):
            hit = self.validate_local(row, p)
            if hit:
                out = self.save_pdf(row, sem, hit["data"])
                return self.accept_manifest(row, sem, STATUS_LOCAL, hit, out)

        # Tier 1 Marwadi
        m_urls = self.marwadi_candidates(row)
        # Prefer URLs whose path contains the course code.
        def _rank(u: str) -> int:
            n = u.lower()
            c = code.lower()
            return 0 if c and c.lower() in n else 1

        for url in sorted(set(m_urls), key=_rank):
            hit = self.validate_remote(row, url, "marwadi")
            if not hit:
                continue
            if hit.get("network_error"):
                network_errors += 1
                continue
            if hit.get("needs_review"):
                review_hit = hit
                continue
            out = self.save_pdf(row, sem, hit["data"])
            return self.accept_manifest(row, sem, STATUS_VERIFIED_MARWADI, hit, out)

        # Tier 2 GTU — never accept branch index as the file.
        gtu_urls = []
        prev_gtu = (row.get("previous_gtu_candidate_url") or "").strip()
        if prev_gtu:
            gtu_urls.append(prev_gtu)
        gtu_urls.extend(self.previous_candidates(row, "gtu"))
        gtu_urls.extend(u for u in self.index_pdfs("gtu") if self.url_looks_relevant(row, u))
        for url in list(dict.fromkeys(gtu_urls)):
            if "branch.aspx" in url.lower():
                self.log_attempt(row, source_url=url, result="skipped_gtu_branch_index")
                continue
            hit = self.validate_remote(row, url, "gtu")
            if not hit:
                continue
            if hit.get("network_error"):
                network_errors += 1
                continue
            if hit.get("needs_review"):
                review_hit = review_hit or hit
                continue
            if hit.get("tier") != "gtu":
                continue
            out = self.save_pdf(row, sem, hit["data"])
            return self.accept_manifest(row, sem, STATUS_VERIFIED_GTU, hit, out)

        # Tier 3 other official universities
        other_urls = [
            u for u in self.index_pdfs("other") if self.url_looks_relevant(row, u)
        ] + self.previous_candidates(row, "other")
        for url in list(dict.fromkeys(other_urls)):
            hit = self.validate_remote(row, url, "other")
            if not hit:
                continue
            if hit.get("network_error"):
                network_errors += 1
                continue
            if hit.get("needs_review"):
                review_hit = review_hit or hit
                continue
            if hit.get("confidence") == "LOW":
                continue
            out = self.save_pdf(row, sem, hit["data"])
            man = self.accept_manifest(row, sem, STATUS_VERIFIED_OTHER, hit, out)
            man["notes"] = (
                "COMPARABLE REFERENCE from another official Indian university; "
                "NOT Marwadi University official syllabus. " + man["notes"]
            )
            return man

        if review_hit:
            # File existed but content could not be confirmed — do not copy as verified.
            return self.empty_manifest(
                row,
                sem,
                STATUS_REVIEW,
                f"pdf_found_but_unconfirmed:{review_hit.get('reason')}",
            )
        if network_errors and not self.http.network_ok:
            return self.empty_manifest(
                row, sem, STATUS_NET_BLOCKED, "network_unavailable_after_retries"
            )
        if network_errors:
            return self.empty_manifest(
                row, sem, STATUS_NET, f"network_errors={network_errors}_no_verified_file"
            )
        return self.empty_manifest(
            row,
            sem,
            STATUS_NONE,
            "no_official_pdf_confirmed_after_marwadi_gtu_other_search",
        )

    def write_reports(self) -> None:
        self.reports.mkdir(parents=True, exist_ok=True)
        man_fields = [
            "program_name",
            "course_code",
            "subject_title",
            "semester",
            "status",
            "source_tier",
            "source_url",
            "final_url",
            "http_status",
            "file_bytes",
            "sha256",
            "confidence",
            "page_range",
            "output_path",
            "notes",
        ]
        with (self.reports / "recovery_manifest.csv").open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=man_fields)
            w.writeheader()
            w.writerows(self.manifest)

        att_fields = [
            "timestamp",
            "course_code",
            "subject_title",
            "program_name",
            "source_url",
            "final_url",
            "http_status",
            "result",
            "notes",
            "sha256",
        ]
        with (self.reports / "source_attempts.csv").open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=att_fields, extrasaction="ignore")
            w.writeheader()
            w.writerows(self.attempts)

        unresolved = [
            m
            for m in self.manifest
            if m["status"]
            not in {
                STATUS_VERIFIED_MARWADI,
                STATUS_VERIFIED_GTU,
                STATUS_VERIFIED_OTHER,
                STATUS_LOCAL,
            }
        ]
        with (self.reports / "unresolved_subjects.csv").open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=man_fields)
            w.writeheader()
            w.writerows(unresolved)

        counts: dict[str, int] = defaultdict(int)
        for m in self.manifest:
            counts[m["status"]] += 1
        lines = [
            "Marwadi B.Tech Verified Syllabus Recovery — SUMMARY",
            f"Generated (UTC): {datetime.now(timezone.utc).isoformat()}",
            f"Queue rows processed: {len(self.manifest)}",
            "",
            "Status counts (honest — only files that passed checks are verified):",
        ]
        for k in sorted(counts):
            lines.append(f"  {k}: {counts[k]}")
        verified = (
            counts[STATUS_VERIFIED_MARWADI]
            + counts[STATUS_VERIFIED_GTU]
            + counts[STATUS_VERIFIED_OTHER]
            + counts[STATUS_LOCAL]
        )
        lines += [
            "",
            f"Verified files written: {verified}",
            f"Unresolved / expanded / review / network: {len(self.manifest) - verified}",
            f"HTTP attempts logged: {len(self.attempts)}",
            "",
            "This run does not claim that every subject has a public PDF.",
            "GTU combined BE-I / BE-II URLs that return 404 are recorded as 404, not reused.",
            "HTML pages, login walls, and branch indexes are never labelled verified.",
            "",
            "Output layout: Output/<Program>/<Semester>/<Code - Title>.pdf",
        ]
        (self.reports / "SUMMARY.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")

        url_lines = [
            "URL verification log (unique source URLs attempted)",
            "",
        ]
        seen_u = set()
        for a in self.attempts:
            u = a.get("source_url") or ""
            if not u or u in seen_u:
                continue
            seen_u.add(u)
            url_lines.append(
                f"{a.get('http_status','')}  {a.get('result','')}  {u}  -> {a.get('final_url','')}"
            )
        (self.reports / "URL_VERIFICATION.txt").write_text(
            "\n".join(url_lines) + "\n", encoding="utf-8"
        )

        pdf_lines = [
            "PDF validation for accepted / review files",
            "",
        ]
        for m in self.manifest:
            if m["status"] in {
                STATUS_VERIFIED_MARWADI,
                STATUS_VERIFIED_GTU,
                STATUS_VERIFIED_OTHER,
                STATUS_LOCAL,
                STATUS_REVIEW,
            }:
                pdf_lines.append(
                    f"{m['status']}  {m['course_code']}  bytes={m['file_bytes']}  "
                    f"sha256={m['sha256']}  conf={m['confidence']}  "
                    f"pages={m['page_range']}  {m['output_path']}"
                )
        (self.reports / "PDF_VALIDATION.txt").write_text(
            "\n".join(pdf_lines) + "\n", encoding="utf-8"
        )

        map_fields = [
            "program_name",
            "course_code",
            "subject_title",
            "semester",
            "status",
            "source_url",
            "final_url",
            "sha256",
            "confidence",
            "output_path",
        ]
        with (self.data / "verified_source_map.csv").open("w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=map_fields, extrasaction="ignore")
            w.writeheader()
            w.writerows(self.manifest)

    def zip_package(self) -> Path:
        zip_path = self.root.parent / "Marwadi_BTech_Verified_Recovery_Package.zip"
        skip = {zip_path.name}
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for dirpath, dirnames, filenames in os.walk(self.root):
                dirnames[:] = [d for d in dirnames if d not in {"__pycache__", ".venv"}]
                for fn in filenames:
                    if fn in skip or fn.endswith(".pyc"):
                        continue
                    full = Path(dirpath) / fn
                    zf.write(full, full.relative_to(self.root.parent))
        # Integrity
        with zipfile.ZipFile(zip_path) as zf:
            bad = zf.testzip()
            if bad:
                raise RuntimeError(f"zip testzip failed: {bad}")
        return zip_path

    def run(self) -> int:
        self.output.mkdir(parents=True, exist_ok=True)
        self.reports.mkdir(parents=True, exist_ok=True)
        targets = self.load_targets()
        extra: list[dict[str, str]] = list(targets)
        print(f"Loaded {len(targets)} subject targets")
        # Probe network once.
        probe = self.http.request("https://www.marwadiuniversity.ac.in/", retries=2)
        if probe.get("status") is None and not probe.get("ok"):
            print("WARNING: network probe failed:", probe.get("error"))
        i = 0
        # extra grows if electives expand
        while i < len(extra):
            row = extra[i]
            i += 1
            try:
                man = self.process_row(row, extra)
            except Exception as exc:
                man = self.empty_manifest(
                    row, "", STATUS_NONE, f"row_exception:{type(exc).__name__}:{exc}"
                )
                self.log_attempt(row, result="row_exception", notes=str(exc))
            self.manifest.append(man)
            print(
                f"[{len(self.manifest)}/{len(extra)}] {man['status']:32} "
                f"{man['course_code']:12} {man['subject_title'][:50]}"
            )
        self.write_reports()
        zip_path = self.zip_package()
        print("Wrote", self.reports / "SUMMARY.txt")
        print("Package", zip_path)
        print((self.reports / "SUMMARY.txt").read_text(encoding="utf-8"))
        return 0


def main() -> int:
    return RecoveryRunner().run()


if __name__ == "__main__":
    sys.exit(main())
