#!/usr/bin/env python3
"""Build Management Studies semester syllabus JSON from the checked-in PDF manifest.

Uses only PDFs already present in this repository. Subjects without a verified
local PDF remain in the JSON with an explicit status and warning; no syllabus
content is fabricated and no network/database calls are made.
"""
from __future__ import annotations

import csv
import hashlib
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import fitz  # PyMuPDF

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "Syllabus/Management_Studies_Recovery_Kit_1/Management_Studies_Syllabus_Recovery_Kit/Output/subject_occurrence_report.csv"
UNIQUE_MANIFEST = ROOT / "Syllabus/Management_Studies_Recovery_Kit_1/Management_Studies_Syllabus_Recovery_Kit/Output/unique_download_list.csv"
PDF_ROOT = ROOT / "Syllabus/Management_Studies_Recovery_Kit_1/Management_Studies_Syllabus_Recovery_Kit/Output"
OUTPUT_ROOT = ROOT / "Syllabus/syllabus_txt/Management_Studies"
EXTRACTION_METHOD = "PyMuPDF native PDF text-layer extraction; no OCR"

COURSE_SLUGS = {
    "mba": "MBA",
    "bba": "BBA",
    "bba-hons-": "BBA_Hons",
    "b-com": "BCom",
    "bba-in-global-business-management": "BBA_Global_Business_Management",
    "bba-aviation": "BBA_Aviation",
    "bba-business-analytics-": "BBA_Business_Analytics",
    "bba-digital-marketing-": "BBA_Digital_Marketing",
    "bba-international-business-": "BBA_International_Business",
    "mba-business-analytics": "MBA_Business_Analytics",
}
# The recovery reports include this catalog programme, but it currently has no subject
# occurrences. Keep it visible in the generated tree without inventing subjects/semesters.
EMPTY_COURSES = {
    "master-in-global-business-management": "Master In Global Business Management",
}
STOP_MARKERS = (
    "course outcomes", "learning outcomes", "course objectives",
    "teaching and examination scheme", "references:", "textbook:",
    "text book:", "recommended books", "supplementary resources",
    "suggested readings", "evaluation scheme", "instructional method",
    "question paper pattern", "assessment pattern", "suggested theory distribution",
)

def clean_text(value: str) -> str:
    value = value.replace("\x00", "").replace("\u00ad", "").replace("\ufeff", "")
    value = "".join(ch for ch in value if ch in "\n\r\t" or ord(ch) >= 32)
    return value.replace("\r\n", "\n").replace("\r", "\n").strip()

def clean_lines(value: str) -> list[str]:
    return [re.sub(r"\s+", " ", line).strip()
            for line in clean_text(value).split("\n")
            if re.sub(r"\s+", " ", line).strip()]

def find_between(text: str, start_patterns: list[str], end_patterns: list[str]) -> str:
    start = None
    for pattern in start_patterns:
        start = re.search(pattern, text, flags=re.IGNORECASE | re.DOTALL)
        if start:
            break
    if not start:
        return ""
    tail = text[start.end():]
    ends = [m.start() for p in end_patterns
            if (m := re.search(p, tail, flags=re.IGNORECASE))]
    return tail[:min(ends)] if ends else tail

def split_numbered_items(section: str) -> list[str]:
    items: list[str] = []
    current: list[str] = []
    for line in clean_lines(section):
        match = re.match(r"^\s*(\d{1,2})[.)]?\s+(.+)$", line)
        if match and len(match.group(2)) > 2:
            if current:
                items.append(" ".join(current).strip())
            current = [match.group(2).strip()]
        else:
            current.append(line)
    if current:
        items.append(" ".join(current).strip())
    ignored = {
        "after completion of this course, student will be able to:",
        "students will be able to", "course outcomes",
    }
    return [item for item in items if item and item.lower() not in ignored]

