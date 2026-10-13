#!/usr/bin/env python3
from __future__ import annotations
import csv, hashlib, os, re, sys, time
from pathlib import Path
from urllib.parse import urljoin, urlparse
import requests
import fitz
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "output"
PDF_DIR = OUT / "PDFs"
MASTER_DIR = OUT / "Master_Syllabi"
HTML_DIR = OUT / "source_pages"
for d in (OUT, PDF_DIR, MASTER_DIR, HTML_DIR):
    d.mkdir(parents=True, exist_ok=True)

SOURCES = {
    "BCA": "https://www.marwadiuniversity.ac.in/bachelor-of-computer-application-bca-hons-colleges-in-rajkot/",
    "MCA": "https://www.marwadiuniversity.ac.in/mca-master-of-computer-application/",
}
MASTER_PDFS = {
    "BCA_programme_guide.pdf": "https://marwadiuniversity.online/wp-content/uploads/2025/02/BCA-Programme-Guide-Final.pdf",
    "MCA_programme_structure.pdf": "https://marwadiuniversity.online/wp-content/uploads/2025/02/MCA_Syllabus-and-Programme-Structure.pdf",
}
HEADERS = {"User-Agent": "PrepMaster-ComputerApplications-SyllabusCollector/1.0 (educational research)"}
CODE_RE = re.compile(r"\b((?:05BC|05BH|04ID|05CR|05MC|05SL|05CE)[0-9A-Za-z]{4,6})\b", re.I)
SESSION = requests.Session()
SESSION.headers.update(HEADERS)
TIMEOUT = (15, 50)

def log(msg):
    print(msg, flush=True)

def get(url):
    r = SESSION.get(url, timeout=TIMEOUT)
    r.raise_for_status()
    return r

def safe(s, maxlen=110):
    s = re.sub(r"[^\w .()&+-]+", "", s, flags=re.UNICODE).strip()
    s = re.sub(r"\s+", " ", s)
    return (s[:maxlen].strip(" .") or "subject")

def clean_title(text, code):
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"\s*\(?\s*" + re.escape(code) + r"\s*\)?\s*", " ", text, flags=re.I)
    return text.strip(" -–—:()[]")

def semester_for(code, course):
    c = code.upper()
    if course == "BCA":
        m = re.search(r"(?:05BC|05BH)(\d{2})", c)
        if m:
            n = int(m.group(1))
            if n in (31, 32, 33, 34, 35, 36):
                return n - 30
            if n == 7: return 7
            if n == 8: return 8
        if c.startswith("04ID0001"): return 1
        if c.startswith("04ID0002"): return 2
        if c.startswith("05CR0301"): return 3
        if c.startswith("05CR0401"): return 4
        if c.startswith("05BC0510"): return 5
        if c.startswith("05BC0612"): return 6
    else:
        m = re.search(r"(?:05MC|05SL|05CE)(\d{2})", c)
        if m:
            n = int(m.group(1))
            if n == 11: return 1
            if n in (1,): return 1
            if n == 2: return 2
            if n == 3: return 3
            if n == 4: return 4
        if c.startswith("05SL02"): return 2
        if c.startswith("05CE03"): return 3
    return ""

