#!/usr/bin/env python3
"""Read-only ESE assessment audit for Management Studies syllabus PDFs."""
import csv, json, re, unicodedata
from collections import defaultdict
from pathlib import Path
import fitz

ROOT=Path(__file__).resolve().parents[2]
INDEX=ROOT/"Syllabus/syllabus_txt/Management_Studies/index.json"
PDF_DIR=ROOT/"Syllabus/Management_Studies_Recovery_Kit_1/Management_Studies_Syllabus_Recovery_Kit/Output/Verified_PDFs/Tier_1"
OUT=Path(__file__).resolve().parent

def norm(s):
    s=unicodedata.normalize("NFKD",s or "").encode("ascii","ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+","",s)

def evidence(path):
    try: doc=fitz.open(path)
    except Exception as e: return {"status":"PDF_OPEN_ERROR","marks":"","evidence":str(e)}
    obs=[]
    with doc:
        for pn,page in enumerate(doc,1):
            text=re.sub(r"\s+"," ",page.get_text("text",sort=True) or "").lower()
            if "teaching and examination scheme" not in text and "teaching scheme" not in text: continue
            words=page.get_text("words",sort=True)
            headers=[w for w in words if re.sub(r"[^a-z]","",str(w[4]).lower())=="ese"]
            nums=[]
            for w in words:
                raw=str(w[4]).strip().replace(",","")
                if re.fullmatch(r"\d+(?:\.\d+)?",raw):
                    val=float(raw)
                    if 0<=val<=100: nums.append((w,val,raw))
            for h in headers:
                hx,hy=(float(h[0])+float(h[2]))/2,(float(h[1])+float(h[3]))/2
                candidates=[]
                for w,val,raw in nums:
                    x,y=(float(w[0])+float(w[2]))/2,(float(w[1])+float(w[3]))/2
                    dy,dx=y-hy,abs(x-hx)
                    if 1<=dy<=65 and dx<=55: candidates.append((dy+1.35*dx,val,raw))
                if candidates:
                    candidates.sort()
                    obs.append((candidates[0][1],pn,candidates[0][2],round(candidates[0][0],1)))
    if not obs: return {"status":"ESE_NOT_FOUND","marks":"","evidence":"No unambiguous numeric ESE value found beneath an ESE header."}
    vals=sorted(set(x[0] for x in obs))
    details="; ".join(f"page {pn}: ESE={raw} (score {score})" for _,pn,raw,score in obs)
    if len(vals)!=1: return {"status":"ESE_CONFLICT","marks":"|".join(map(str,vals)),"evidence":details}
    v=vals[0]
    return {"status":"ESE_MARKS_0" if v==0 else "ESE_MARKS_POSITIVE","marks":str(int(v) if v.is_integer() else v),"evidence":details}

def main():
    index=json.loads(INDEX.read_text(encoding="utf-8"))
    pdfs=sorted(PDF_DIR.glob("*.pdf")) if PDF_DIR.exists() else []
    byname=defaultdict(list); cache={}
    for p in pdfs:
        name=re.sub(r"\s+\[[0-9a-fA-F]{8,}\]$","",p.stem).strip()
        byname[norm(name)].append(p); cache[p]=evidence(p)
    report=[]
    for course in index.get("courses",[]):
        for jf in course.get("semester_files",[]):
            path=ROOT/jf
            if not path.exists(): continue
            data=json.loads(path.read_text(encoding="utf-8"))
            for sub in data.get("subjects",[]):
                matches=byname.get(norm(sub.get("subject_name","")),[])
                ev=[cache[p] for p in matches]
                statuses={x["status"] for x in ev}; marks={x["marks"] for x in ev if x["marks"]}
                proposed=""
                if matches and len(statuses)==1 and len(marks)==1:
                    st=next(iter(statuses))
                    if st=="ESE_MARKS_0": proposed="true"
                    elif st=="ESE_MARKS_POSITIVE": proposed="false"
                status=("CLASSIFIED_NO_ESE" if proposed=="true" else "CLASSIFIED_HAS_ESE" if proposed=="false" else "UNRESOLVED_NO_EXACT_PDF" if not matches else "UNRESOLVED_PDF_EVIDENCE")
                report.append({"CourseId":sub.get("subject_id",""),"CourseName":sub.get("course_name",course.get("course_name","")),"Semester":sub.get("semester",""),"SubjectId":sub.get("subject_id",""),"SubjectName":sub.get("subject_name",""),"SubjectCode":sub.get("subject_code",""),"ESEMarks":"|".join(sorted(marks)),"ProposedIsDepartmentalSubject":proposed,"AuditStatus":status,"Reason":"; ".join(f'{p.name}: {x["status"]} marks={x["marks"]} {x["evidence"]}' for p,x in zip(matches,ev)) if matches else "No exact-name Tier 1 PDF found","SourceJSON":jf,"SourcePDF":" | ".join(p.name for p in matches)})
    report_path=OUT/"management_studies_ese_audit.csv"
    with report_path.open("w",encoding="utf-8-sig",newline="") as f:
        w=csv.DictWriter(f,fieldnames=list(report[0].keys()) if report else ["CourseId","CourseName","Semester","SubjectId","SubjectName","SubjectCode","ESEMarks","ProposedIsDepartmentalSubject","AuditStatus","Reason","SourceJSON","SourcePDF"])
        w.writeheader();w.writerows(report)
    classified=[r for r in report if r["ProposedIsDepartmentalSubject"] in ("true","false")]
    summary={"subjects_in_syllabus_index":len(report),"tier1_pdfs_found":len(pdfs),"classified_no_ese_true":sum(r["ProposedIsDepartmentalSubject"]=="true" for r in classified),"classified_has_ese_false":sum(r["ProposedIsDepartmentalSubject"]=="false" for r in classified),"unresolved":len(report)-len(classified),"database_updates_performed":0,"note":"Read-only report. Do not update Supabase from subject names alone; reconcile these rows against public.Subjects and verify ambiguous PDF table extraction first."}
    (OUT/"management_studies_ese_audit_summary.json").write_text(json.dumps(summary,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(summary,indent=2))
if __name__=="__main__": main()