def parse_unit_blocks(text: str) -> dict[str, list[dict[str, Any]]]:
    """Parse explicit unit headings while preserving all original page text elsewhere."""
    result: dict[str, list[dict[str, Any]]] = {"theory_units": [], "practical_units": []}
    active = False
    kind = "theory_units"
    current: dict[str, Any] | None = None

    def flush() -> None:
        nonlocal current
        if current:
            raw_lines = [x for x in current.pop("_topic_lines", []) if x]
            current["topic_lines"] = raw_lines
            current["topics_text"] = " ".join(raw_lines).strip()
            topics: list[str] = []
            for raw in raw_lines:
                topics.extend(p.strip(" \t-•") for p in re.split(r"\s*[•●▪]\s*|\s*;\s*", raw)
                              if p.strip(" \t-•"))
            current["topics"] = topics
            result[kind].append(current)
            current = None

    unit_pattern = re.compile(
        r"^(?:UNIT|MODULE)\s*[-:#.]?\s*(I{1,3}|IV|V?I{0,3}|VI{0,3}|IX|X|\d{1,2})"
        r"(?:\s*[-:.)]\s*|\s+)?(.*)$", re.IGNORECASE
    )
    table_unit_pattern = re.compile(
        r"^(\d{1,2})[.)]?\s+([A-Za-z][A-Za-z0-9 /&()–—:,.+'’\-]{1,120}?)\s+(\d{1,3})$"
    )
    for line in clean_lines(text):
        low = line.lower()
        if re.fullmatch(r"\[page\s+\d+\]", line, flags=re.I):
            continue
        if low.startswith(("digitally signed by", "mr.", "dr.")):
            continue
        if "suggested list of experiments" in low or "practical contents" in low:
            flush()
            kind = "practical_units"
            active = True
            continue
        if any(marker in low for marker in (
            "course contents", "contents of the course", "contents:", "contents :",
            "detailed syllabus", "unit-wise syllabus", "unit wise syllabus",
            "syllabus contents", "course outline", "course structure",
        )):
            active = True
            continue
        explicit = unit_pattern.match(line)
        if explicit:
            active = True
            title = explicit.group(2).strip(" :-")
            number_text = explicit.group(1).upper()
            roman = {"I":1, "II":2, "III":3, "IV":4, "V":5, "VI":6,
                     "VII":7, "VIII":8, "IX":9, "X":10}
            number = int(number_text) if number_text.isdigit() else roman.get(number_text, len(result[kind]) + 1)
            flush()
            current = {"unit_number": number, "title": title or f"Unit {number}",
                       "contact_hours": None, "_topic_lines": []}
            continue
        if not active:
            continue
        if any(low.startswith(marker) for marker in STOP_MARKERS):
            flush()
            active = False
            continue
        numbered = table_unit_pattern.match(line)
        if numbered:
            flush()
            current = {"unit_number": int(numbered.group(1)),
                       "title": numbered.group(2).strip(),
                       "contact_hours": int(numbered.group(3)) if numbered.group(3) else None,
                       "_topic_lines": []}
            continue
        if current:
            if current["contact_hours"] is None and re.fullmatch(r"\d{1,3}", line):
                current["contact_hours"] = int(line)
            elif low not in {"unit", "unit topics", "unit topics contact hours", "total hours"}:
                current["_topic_lines"].append(line)
    flush()
    return result

def extract_references(text: str) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    specs = {
        "references": ([r"\bReferences\s*:"], [r"Text\s*Books?\s*:", r"Supplementary Resources", r"Instructional Method", r"Suggested Theory Distribution"]),
        "textbooks": ([r"\bText\s*Books?\s*:"], [r"References\s*:", r"Supplementary Resources", r"Instructional Method", r"Suggested Theory Distribution"]),
        "recommended_books": ([r"Recommended Books?\s*:"], [r"Supplementary Resources", r"Instructional Method", r"Suggested Theory Distribution"]),
        "supplementary_resources": ([r"Supplementary Resources\s*:"], [r"Instructional Method", r"Suggested Theory Distribution"]),
    }
    for key, (starts, ends) in specs.items():
        section = find_between(text, starts, ends)
        items: list[str] = []
        for line in clean_lines(section):
            if line.lower().startswith(("digitally signed", "mr.", "dr.")):
                continue
            if re.match(r"^\d+\s+", line):
                items.append(re.sub(r"^\d+\s+", "", line).strip())
            elif items:
                items[-1] += " " + line
        result[key] = items
    return result

