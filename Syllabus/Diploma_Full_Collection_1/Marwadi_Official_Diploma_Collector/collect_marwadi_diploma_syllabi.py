#!/usr/bin/env python3
"""Collect Diploma syllabus PDFs directly from Marwadi University's public website.

Source of truth: the six official Marwadi Diploma course pages and Marwadi's own
WordPress media API. This tool does not read Supabase, GitHub, or a prior manifest.
It never labels a network error as a missing syllabus.
"""
from __future__ import annotations
import csv, hashlib, html, json, re, shutil, sys, time, zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse, urlencode

import requests
from bs4 import BeautifulSoup, NavigableString, Tag
import fitz

BASE = "https://www.marwadiuniversity.ac.in"
REST = BASE + "/wp-json/wp/v2/media"
COURSES = {
    "Diploma Computer Engineering": "https://www.marwadiuniversity.ac.in/computer-engineering-diploma/",
    "Diploma Mechanical Engineering": "https://www.marwadiuniversity.ac.in/mechanical-engineering-diploma/",
    "Diploma Chemical Engineering": "https://www.marwadiuniversity.ac.in/chemical-engineering-diploma/",
    "Diploma Electrical Engineering": "https://www.marwadiuniversity.ac.in/electrical-engineering-diploma/",
    "Diploma Civil Engineering": "https://www.marwadiuniversity.ac.in/civil-engineering-diploma/",
    "Diploma Information and Communication Technology": "https://www.marwadiuniversity.ac.in/ict-diploma/",
}
ROOT = Path(__file__).resolve().parent
OUT = ROOT / "Marwadi_Diploma_Syllabus_Collection"
ZIP_OUT = ROOT / "Marwadi_Diploma_Complete_Syllabus_Collection.zip"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36"
CODE_RE = re.compile(r"(?i)\b((?:0?9[A-Z]{2}\d{3,5}|O9[A-Z]{2}\d{3,5}|PM\d{4,6}))\b")
PAIR_RE = re.compile(r"([^()\r\n]{2,120}?)\s*\(\s*((?:0?9[A-Z]{2}\d{3,5}|O9[A-Z]{2}\d{3,5}|PM\d{4,6}))\s*\)", re.I)
PDF_EXT_RE = re.compile(r"\.pdf(?:$|[?#])", re.I)
RETRIES = 5

session = requests.Session()
session.headers.update({"User-Agent": USER_AGENT, "Accept": "text/html,application/json,application/pdf,*/*"})


def log(msg: str) -> None:
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def is_official(url: str) -> bool:
    try:
        host = urlparse(url).hostname or ""
        return host == "marwadiuniversity.ac.in" or host.endswith(".marwadiuniversity.ac.in")
    except Exception:
        return False


def get(url: str, params=None) -> requests.Response:
    if not is_official(url):
        raise ValueError(f"Refusing non-Marwadi host: {url}")
    last = None
    for attempt in range(RETRIES):
        try:
            r = session.get(url, params=params, timeout=(15, 45), allow_redirects=True)
            if r.status_code == 429 or 500 <= r.status_code < 600:
                wait = min(3 * (2 ** attempt), 30)
                retry_after = r.headers.get("Retry-After", "")
                if retry_after.isdigit():
                    wait = min(max(wait, int(retry_after)), 45)
                last = RuntimeError(f"HTTP {r.status_code}; retrying in {wait}s")
                if attempt < RETRIES - 1:
                    log(f"Transient HTTP {r.status_code} for {r.url}; retry {attempt + 1}/{RETRIES - 1} in {wait}s")
                    time.sleep(wait)
                    continue
                raise last
            r.raise_for_status()
            return r
        except (requests.Timeout, requests.ConnectionError) as e:
            last = e
            if attempt == RETRIES - 1:
                raise
            wait = min(2 * (2 ** attempt), 20)
            log(f"Network error for {url}; retry {attempt + 1}/{RETRIES - 1} in {wait}s")
            time.sleep(wait)
    raise RuntimeError(str(last or "request failed"))