def read_seed():
    rows = []
    with (ROOT / "seed_catalog.csv").open(encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            rows.append({"course":r["course"],"program_name":r["program_name"],"semester":r["semester"],
                         "subject_code":r["subject_code"],"subject_title":r["subject_title"],
                         "page_url":SOURCES[r["course"]],"pdf_url":"","source":"seed"})
    return rows

def parse_page(course, url, html):
    soup = BeautifulSoup(html, "html.parser")
    rows = []
    # Individual PDF links are usually anchors whose text includes a subject code.
    for a in soup.find_all("a", href=True):
        label = " ".join(a.get_text(" ", strip=True).split())
        matches = list(CODE_RE.finditer(label))
        if not matches:
            continue
        code = matches[-1].group(1).upper()
        # Filter to codes relevant to this programme; avoid unrelated footer/content links.
        if course == "BCA" and not code.startswith(("05BC","05BH","04ID","05CR")): continue
        if course == "MCA" and not code.startswith(("05MC","05SL","05CE")): continue
        title = clean_title(label, code)
        if not title or len(title) < 2: title = code
        href = urljoin(url, a["href"])
        pdf_url = href if urlparse(href).path.lower().endswith(".pdf") else ""
        rows.append({"course":course,"program_name":"Bachelor of Computer Applications (Hons.)" if course=="BCA" else "Master of Computer Applications",
                     "semester":str(semester_for(code,course) or ""),
                     "subject_code":code,"subject_title":title,"page_url":url,"pdf_url":pdf_url,"source":"live_page_link"})
    # Capture code/title pairs shown as plain text (MCA's later-semester outline is mostly plain text).
    text = " ".join(soup.stripped_strings)
    # Keep a bounded text window around each code and derive a plausible preceding title.
    for m in CODE_RE.finditer(text):
        code = m.group(1).upper()
        if course == "BCA" and not code.startswith(("05BC","05BH","04ID","05CR")): continue
        if course == "MCA" and not code.startswith(("05MC","05SL","05CE")): continue
        before = text[max(0,m.start()-130):m.start()]
        # The latest course-like boundary prevents swallowing unrelated preceding prose.
        before = re.split(r"(?:SEM(?:ESTER)?\s*[1-8]|List of electives|Core Courses|Elective Courses|Course Outline|Overview)", before, flags=re.I)[-1]
        title = re.sub(r"\s+", " ", before).strip(" :-–—,.;")
        title = title[-90:] if title else code
        # Keep the likely title phrase after the last period/colon/semicolon.
        title = re.split(r"[.;|]", title)[-1].strip(" :-–—,")
        if not title or len(title) > 90: title = code
        rows.append({"course":course,"program_name":"Bachelor of Computer Applications (Hons.)" if course=="BCA" else "Master of Computer Applications",
                     "semester":str(semester_for(code,course) or ""),
                     "subject_code":code,"subject_title":title,"page_url":url,"pdf_url":"","source":"live_page_text"})
    # Deduplicate within course/code; prefer a direct PDF link and a non-code-only title.
    merged = {}
    for r in rows:
        key=(r["course"],r["subject_code"].upper())
        old=merged.get(key)
        if old is None or (not old["pdf_url"] and r["pdf_url"]) or (old["subject_title"]==r["subject_code"] and r["subject_title"]!=r["subject_code"]):
            merged[key]=r
        elif old and not old["pdf_url"] and r["pdf_url"]:
            old["pdf_url"]=r["pdf_url"]
    return list(merged.values())

def write_csv(path, rows, fields):
    with path.open("w", newline="", encoding="utf-8-sig") as f:
        w=csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)

def download_file(url, dest):
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 1000:
        data=dest.read_bytes()
        if data.startswith(b"%PDF"):
            return "CACHED", len(data), hashlib.sha256(data).hexdigest(), ""
    try:
        r=get(url)
        data=r.content
        if not data.startswith(b"%PDF"):
            return "NOT_A_PDF", len(data), hashlib.sha256(data).hexdigest(), f"HTTP {r.status_code}; content-type={r.headers.get('content-type','')}"
        dest.write_bytes(data)
        return "DOWNLOADED", len(data), hashlib.sha256(data).hexdigest(), ""
    except Exception as e:
        return "DOWNLOAD_FAILED", 0, "", str(e)[:500]

def validate_pdf(path):
    try:
        data=path.read_bytes()
        if not data.startswith(b"%PDF"): return False, 0, 0, "", "missing PDF signature"
        doc=fitz.open(stream=data, filetype="pdf")
        pages=len(doc)
        text=" ".join(p.get_text("text") for p in doc)
        doc.close()
        return pages>0 and len(text.strip())>30, pages, len(text), text[:15000], "" if len(text.strip())>30 else "no extractable text"
    except Exception as e:
        return False, 0, 0, "", str(e)[:300]

def find_media_candidates(code):
    # Official Marwadi WordPress media API; candidates are revalidated as PDFs.
    url="https://www.marwadiuniversity.ac.in/wp-json/wp/v2/media"
    try:
        r=SESSION.get(url, params={"search":code,"per_page":20}, timeout=TIMEOUT)
        r.raise_for_status()
        items=r.json()
        out=[]
        for item in items:
            src=item.get("source_url","")
            title=(item.get("title") or {}).get("rendered","")
            if src and ".pdf" in urlparse(src).path.lower():
                out.append((src, re.sub("<[^>]+>","",title)))
        return out
    except Exception:
        return []

