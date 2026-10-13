#!/usr/bin/env python3
"""Evidence-based ESE audit for Science & Pharmacy subject flags; read-only. Does not write to Supabase."""
from __future__ import annotations
import csv, json, re, unicodedata
from collections import defaultdict
from pathlib import Path
import fitz

ROOT = Path(__file__).resolve().parents[2]
PDF_DIR = ROOT / "Syllabus" / "Science_Pharmacy_Recovery_Kit_1" / "Science_Pharmacy_Syllabus_Recovery_Kit" / "Output" / "Verified_PDFs" / "Tier_1"
HERE = Path(__file__).resolve().parent
SNAPSHOT = HERE / "science_pharmacy_subject_snapshot.csv"
OUT_CSV = HERE / "science_pharmacy_audit_report.csv"
OUT_JSON = HERE / "science_pharmacy_audit_summary.json"

def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9]+", "", s)

def pdf_title(path: Path) -> str:
    return re.sub(r"\s+\[[0-9a-fA-F]{8,}\]$", "", path.stem).strip()

def get_pdf_evidence(path: Path) -> dict:
    try:
        doc = fitz.open(path)
    except Exception as exc:
        return {"pdf": path.name, "status": "PDF_OPEN_ERROR", "marks": "", "evidence": str(exc)}
    observations, snippets = [], []
    with doc:
        for pno, page in enumerate(doc, start=1):
            text = page.get_text("text", sort=True) or ""
            compact = re.sub(r"\s+", " ", text).lower()
            if "teaching and examination scheme" not in compact and "teaching scheme" not in compact:
                continue
            words = page.get_text("words", sort=True)
            headers = [w for w in words if re.sub(r"[^a-z]", "", str(w[4]).lower()) == "ese"]
            nums = []
            for w in words:
                raw = str(w[4]).strip().replace(",", "")
                if re.fullmatch(r"\d+(?:\.\d+)?", raw):
                    nums.append((w, float(raw)))
            for h in headers:
                hx, hy = (float(h[0])+float(h[2]))/2, (float(h[1])+float(h[3]))/2
                candidates = []
                for w, val in nums:
                    x, y = (float(w[0])+float(w[2]))/2, (float(w[1])+float(w[3]))/2
                    dy, dx = y-hy, abs(x-hx)
                    if 1 <= dy <= 65 and dx <= 55 and 0 <= val <= 100:
                        candidates.append((dy+dx*1.35, val, str(w[4])))
                if candidates:
                    candidates.sort(key=lambda x:x[0])
                    score,val,raw=candidates[0]
                    observations.append((val,pno,raw,round(score,1)))
                    snippets.append(f"page {pno}: ESE header -> {raw} (score {round(score,1)})")
    if not observations:
        return {"pdf":path.name,"status":"ESE_NOT_FOUND","marks":"","evidence":"No readable numeric ESE value beneath ESE header in scheme table."}
    values=sorted({o[0] for o in observations})
    if len(values)!=1:
        return {"pdf":path.name,"status":"ESE_CONFLICT","marks":"|".join(map(str,values)),"evidence":"; ".join(snippets)}
    val=values[0]
    return {"pdf":path.name,"status":"ESE_MARKS_0" if val==0 else "ESE_MARKS_POSITIVE","marks":str(int(val) if val.is_integer() else val),"evidence":"; ".join(snippets)}

def main():
    with SNAPSHOT.open(encoding="utf-8-sig",newline="") as f:
        subjects=list(csv.DictReader(f))
    pdfs=sorted(PDF_DIR.glob("*.pdf")) if PDF_DIR.exists() else []
    by_title=defaultdict(list); cache={}
    for p in pdfs:
        by_title[norm(pdf_title(p))].append(p)
        cache[p]=get_pdf_evidence(p)
    report=[]
    for s in subjects:
        matches=by_title.get(norm(s["SubjectName"]),[])
        evidence=[cache[p] for p in matches]
        statuses={e["status"] for e in evidence}
        marks={e["marks"] for e in evidence if e["marks"]!=""}
        proposed=""
        if matches and len(evidence)==len(matches) and len(statuses)==1 and len(marks)==1:
            st=next(iter(statuses))
            if st=="ESE_MARKS_0": proposed="true"
            elif st=="ESE_MARKS_POSITIVE": proposed="false"
            else: st="UNRESOLVED_ESE_EVIDENCE"
        else:
            st="UNRESOLVED_NO_EXACT_PDF" if not matches else "UNRESOLVED_PDF_CONFLICT_OR_UNREADABLE"
        report.append({"SubjectId":s["SubjectId"],"CourseId":s["CourseId"],"CourseName":s["CourseName"],"Semester":s["Semester"],"SubjectName":s["SubjectName"],"current_flag":str(s["isDepartmentalSubject"]).lower(),"proposed_flag":proposed,"audit_status":st,"ese_marks":"|".join(sorted(marks)),"matching_pdf_count":len(matches),"matching_pdfs":" | ".join(p.name for p in matches),"evidence":" || ".join(f'{e["pdf"]}: {e["status"]} marks={e["marks"]} {e["evidence"]}' for e in evidence)})
    with OUT_CSV.open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=list(report[0].keys()));w.writeheader();w.writerows(report)
    classified=[r for r in report if r["proposed_flag"] in ("true","false")]
    mismatches=[r for r in classified if r["current_flag"]!=r["proposed_flag"]]
    summary={"snapshot_rows":len(subjects),"tier1_official_pdfs_found":len(pdfs),"classified":len(classified),"confirmed_no_ese_true":sum(r["proposed_flag"]=="true" for r in classified),"confirmed_ese_false":sum(r["proposed_flag"]=="false" for r in classified),"unresolved":len(report)-len(classified),"confirmed_mismatches":len(mismatches),"mismatch_rows":[{"SubjectId":r["SubjectId"],"CourseId":r["CourseId"],"Semester":r["Semester"],"SubjectName":r["SubjectName"],"current_flag":r["current_flag"],"proposed_flag":r["proposed_flag"],"ese_marks":r["ese_marks"]} for r in mismatches],"per_course":{}}
    for course in sorted({r["CourseName"] for r in report}):
        rows=[r for r in report if r["CourseName"]==course]
        summary["per_course"][course]={"total":len(rows),"classified":sum(r["proposed_flag"] in ("true","false") for r in rows),"true":sum(r["proposed_flag"]=="true" for r in rows),"false":sum(r["proposed_flag"]=="false" for r in rows),"unresolved":sum(r["proposed_flag"] not in ("true","false") for r in rows)}
    OUT_JSON.write_text(json.dumps(summary,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    print(json.dumps({k:v for k,v in summary.items() if k!="mismatch_rows"},indent=2))
if __name__=="__main__": main()