def norm_code(s: str) -> str:
    out = re.sub(r"[^A-Z0-9]", "", str(s or "").upper())
    if out.startswith("O9"):
        out = "09" + out[2:]
    return out


def title_norm(s: str) -> str:
    s = html.unescape(str(s or "")).lower().replace("c++", " cplusplus ").replace(".net", " dotnet ")
    s = s.replace("database", "data base").replace("iot", "internet of things")
    s = re.sub(r"[^a-z0-9]+", " ", s)
    stop = {"the", "and", "of", "for", "with", "in", "a", "an", "course", "diploma", "syllabus"}
    return " ".join(w for w in s.split() if w not in stop)


def title_score(target: str, content: str) -> float:
    a, b = set(title_norm(target).split()), set(title_norm(content).split())
    if not a or not b:
        return 0.0
    return len(a & b) / len(a)


def safe_name(s: str, limit=120) -> str:
    s = html.unescape(str(s or "Unknown")).replace("\u00a0", " ")
    s = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", s)
    s = re.sub(r"\s+", " ", s).strip(" ._-\t")
    return (s or "Unknown")[:limit]


def code_title_from_label(label: str):
    label = " ".join(html.unescape(label or "").split())
    m = CODE_RE.search(label)
    if not m:
        return None
    title = label[:m.start()].strip(" -:|\t\r\n")
    title = re.sub(r"(?i)^(theory component|skill component|audit component)\s+", "", title).strip()
    if not title or title_norm(title) in {"sem", "semester", "course outline"}:
        return None
    return {"subject_code": norm_code(m.group(1)), "subject_title": title}


def sem_for_tag(tag: Tag | None) -> tuple[str, str]:
    cur = tag
    for depth in range(12):
        if not isinstance(cur, Tag):
            break
        attrs = cur.attrs or {}
        # Elementor / tab widgets normally encode the tab number in one of these.
        for val in [attrs.get("data-tab"), attrs.get("data-tab-index")]:
            if val is not None and str(val).isdigit() and 1 <= int(val) <= 6:
                return f"Semester_{int(val):02d}", "DOM data-tab"
        ident = " ".join([str(attrs.get("id", "")), " ".join(attrs.get("class", [])) if isinstance(attrs.get("class"), list) else str(attrs.get("class", ""))])
        m = re.search(r"(?:tab-content|tab-title|elementor-tab-content|elementor-tab-title)[^\d]*(?:\d+[-_])?(\d+)\s*$", ident, re.I)
        if m and 1 <= int(m.group(1)) <= 6 and ("tab" in ident.lower()):
            return f"Semester_{int(m.group(1)):02d}", "DOM tab id/class"
        # Some theme layouts mark the active semester in an ancestor heading.
        txt = cur.get_text(" ", strip=True)[:250]
        sm = re.search(r"(?i)\bSEM(?:ESTER)?\s*[-:]?\s*([1-6])\b", txt)
        if sm and len(txt) < 120:
            return f"Semester_{int(sm.group(1)):02d}", "nearby semester heading"
        cur = cur.parent if isinstance(cur.parent, Tag) else None
    return "Semester_Unspecified", "semester not encoded unambiguously in page DOM"