def get_semester(value: str) -> int | None:
    value = str(value or "").strip()
    if value.isdigit():
        return int(value)
    roman = {"I":1, "II":2, "III":3, "IV":4, "V":5, "VI":6,
             "VII":7, "VIII":8, "IX":9, "X":10}
    return roman.get(value.upper())

def course_slug(course_id: str, course_name: str) -> str:
    return COURSE_SLUGS.get(course_id, re.sub(r"[^A-Za-z0-9]+", "_", course_name).strip("_") or "Unknown_Course")

def extract_subject(row: dict[str, str], generated: str) -> dict[str, Any]:
    subject_id = str(row.get("source_subject_id") or "")
    subject_name = str(row.get("subject_title") or "").strip()
    course_id = str(row.get("source_course_id") or "")
    course_name = str(row.get("course_title") or "")
    semester = get_semester(row.get("semester", ""))
    occurrence_status = str(row.get("occurrence_review_status") or "").strip()
    unique_status = str(row.get("unique_title_status") or "").strip()
    candidate_path = str(row.get("selected_pdf_file") or "").strip()
    candidate_url = str(row.get("selected_pdf_url") or "")
    candidate_repo_path = (PDF_ROOT / candidate_path).relative_to(ROOT).as_posix() if candidate_path else None
    course_code_evidence = [x.strip() for x in str(row.get("course_code_evidence") or "").split("|") if x.strip()]
    declared_codes = [x.strip() for x in str(row.get("pdf_declared_codes") or "").split("|") if x.strip()]
    raw_hash = str(row.get("sha256") or "").strip().lower()
    note = str(row.get("note") or "").strip()

    # Duplicate title matches must not be applied to every course automatically.
    # Only occurrence rows explicitly verified for this course may use the mapped PDF.
    approved = occurrence_status == "VERIFIED_MARWADI" and unique_status == "VERIFIED_MARWADI" and bool(candidate_path)
    pdf_path = (PDF_ROOT / candidate_path) if approved and candidate_path else None
    source_code = declared_codes[0] if approved and declared_codes else ""
    status = unique_status or "UNRESOLVED"
    question_use = "YES_VERIFIED_MARWADI_OCCURRENCE" if approved else f"NO_{occurrence_status or 'UNRESOLVED'}"

    warnings: list[str] = []
    if not approved:
        if occurrence_status == "DUPLICATE_TITLE_PDF_MATCHED_A_VARIANT_REVIEW_THIS_COURSE":
            warnings.append("A same-title PDF was matched to another course variant; this occurrence was not verified, so its content was intentionally not used.")
        elif occurrence_status == "DUPLICATE_TITLE_PDF_DOES_NOT_MATCH_THIS_COURSE_CODE":
            warnings.append("The selected same-title PDF's course-code evidence does not match this course occurrence; its content was intentionally not used.")
        elif occurrence_status == "FAILED_NO_MATCHING_OFFICIAL_PDF":
            warnings.append("No acceptable official syllabus PDF was verified for this occurrence in the recovery run.")
        else:
            warnings.append(note or "The selected title-level PDF was not verified for this exact course/semester occurrence; syllabus content was not inferred.")
    if not pdf_path or not pdf_path.is_file():
        if approved:
            warnings.append("The occurrence is marked verified, but its mapped PDF is not present at the expected repository path.")
        return {
            "subject_id": subject_id, "subject_name": subject_name,
            "course_id": course_id, "course_name": course_name,
            "semester": semester, "subject_code": source_code,
            "course_code_evidence": course_code_evidence,
            "catalog_status": status, "catalog_action": occurrence_status,
            "source_pdf_url": candidate_url if approved else None,
            "candidate_pdf_url": candidate_url or None,
            "source_pdf_repo_path": None, "candidate_pdf_repo_path": candidate_repo_path,
            "expected_pdf_sha256": raw_hash or None,
            "extraction_method": EXTRACTION_METHOD, "extraction_status": "PDF_NOT_FOUND",
            "official_document_metadata": {
                "course_title": None, "course_code": None, "semester_label": None,
                "credits": None, "prerequisite": None,
            },
            "objectives": [], "course_outcomes": [],
            "teaching_and_examination_scheme_text": "",
            "contents": {"theory_units": [], "practical_units": []},
            "references": {"references": [], "textbooks": [], "recommended_books": [], "supplementary_resources": []},
            "page_count": 0, "extracted_character_count": 0, "source_text_by_page": [],
            "warnings": warnings, "pdf_verification_status": occurrence_status or "UNRESOLVED",
            "question_generation_use": question_use,
        }

    try:
        raw_bytes = pdf_path.read_bytes()
        actual_hash = hashlib.sha256(raw_bytes).hexdigest()
        if raw_hash and actual_hash.lower() != raw_hash:
            warnings.append("Local PDF SHA-256 differs from the occurrence report's recorded PDF SHA-256.")
        with fitz.open(stream=raw_bytes, filetype="pdf") as doc:
            page_texts = [clean_text(page.get_text("text", sort=True)) for page in doc]
        full_text = "\n\n".join(f"[PAGE {i + 1}]\n{page}" for i, page in enumerate(page_texts)).strip()
        compact_text = "\n".join(page_texts)
        title_match = re.search(r"(?:COURSE|SUBJECT)\s+TITLE\s*[:\-]?\s*([^\n]+)|(?:COURSE|SUBJECT)\s+NAME\s*[:\-]?\s*([^\n]+)", compact_text, re.I)
        title_value = next((x.strip() for x in title_match.groups() if x and x.strip()), None) if title_match else None
        code_match = re.search(r"(?:COURSE|SUBJECT)\s+CODE\s*[:\-]?\s*([A-Z0-9][A-Z0-9./\-]{2,})|(?:COURSE|SUBJECT)\s+ID\s*[:\-]?\s*([A-Z0-9][A-Z0-9./\-]{2,})", compact_text, re.I)
        code_value = next((x.strip() for x in code_match.groups() if x and x.strip()), None) if code_match else None
        sem_match = re.search(r"\bSEMESTER\s*[:\-]?\s*(X|IX|VIII|VII|VI|V|IV|III|II|I|10|[1-9])\b", compact_text, re.I)
        sem_label = sem_match.group(1).upper() if sem_match else None
        credits_match = re.search(r"\b(?:COURSE\s+)?CREDITS?\s*[:\-]?\s*([0-9]+(?:\.[0-9]+)?)", compact_text, re.I)
        prerequisite = find_between(compact_text,
            [r"Pre[- ]requisites?\s*:\s*", r"Prerequisites?\s*:\s*", r"Pre-requisite of course\s*:\s*"],
            [r"Contents", r"Course Outcomes", r"Teaching and Examination Scheme", r"References", r"Text Books?"])
        objectives_text = find_between(compact_text,
            [r"Course Objectives?\s*:\s*", r"Objectives?\s*:\s*", r"Aim\s*:\s*"],
            [r"Course Outcomes", r"Learning Outcomes", r"Contents", r"Teaching and Examination Scheme", r"References"])
        outcomes_text = find_between(compact_text,
            [r"Course Outcomes?\s*:\s*", r"Learning Outcomes?\s*:\s*"],
            [r"Contents", r"Teaching and Examination Scheme", r"References", r"Text Books?"])
        scheme = find_between(compact_text, [r"Teaching and Examination Scheme"], [r"Contents", r"Detailed Syllabus", r"Unit\s+(?:I|1)", r"References"])
        content = parse_unit_blocks(compact_text)
        base = {
            "subject_id": subject_id, "subject_name": subject_name,
            "course_id": course_id, "course_name": course_name,
            "semester": semester, "subject_code": source_code or code_value or "",
            "course_code_evidence": course_code_evidence,
            "catalog_status": status, "catalog_action": occurrence_status,
            "source_pdf_url": candidate_url, "candidate_pdf_url": candidate_url,
            "source_pdf_repo_path": candidate_repo_path, "candidate_pdf_repo_path": candidate_repo_path,
            "expected_pdf_sha256": raw_hash or None,
            "extraction_method": EXTRACTION_METHOD,
            "extraction_status": "TEXT_EXTRACTED_AND_STRUCTURED",
            "official_document_metadata": {
                "course_title": title_value, "course_code": code_value,
                "semester_label": sem_label,
                "credits": float(credits_match.group(1)) if credits_match and "." in credits_match.group(1) else int(credits_match.group(1)) if credits_match else None,
                "prerequisite": " ".join(clean_lines(prerequisite)) or None,
            },
            "objectives": split_numbered_items(objectives_text) or ([" ".join(clean_lines(objectives_text))] if clean_lines(objectives_text) else []),
            "course_outcomes": split_numbered_items(outcomes_text),
            "teaching_and_examination_scheme_text": " ".join(clean_lines(scheme)),
            "contents": content, "references": extract_references(compact_text),
            "page_count": len(page_texts), "extracted_character_count": len(full_text),
            "source_text_by_page": [{"page": i + 1, "text": page} for i, page in enumerate(page_texts)],
            "warnings": warnings, "actual_pdf_sha256": actual_hash,
            "pdf_verification_status": occurrence_status,
            "question_generation_use": question_use,
        }
        if len(compact_text.strip()) < 180:
            base["extraction_status"] = "LOW_TEXT_LAYER_OCR_REVIEW_NEEDED"
            base["warnings"].append("Very little machine-readable text was extracted; inspect/OCR this PDF.")
        elif not (content["theory_units"] or content["practical_units"]):
            base["extraction_status"] = "TEXT_EXTRACTED_CONTENTS_NEED_MANUAL_REVIEW"
            base["warnings"].append("PDF text was extracted, but unit/topic structure could not be confidently parsed.")
        if sem_label and semester is not None:
            official_sem = get_semester(sem_label)
            if official_sem is not None and official_sem != semester:
                base["warnings"].append("Official PDF semester differs from the catalog semester.")
        if source_code and code_value and source_code.casefold() != code_value.casefold():
            base["warnings"].append("PDF metadata course code differs from the declared code in the reports.")
        return base
    except Exception as exc:
        return {
            "subject_id": subject_id, "subject_name": subject_name,
            "course_id": course_id, "course_name": course_name,
            "semester": semester, "subject_code": source_code,
            "course_code_evidence": course_code_evidence,
            "catalog_status": status, "catalog_action": occurrence_status,
            "source_pdf_url": candidate_url, "candidate_pdf_url": candidate_url or None,
            "source_pdf_repo_path": candidate_repo_path, "candidate_pdf_repo_path": candidate_repo_path,
            "expected_pdf_sha256": raw_hash or None,
            "extraction_method": EXTRACTION_METHOD, "extraction_status": "EXTRACTION_ERROR",
            "official_document_metadata": {"course_title": None, "course_code": None, "semester_label": None, "credits": None, "prerequisite": None},
            "objectives": [], "course_outcomes": [], "teaching_and_examination_scheme_text": "",
            "contents": {"theory_units": [], "practical_units": []},
            "references": {"references": [], "textbooks": [], "recommended_books": [], "supplementary_resources": []},
            "page_count": 0, "extracted_character_count": 0, "source_text_by_page": [],
            "warnings": warnings + [f"{type(exc).__name__}: {exc}"],
            "pdf_verification_status": occurrence_status, "question_generation_use": question_use,
        }

