#!/usr/bin/env python3
"""Read-only, evidence-backed ESE audit for B.Tech Subject rows."""
from __future__ import annotations
import csv, hashlib, json, re, unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any
import fitz

ROOT = Path(__file__).resolve().parents[2]
COLLECTION = ROOT / "Syllabus" / "B.Tech programs"
MAP_CSV = COLLECTION / "_Catalogs" / "program_course_map.csv"
INPUT_CSV = Path(__file__).with_name("btech_subject_snapshot.csv")
OUT_CSV = Path(__file__).with_name("audit_report.csv")
OUT_JSON = Path(__file__).with_name("audit_summary.json")

ALIASES = {
    "B.Tech - Computer Engineering": ["B.Tech Computer Engineering"],
    "B.Tech - IT": ["B.Tech Information Technology"],
    "B.Tech - AI/ML": ["B.Tech CSE Artificial Intelligence and Machine Learning"],
    "B.Tech - AI/Data science": ["B.Tech CSE Artificial Intelligence and Data Science"],
    "B.Tech - ICT": ["B.Tech Information and Communication Technology"],
    "B.Tech - CSE": ["B.Tech Computer Science and Engineering"],
    "B.Tech - CSE & Cyber Security": ["B.Tech CSE Cyber Security"],
    "B.Tech - CSE & AI": ["B.Tech CSE Artificial Intelligence"],
}
SCHEME_PATTERNS = [
    r"teaching\s+and\s+examination\s+scheme",
    r"evaluation\s+scheme", r"assessment\s+scheme",
    r"examination\s+scheme", r"scheme\s+of\s+assessment",
]