def parse_course_page(course_name: str, page_url: str, page_html: str):
    soup = BeautifulSoup(page_html, "html.parser")
    targets: dict[tuple[str, str, str], dict] = {}
    direct_links: list[dict] = []
    anchor_codes: set[tuple[str, str]] = set()

    # Use anchor labels first because they retain the university's course-code/title link.
    for a in soup.find_all("a", href=True):
        label = " ".join(a.get_text(" ", strip=True).split())
        parsed = code_title_from_label(label)
        href = urljoin(page_url, html.unescape(a.get("href", "").strip()))
        if parsed:
            sem, sem_source = sem_for_tag(a)
            key = (parsed["subject_code"], title_norm(parsed["subject_title"]), sem)
            row = targets.setdefault(key, {
                "course_name": course_name, "course_page": page_url,
                **parsed, "semester_folder": sem, "semester_detection": sem_source,
                "direct_url": "", "page_label": label, "target_source": "official course page",
            })
            # prefer a definite semester over an ambiguous duplicate occurrence
            if row["semester_folder"] == "Semester_Unspecified" and sem != "Semester_Unspecified":
                row["semester_folder"], row["semester_detection"] = sem, sem_source
            if is_official(href):
                anchor_codes.add(key)
                if PDF_EXT_RE.search(urlparse(href).path) or "application/pdf" in str(a.get("type", "")).lower():
                    if not row["direct_url"]:
                        row["direct_url"] = href
                    direct_links.append({"course_name": course_name, "course_page": page_url, "label": label, "url": href, "code": parsed["subject_code"], "title": parsed["subject_title"], "semester_folder": sem, "link_type": "subject-code anchor"})
        elif is_official(href) and PDF_EXT_RE.search(urlparse(href).path):
            # Do not treat the program brochure as a syllabus.
            if "brochure" not in label.lower():
                sem, _ = sem_for_tag(a)
                direct_links.append({"course_name": course_name, "course_page": page_url, "label": label or "PDF link without visible label", "url": href, "code": "", "title": label or "Unlabelled PDF", "semester_folder": sem, "link_type": "direct PDF link; subject association not explicit"})

    # Discover curriculum pairs rendered as text, even if the page has no clickable PDF link.
    full_text = soup.get_text(" ", strip=True)
    for match in PAIR_RE.finditer(full_text):
        title = re.sub(r"\s+", " ", match.group(1)).strip(" -:|\t")
        code = norm_code(match.group(2))
        if len(title_norm(title).split()) == 0:
            continue
        tag = None
        st = soup.find(string=re.compile(re.escape(match.group(2)), re.I))
        if st and isinstance(st, NavigableString) and isinstance(st.parent, Tag):
            tag = st.parent
        sem, sem_source = sem_for_tag(tag)
        key = (code, title_norm(title), sem)
        if key not in targets:
            # Preserve the page occurrence and its semester when the DOM exposes it.
            targets[key] = {"course_name": course_name, "course_page": page_url, "subject_code": code, "subject_title": title,
                            "semester_folder": sem, "semester_detection": sem_source, "direct_url": "", "page_label": match.group(0), "target_source": "official course page text"}
        else:
            # If an anchor had a code, also make sure label data remains attached.
            targets[key]["subject_title"] = targets[key].get("subject_title") or title
    return list(targets.values()), direct_links, soup


def media_candidates(query: str) -> list[dict]:
    r = get(REST, params={"search": query, "per_page": 100, "_fields": "source_url,title,slug,mime_type,date,link"})
    if not isinstance(r.json(), list):
        return []
    found = []
    for item in r.json():
        url = str(item.get("source_url") or "")
        if not url or not is_official(url):
            continue
        mime = str(item.get("mime_type") or "").lower()
        if mime == "application/pdf" or PDF_EXT_RE.search(urlparse(url).path):
            title_obj = item.get("title") or {}
            label = title_obj.get("rendered", "") if isinstance(title_obj, dict) else str(title_obj)
            found.append({"url": url, "label": label or item.get("slug", ""), "method": f"Marwadi WordPress media API search: {query}"})
    return found


def pdf_facts(data: bytes, code: str, title: str) -> dict:
    if not data.startswith(b"%PDF-"):
        return {"pdf_valid": False, "pages": 0, "code_match": False, "title_score": 0.0, "text_excerpt": "Not a PDF response"}
    try:
        doc = fitz.open(stream=data, filetype="pdf")
        texts = []
        for page in doc:
            texts.append(page.get_text("text"))
        all_text = "\n".join(texts)
        compact = re.sub(r"[^A-Z0-9]", "", all_text.upper())
        code_match = bool(code and norm_code(code) in compact)
        sim = title_score(title, all_text[:30000])
        return {"pdf_valid": True, "pages": len(doc), "code_match": code_match, "title_score": round(sim, 3), "text_excerpt": re.sub(r"\s+", " ", all_text[:450])}
    except Exception as e:
        return {"pdf_valid": False, "pages": 0, "code_match": False, "title_score": 0.0, "text_excerpt": f"PDF parse error: {e}"}