def main() -> int:
    if not MANIFEST.is_file():
        raise FileNotFoundError(f"Management Studies occurrence report not found: {MANIFEST}")
    if not UNIQUE_MANIFEST.is_file():
        raise FileNotFoundError(f"Management Studies unique-title report not found: {UNIQUE_MANIFEST}")
    with MANIFEST.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    with UNIQUE_MANIFEST.open("r", encoding="utf-8-sig", newline="") as handle:
        unique_rows = list(csv.DictReader(handle))
    unique_by_id = {str(r.get("target_id") or ""): r for r in unique_rows}
    for row in rows:
        unique = unique_by_id.get(str(row.get("target_id") or ""), {})
        row["pdf_declared_codes"] = unique.get("pdf_declared_codes", "")
        # The occurrence status, not title-level success alone, controls PDF use.
        row["_unique_status"] = unique.get("status", "")
        row["unique_title_status"] = unique.get("status", "")
        if not row.get("selected_pdf_file"):
            row["selected_pdf_file"] = unique.get("local_pdf_path", "")
            row["selected_pdf_url"] = unique.get("selected_pdf_url", "")
            row["sha256"] = unique.get("sha256", "")
    if not rows:
        raise RuntimeError("No Management Studies subject occurrences were found in the occurrence report.")
    course_groups: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in rows:
        course_groups[str(row.get("source_course_id") or "")].append(row)
    generated = datetime.now(timezone.utc).isoformat(timespec="seconds")
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    overall: Counter[str] = Counter()
    index_courses: list[dict[str, Any]] = []

    for course_id, course_rows in sorted(course_groups.items(), key=lambda item: item[0]):
        names = {str(r.get("course_title") or "").strip() for r in course_rows}
        if len(names) != 1:
            raise RuntimeError(f"Inconsistent course titles for course_id {course_id}: {names}")
        name = next(iter(names))
        slug = course_slug(course_id, name)
        course_dir = OUTPUT_ROOT / slug
        course_dir.mkdir(parents=True, exist_ok=True)
        by_semester: dict[int | None, list[dict[str, Any]]] = defaultdict(list)
        for row in sorted(course_rows, key=lambda r: (
            get_semester(r.get("semester", "")) is None,
            get_semester(r.get("semester", "")) or 999,
            str(r.get("subject_title") or "").casefold(),
            str(r.get("source_subject_id") or ""),
        )):
            subject = extract_subject(row, generated)
            by_semester[subject["semester"]].append(subject)
            overall[subject["extraction_status"]] += 1

        semester_values = [get_semester(r.get("semester", "")) for r in course_rows]
        known = [v for v in semester_values if v is not None]
        semester_files: list[str] = []
        for sem in sorted({value for value in known if value is not None} or {1}):
            subjects = by_semester.get(sem, [])
            payload = {
                "schema_version": "1.0",
                "generated_at_utc": generated,
                "extraction_method": (
                    "PyMuPDF text-layer extraction from PDFs checked into this repository. "
                    "Unit/topic parsing is a readable index; source_text_by_page preserves "
                    "the extracted page text for auditing. Scanned PDFs are flagged for OCR review."
                ),
                "source_catalog": MANIFEST.relative_to(ROOT).as_posix(),
                "course": {"course_id": course_id, "course_name": name, "output_slug": slug},
                "semester": sem,
                "subject_count": len(subjects),
                "subjects": subjects,
                "build_summary": {
                    "extracted": sum(s["extraction_status"] == "TEXT_EXTRACTED_AND_STRUCTURED" for s in subjects),
                    "manual_review": sum(s["extraction_status"] == "TEXT_EXTRACTED_CONTENTS_NEED_MANUAL_REVIEW" for s in subjects),
                    "ocr_review": sum(s["extraction_status"] == "LOW_TEXT_LAYER_OCR_REVIEW_NEEDED" for s in subjects),
                    "missing_pdf": sum(s["extraction_status"] == "PDF_NOT_FOUND" for s in subjects),
                    "extraction_errors": sum(s["extraction_status"] == "EXTRACTION_ERROR" for s in subjects),
                },
            }
            path = course_dir / f"semester_{sem}.json"
            path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            semester_files.append(path.relative_to(ROOT).as_posix())
            print(f"{path.relative_to(ROOT)}: {len(subjects)} subjects; {payload['build_summary']}")

        if None in by_semester:
            subjects = by_semester[None]
            payload = {
                "schema_version": "1.0", "generated_at_utc": generated,
                "extraction_method": "PyMuPDF text-layer extraction; unknown semester is not inferred.",
                "source_catalog": MANIFEST.relative_to(ROOT).as_posix(),
                "course": {"course_id": course_id, "course_name": name, "output_slug": slug},
                "semester": None, "semester_label": "Unknown (not assigned in source manifest)",
                "subject_count": len(subjects), "subjects": subjects,
                "build_summary": {"extracted": sum(s["extraction_status"] == "TEXT_EXTRACTED_AND_STRUCTURED" for s in subjects),
                                  "missing_pdf": sum(s["extraction_status"] == "PDF_NOT_FOUND" for s in subjects)},
            }
            path = course_dir / "semester_unknown.json"
            path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            semester_files.append(path.relative_to(ROOT).as_posix())

        index_courses.append({
            "course_id": course_id, "course_name": name, "output_slug": slug,
            "subject_count": len(course_rows), "semester_files": semester_files,
            "statuses": dict(sorted(Counter(s["extraction_status"] for group in by_semester.values() for s in group).items())),
        })

    for empty_id, empty_name in EMPTY_COURSES.items():
        if empty_id in course_groups:
            continue
        slug = course_slug(empty_id, empty_name)
        course_dir = OUTPUT_ROOT / slug
        course_dir.mkdir(parents=True, exist_ok=True)
        empty_payload = {
            "schema_version": "1.0",
            "generated_at_utc": generated,
            "extraction_method": "No subject rows were available for this course in the recovery occurrence report; no syllabus content or semester was inferred.",
            "source_catalog": MANIFEST.relative_to(ROOT).as_posix(),
            "course": {"course_id": empty_id, "course_name": empty_name, "output_slug": slug},
            "semester": None,
            "semester_label": "No subject/semester mapping available in source report",
            "subject_count": 0,
            "subjects": [],
            "build_summary": {
                "extracted": 0, "manual_review": 0, "ocr_review": 0,
                "missing_pdf": 0, "extraction_errors": 0,
                "course_status": "NO_SUBJECTS_IN_SOURCE_REPORT",
            },
        }
        empty_path = course_dir / "semester_unknown.json"
        empty_path.write_text(json.dumps(empty_payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        index_courses.append({
            "course_id": empty_id, "course_name": empty_name, "output_slug": slug,
            "subject_count": 0, "semester_files": [empty_path.relative_to(ROOT).as_posix()],
            "statuses": {"NO_SUBJECTS_IN_SOURCE_REPORT": 0},
            "note": "This course exists in the department catalog snapshot but has no subject entries in the recovery occurrence report.",
        })

    index = {
        "schema_version": "1.0", "generated_at_utc": generated,
        "source_catalog": MANIFEST.relative_to(ROOT).as_posix(),
        "domain": "Management Studies", "course_count": len(index_courses),
        "subject_occurrence_count": len(rows), "courses": index_courses,
        "build_summary": dict(sorted(overall.items())),
    }
    (OUTPUT_ROOT / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("OVERALL SUMMARY: " + json.dumps(index["build_summary"], ensure_ascii=False))
    print(f"Generated {len(index_courses)} courses and {sum(len(c['semester_files']) for c in index_courses)} semester JSON files.")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