def norm(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode("ascii").lower()
    value = value.replace("&", " and ")
    return re.sub(r"[^a-z0-9]+", "", value)

def token(value: str) -> str:
    return (value or "").strip().strip(".,:;()[]{}<>").lower()

def numeric(value: str):
    raw = re.sub(r"^[^\d-]+|[^\d.%+-]+$", "", (value or "").strip().replace(",", ""))
    if not raw or not re.fullmatch(r"-?\d+(?:\.\d+)?%?", raw):
        return None
    try:
        val = float(raw.rstrip("%"))
    except ValueError:
        return None
    return val if 0 <= val <= 100 else None

def scheme_heading_y(words: list[tuple], text: str):
    hit = None
    for pat in SCHEME_PATTERNS:
        m = re.search(pat, text, re.I)
        if m:
            hit = m
            break
    if not hit:
        return None, ""
    groups = defaultdict(list)
    for w in words:
        groups[(w[5], w[6])].append(w)
    for group in groups.values():
        line = " ".join(str(w[4]) for w in group)
        if any(re.search(pat, line, re.I) for pat in SCHEME_PATTERNS):
            return min(float(w[1]) for w in group), hit.group(0)
    return 0.0, hit.group(0)

def parse_pdf(path: Path, expected_hash: str) -> dict[str, Any]:
    if not path.is_file():
        return {"status":"PDF_NOT_FOUND","marks":"","decision":None,"evidence":"","excerpt":""}
    data = path.read_bytes()
    actual_hash = hashlib.sha256(data).hexdigest()
    if expected_hash and actual_hash.lower() != expected_hash.lower():
        return {"status":"PDF_HASH_MISMATCH","marks":"","decision":None,
                "evidence":f"Expected SHA-256 {expected_hash}; actual {actual_hash}.","excerpt":""}
    observations = []
    try:
        with fitz.open(path) as doc:
            for page_no, page in enumerate(doc, start=1):
                text = page.get_text("text", sort=True) or ""
                words = page.get_text("words", sort=True)
                if not text or not words:
                    continue
                hy, heading = scheme_heading_y(words, text)
                if hy is None:
                    continue
                for w in words:
                    if token(str(w[4])).replace(".", "") != "ese":
                        continue
                    x0,y0,x1,y1 = map(float, w[:4])
                    if y0 < hy - 8 or y0 > hy + 260:
                        continue
                    xc=(x0+x1)/2; yc=(y0+y1)/2
                    cells=[]
                    for v in words:
                        if v is w: continue
                        vx0,vy0,vx1,vy1=map(float,v[:4])
                        vxc=(vx0+vx1)/2; vyc=(vy0+vy1)/2
                        dy=vyc-yc; dx=abs(vxc-xc)
                        below = 1 <= dy <= 95 and dx <= 48
                        inline = abs(dy) <= 4 and -3 <= vx0-x1 <= 90
                        if not (below or inline): continue
                        raw=str(v[4]).strip(); val=numeric(raw)
                        t=token(raw).replace(".","")
                        if val is not None or t in {"-","–","—","nil","nill","na","none"}:
                            score=(max(0,dy)+dx*1.5) if below else (abs(dy)+max(0,vx0-x1)*0.05)
                            cells.append((score,raw,val,t,dx,dy))
                    if cells:
                        cells.sort(key=lambda c:c[0])
                        _,raw,val,t,dx,dy=cells[0]
                        if val is not None:
                            val=int(val) if val.is_integer() else val
                            observations.append({"status":"ESE_MARKS_READ","marks":val,"decision":val==0,
                                "evidence":f"PDF page {page_no}; {heading}; ESE cell={raw!r}; horizontal offset={dx:.1f}pt; vertical offset={dy:.1f}pt","text":text})
                        else:
                            observations.append({"status":"ESE_NO_ASSESSMENT_EXPLICIT","marks":0,"decision":True,
                                "evidence":f"PDF page {page_no}; {heading}; ESE cell explicitly {raw!r}; horizontal offset={dx:.1f}pt; vertical offset={dy:.1f}pt","text":text})
                # Strict text fallback for explicitly labelled inline values only.
                if not any(o.get("text")==text for o in observations):
                    flat=re.sub(r"\s+"," ",text)
                    m=re.search(r"\bESE\b\s*(?:marks?|weightage)?\s*[:=-]\s*(0|zero|nil|nill|none|not applicable|N/?A)\b",flat,re.I)
                    if m:
                        observations.append({"status":"ESE_NO_ASSESSMENT_EXPLICIT","marks":0,"decision":True,
                            "evidence":f"PDF page {page_no}; explicit scheme cell {m.group(0)!r}","text":text})
                    else:
                        m=re.search(r"\bESE\b\s*(?:marks?|weightage)?\s*[:=-]\s*(\d{1,3})\b",flat,re.I)
                        if m and int(m.group(1))<=100:
                            val=int(m.group(1))
                            observations.append({"status":"ESE_MARKS_READ","marks":val,"decision":val==0,
                                "evidence":f"PDF page {page_no}; explicit scheme cell {m.group(0)!r}","text":text})
    except Exception as exc:
        return {"status":"PDF_READ_ERROR","marks":"","decision":None,"evidence":repr(exc),"excerpt":""}
    if not observations:
        return {"status":"UNRESOLVED_NO_CLEAR_ESE_CELL","marks":"","decision":None,
                "evidence":"PDF hash verified; no unambiguous numeric ESE cell or explicit no-assessment cell located.","excerpt":""}
    distinct={(o["status"],str(o["marks"]),str(o["decision"])) for o in observations}
    if len(distinct)!=1:
        return {"status":"CONFLICTING_ESE_EVIDENCE","marks":"","decision":None,
                "evidence":" | ".join(o["evidence"] for o in observations),"excerpt":""}
    chosen=observations[0]
    lines=[re.sub(r"\s+"," ",line).strip() for line in chosen["text"].splitlines() if line.strip()]
    idx=[i for i,line in enumerate(lines) if re.search(r"\bESE\b|teaching and examination scheme|evaluation scheme|assessment scheme",line,re.I)]
    excerpt=" | ".join(lines[max(0,idx[0]-2):min(len(lines),idx[0]+10)])[:700] if idx else ""
    return {"status":chosen["status"],"marks":chosen["marks"],"decision":chosen["decision"],
            "evidence":" | ".join(o["evidence"] for o in observations),"excerpt":excerpt}

def main():
    with INPUT_CSV.open(encoding="utf-8-sig",newline="") as f:
        subjects=list(csv.DictReader(f))
    with MAP_CSV.open(encoding="utf-8-sig",newline="") as f:
        source_map=list(csv.DictReader(f))
    for m in source_map:
        m["_title_key"]=norm(m.get("course_title",""))
        m["_library_rel"]=(m.get("library_file","") or "").replace("\\","/").lstrip("/")
    pdf_cache={}; report=[]
    for s in subjects:
        course=s["CourseName"]; aliases=ALIASES.get(course,[])
        title_key=norm(s["SubjectName"])
        matches=[m for m in source_map if m.get("program_name") in aliases and m["_title_key"]==title_key]
        match_method="EXACT_PROGRAM_TITLE" if matches else ""
        # Conservative fallback: use the shared B.Tech collection only for an exact title
        # match, and later require every matching PDF to yield the same explicit ESE marks.
        if not matches:
            matches=[m for m in source_map if m["_title_key"]==title_key]
            if matches:
                match_method="GLOBAL_EXACT_TITLE_UNANIMOUS"
        row={"SubjectId":s["SubjectId"],"SubjectName":s["SubjectName"],"CourseId":s["CourseId"],
             "CourseName":course,"Semester":s["Semester"],
             "current_isDepartmentalSubject":s["isDepartmentalSubject"],
             "matched_program_names":"; ".join(aliases),"match_method":match_method,
             "matched_course_codes":"","matched_pdf_paths":"",
             "pdf_sha_verified":"","ese_status":"","ese_marks":"","proposed_isDepartmentalSubject":"",
             "audit_status":"","evidence":"","source_excerpt":""}
        if not aliases:
            row.update(audit_status="UNRESOLVED_NO_PROGRAM_ALIAS",ese_status="UNRESOLVED")
            report.append(row); continue
        if not matches:
            row.update(audit_status="UNRESOLVED_NO_EXACT_TITLE_MATCH",ese_status="UNRESOLVED",
                evidence="No exact normalized title match in its own program or the shared verified B.Tech PDF collection.")
            report.append(row); continue
        evidence=[]
        for m in matches:
            rel=m["_library_rel"]; key=(rel,(m.get("content_sha256") or "").strip())
            if key not in pdf_cache:
                pdf_cache[key]=parse_pdf(COLLECTION/rel,key[1])
            ev=dict(pdf_cache[key]); ev.update(code=m.get("course_code",""),title=m.get("course_title",""),
                path=rel,program=m.get("program_name",""),url=m.get("source_url",""))
            evidence.append(ev)
        row["matched_course_codes"]="; ".join(sorted({e["code"] for e in evidence}))
        row["matched_pdf_paths"]="; ".join(sorted({e["path"] for e in evidence}))
        row["pdf_sha_verified"]="yes" if all(e["status"] not in {"PDF_NOT_FOUND","PDF_HASH_MISMATCH","PDF_READ_ERROR"} for e in evidence) else "no"
        statuses={e["status"] for e in evidence}
        if any(e.get("decision") is None for e in evidence):
            row.update(audit_status="UNRESOLVED_PDF_OR_ESE_EVIDENCE",ese_status="; ".join(sorted(statuses)))
            row["evidence"]=" | ".join(e["evidence"] for e in evidence)[:2500]
            row["source_excerpt"]=" | ".join(e["excerpt"] for e in evidence if e["excerpt"])[:1500]
            report.append(row); continue
        decisions={str(e["decision"]) for e in evidence}; marks={str(e["marks"]) for e in evidence}
        if len(decisions)!=1 or len(marks)!=1:
            row.update(audit_status="UNRESOLVED_AMBIGUOUS_MATCH_OR_ESE",ese_status="; ".join(sorted(statuses)))
            row["evidence"]=" | ".join(e["evidence"] for e in evidence)[:2500]
            row["source_excerpt"]=" | ".join(e["excerpt"] for e in evidence if e["excerpt"])[:1500]
            report.append(row); continue
        chosen=evidence[0]; decision=bool(chosen["decision"])
        row["ese_status"]=chosen["status"]; row["ese_marks"]=chosen["marks"]
        row["proposed_isDepartmentalSubject"]=str(decision).lower()
        row["audit_status"]="CLASSIFIED_CONFIRMED_NO_ESE" if decision else "CLASSIFIED_CONFIRMED_ESE"
        row["evidence"]=" | ".join(e["evidence"] for e in evidence)[:2500]
        row["source_excerpt"]=" | ".join(e["excerpt"] for e in evidence if e["excerpt"])[:1500]
        report.append(row)
    fields=list(report[0]) if report else []
    with OUT_CSV.open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=fields,extrasaction="ignore"); w.writeheader(); w.writerows(report)
    per_course={}
    for course in sorted({r["CourseName"] for r in report}):
        group=[r for r in report if r["CourseName"]==course]; counts=Counter(r["audit_status"] for r in group)
        per_course[course]={"total":len(group),"confirmed_no_ese_true":counts["CLASSIFIED_CONFIRMED_NO_ESE"],
            "confirmed_ese_false":counts["CLASSIFIED_CONFIRMED_ESE"],
            "unresolved":sum(v for k,v in counts.items() if k.startswith("UNRESOLVED")),"status_counts":dict(counts)}
    summary={"rule":"ESE marks 0 or an explicit no-assessment cell => true; positive ESE marks => false. Missing/ambiguous evidence remains unresolved.",
        "database_snapshot_rows":len(subjects),"program_course_map_rows":len(source_map),"unique_pdfs_inspected":len(pdf_cache),
        "classified":sum(r["proposed_isDepartmentalSubject"] in {"true","false"} for r in report),
        "confirmed_no_ese_true":sum(r["audit_status"]=="CLASSIFIED_CONFIRMED_NO_ESE" for r in report),
        "confirmed_ese_false":sum(r["audit_status"]=="CLASSIFIED_CONFIRMED_ESE" for r in report),
        "unresolved":sum(r["audit_status"].startswith("UNRESOLVED") for r in report),"by_course":per_course}
    OUT_JSON.write_text(json.dumps(summary,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print("BTECH_ESE_AUDIT_SUMMARY="+json.dumps(summary,ensure_ascii=False))
if __name__=="__main__": main()
