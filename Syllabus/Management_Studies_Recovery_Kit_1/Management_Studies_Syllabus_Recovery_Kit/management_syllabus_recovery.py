#!/usr/bin/env python3
"""PrepMaster Management Studies syllabus recovery.

Downloads at most one candidate PDF per unique normalized subject title. It preserves every
course/semester occurrence in CSV reports so duplicate titles are visible. It never writes to
Supabase, GitHub, or the website catalog.
"""
from __future__ import annotations
import argparse, csv, hashlib, html, io, json, os, re, sys, threading, time, traceback, unicodedata, urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Optional

import requests
from bs4 import BeautifulSoup
import fitz  # PyMuPDF

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
OUT_DIR = ROOT / "Output"
PDF_DIR = OUT_DIR / "Verified_PDFs"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) PrepMasterManagementSyllabusRecovery/1.0"
TIMEOUT = 12
RETRIES = 2
WORKERS = 5
MAX_PDF_BYTES = 32 * 1024 * 1024
MAX_PDF_PAGES = 500

RAW_MANIFEST_URLS = [
    "https://raw.githubusercontent.com/dakshhadvani19/prep_master_/main/global-exam-prep/src/data/mockData.js",
    "https://github.com/dakshhadvani19/prep_master_/raw/refs/heads/main/global-exam-prep/src/data/mockData.js",
]

# Official Marwadi programme pages, keyed by mockData.js course `id`.
MARWADI_COURSE_PAGES = {
    "bba": "https://www.marwadiuniversity.ac.in/bba-colleges-in-rajkot/",
    "bba-hons-": "https://www.marwadiuniversity.ac.in/bba-hons/",
    "b-com": "https://www.marwadiuniversity.ac.in/bachelor-of-commerce-colleges/",
    "bba-business-analytics-": "https://www.marwadiuniversity.ac.in/bba-in-business-analytics-colleges-in-gujarat/",
    "bba-digital-marketing-": "https://www.marwadiuniversity.ac.in/best-bba-in-digital-marketing-colleges-in-gujarat/",
    "bba-international-business-": "https://www.marwadiuniversity.ac.in/bba-in-international-business-colleges-in-gujarat/",
    "bba-in-global-business-management": "https://www.marwadiuniversity.ac.in/bba-in-global-business-management/",
    "bba-aviation": "https://www.marwadiuniversity.ac.in/bba-aviation-and-hospitality-management/",
    "mba": "https://www.marwadiuniversity.ac.in/mba/",
    "mba-business-analytics": "https://www.marwadiuniversity.ac.in/mba-business-analytics/",
    "master-in-global-business-management": "https://www.marwadiuniversity.ac.in/master-in-global-business-management/",
}
MARWADI_HOSTS = {"marwadiuniversity.ac.in", "www.marwadiuniversity.ac.in", "testmuwebsite.marwadiuniversity.ac.in"}
GTU_HOSTS = {"gtu.ac.in", "www.gtu.ac.in", "old26.gtu.ac.in"}
# The final tier is intentionally restricted to known official university/institution domains.
OTHER_OFFICIAL_HOSTS = {
    "gujaratuniversity.ac.in", "www.gujaratuniversity.ac.in",
    "mu.ac.in", "www.mu.ac.in", "unipune.ac.in", "www.unipune.ac.in",
    "ignou.ac.in", "www.ignou.ac.in", "du.ac.in", "www.du.ac.in",
    "jmi.ac.in", "www.jmi.ac.in", "bhu.ac.in", "www.bhu.ac.in",
    "vtu.ac.in", "www.vtu.ac.in", "spuvvn.edu", "www.spuvvn.edu",
    "spuvvn.ac.in", "www.spuvvn.ac.in",
}
ALLOWED_SOURCE_HOSTS = MARWADI_HOSTS | GTU_HOSTS | OTHER_OFFICIAL_HOSTS
CODE_RE = re.compile(r"(?<![A-Z0-9])\d{2}[A-Z]{2}[A-Z0-9]{3,}(?![A-Z0-9])", re.I)
CONTENT_MARKERS = (
    "course contents", "course content", "contents", "unit i", "unit 1", "unit no",
    "teaching scheme", "contact hours", "course duration", "modules", "module 1", "topics",
)
DETAIL_MARKERS = (
    "course outcomes", "course outcome", "course objectives", "learning outcomes",
    "reference books", "text books", "textbook", "course credits", "pre requisite",
    "course code", "teaching and examination scheme", "unit outcomes",
)
STOPWORDS = {"a", "an", "and", "or", "the", "of", "for", "in", "to", "with", "by", "on", "from", "at", "course", "subject", "syllabus"}

LOCK = threading.RLock()
REQUEST_LOG: list[dict] = []
PDF_VALIDATION_LOG: list[dict] = []
NETWORK_ERRORS: list[dict] = []
FETCH_CACHE: dict[str, tuple[int, str, str, bytes, str]] = {}

@dataclass
class Candidate:
    url: str
    tier: int
    institution: str
    listing_text: str = ""
    discovered_from: str = ""
    context_course: str = ""
    expected_codes: list[str] | None = None
    discovery_reason: str = ""
    score: float = 0.0


