#!/usr/bin/env python3
"""Read-only ESE evidence audit for BCA/MCA subjects. Never writes to Supabase."""
from __future__ import annotations
import csv, json, re, unicodedata
from collections import defaultdict, Counter
from pathlib import Path
import fitz

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
PDF_DIR = ROOT / "Syllabus" / "Computer_Applications_1" / "Computer_Applications_Batch_Runner" / "output" / "PDFs"
SNAPSHOT = HERE / "computer_applications_subject_snapshot.csv"
OUT_CSV = HERE / "computer_applications_audit_report.csv"
OUT_JSON = HERE / "computer_applications_audit_summary.json"

ALIASES = {
    "programmingincnet": "programmingincsharpnet",
    "programmingincsharpnet": "programmingincnet",
    "webapplicationdevelopmentusinglaravel": "webapplicationdevelopmentusinglaravel",
    "lifeskill1universalhumanvalues": "lifeskill1universalhumanvalues",
    "lifeskill2professionalskills": "lifeskill2professionalskills",
}

def norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode("ascii").lower()
    return re.sub(r"[^a-z0-9]+", "", s)

def pdf_title(path: Path) -> str:
    stem = re.sub(r"\s+\[[0-9a-fA-F]{8,}\]$", "", path.stem).strip()
    if " - " in stem:
        stem = stem.split(" - ", 1)[1]
    return stem

def get_pdf_evidence(path: Path) -> dict:
    try:
        doc = fitz.open(path)
    except Exception as exc:
        return {"pdf": str(path.relative_to(PDF_DIR)), "status": "PDF_OPEN_ERROR", "marks": "", "evidence": str(exc)}
    observations, snippets = [], []
    with doc:
        for pno, page in enumerate(doc, start=1):
            text = page.get_text("text", sort=True) or ""
            normalized = re.sub(r"\s+", " ", text).lower()
            if not text or ("teaching and examination scheme" not in normalized and "teaching scheme" not in normalized and "examination scheme" not in normalized):
                continue
            words = page.get_text("words", sort=True)
            ese_words = [w for w in words if re.sub(r"[^a-z]", "", str(w[4]).lower()) == "ese"]
            nums = []
            for w in words:
                raw = str(w[4]).strip().replace(",", "")
                if re.fullmatch(r"\d+(?:\.\d+)?", raw):
                    nums.append((w, float(raw)))
            for h in ese_words:
                hx, hy = (float(h[0])+float(h[2]))/2, (float(h[1])+float(h[3]))/2
                candidates = []
                for w, val in nums:
                    x, y = (float(w[0])+float(w[2]))/2, (float(w[1])+float(w[3]))/2
                    dy, dx = y-hy, abs(x-hx)
                    if 1 <= dy <= 65 and dx <= 55 and 0 <= val <= 100:
                        candidates.append((dy+dx*1.35, val, str(w[4])))
                if candidates:
                    candidates.sort(key=lambda z:z[0])
                    score, val, raw = candidates[0]
                    observations.append(val)
                    snippets.append(f"page {pno}: ESE header -> {raw} (layout score {score:.1f})")
    if not observations:
        return {"pdf": str(path.relative_to(PDF_DIR)), "status": "ESE_NOT_FOUND", "marks": "", "evidence": "No readable ESE mark detected beneath an ESE header in an examination-scheme table."}
    vals = sorted(set(observations))
    if len(vals) != 1:
        return {"pdf": str(path.relative_to(PDF_DIR)), "status": "ESE_CONFLICT", "marks": "|".join(str(v) for v in vals), "evidence": "; ".join(snippets)}
    val = vals[0]
    return {"pdf": str(path.relative_to(PDF_DIR)), "status": "ESE_MARKS_0" if val == 0 else "ESE_MARKS_POSITIVE", "marks": str(int(val) if val.is_integer() else val), "evidence": "; ".join(snippets)}