def main():
    started=time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
    inventory={}
    reports=[]
    page_errors=[]
    page_data={}
    for course,url in SOURCES.items():
        try:
            log(f"[PAGE] Fetching {course}: {url}")
            response=get(url)
            html=response.text
            page_data[course]=html
            (HTML_DIR/f"{course}_official_page.html").write_text(html, encoding="utf-8")
            live=parse_page(course,url,html)
            for r in live:
                key=(r["course"],r["subject_code"].upper())
                inventory[key]=r
            log(f"[PAGE] {course}: extracted {len(live)} unique coded entries")
        except Exception as e:
            page_errors.append({"course":course,"url":url,"error":str(e)})
            log(f"[WARN] Could not fetch {course} live page: {e}")
    # Merge the bundled official-page snapshot. Keep curated seed titles/semester labels,
    # while preserving live page links and any additional entries found on the live site.
    for seed_row in read_seed():
        key=(seed_row["course"],seed_row["subject_code"].upper())
        if key not in inventory:
            inventory[key]=seed_row
        else:
            live_row=inventory[key]
            live_row["subject_title"]=seed_row["subject_title"]
            live_row["semester"]=seed_row["semester"]
            live_row["program_name"]=seed_row["program_name"]
            if not live_row.get("pdf_url"):
                live_row["pdf_url"]=seed_row.get("pdf_url","")
            live_row["source"]="live_page+seed_title"
    subjects=sorted(inventory.values(), key=lambda r:(r["course"], int(r["semester"] or 99), r["subject_code"]))
    write_csv(OUT/"subject_inventory.csv",subjects,["course","program_name","semester","subject_code","subject_title","page_url","pdf_url","source"])

    # Download complete programme-level PDFs first, so the syllabus is not lost if individual PDFs are absent.
    master_report=[]
    for filename,url in MASTER_PDFS.items():
        status,n,sha,err=download_file(url,MASTER_DIR/filename)
        valid,pages,chars,txt,verr=validate_pdf(MASTER_DIR/filename) if status in ("DOWNLOADED","CACHED") else (False,0,0,"","")
        master_report.append({"filename":filename,"url":url,"download_status":status,"valid_pdf":valid,"pages":pages,"extractable_chars":chars,"sha256":sha,"error":err or verr})
        log(f"[MASTER] {filename}: {status}; valid={valid}; pages={pages}; chars={chars}")
    write_csv(OUT/"master_pdf_report.csv",master_report,["filename","url","download_status","valid_pdf","pages","extractable_chars","sha256","error"])

    # Download each directly-linked PDF. If absent, search official media API for a code-specific PDF.
    for i,r in enumerate(subjects,1):
        code=r["subject_code"]
        candidates=[]
        if r.get("pdf_url"): candidates.append((r["pdf_url"],"official_page_link"))
        # Always try official media search when no direct PDF is linked.
        if not candidates:
            candidates.extend((u,"official_media_search:"+title) for u,title in find_media_candidates(code))
        if not candidates:
            reports.append({"course":r["course"],"semester":r["semester"],"subject_code":code,"subject_title":r["subject_title"],
                            "source_url":"","file_path":"","download_status":"NO_INDIVIDUAL_PDF_FOUND","valid_pdf":False,
                            "code_in_pdf":False,"title_evidence":False,"pages":0,"extractable_chars":0,"sha256":"",
                            "note":"No direct or official-media PDF candidate found; check master programme PDF and source page."})
            continue
        chosen=False
        for url,how in candidates[:5]:
            dest=PDF_DIR/r["course"]/f"Sem_{r['semester'] or 'Unknown'}"/f"{safe(code)} - {safe(r['subject_title'])}.pdf"
            status,n,sha,err=download_file(url,dest)
            valid,pages,chars,txt,verr=validate_pdf(dest) if status in ("DOWNLOADED","CACHED") else (False,0,0,"","")
            if not valid:
                reports.append({"course":r["course"],"semester":r["semester"],"subject_code":code,"subject_title":r["subject_title"],
                                "source_url":url,"file_path":str(dest.relative_to(OUT)),"download_status":status if status not in ("DOWNLOADED","CACHED") else "INVALID_PDF",
                                "valid_pdf":False,"code_in_pdf":False,"title_evidence":False,"pages":pages,"extractable_chars":chars,
                                "sha256":sha,"note":err or verr or how})
                continue
            code_in = bool(re.search(re.escape(code),txt,re.I)) if not re.search(r"[xX]$",code) else False
            # Avoid claiming exact validation for broad/generic course titles.
            title_words=[w.lower() for w in re.findall(r"[A-Za-z]{4,}",r["subject_title"]) if w.lower() not in {"using","with","from","course","elective","project","programming"}]
            title_hits=sum(1 for w in title_words if w in txt.lower())
            title_evidence=title_hits>=min(2,len(title_words)) if title_words else False
            verified=code_in and title_evidence
            status_label="VERIFIED_CODE_AND_TITLE" if verified else ("REVIEW_CODE_OR_TITLE_MISMATCH" if title_evidence or code_in else "REVIEW_PDF_CONTENT")
            reports.append({"course":r["course"],"semester":r["semester"],"subject_code":code,"subject_title":r["subject_title"],
                            "source_url":url,"file_path":str(dest.relative_to(OUT)),"download_status":status_label,
                            "valid_pdf":True,"code_in_pdf":code_in,"title_evidence":title_evidence,"pages":pages,"extractable_chars":chars,
                            "sha256":sha,"note":how if verified else f"{how}; code/title evidence needs manual review"})
            chosen=True
            break
        if not chosen:
            log(f"[WARN] {r['course']} {code}: candidates failed validation")
        if i % 10 == 0:
            log(f"[PROGRESS] checked {i}/{len(subjects)} subject entries")
        time.sleep(0.15)
    write_csv(OUT/"download_report.csv",reports,["course","semester","subject_code","subject_title","source_url","file_path","download_status","valid_pdf","code_in_pdf","title_evidence","pages","extractable_chars","sha256","note"])
    write_csv(OUT/"source_page_errors.csv",page_errors,["course","url","error"])

    counts={}
    for x in reports: counts[x["download_status"]]=counts.get(x["download_status"],0)+1
    valid_masters=sum(1 for x in master_report if x["valid_pdf"])
    lines=[
        "PREPMASTER — COMPUTER APPLICATIONS BATCH RUNNER",
        "="*52,
        f"Run started: {started}",
        f"Subject inventory entries: {len(subjects)} (unique course + subject code)",
        f"BCA inventory entries: {sum(1 for x in subjects if x['course']=='BCA')}",
        f"MCA inventory entries: {sum(1 for x in subjects if x['course']=='MCA')}",
        f"Master programme PDFs valid: {valid_masters}/{len(master_report)}",
        "",
        "INDIVIDUAL PDF RESULT COUNTS",
    ]
    lines += [f"- {k}: {v}" for k,v in sorted(counts.items())] or ["- No individual-PDF attempts reported."]
    lines += [
        "",
        "Interpretation:",
        "- The programme-level PDFs are retained separately as coverage backups.",
        "- VERIFIED_CODE_AND_TITLE means the expected code and title evidence were found in extracted PDF text; it is not a guarantee of curriculum-year equivalence.",
        "- REVIEW_* means the PDF downloaded but needs human verification.",
        "- NO_INDIVIDUAL_PDF_FOUND means no public individual PDF was found via the configured official page/media search; it does not mean the subject is absent.",
        "- Check subject_inventory.csv for the complete coded course outline and download_report.csv for per-subject outcomes.",
        "- This run does not modify GitHub or Supabase.",
    ]
    (OUT/"RUN_SUMMARY.txt").write_text("\n".join(lines)+"\n",encoding="utf-8")
    log("\n".join(lines))
    if page_errors:
        log("[WARN] One or more live pages failed; bundled seed entries were retained.")
    # Nonzero only for total runtime setup issues; individual missing PDFs are reported, not fatal.
    return 0

if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nInterrupted by user.", file=sys.stderr)
        raise SystemExit(130)