def log(msg: str) -> None:
    line = f"[{time.strftime('%H:%M:%S')}] {msg}"
    print(line, flush=True)
    try:
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        with (OUT_DIR / "run_log.txt").open("a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def norm(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or "")).casefold()
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def compact(value: Any) -> str:
    return norm(value).replace(" ", "")


def tokens(value: Any) -> set[str]:
    return {t for t in norm(value).split() if t not in STOPWORDS and len(t) > 1}


def extract_domains_array(source: str) -> list[dict]:
    """Parse the JSON array after `export const domains =`; avoids evaluating arbitrary JS."""
    marker = "export const domains"
    at = source.find(marker)
    if at < 0:
        raise ValueError("GitHub mockData.js no longer contains the expected 'export const domains' marker")
    start = source.find("[", at)
    if start < 0:
        raise ValueError("Could not find the domains array")
    depth, quote, escaped = 0, None, False
    for i in range(start, len(source)):
        ch = source[i]
        if quote:
            if escaped:
                escaped = False
            elif ch == "\\":
                escaped = True
            elif ch == quote:
                quote = None
            continue
        if ch in ('"', "'"):
            quote = ch
        elif ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                candidate = source[start:i + 1]
                try:
                    value = json.loads(candidate)
                except json.JSONDecodeError as e:
                    raise ValueError(f"The domain data array is no longer strict JSON: {e}") from e
                if not isinstance(value, list):
                    raise ValueError("Parsed domains data was not a list")
                return value
    raise ValueError("The domains array is incomplete or malformed")


def decode_domain_manifest(source: str) -> tuple[list[dict], dict]:
    domains = extract_domains_array(source)
    domain = next((d for d in domains if d.get("id") == "management"), None)
    if not domain:
        raise ValueError("The PrepMaster source manifest has no `management` domain")
    courses = domain.get("courses") or []
    occurrences = []
    for course in courses:
        # IMPORTANT: use `subjects`, not `scenarios`. The repository's courseMapping.json counts
        # track subjects; scenarios are sample exam/scenario definitions, not catalog entries.
        for subject in course.get("subjects") or []:
            title = str(subject.get("title") or "").strip()
            sid = str(subject.get("id") or "").strip()
            if not title or not sid:
                continue
            sem = subject.get("sem", "")
            occurrences.append({
                "source_course_id": str(course.get("id") or ""),
                "course_title": str(course.get("title") or course.get("id") or ""),
                "source_subject_id": sid,
                "subject_title": title,
                "semester": sem,
                "source_type": "subjects",
                "title_key": norm(title),
            })
    if not occurrences:
        raise ValueError("Management domain was found but it contained no catalog subject rows")
    digest = hashlib.sha256(source.encode("utf-8")).hexdigest()
    meta = {"domain_id": domain.get("id"), "domain_title": domain.get("title"), "course_count": len(courses),
            "occurrence_count": len(occurrences), "source_url": RAW_MANIFEST_URLS[0], "source_sha256": digest,
            "source_fetched_at": time.strftime("%Y-%m-%d %H:%M:%S")}
    return occurrences, meta


def build_unique_targets(occurrences: list[dict]) -> tuple[list[dict], list[dict]]:
    grouped: dict[str, list[dict]] = {}
    for row in occurrences:
        grouped.setdefault(row["title_key"], []).append(row)
    targets, duplicate_groups = [], []
    for key, rows in grouped.items():
        title_counts_by_course: dict[str, int] = {}
        for r in rows:
            title_counts_by_course[r["course_title"]] = title_counts_by_course.get(r["course_title"], 0) + 1
        courses = sorted({r["course_title"] for r in rows})
        course_ids = sorted({r["source_course_id"] for r in rows})
        semesters = sorted({str(r["semester"]) for r in rows}, key=lambda x: (not x.isdigit(), int(x) if x.isdigit() else x))
        target_id = hashlib.sha1(key.encode("utf-8")).hexdigest()[:12]
        target = {
            "target_id": target_id, "title_key": key, "subject_title": rows[0]["subject_title"],
            "occurrence_count": len(rows), "course_count": len(courses), "courses": courses,
            "source_course_ids": course_ids, "semesters": semesters,
            "source_subject_ids": sorted({r["source_subject_id"] for r in rows}),
            "occurrences": rows, "expected_codes_by_course": {}, "all_expected_codes": [],
        }
        targets.append(target)
        if len(rows) > 1:
            duplicate_groups.append({
                "target_id": target_id, "normalized_title": key, "subject_title": rows[0]["subject_title"],
                "occurrence_count": len(rows), "course_count": len(courses), "courses": " | ".join(courses),
                "source_course_ids": " | ".join(course_ids), "semesters": " | ".join(semesters),
                "source_subject_ids": " | ".join(sorted({r["source_subject_id"] for r in rows})),
                "download_rule": "ONE download attempt for this normalized title; program-specific code/coverage still requires review",
                "selected_candidate_course": "", "selected_pdf_file": "", "selected_source": "", "final_status": "PENDING",
            })
    targets.sort(key=lambda x: norm(x["subject_title"]))
    duplicate_groups.sort(key=lambda x: norm(x["subject_title"]))
    return targets, duplicate_groups


def host_of(url: str) -> str:
    try: return (urllib.parse.urlparse(url).hostname or "").lower()
    except Exception: return ""


def host_allowed(url: str, hosts: set[str]) -> bool:
    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme.lower() != "https":
            return False
        h = (parsed.hostname or "").lower()
        return any(h == base or h.endswith("." + base) for base in hosts)
    except Exception:
        return False


def is_direct_pdf_url(url: str) -> bool:
    return urllib.parse.urlparse(url).path.lower().endswith(".pdf")


def request_url(url: str, label: str, allowed_hosts: Optional[set[str]] = None, timeout: int = TIMEOUT,
                max_bytes: int = MAX_PDF_BYTES) -> tuple[int, str, str, bytes, str]:
    url = urllib.parse.urldefrag(url.strip())[0]
    if allowed_hosts is not None and not host_allowed(url, allowed_hosts):
        row = {"time_local": time.strftime("%Y-%m-%d %H:%M:%S"), "action": label, "url": url,
               "final_url": "", "http_status": "REJECTED_HOST", "content_type": "", "response_bytes": 0,
               "error": "URL host not permitted for this source tier"}
        with LOCK: REQUEST_LOG.append(row)
        return 0, "", "", b"", "Host not permitted"
    with LOCK:
        if url in FETCH_CACHE:
            return FETCH_CACHE[url]
    last = (0, url, "", b"", "No request made")
    for attempt in range(RETRIES + 1):
        try:
            with requests.get(url, headers={"User-Agent": USER_AGENT, "Accept": "application/pdf,application/json,text/html,*/*;q=0.8"}, timeout=timeout, stream=True, allow_redirects=True) as r:
                body = bytearray()
                # stream limits prevent a bad URL from allocating unbounded memory
                for chunk in r.iter_content(128 * 1024):
                    if not chunk: continue
                    body.extend(chunk)
                    if len(body) > max_bytes:
                        raise ValueError(f"Response exceeded {max_bytes} byte limit")
                payload = bytes(body)
                final_url = r.url
                status, ctype = r.status_code, r.headers.get("Content-Type", "")
                err = ""
                if allowed_hosts is not None and not host_allowed(final_url, allowed_hosts):
                    err = "Redirect moved outside permitted source host allowlist"
                    status = "REJECTED_REDIRECT_HOST"
                    payload = b""
                last = (status, final_url, ctype, payload, err)
                break
        except Exception as e:
            last = (0, url, "", b"", f"{type(e).__name__}: {e}")
            if attempt < RETRIES:
                time.sleep(0.6 * (attempt + 1))
    status, final_url, ctype, body, err = last
    row = {"time_local": time.strftime("%Y-%m-%d %H:%M:%S"), "action": label, "url": url,
           "final_url": final_url, "http_status": status, "content_type": ctype,
           "response_bytes": len(body), "error": err}
    with LOCK:
        REQUEST_LOG.append(row)
        FETCH_CACHE[url] = last
        retryable = not status or status in (401, 403, 408, 425, 429) or (isinstance(status, int) and status >= 500)
        if retryable:
            NETWORK_ERRORS.append(row.copy())
    return last


def fetch_manifest() -> tuple[str, str]:
    # No unsafe code evaluation. Only this well-known source file is downloaded and its JSON data array is parsed.
    errors = []
    for url in RAW_MANIFEST_URLS:
        status, final, ctype, body, err = request_url(url, "fetch_prepMaster_management_manifest", None, timeout=20, max_bytes=5 * 1024 * 1024)
        if status == 200 and body:
            text = body.decode("utf-8-sig", errors="replace")
            try:
                # verify parser shape here so a GitHub HTML/error page cannot masquerade as a manifest
                decode_domain_manifest(text)
                return text, final
            except Exception as e:
                errors.append(f"{url}: content was fetched but parse failed: {e}")
        else:
            errors.append(f"{url}: HTTP/status {status}; {err}")
    raise RuntimeError("Could not load the PrepMaster Management Studies subject manifest. " + " | ".join(errors))


def flatten_page(html_text: str) -> str:
    return " ".join(BeautifulSoup(html_text, "html.parser").stripped_strings)


def extract_pdf_links(page_url: str, html_text: str, tier: int, institution: str, course_title: str = "") -> list[Candidate]:
    soup = BeautifulSoup(html_text, "html.parser")
    allowed = MARWADI_HOSTS if tier == 1 else GTU_HOSTS if tier == 2 else OTHER_OFFICIAL_HOSTS
    out, seen = [], set()
    for a in soup.find_all("a", href=True):
        href = urllib.parse.urljoin(page_url, html.unescape(a["href"]))
        label = " ".join(a.stripped_strings) or a.get("title", "") or ""
        if not is_direct_pdf_url(href) or not host_allowed(href, allowed) or href in seen:
            continue
        seen.add(href)
        out.append(Candidate(href, tier, institution, label, page_url, course_title, [], "Direct PDF link found on official page"))
    return out


def similarity_to_title(target_title: str, evidence: str) -> float:
    t = tokens(target_title)
    e = tokens(evidence)
    if not t or not e: return 0.0
    overlap = len(t & e) / len(t)
    normalized_title = norm(target_title)
    normalized_evidence = norm(evidence)
    if normalized_title and normalized_title in normalized_evidence:
        return 1.0
    # For short labels, require a literal title, don't accept one common word.
    if len(t) <= 2: return 0.0
    return overlap


def scan_page_code_evidence(targets: list[dict], page_html_by_course: dict[str, tuple[str, str, int, str]]) -> dict[str, dict[str, list[str]]]:
    """Map exact titles on official program pages to nearby course codes for per-course checks."""
    result: dict[str, dict[str, list[str]]] = {t["target_id"]: {} for t in targets}
    for t in targets:
        title = norm(t["subject_title"])
        for occurrence in t["occurrences"]:
            cid = occurrence["source_course_id"]
            entry = page_html_by_course.get(cid)
            if not entry: continue
            page_url, page_text, status, _raw = entry
            if status != 200: continue
            # Require the subject name to occur as a whole phrase rather than as part of a longer title.
            match = re.search(r"(?<![a-z0-9])" + re.escape(title) + r"(?![a-z0-9])", page_text)
            if not match: continue
            pos = match.start()
            # Page text is normalized; nearby IDs are used only as code evidence, never as proof by themselves.
            neighborhood = page_text[pos:pos + max(180, len(title) + 130)]
            codes = sorted({x.upper() for x in CODE_RE.findall(neighborhood)})
            if codes:
                result[t["target_id"]].setdefault(cid, [])
                result[t["target_id"]][cid] = sorted(set(result[t["target_id"]][cid] + codes))
    for t in targets:
        by_course = result[t["target_id"]]
        t["expected_codes_by_course"] = by_course
        t["all_expected_codes"] = sorted({c for values in by_course.values() for c in values})
    return result


def marwadi_page_preload(course_ids: set[str]) -> dict[str, tuple[str, str, int, str]]:
    pages = {}
    # One request per official course page, avoiding repeat fetches for duplicates.
    to_fetch = [(cid, MARWADI_COURSE_PAGES[cid]) for cid in sorted(course_ids) if cid in MARWADI_COURSE_PAGES]
    def run(item):
        cid, url = item
        status, final, ctype, body, err = request_url(url, "fetch_Marwadi_course_page", MARWADI_HOSTS, timeout=TIMEOUT, max_bytes=5 * 1024 * 1024)
        text = flatten_page(body.decode("utf-8", errors="replace")) if status == 200 and body else ""
        return cid, (final or url, norm(text), status if isinstance(status, int) else 0, body.decode("utf-8", errors="replace") if status == 200 and body else ""), err
    with ThreadPoolExecutor(max_workers=min(WORKERS, max(1, len(to_fetch)))) as pool:
        for fut in as_completed([pool.submit(run, item) for item in to_fetch]):
            try:
                cid, entry, err = fut.result(); pages[cid] = entry
                log(f"Marwadi program page {cid}: HTTP {entry[2]}" + (f" ({err})" if err else ""))
            except Exception as e:
                log(f"Page preload exception: {type(e).__name__}: {e}")
    return pages


def candidate_for_target_from_page_links(target: dict, page_html_by_course: dict[str, tuple[str, str, int, str]]) -> list[Candidate]:
    target_title = target["subject_title"]
    out = []
    course_names = set(target["courses"])
    for occurrence in target["occurrences"]:
        entry = page_html_by_course.get(occurrence["source_course_id"])
        if not entry or entry[2] != 200: continue
        page_url, _text, _status, raw_html = entry
        for c in extract_pdf_links(page_url, raw_html, 1, "Marwadi University", occurrence["course_title"]):
            evidence = c.listing_text + " " + urllib.parse.unquote(urllib.parse.urlparse(c.url).path)
            sc = similarity_to_title(target_title, evidence)
            # Do not download generic PDFs from a course page unless filename/label establishes relevance.
            if sc >= 0.72:
                c.score = sc
                c.expected_codes = target["expected_codes_by_course"].get(occurrence["source_course_id"], [])
                c.context_course = occurrence["course_title"]
                c.discovery_reason += "; filename/link title score={:.2f}".format(sc)
                out.append(c)
    return out


def wp_media_candidates(target: dict) -> tuple[list[Candidate], bool]:
    title = target["subject_title"]
    endpoint = "https://www.marwadiuniversity.ac.in/wp-json/wp/v2/media?" + urllib.parse.urlencode({"search": title, "per_page": 100})
    status, final, ctype, body, err = request_url(endpoint, "search_Marwadi_WordPress_media:" + title, MARWADI_HOSTS, timeout=TIMEOUT, max_bytes=6 * 1024 * 1024)
    if status != 200 or not body:
        return [], (not status or status in (401, 403, 408, 425, 429) or (isinstance(status, int) and status >= 500))
    try: items = json.loads(body.decode("utf-8", errors="replace"))
    except Exception:
        return [], False
    out = []
    expected_all = target.get("all_expected_codes", [])
    for item in items if isinstance(items, list) else []:
        url = str(item.get("source_url") or "")
        if not url or not is_direct_pdf_url(url) or not host_allowed(url, MARWADI_HOSTS): continue
        title_obj = item.get("title", {})
        listing = (title_obj.get("rendered", "") if isinstance(title_obj, dict) else str(title_obj))
        listing += " " + str(item.get("slug", "")) + " " + str(item.get("alt_text", ""))
        score = similarity_to_title(title, listing + " " + urllib.parse.unquote(urllib.parse.urlparse(url).path))
        if score < 0.60 and norm(title) not in norm(listing + " " + urllib.parse.unquote(url)):
            continue
        out.append(Candidate(url, 1, "Marwadi University", listing, final or endpoint,
                             "", expected_all, "Official WordPress media API result; title must still match PDF text", score))
    out.sort(key=lambda x: (-x.score, x.url))
    return out[:20], False


def search_engine_candidates(target: dict, tier: int) -> tuple[list[Candidate], bool]:
    title = target["subject_title"]
    if tier == 2:
        query = f'site:gtu.ac.in "{title}" syllabus filetype:pdf'
        hosts, institution = GTU_HOSTS, "Gujarat Technological University"
    else:
        query = f'"{title}" syllabus filetype:pdf (site:gujaratuniversity.ac.in OR site:mu.ac.in OR site:unipune.ac.in OR site:ignou.ac.in OR site:du.ac.in OR site:jmi.ac.in OR site:bhu.ac.in OR site:vtu.ac.in OR site:spuvvn.edu)'
        hosts, institution = OTHER_OFFICIAL_HOSTS, "Other official university (comparable reference)"
    search_url = "https://www.google.com/search?" + urllib.parse.urlencode({"q": query, "num": "10"})
    status, final, ctype, body, err = request_url(search_url, f"search_engine_tier_{tier}:" + title, None, timeout=TIMEOUT, max_bytes=4 * 1024 * 1024)
    google_blocked = bool(body and any(marker in body[:200000].decode("utf-8", errors="ignore").lower()
                                       for marker in ["unusual traffic", "automated queries", "recaptcha", "captcha", "not a robot", "our systems have detected"]))
    if status != 200 or not body or google_blocked:
        # Bing is used as an independent discovery fallback; only source URLs passing the allowlist are retained.
        bing = "https://www.bing.com/search?" + urllib.parse.urlencode({"q": query, "count": "10"})
        status2, final2, ctype2, body2, err2 = request_url(bing, f"search_engine_tier_{tier}_Bing:" + title, None, timeout=TIMEOUT, max_bytes=4 * 1024 * 1024)
        if status2 != 200 or not body2:
            return [], True
        bing_low = body2[:200000].decode("utf-8", errors="ignore").lower()
        if any(marker in bing_low for marker in ["captcha", "verify you are human", "access denied", "unusual traffic"]):
            return [], True
        page = BeautifulSoup(body2, "html.parser")
    else:
        page = BeautifulSoup(body, "html.parser")
    out, seen = [], set()
    # Links may be direct PDF targets or source pages. Direct PDFs are ranked first.
    for a in page.find_all("a", href=True):
        href = html.unescape(a["href"])
        if "google." in host_of(href):
            parsed = urllib.parse.urlparse(href)
            params = urllib.parse.parse_qs(parsed.query)
            href = (params.get("q") or params.get("url") or [href])[0]
        if "bing.com/ck/a" in href:
            continue
        href = urllib.parse.urldefrag(href)[0]
        if not href.startswith("http") or not host_allowed(href, hosts) or href in seen: continue
        if not is_direct_pdf_url(href):
            # A source listing page is not itself accepted; it is just a discovery page from which direct PDFs may be found.
            low = href.lower()
            if not any(k in low for k in ["syllabus", "curriculum", "course", "program", "programme", "department", "management"]):
                continue
        seen.add(href)
        label = " ".join(a.stripped_strings)
        sc = similarity_to_title(title, label + " " + urllib.parse.unquote(href))
        # GTU/other universities use their own course codes, so Marwadi's expected codes must not
        # be used to reject a genuinely comparable syllabus from another institution.
        out.append(Candidate(href, tier, institution, label, search_url, "", [],
                             "Search result from official-domain query; content validation mandatory", sc))
    out.sort(key=lambda c: (not is_direct_pdf_url(c.url), -c.score, c.url))
    # Inspect a bounded set; no generic search result may bypass PDF/content validation.
    out = out[:12]
    expanded = []
    for cand in out:
        if is_direct_pdf_url(cand.url):
            expanded.append(cand); continue
        status2, final2, ctype2, b2, err2 = request_url(cand.url, f"open_official_fallback_listing_tier_{tier}", hosts, timeout=TIMEOUT, max_bytes=5*1024*1024)
        if status2 == 200 and b2:
            expanded.extend(extract_pdf_links(final2 or cand.url, b2.decode("utf-8", errors="replace"), tier, institution))
    # Deduplicate candidates and preserve title-related evidence where available.
    unique = {}
    for cand in expanded:
        prev = unique.get(cand.url)
        if prev is None or cand.score > prev.score: unique[cand.url] = cand
    vals = sorted(unique.values(), key=lambda c: (-c.score, c.url))[:20]
    return vals, False


def pdf_validate(body: bytes, target: dict, cand: Candidate) -> tuple[bool, str, int, str, list[str], float]:
    if len(body) < 1200 or not body.startswith(b"%PDF-"):
        return False, "HTTP response was not a sufficiently sized PDF file", 0, "", [], 0.0
    try:
        doc = fitz.open(stream=body, filetype="pdf")
        page_count = doc.page_count
        if page_count < 1:
            doc.close()
            return False, "PDF has no pages", 0, "", [], 0.0
        if page_count > MAX_PDF_PAGES:
            doc.close()
            return False, f"PDF exceeded {MAX_PDF_PAGES} page limit", page_count, "", [], 0.0
        pages = min(page_count, 8)
        text = "\n".join(doc.load_page(i).get_text("text") or "" for i in range(pages))
        doc.close()
    except Exception as e:
        return False, f"PyMuPDF could not open/extract PDF: {type(e).__name__}: {e}", 0, "", [], 0.0
    ntext = norm(text)
    title = target["subject_title"]
    title_norm = norm(title)
    title_tokens = tokens(title)
    overlap = len(title_tokens & tokens(text)) / max(1, len(title_tokens)) if title_tokens else 0.0
    exact = bool(title_norm and re.search(r"(?<![a-z0-9])" + re.escape(title_norm) + r"(?![a-z0-9])", ntext))
    all_text_codes = sorted({c.upper() for c in CODE_RE.findall(text[:10000])})
    expected_codes = sorted({str(c).upper() for c in (cand.expected_codes or [])})
    code_matches = sorted(set(all_text_codes) & set(expected_codes))
    # Very short/common names (e.g. MANAGEMENT or VOICE) need a code match or a standalone
    # title heading near the beginning, not merely the word appearing in unrelated prose.
    top_lines = [norm(line) for line in text.splitlines()[:20] if norm(line)]
    exact_header = any(line == title_norm or re.fullmatch(re.escape(title_norm) + r"(?: \d{2}[a-z]{2}[a-z0-9]{3,})?", line) for line in top_lines)
    if len(title_tokens) <= 2 and not (exact and (bool(code_matches) or exact_header)):
        return False, "Short/generic title requires a matching official-page course code or an exact heading near the start of the PDF", page_count, text[:1500], all_text_codes, overlap
    if not exact and (len(title_tokens) < 3 or overlap < 0.86):
        return False, f"Subject-title match too weak (token overlap {overlap:.2f}; exact={exact})", page_count, text[:1500], all_text_codes, overlap
    code_conflict = bool(expected_codes and all_text_codes and not code_matches)
    if code_conflict:
        return False, f"Course-code conflict: page evidence expects {', '.join(expected_codes)} but PDF declares {', '.join(all_text_codes[:8])}", page_count, text[:1500], all_text_codes, overlap
    low = ntext
    content_hits = [m for m in CONTENT_MARKERS if norm(m) in low]
    detail_hits = [m for m in DETAIL_MARKERS if norm(m) in low]
    if len(text.strip()) < 150:
        return False, "PDF has too little extractable text to verify (scanned/image-only files need manual review)", page_count, text[:1500], all_text_codes, overlap
    if not content_hits or not detail_hits:
        return False, "Subject title matched but the PDF lacks both syllabus content structure and course-detail markers (may be a brochure/index)", page_count, text[:1500], all_text_codes, overlap
    if cand.tier == 1:
        note = "Title and syllabus content verified in official Marwadi PDF"
    elif cand.tier == 2:
        note = "Title and syllabus content verified in official GTU comparable PDF; not a Marwadi syllabus"
    else:
        note = "Title and syllabus content verified in another official university PDF; comparable reference, not a Marwadi syllabus"
    if expected_codes:
        note += "; code match: " + (", ".join(code_matches) if code_matches else "page codes not visible in first 8 pages")
    return True, note, page_count, text[:1800], all_text_codes, overlap


def download_and_validate(target: dict, candidate: Candidate) -> dict:
    hosts = MARWADI_HOSTS if candidate.tier == 1 else GTU_HOSTS if candidate.tier == 2 else OTHER_OFFICIAL_HOSTS
    status, final, ctype, body, err = request_url(candidate.url, f"download_pdf_tier_{candidate.tier}", hosts, timeout=TIMEOUT)
    attempt = {
        "time_local": time.strftime("%Y-%m-%d %H:%M:%S"), "target_id": target["target_id"],
        "subject_title": target["subject_title"], "tier": candidate.tier, "institution": candidate.institution,
        "candidate_url": candidate.url, "final_url": final, "discovered_from": candidate.discovered_from,
        "context_course": candidate.context_course, "listing_text": candidate.listing_text,
        "http_status": status, "content_type": ctype, "response_bytes": len(body), "error": err,
        "validation": "NOT_TESTED", "validation_note": "", "page_count": "", "sha256": "",
        "expected_codes": " | ".join(candidate.expected_codes or []), "pdf_codes": "", "saved_pdf": "",
    }
    if status != 200 or not body:
        attempt["validation"] = "DOWNLOAD_FAILED"
        attempt["validation_note"] = "Direct PDF fetch failed or returned no body"
        with LOCK: PDF_VALIDATION_LOG.append({**attempt, "text_preview": ""})
        return {"accepted": False, "attempt": attempt, "retryable": (not status or status in (401, 403, 408, 425, 429) or (isinstance(status, int) and status >= 500))}
    valid, note, pages, snippet, pdf_codes, overlap = pdf_validate(body, target, candidate)
    attempt.update({"validation": "VERIFIED_MATCH" if valid else "REJECTED_NO_MATCH", "validation_note": note,
                    "page_count": pages, "sha256": hashlib.sha256(body).hexdigest(),
                    "pdf_codes": " | ".join(pdf_codes), "title_token_overlap": f"{overlap:.2f}"})
    with LOCK: PDF_VALIDATION_LOG.append({**attempt, "text_preview": snippet[:800]})
    return {"accepted": valid, "attempt": attempt, "retryable": False, "body": body, "pdf_codes": pdf_codes, "pages": pages, "note": note, "candidate": candidate}


def mark_selected_pdf_attempt(attempt: dict, saved_path: Path) -> None:
    relative = str(saved_path.relative_to(OUT_DIR)).replace("\\", "/")
    attempt["attempt"]["saved_pdf"] = relative
    target_id = attempt["attempt"].get("target_id")
    url = attempt["attempt"].get("candidate_url")
    with LOCK:
        for row in reversed(PDF_VALIDATION_LOG):
            if row.get("target_id") == target_id and row.get("candidate_url") == url and row.get("validation") == "VERIFIED_MATCH":
                row["saved_pdf"] = relative
                return
        PDF_VALIDATION_LOG.append({**attempt["attempt"], "text_preview": "selected candidate"})


def safe_filename(text: str, maxlen: int = 140) -> str:
    text = re.sub(r'[<>:"/\\|?*\x00-\x1f]', " ", str(text or ""))
    text = re.sub(r"\s+", " ", text).strip(" .")
    return (text or "Unknown subject")[:maxlen]


def get_candidates_for_target(target: dict, page_html_by_course: dict[str, tuple[str, str, int, str]]) -> tuple[list[Candidate], bool]:
    candidates = candidate_for_target_from_page_links(target, page_html_by_course)
    api, api_network = wp_media_candidates(target)
    candidates += api
    unique = {}
    for c in candidates:
        if c.url not in unique or c.score > unique[c.url].score:
            unique[c.url] = c
    candidates = sorted(unique.values(), key=lambda c: (-c.score, c.url))[:30]
    return candidates, api_network


def process_target(target: dict, page_html_by_course: dict[str, tuple[str, str, int, str]]) -> dict:
    result = {"target_id": target["target_id"], "subject_title": target["subject_title"],
              "normalized_title": target["title_key"], "occurrence_count": target["occurrence_count"],
              "course_count": target["course_count"], "courses": " | ".join(target["courses"]),
              "source_course_ids": " | ".join(target["source_course_ids"]), "semesters": " | ".join(map(str, target["semesters"])),
              "source_subject_ids": " | ".join(target["source_subject_ids"]),
              "expected_codes_by_course": json.dumps(target["expected_codes_by_course"], ensure_ascii=False),
              "expected_codes": " | ".join(target["all_expected_codes"]), "status": "", "selected_tier": "",
              "selected_institution": "", "selected_pdf_url": "", "selected_context_course": "",
              "local_pdf_path": "", "sha256": "", "page_count": "", "pdf_declared_codes": "",
              "validation_note": "", "candidate_attempts": 0, "network_issue_seen": "NO"}
    try:
        candidates, discovery_network = get_candidates_for_target(target, page_html_by_course)
        # A failed primary Marwadi programme-page request means the primary source tier was
        # not completely checked, even if the per-title WordPress search itself returned 200.
        page_network_issue = False
        for occurrence in target["occurrences"]:
            cid = occurrence["source_course_id"]
            if cid not in MARWADI_COURSE_PAGES:
                continue
            page_entry = page_html_by_course.get(cid)
            if not page_entry:
                page_network_issue = True
                continue
            page_status = page_entry[2]
            if not page_status or page_status in (401, 403, 408, 425, 429) or page_status >= 500:
                page_network_issue = True
        network_seen = bool(discovery_network or page_network_issue)
        result["candidate_attempts"] = len(candidates)
        # Try each Tier 1 candidate before attempting fallback. Do not use a similar name alone to pass.
        for cand in candidates:
            attempt = download_and_validate(target, cand)
            with LOCK: REQUEST_LOG.append({"time_local": time.strftime("%Y-%m-%d %H:%M:%S"), "action": "pdf_validation_summary",
                                           "url": cand.url, "final_url": attempt["attempt"].get("final_url", ""),
                                           "http_status": attempt["attempt"].get("http_status", ""), "content_type": attempt["attempt"].get("content_type", ""),
                                           "response_bytes": attempt["attempt"].get("response_bytes", 0), "error": attempt["attempt"].get("validation_note", attempt["attempt"].get("error", ""))})
            if attempt["retryable"]: network_seen = True
            if attempt["accepted"]:
                c = attempt["candidate"]
                subdir = PDF_DIR / f"Tier_{c.tier}"
                subdir.mkdir(parents=True, exist_ok=True)
                filename = f"{safe_filename(target['subject_title'])} [{target['target_id']}].pdf"
                path = subdir / filename
                path.write_bytes(attempt["body"])
                mark_selected_pdf_attempt(attempt, path)
                matched_course = c.context_course
                pdf_codes = set(attempt["pdf_codes"])
                if not matched_course and c.tier == 1 and pdf_codes:
                    for occurrence in target["occurrences"]:
                        expected_for_course = set(target["expected_codes_by_course"].get(occurrence["source_course_id"], []))
                        if expected_for_course & pdf_codes:
                            matched_course = occurrence["course_title"]
                            break
                result.update({"status": "VERIFIED_MARWADI" if c.tier == 1 else "VERIFIED_GTU_COMPARABLE" if c.tier == 2 else "VERIFIED_OTHER_OFFICIAL_COMPARABLE",
                               "selected_tier": c.tier, "selected_institution": c.institution, "selected_pdf_url": c.url,
                               "selected_context_course": matched_course, "local_pdf_path": str(path.relative_to(OUT_DIR)).replace("\\", "/"),
                               "sha256": attempt["attempt"]["sha256"], "page_count": attempt["pages"],
                               "pdf_declared_codes": " | ".join(attempt["pdf_codes"]), "validation_note": attempt["note"],
                               "network_issue_seen": "YES" if network_seen else "NO"})
                return result
        # Never silently downgrade from Marwadi to a fallback if a source access failure means
        # the primary tier was not fully checked. This avoids treating a network block as absence.
        if network_seen:
            result["status"] = "NETWORK_UNVERIFIED_RETRY"
            result["validation_note"] = "Marwadi source/API/PDF access encountered a retryable network/access error; GTU/other fallback was deferred until the primary tier can be checked."
            result["network_issue_seen"] = "YES"
            return result
        # If Tier 1 had no acceptable PDF, search GTU's official domain, then other official universities.
        for tier in (2, 3):
            fallback_candidates, failed_search = search_engine_candidates(target, tier)
            network_seen = network_seen or failed_search
            for cand in fallback_candidates:
                if is_direct_pdf_url(cand.url):
                    attempt = download_and_validate(target, cand)
                    if attempt["retryable"]: network_seen = True
                    if attempt["accepted"]:
                        c = attempt["candidate"]
                        subdir = PDF_DIR / f"Tier_{c.tier}"
                        subdir.mkdir(parents=True, exist_ok=True)
                        filename = f"{safe_filename(target['subject_title'])} [{target['target_id']}].pdf"
                        path = subdir / filename
                        path.write_bytes(attempt["body"])
                        mark_selected_pdf_attempt(attempt, path)
                        result.update({"status": "VERIFIED_GTU_COMPARABLE" if c.tier == 2 else "VERIFIED_OTHER_OFFICIAL_COMPARABLE",
                                       "selected_tier": c.tier, "selected_institution": c.institution, "selected_pdf_url": c.url,
                                       "selected_context_course": c.context_course, "local_pdf_path": str(path.relative_to(OUT_DIR)).replace("\\", "/"),
                                       "sha256": attempt["attempt"]["sha256"], "page_count": attempt["pages"],
                                       "pdf_declared_codes": " | ".join(attempt["pdf_codes"]), "validation_note": attempt["note"],
                                       "network_issue_seen": "YES" if network_seen else "NO"})
                        return result
                else:
                    # Opened listings can reveal direct official PDF links. Those are still validated normally.
                    host_set = GTU_HOSTS if tier == 2 else OTHER_OFFICIAL_HOSTS
                    st, fin, ct, body, err = request_url(cand.url, f"open_fallback_listing_tier_{tier}", host_set)
                    if st == 200 and body:
                        listed = extract_pdf_links(fin or cand.url, body.decode("utf-8", errors="replace"), tier, cand.institution, cand.context_course)
                        for nested in listed:
                            nested.expected_codes = []  # comparable institutions use different course-code systems
                            attempt = download_and_validate(target, nested)
                            if attempt["retryable"]: network_seen = True
                            if attempt["accepted"]:
                                c = attempt["candidate"]
                                subdir = PDF_DIR / f"Tier_{c.tier}"; subdir.mkdir(parents=True, exist_ok=True)
                                path = subdir / f"{safe_filename(target['subject_title'])} [{target['target_id']}].pdf"
                                path.write_bytes(attempt["body"])
                                mark_selected_pdf_attempt(attempt, path)
                                result.update({"status": "VERIFIED_GTU_COMPARABLE" if c.tier == 2 else "VERIFIED_OTHER_OFFICIAL_COMPARABLE",
                                               "selected_tier": c.tier, "selected_institution": c.institution, "selected_pdf_url": c.url,
                                               "selected_context_course": c.context_course, "local_pdf_path": str(path.relative_to(OUT_DIR)).replace("\\", "/"),
                                               "sha256": attempt["attempt"]["sha256"], "page_count": attempt["pages"],
                                               "pdf_declared_codes": " | ".join(attempt["pdf_codes"]), "validation_note": attempt["note"],
                                               "network_issue_seen": "YES" if network_seen else "NO"})
                                return result
        if network_seen:
            result["status"] = "NETWORK_UNVERIFIED_RETRY"
            result["validation_note"] = "Network/access failures prevented a complete source check; this is not proof the syllabus does not exist."
        else:
            result["status"] = "FAILED_NO_MATCHING_OFFICIAL_PDF"
            result["validation_note"] = "No course-title-matched syllabus PDF was found in the searched official sources. This is a search result, not proof of global non-existence."
        return result
    except Exception as e:
        result["status"] = "PROCESSING_ERROR_RETRY"
        result["validation_note"] = f"{type(e).__name__}: {e}"
        result["network_issue_seen"] = "YES"
        with LOCK: NETWORK_ERRORS.append({"time_local": time.strftime("%Y-%m-%d %H:%M:%S"), "action": "process_target", "url": "",
                                          "final_url": "", "http_status": "PROCESSING_ERROR", "content_type": "", "response_bytes": 0,
                                          "error": result["validation_note"], "subject_title": target["subject_title"]})
        return result


def write_csv(path: Path, rows: list[dict], headers: Optional[list[str]] = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if headers is None:
        headers = list(dict.fromkeys(k for row in rows for k in row.keys()))
    with path.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=headers, extrasaction="ignore")
        w.writeheader()
        for row in rows:
            w.writerow({k: row.get(k, "") for k in headers})


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def emit_outputs(meta: dict, occurrences: list[dict], targets: list[dict], duplicate_rows: list[dict], results: list[dict],
                 manifest_url: str, manifest_sha: str) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    # All candidate attempts are stored in PDF_VALIDATION_LOG; flatten only fields that are stable across tiers.
    validation_headers = ["time_local", "target_id", "subject_title", "tier", "institution", "candidate_url", "final_url", "discovered_from", "context_course", "listing_text", "http_status", "content_type", "response_bytes", "error", "validation", "validation_note", "page_count", "sha256", "expected_codes", "pdf_codes", "title_token_overlap", "saved_pdf", "text_preview"]
    write_csv(OUT_DIR / "pdf_validation_report.csv", PDF_VALIDATION_LOG, validation_headers)
    write_csv(OUT_DIR / "source_attempts.csv", REQUEST_LOG, ["time_local", "action", "url", "final_url", "http_status", "content_type", "response_bytes", "error"])
    write_csv(OUT_DIR / "network_failures.csv", NETWORK_ERRORS)
    # Unique title queue and one result per normalized subject title.
    write_csv(OUT_DIR / "unique_download_list.csv", results)
    result_by_id = {r["target_id"]: r for r in results}
    occurrence_report = []
    for t in targets:
        r = result_by_id.get(t["target_id"], {})
        downloaded_codes = {x.strip().upper() for x in str(r.get("pdf_declared_codes", "")).split("|") if x.strip()}
        for occ in t["occurrences"]:
            occurrence_codes = t["expected_codes_by_course"].get(occ["source_course_id"], [])
            if not r.get("status", "").startswith("VERIFIED_"):
                occ_status = r.get("status", "NOT_PROCESSED")
            elif occurrence_codes and downloaded_codes and not (set(occurrence_codes) & downloaded_codes):
                occ_status = "DUPLICATE_TITLE_PDF_DOES_NOT_MATCH_THIS_COURSE_CODE"
            elif t["occurrence_count"] > 1 and not (set(occurrence_codes) & downloaded_codes) and t["all_expected_codes"]:
                occ_status = "DUPLICATE_TITLE_PDF_MATCHED_A_VARIANT_REVIEW_THIS_COURSE"
            elif t["occurrence_count"] > 1 and not occurrence_codes:
                occ_status = "DUPLICATE_TITLE_SAME_PDF_CANDIDATE_REVIEW_PROGRAM_SCOPE"
            else:
                occ_status = r.get("status", "NOT_PROCESSED")
            occurrence_report.append({"source_course_id": occ["source_course_id"], "course_title": occ["course_title"],
                                      "source_subject_id": occ["source_subject_id"], "subject_title": occ["subject_title"],
                                      "semester": occ["semester"], "normalized_title": t["title_key"], "target_id": t["target_id"],
                                      "title_occurrence_count": t["occurrence_count"], "title_course_count": t["course_count"],
                                      "course_code_evidence": " | ".join(occurrence_codes), "unique_title_status": r.get("status", ""),
                                      "occurrence_review_status": occ_status, "selected_pdf_file": r.get("local_pdf_path", ""),
                                      "selected_source": r.get("selected_institution", ""), "selected_pdf_url": r.get("selected_pdf_url", ""),
                                      "sha256": r.get("sha256", ""), "note": r.get("validation_note", "")})
    write_csv(OUT_DIR / "subject_occurrence_report.csv", occurrence_report)
    dup_final = []
    for d in duplicate_rows:
        r = result_by_id.get(d["target_id"], {})
        duplicate_count = sum(1 for o in occurrence_report if o["target_id"] == d["target_id"] and o["occurrence_review_status"].startswith("DUPLICATE_TITLE_PDF_DOES_NOT_MATCH_THIS_COURSE_CODE"))
        target_row = next((t for t in targets if t["target_id"] == d["target_id"]), {})
        dup_final.append({**d, "course_code_evidence_by_course": json.dumps(target_row.get("expected_codes_by_course", {}), ensure_ascii=False),
                          "all_expected_course_codes": " | ".join(target_row.get("all_expected_codes", [])),
                          "selected_candidate_course": r.get("selected_context_course", ""), "selected_pdf_file": r.get("local_pdf_path", ""),
                          "selected_source": r.get("selected_institution", ""), "selected_pdf_url": r.get("selected_pdf_url", ""),
                          "pdf_declared_codes": r.get("pdf_declared_codes", ""), "final_status": r.get("status", ""),
                          "course_occurrences_not_code_verified": duplicate_count, "verification_note": r.get("validation_note", "")})
    write_csv(OUT_DIR / "duplicate_subject_titles.csv", dup_final)
    failed = [r for r in results if not str(r.get("status", "")).startswith("VERIFIED_")]
    write_csv(OUT_DIR / "failed_subjects.csv", failed)
    # Store the source manifest snapshot and normalized occurrence/target lists for auditable reruns.
    write_json(OUT_DIR / "source_manifest_metadata.json", {**meta, "fetched_url": manifest_url, "source_sha256": manifest_sha,
                                                            "unique_title_count": len(targets), "duplicate_title_group_count": len(duplicate_rows)})
    write_csv(OUT_DIR / "source_occurrences_snapshot.csv", occurrences)
    summary = collections_summary(results, occurrences, targets, duplicate_rows, NETWORK_ERRORS, PDF_VALIDATION_LOG, meta, manifest_url)
    (OUT_DIR / "RUN_SUMMARY.txt").write_text(summary, encoding="utf-8")
    # User needs actual PDFs and reports in the output ZIP, not just a runner.
    import zipfile
    output_zip = OUT_DIR / "Management_Studies_Syllabus_Collection_Output.zip"
    with zipfile.ZipFile(output_zip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=5) as z:
        for p in sorted(PDF_DIR.rglob("*.pdf")) if PDF_DIR.exists() else []:
            z.write(p, p.relative_to(OUT_DIR).as_posix())
        for p in sorted(OUT_DIR.iterdir()):
            if p.is_file() and p.name != output_zip.name and p.suffix.lower() in (".csv", ".txt", ".json"):
                z.write(p, p.relative_to(OUT_DIR).as_posix())
        # Include a tiny README so a moved output ZIP remains understandable.
        z.writestr("OUTPUT_README.txt", "Contains real PDFs downloaded and verified by title/content, plus full reports.\nNo database or GitHub writes were made.\nReview duplicate_subject_titles.csv and subject_occurrence_report.csv before deciding which database rows to keep/remove.\n")
    log("Output ZIP created: " + str(output_zip))


def collections_summary(results, occurrences, targets, duplicate_rows, network_errors, validation_rows, meta, manifest_url):
    from collections import Counter
    status_counts = Counter(r.get("status", "") for r in results)
    pdf_count = sum(1 for p in PDF_DIR.rglob("*.pdf")) if PDF_DIR.exists() else 0
    lines = [
        "PREPMASTER MANAGEMENT STUDIES SYLLABUS RECOVERY SUMMARY",
        "=" * 62,
        f"Run date: {time.strftime('%Y-%m-%d %H:%M:%S')}",
        f"Manifest domain: {meta.get('domain_title', 'Management Studies')}",
        f"Manifest URL: {manifest_url}",
        f"Manifest source SHA-256: {meta.get('source_sha256', '')}",
        f"Courses in manifest: {meta.get('course_count', 0)}",
        f"Catalog subject occurrences: {len(occurrences)}",
        f"Unique normalized subject titles: {len(targets)}",
        f"Duplicate-title groups: {len(duplicate_rows)}",
        f"Unique PDFs actually saved: {pdf_count}",
        f"Candidate/PDF validation records: {len(validation_rows)}",
        f"Network/access errors recorded: {len(network_errors)}",
        "",
        "RESULTS BY UNIQUE TITLE",
    ]
    for status, count in sorted(status_counts.items()): lines.append(f"  {status}: {count}")
    lines += ["", "SOURCE PRIORITY", "1. Official Marwadi University source", "2. Official Gujarat Technological University PDF (comparable; not a Marwadi syllabus)",
              "3. Other configured official Indian university PDF (comparable reference; not a Marwadi syllabus)", "",
              "DUPLICATE RULE", "Each normalized subject title gets one download queue entry. All course, subject-ID, and semester occurrences are retained in the reports.",
              "A title match does not automatically prove that one course's syllabus applies to every course with the same title. Use course-code/coverage warnings in duplicate_subject_titles.csv and subject_occurrence_report.csv.", "",
              "REPORT GUIDE", "- unique_download_list.csv: one row per unique title with selected PDF/source/status.",
              "- duplicate_subject_titles.csv: same-name subjects, all courses/semesters/IDs, and selected candidate.",
              "- subject_occurrence_report.csv: each catalog occurrence mapped to the one unique-title result; course-specific code mismatches are flagged. source_course_id/source_subject_id come from mockData.js, not live Supabase numeric IDs.",
              "- failed_subjects.csv: unresolved unique titles and their failure/network status.",
              "- pdf_validation_report.csv: real PDF structure, extracted text, course title/code match and rejection notes.",
              "- source_attempts.csv: HTTP/source discovery logs; network_failures.csv contains retryable connectivity/access failures.", "",
              "IMPORTANT", "FAILED_NO_MATCHING_OFFICIAL_PDF means no acceptable file was found in this run, not proof a PDF does not exist anywhere.",
              "NETWORK_UNVERIFIED_RETRY and PROCESSING_ERROR_RETRY must not be treated as subjects confirmed missing.",
              "This runner makes no Supabase/database, GitHub, source catalog, or production website changes.",
              "Only import/remove subject rows after reviewing results and matching each occurrence to its actual live database SubjectId/CourseId."]
    return "\n".join(lines) + "\n"


def self_test() -> int:
    fixture = '''export const domains = [{"id":"management","title":"Management Studies","courses":[{"id":"bba","title":"BBA","subjects":[{"id":"1","title":"Marketing Management","sem":3},{"id":"2","title":"Financial Accounting","sem":1}]},{"id":"mba","title":"MBA","subjects":[{"id":"3","title":"Marketing Management","sem":2}],"scenarios":[{"id":"x","title":"SHOULD NOT BE INCLUDED","sem":1}]}]}];\nexport const examTemplates = {};'''
    occ, meta = decode_domain_manifest(fixture)
    assert len(occ) == 3, f"Expected 3 catalog occurrences, got {len(occ)}"
    assert all(o["subject_title"] != "SHOULD NOT BE INCLUDED" for o in occ), "Scenario rows must not enter catalog recovery"
    targets, dups = build_unique_targets(occ)
    assert len(targets) == 2, f"Expected 2 unique title downloads, got {len(targets)}"
    assert len(dups) == 1 and dups[0]["occurrence_count"] == 2, "Duplicate titles were not grouped"
    assert host_allowed("https://www.marwadiuniversity.ac.in/wp-content/test.pdf", MARWADI_HOSTS), "Official source host should be allowed"
    assert not host_allowed("http://www.marwadiuniversity.ac.in/wp-content/test.pdf", MARWADI_HOSTS), "HTTP source should be rejected"
    assert not host_allowed("https://marwadiuniversity.ac.in.evil.example/test.pdf", MARWADI_HOSTS), "Host suffix spoof should be rejected"
    # Generate a tiny local PDF and verify that matching checks accept only the real target title.
    doc = fitz.open(); page = doc.new_page(); page.insert_text((72,72), "Marketing Management\nCourse Outcomes\nCourse Contents\nUnit 1 - Basics of marketing and management principles\nUnit 2 - market research, business strategy, consumer decisions, segmentation, pricing, communications, distribution and applications of marketing management in business organizations.")
    pdf = doc.tobytes() + b"\n" + (b" " * 1500); doc.close()
    t = next(t for t in targets if t["subject_title"] == "Marketing Management")
    c = Candidate("https://www.marwadiuniversity.ac.in/wp-content/uploads/test.pdf",1,"Marwadi University","Marketing Management",expected_codes=[])
    ok, note, pages, _, _, _ = pdf_validate(pdf, t, c)
    assert ok and pages == 1, f"Valid fixture PDF rejected: {note}"
    fake = dict(t); fake["subject_title"] = "Accounting in International Markets"
    ok, _, _, _, _, _ = pdf_validate(pdf, fake, c)
    assert not ok, "Unrelated subject incorrectly passed PDF validation"
    print("SELF-TEST PASSED: manifest parser, subjects-vs-scenarios, title deduplication, PDF validation, and mismatch rejection.")
    return 0


def preflight() -> int:
    print("Management Studies Recovery - preflight")
    if sys.version_info < (3, 10):
        print("ERROR: Python 3.10 or newer is required."); return 2
    for name, module in [("requests", requests), ("BeautifulSoup", BeautifulSoup), ("PyMuPDF", fitz)]:
        print(f"OK: {name} loaded")
    try:
        self_test()
    except Exception:
        traceback.print_exc(); return 3
    print("Preflight passed. The full recovery is not started by this command.")
    return 0


def archive_previous_output() -> None:
    """Move prior output aside so old PDFs/reports cannot be mistaken for this run's results."""
    if OUT_DIR.exists() and any(OUT_DIR.iterdir()):
        stamp = time.strftime("%Y%m%d_%H%M%S")
        archived = ROOT / f"Output_previous_{stamp}"
        suffix = 1
        while archived.exists():
            archived = ROOT / f"Output_previous_{stamp}_{suffix}"
            suffix += 1
        OUT_DIR.rename(archived)
        print(f"Previous Output archived at: {archived}", flush=True)


def main() -> int:
    global WORKERS
    parser = argparse.ArgumentParser(description="Collect and validate Management Studies syllabus PDFs without changing DB/GitHub.")
    parser.add_argument("--self-test", action="store_true", help="Offline test of parser, title deduplication, and PDF validation")
    parser.add_argument("--preflight-only", action="store_true", help="Run offline preflight tests and exit")
    parser.add_argument("--workers", type=int, default=WORKERS, help="Concurrent subject workers, default 5")
    args = parser.parse_args()
    if args.self_test or args.preflight_only:
        return preflight()
    if args.workers < 1 or args.workers > 12:
        print("ERROR: --workers must be between 1 and 12."); return 2
    WORKERS = args.workers
    archive_previous_output()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / "run_log.txt").write_text("", encoding="utf-8")
    log("Starting Management Studies syllabus recovery. No database/GitHub writes will be performed.")
    try:
        log("Fetching PrepMaster's current Management Studies catalog manifest from GitHub...")
        source_text, manifest_url = fetch_manifest()
        occurrences, meta = decode_domain_manifest(source_text)
        targets, duplicates = build_unique_targets(occurrences)
        log(f"Loaded {len(occurrences)} catalog occurrences, {len(targets)} unique subject titles, {len(duplicates)} duplicate-title groups across {meta['course_count']} courses.")
        write_csv(OUT_DIR / "source_occurrences_snapshot.csv", occurrences)
        write_csv(OUT_DIR / "unique_download_list_initial.csv", [{k:v for k,v in t.items() if k != "occurrences"} for t in targets])
        write_csv(OUT_DIR / "duplicate_subject_titles_initial.csv", duplicates)
        course_ids = {o["source_course_id"] for o in occurrences}
        log("Fetching official Marwadi Management Studies program pages...")
        page_html = marwadi_page_preload(course_ids)
        scan_page_code_evidence(targets, page_html)
        # Recalculate target code evidence in initial manifest after page preloading.
        write_csv(OUT_DIR / "unique_download_list_initial.csv", [{k:v for k,v in t.items() if k != "occurrences"} for t in targets])
        log("Searching once per unique title; same-name subjects will not be independently downloaded multiple times.")
        results = []
        with ThreadPoolExecutor(max_workers=WORKERS) as pool:
            futures = {pool.submit(process_target, t, page_html): t for t in targets}
            done = 0
            for future in as_completed(futures):
                t = futures[future]; done += 1
                try: res = future.result()
                except Exception as e:
                    res = {"target_id":t["target_id"], "subject_title":t["subject_title"], "status":"PROCESSING_ERROR_RETRY",
                           "validation_note":f"{type(e).__name__}: {e}", "network_issue_seen":"YES"}
                results.append(res)
                log(f"[{done}/{len(targets)}] {res.get('subject_title','')} — {res.get('status','UNKNOWN')}")
        results.sort(key=lambda r: norm(r.get("subject_title", "")))
        emit_outputs(meta, occurrences, targets, duplicates, results, manifest_url, meta["source_sha256"])
        log("Recovery completed. Open Output/RUN_SUMMARY.txt and review the CSV reports.")
        return 0
    except Exception as e:
        log(f"FATAL ERROR: {type(e).__name__}: {e}")
        with (OUT_DIR / "fatal_error.txt").open("a", encoding="utf-8") as f:
            f.write(f"\n[{time.strftime('%Y-%m-%d %H:%M:%S')}] {type(e).__name__}: {e}\n{traceback.format_exc()}\n")
        traceback.print_exc()
        log("No DB/GitHub writes were performed. Read Output/fatal_error.txt and run RUN_MANAGEMENT_RECOVERY.bat again after correcting the reported problem.")
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