def main():
    with SNAPSHOT.open(encoding="utf-8-sig", newline="") as f:
        subjects = list(csv.DictReader(f))
    pdfs = sorted(PDF_DIR.rglob("*.pdf")) if PDF_DIR.exists() else []
    by_title, evidence_by_path = defaultdict(list), {}
    for p in pdfs:
        ev = get_pdf_evidence(p)
        evidence_by_path[p] = ev
        key = norm(pdf_title(p))
        by_title[key].append(p)
        by_title[ALIASES.get(key, key)].append(p) if key in ALIASES else None
    report = []
    for s in subjects:
        title = s["SubjectName"]
        key = norm(title)
        matches = list(dict.fromkeys(by_title.get(key, []) + by_title.get(ALIASES.get(key, ""), [])))
        # Never reuse another programme's syllabus as evidence, even when subject titles match.
        expected_program = "BCA" if str(s["CourseId"]) == "18" else "MCA" if str(s["CourseId"]) == "19" else ""
        if expected_program:
            matches = [p for p in matches if p.relative_to(PDF_DIR).parts[0].upper() == expected_program]
        evidence = [evidence_by_path[p] for p in matches]
        proposed, marks = "", ""
        if not matches:
            status = "UNRESOLVED_NO_EXACT_PDF"
        else:
            statuses = {e["status"] for e in evidence}
            mark_values = {e["marks"] for e in evidence if e["marks"] != ""}
            if len(statuses) == 1 and len(mark_values) == 1 and next(iter(statuses)) == "ESE_MARKS_0":
                status, proposed, marks = "CONFIRMED_ESE_ZERO", "true", next(iter(mark_values))
            elif len(statuses) == 1 and len(mark_values) == 1 and next(iter(statuses)) == "ESE_MARKS_POSITIVE":
                status, proposed, marks = "CONFIRMED_ESE_POSITIVE", "false", next(iter(mark_values))
            else:
                status = "UNRESOLVED_PDF_CONFLICT_OR_UNREADABLE"
                marks = "|".join(sorted(mark_values))
        current = str(s["isDepartmentalSubject"]).strip().lower()
        mismatch = "yes" if proposed and current != proposed else "no" if proposed else ""
        report.append({
            "SubjectId": s["SubjectId"], "CourseId": s["CourseId"], "CourseName": s["CourseName"],
            "SubjectName": title, "current_isDepartmentalSubject": current,
            "ESE_marks": marks, "proposed_isDepartmentalSubject": proposed,
            "audit_status": status, "flag_mismatch": mismatch,
            "matched_PDFs": " | ".join(str(p.relative_to(PDF_DIR)) for p in matches),
            "evidence": " || ".join(e["evidence"] for e in evidence)
        })
    fields = list(report[0].keys()) if report else []
    with OUT_CSV.open("w", newline="", encoding="utf-8-sig") as f:
        w=csv.DictWriter(f, fieldnames=fields); w.writeheader(); w.writerows(report)
    counts = Counter(r["audit_status"] for r in report)
    summary = {
        "department": "Computer Applications (BCA and MCA)",
        "scope": {"subjects": len(report), "courses": sorted({r["CourseName"] for r in report})},
        "audit_status_counts": dict(counts),
        "confirmed_classifications": sum(bool(r["proposed_isDepartmentalSubject"]) for r in report),
        "confirmed_mismatches": sum(r["flag_mismatch"] == "yes" for r in report),
        "unresolved_subjects": sum(not r["proposed_isDepartmentalSubject"] for r in report),
        "rule": "ESE=0 => isDepartmentalSubject=true; positive ESE => false; unresolved evidence remains unchanged.",
        "database_writes": 0,
        "note": "This workflow audits repository PDFs against a snapshot. It does not update Supabase; review the CSV and apply only evidence-backed changes."
    }
    OUT_JSON.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))

if __name__ == "__main__":
    main()