def csv_write(path: Path, rows: list[dict], fields=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not fields:
        fields = list(dict.fromkeys(k for row in rows for k in row.keys()))
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for row in rows:
            w.writerow({k: row.get(k, "") for k in fields})


def run_self_test() -> bool:
    assert code_title_from_label("Basics of Web Designing (09CE3102)")["subject_code"] == "09CE3102"
    assert title_score("Database Management System", "Database Management System (09CE2302)") >= .99
    fixture = '''<html><body><div data-tab="1" id="elementor-tab-content-100-1"><a href="https://www.marwadiuniversity.ac.in/wp-content/uploads/2026/05/09CE3102_BWD.pdf">Basics of Web Designing (09CE3102)</a></div></body></html>'''
    targets, links, _ = parse_course_page("Diploma Computer Engineering", COURSES["Diploma Computer Engineering"], fixture)
    assert len(targets) == 1 and targets[0]["semester_folder"] == "Semester_01" and len(links) == 1
    assert is_official("https://www.marwadiuniversity.ac.in/wp-content/uploads/example.pdf")
    assert not is_official("https://example.org/other.pdf")
    # Generate an in-memory PDF to check actual text/code validator without network access.
    doc = fitz.open()
    p = doc.new_page()
    p.insert_text((72, 72), "Marwadi University\nSyllabus for Diploma\nComputer Network Skills\nCourse Code: 09CE2105")
    data = doc.tobytes()
    doc.close()
    facts = pdf_facts(data, "09CE2105", "Computer Network Skills")
    assert facts["pdf_valid"] and facts["code_match"] and facts["title_score"] >= .9
    print("SELF-TEST PASSED: official URL guard, course-code/title parsing, PDF validation, code matching.")
    return True


def main():
    if "--self-test" in sys.argv:
        run_self_test()
        return 0
    if OUT.exists():
        # Never mix old run results with the new, official-page-based collection.
        shutil.rmtree(OUT)
    if ZIP_OUT.exists():
        ZIP_OUT.unlink()
    (OUT / "Reports").mkdir(parents=True, exist_ok=True)
    for sub in ["Verified_Syllabi", "Needs_Review", "Other_Official_Page_PDFs"]:
        (OUT / sub).mkdir(parents=True, exist_ok=True)

    all_targets, all_direct = [], []
    page_status, parse_errors = [], []
    for course, url in COURSES.items():
        log(f"Fetching official course page: {course}")
        try:
            r = get(url)
            targets, direct, soup = parse_course_page(course, url, r.text)
            all_targets.extend(targets)
            all_direct.extend(direct)
            page_status.append({"course_name": course, "course_page": url, "http_status": r.status_code, "page_title": soup.title.get_text(strip=True) if soup.title else "", "subjects_discovered": len(targets), "direct_pdf_links_discovered": len(direct), "result": "PAGE_FETCHED"})
            log(f"  Found {len(targets)} subject/code entries and {len(direct)} direct PDF links")
        except Exception as e:
            parse_errors.append({"course_name": course, "course_page": url, "error": repr(e)})
            page_status.append({"course_name": course, "course_page": url, "http_status": "", "subjects_discovered": 0, "direct_pdf_links_discovered": 0, "result": "PAGE_FETCH_FAILED", "error": repr(e)})
            log(f"  ERROR fetching page: {e}")

    if not all_targets:
        log("No syllabus targets were discovered. Output will contain a failure report, not claim completion.")

    # Map direct links to a unique target by course + code; title is the fallback.
    target_by_key = {(t["course_name"], t["subject_code"], title_norm(t["subject_title"])): t for t in all_targets}
    by_course_code = defaultdict(list)
    for t in all_targets:
        by_course_code[(t["course_name"], t["subject_code"])].append(t)
    for link in all_direct:
        if link.get("code"):
            opts = by_course_code.get((link["course_name"], link["code"]), [])
            if opts:
                # Preserve each distinct subject PDF URL in its associated target.
                for opt in opts:
                    opt.setdefault("direct_urls", []).append(link["url"])

    downloaded_cache: dict[str, dict] = {}
    report_downloads, target_results = [], []
    direct_download_results = []

    def download_pdf(url: str) -> dict:
        if url in downloaded_cache:
            return downloaded_cache[url]
        try:
            r = get(url)
            data = r.content
            facts0 = pdf_facts(data, "", "")
            if not facts0["pdf_valid"]:
                result = {"ok": False, "url": url, "error": f"Response was not a readable PDF (HTTP {r.status_code}; content-type={r.headers.get('content-type','')})", "data": b"", "sha256": ""}
            else:
                result = {"ok": True, "url": r.url, "error": "", "data": data, "sha256": hashlib.sha256(data).hexdigest(), "pages": facts0["pages"], "http_status": r.status_code}
        except Exception as e:
            result = {"ok": False, "url": url, "error": repr(e), "data": b"", "sha256": ""}
        downloaded_cache[url] = result
        return result

    # Process direct links for each target first. Only missing/broken direct PDFs invoke media search.
    for idx, t in enumerate(all_targets, 1):
        course = t["course_name"]
        code = t["subject_code"]
        title = t["subject_title"]
        urls = list(dict.fromkeys([u for u in ([t.get("direct_url", "")] + t.get("direct_urls", [])) if u]))
        methods = {u: "direct syllabus link on official course page" for u in urls}
        candidates = []
        for u in urls:
            candidates.append({"url": u, "label": t.get("page_label", ""), "method": methods[u]})
        # If there is no link or direct link did not validate, search Marwadi's own media index.
        def evaluate_candidates(cands):
            best_review = None
            for c in cands:
                d = download_pdf(c["url"])
                if not d["ok"]:
                    continue
                facts = pdf_facts(d["data"], code, title)
                if not facts["pdf_valid"]:
                    continue
                if facts["code_match"] and facts["title_score"] >= .50:
                    return (c, d, facts), best_review
                # Preserve likely title candidates for a human review instead of discarding them.
                if facts["title_score"] >= .45 and (best_review is None or facts["title_score"] > best_review[2]["title_score"]):
                    best_review = (c, d, facts)
            return None, best_review
        picked, best_review = evaluate_candidates(candidates)
        api_errors = []
        if not picked:
            for query in [code, title]:
                try:
                    extra = media_candidates(query)
                    have = {c["url"] for c in candidates}
                    for c in extra:
                        if c["url"] not in have:
                            candidates.append(c); have.add(c["url"])
                    exact_candidate, review_candidate = evaluate_candidates(extra)
                    if review_candidate and (best_review is None or review_candidate[2]["title_score"] > best_review[2]["title_score"]):
                        best_review = review_candidate
                    if exact_candidate:
                        picked = exact_candidate
                        break
                except Exception as e:
                    api_errors.append(f"{query}: {e!r}")
                time.sleep(.2)
        if not picked and best_review:
            picked = best_review
        if picked:
            c, d, facts = picked
            exact = facts["code_match"] and facts["title_score"] >= .50
            status = "VERIFIED_CODE_AND_TITLE" if exact else "REVIEW_TITLE_OR_CODE_MISMATCH"
            out_subdir = "Verified_Syllabi" if exact else "Needs_Review"
            course_dir = safe_name(course)
            sem = t.get("semester_folder") or "Semester_Unspecified"
            fname = safe_name(f"{code} - {title}") + ".pdf"
            target_path = OUT / out_subdir / course_dir / sem / fname
            target_path.parent.mkdir(parents=True, exist_ok=True)
            target_path.write_bytes(d["data"])
            t_result = {**t, "status": status, "source_url": d["url"], "source_method": c.get("method", ""), "local_path": str(target_path.relative_to(OUT)), "sha256": d["sha256"], "pages": facts["pages"], "code_match": facts["code_match"], "title_score": facts["title_score"], "pdf_excerpt": facts["text_excerpt"], "error": ""}
        else:
            # Preserve link candidates' network and validation status, but do not falsely call unavailable.
            had_network_error = any("ConnectionError" in str(d.get("error")) or "Timeout" in str(d.get("error")) or "HTTP 429" in str(d.get("error")) or "HTTP 5" in str(d.get("error")) for c in candidates for d in [downloaded_cache.get(c["url"], {})]) or bool(api_errors)
            status = "NETWORK_UNVERIFIED" if had_network_error else ("NO_VALIDATED_PDF_FOUND_ON_OFFICIAL_PAGE_OR_MEDIA_INDEX" if not candidates else "PDF_CANDIDATE_FAILED_VALIDATION")
            t_result = {**t, "status": status, "source_url": ";".join(c["url"] for c in candidates), "source_method": ";".join(c.get("method", "") for c in candidates), "local_path": "", "sha256": "", "pages": "", "code_match": False, "title_score": "", "pdf_excerpt": "", "error": " | ".join(api_errors) or "No matching/valid PDF was confirmed from the current official page and Marwadi media search."}
        target_results.append(t_result)
        report_downloads.append({"course_name": course, "semester_folder": t.get("semester_folder"), "subject_code": code, "subject_title": title, "status": t_result["status"], "source_url": t_result["source_url"], "source_method": t_result["source_method"], "local_path": t_result["local_path"], "sha256": t_result["sha256"], "pages": t_result["pages"], "code_match": t_result["code_match"], "title_score": t_result["title_score"], "error": t_result["error"]})
        if idx % 20 == 0 or idx == len(all_targets):
            log(f"Processed {idx}/{len(all_targets)} page-listed subject entries")

    # Download every other direct PDF link found on the official course pages so it is not lost.
    mapped_urls = {u for t in all_targets for u in ([t.get("direct_url", "")] + t.get("direct_urls", [])) if u}
    seen_direct = set()
    for item in all_direct:
        url = item["url"]
        key = (item["course_name"], url)
        if key in seen_direct:
            continue
        seen_direct.add(key)
        d = download_pdf(url)
        if not d.get("ok"):
            direct_download_results.append({**item, "status": "NETWORK_OR_INVALID_PDF", "local_path": "", "sha256": "", "error": d.get("error", "download failed")})
            continue
        # Don't duplicate PDFs already placed via a verified/needs-review target.
        already = any(x.get("source_url") == d["url"] and x.get("local_path") for x in target_results)
        if already:
            direct_download_results.append({**item, "status": "ASSOCIATED_WITH_SUBJECT_RECORD", "local_path": "", "sha256": d["sha256"], "error": "PDF is already in a subject folder."})
            continue
        label = item.get("label") or "Unlabelled official PDF"
        folder = OUT / "Other_Official_Page_PDFs" / safe_name(item["course_name"]) / (item.get("semester_folder") or "Semester_Unspecified")
        dest = folder / (safe_name(label) + ".pdf")
        # Include a hash prefix to avoid files with identical labels overwriting one another.
        dest = folder / (safe_name(label) + "__" + d["sha256"][:8] + ".pdf")
        folder.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(d["data"])
        direct_download_results.append({**item, "status": "OFFICIAL_PAGE_PDF_SAVED_UNASSIGNED", "local_path": str(dest.relative_to(OUT)), "sha256": d["sha256"], "error": "Directly published from official course page; subject association was not explicit in its link label."})

    # Remove transient binary data from report objects, produce source audit + summary.
    csv_write(OUT / "Reports" / "course_pages.csv", page_status)
    csv_write(OUT / "Reports" / "subject_inventory_from_marwadi_pages.csv", target_results)
    csv_write(OUT / "Reports" / "pdf_download_manifest.csv", report_downloads)
    csv_write(OUT / "Reports" / "direct_page_pdf_links.csv", direct_download_results)
    csv_write(OUT / "Reports" / "page_discovery_direct_links.csv", all_direct)
    csv_write(OUT / "Reports" / "course_page_errors.csv", parse_errors)

    statuses = defaultdict(int)
    for row in target_results:
        statuses[row["status"]] += 1
    direct_files = sum(1 for row in direct_download_results if row.get("local_path"))
    pdf_files = sum(1 for p in OUT.rglob("*.pdf"))
    exact = statuses.get("VERIFIED_CODE_AND_TITLE", 0)
    review = sum(v for k,v in statuses.items() if k.startswith("REVIEW") or k.startswith("PDF_CANDIDATE"))
    missing = statuses.get("NO_VALIDATED_PDF_FOUND_ON_OFFICIAL_PAGE_OR_MEDIA_INDEX", 0)
    network = statuses.get("NETWORK_UNVERIFIED", 0)
    summary = f"""MARWADI UNIVERSITY DIPLOMA SYLLABUS COLLECTION\nRun: {datetime.now(timezone.utc).isoformat()}\nSource of truth: six official Marwadi University Diploma program pages + the official Marwadi WordPress media API only.\nSupabase/GitHub/previous recovery manifests used: NO\n\nOfficial pages fetched: {sum(1 for x in page_status if x.get('result') == 'PAGE_FETCHED')} / {len(COURSES)}\nSubject/code entries discovered from actual pages: {len(all_targets)}\nPDFs saved in output folders: {pdf_files}\nEntries validated by PDF-internal code + title: {exact}\nEntries requiring review: {review}\nEntries with no confirmed PDF from official page/media index: {missing}\nEntries network-unverified: {network}\nOther direct official PDFs saved without a reliable subject mapping: {direct_files}\n\nIMPORTANT\n- This collection is generated from Marwadi's current official pages, not Supabase catalog subjects.\n- VERIFIED_Syllabi contains only PDFs with internal course code and title evidence.\n- Needs_Review and Other_Official_Page_PDFs preserve official files that were linked/published but could not be safely mapped as an exact subject match.\n- A no-match status means this run did not find/validate a PDF; it does NOT prove the university has no PDF for that subject.\n- Check Reports/ before treating the collection as exhaustive. A page-fetch failure or network error is not a missing syllabus.\n- No live catalog, Supabase or GitHub writes are performed.\n"""
    (OUT / "Reports" / "SUMMARY.txt").write_text(summary, encoding="utf-8")
    (OUT / "README_FIRST.txt").write_text(
        "This collection was rebuilt from the six official Marwadi University Diploma course pages and Marwadi's own media index. It does not use the Supabase subject list.\n\n"
        "Folders:\n- Verified_Syllabi: PDF text included the current official subject code and a sufficient title match.\n- Needs_Review: official candidate files need manual review because code/title evidence is incomplete or mismatched.\n- Other_Official_Page_PDFs: direct PDFs linked on official course pages but not associated to a code/title with enough confidence.\n- Reports: exact course-page subject inventory, direct links, hashes, statuses and failures.\n\n"
        "See Reports/SUMMARY.txt before claiming completion. The university may list some subjects without an accessible PDF. No web extraction process can guarantee a PDF that Marwadi does not publish or that its server will not serve.\n",
        encoding="utf-8"
    )

    with zipfile.ZipFile(ZIP_OUT, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as zf:
        for p in OUT.rglob("*"):
            if p.is_file():
                zf.write(p, p.relative_to(ROOT))
    log(f"Collection complete. Created: {ZIP_OUT}")
    print(summary)
    return 0

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("Interrupted; reports/files already downloaded remain in output folder.", file=sys.stderr)
        raise SystemExit(130)
