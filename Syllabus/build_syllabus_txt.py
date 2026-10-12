#!/usr/bin/env python3
"""Extract the Diploma Computer Engineering syllabus PDFs into semester JSON files.

Reads the already checked-in, PDF-verified syllabus collection and the active catalog.
Does not read from Supabase, make network requests, or modify source PDFs.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import fitz  # PyMuPDF


ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "global-exam-prep/temp_removed_subjects/diploma_active_syllabus_catalog_2026-10-12.csv"
PDF_ROOT = (
    ROOT
    / "Syllabus/Diploma_Full_Collection_1/Marwadi_Official_Diploma_Collector/"
      "Marwadi_Diploma_Syllabus_Collection/Verified_Syllabi/Diploma Computer Engineering/"
      "Semester_Unspecified"
)
OUTPUT_ROOT = ROOT / "Syllabus/syllabus_txt/Diploma/Computer_Engineering"
COURSE_ID = 44
COURSE_NAME = "Diploma Computer Engineering"

STOP_CONTENTS = (
    "suggested theory distribution",
    "references:",
    "recommended books:",
    "textbook",
    "supplementary resources",
    "instructional method",
    "digitally signed by",
    "course outcomes",
    "teaching and examination scheme",
)


def clean_text(text: str) -> str:
    """Normalize extraction artefacts without deleting syllabus information."""
    text = text.replace("\x00", "")
    text = text.replace("\u00ad", "")
    text = text.replace("\ufeff", "")
    # Remove non-printing control characters, keeping tab/newline.
    text = "".join(ch for ch in text if ch in "\n\r\t" or ord(ch) >= 32)
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    return text.strip()


def clean_lines(text: str) -> list[str]:
    return [re.sub(r"\s+", " ", line).strip() for line in clean_text(text).split("\n")
            if re.sub(r"\s+", " ", line).strip()]


def find_between(text: str, start_pattern: str, end_patterns: list[str]) -> str:
    start = re.search(start_pattern, text, flags=re.IGNORECASE | re.DOTALL)
    if not start:
        return ""
    tail = text[start.end():]
    ends = []
    for pattern in end_patterns:
        match = re.search(pattern, tail, flags=re.IGNORECASE)
        if match:
            ends.append(match.start())
    return tail[:min(ends)] if ends else tail


def split_numbered_items(section: str) -> list[str]:
    """Split a numbered PDF section while retaining wrapped lines and wording."""
    lines = clean_lines(section)
    if not lines:
        return []
    items: list[str] = []
    current: list[str] = []
    for line in lines:
        # The source PDFs usually place each numbered outcome/objective on its own line.
        match = re.match(r"^\d{1,2}\s+(?!\d+\.\d)(.+)$", line)
        if match and (len(line) > 3):
            if current:
                items.append(" ".join(current).strip())
            current = [match.group(1).strip()]
        else:
            current.append(line)
    if current:
        items.append(" ".join(current).strip())
    # Drop only empty or table-heading fragments.
    return [item for item in items if item and item.lower() not in {
        "after completion of this course, student will be able to:",
        "students will be able to",
    }]


def parse_unit_blocks(text: str) -> dict[str, list[dict[str, Any]]]:
    """Read repeated Contents blocks into theory/practical unit structures.

    The original page text is preserved separately, so this parser is a readable
    index rather than a lossy replacement for the source.
    """
    lines = clean_lines(text)
    sections: dict[str, list[dict[str, Any]]] = {"theory": [], "practical": []}
    active = False
    block_type = "theory"
    current: dict[str, Any] | None = None
    in_experiment_list = False

    def flush() -> None:
        nonlocal current
        if current:
            topic_lines = [x for x in current.pop("_topic_lines", []) if x]
            current["topic_lines"] = topic_lines
            current["topics_text"] = " ".join(topic_lines).strip()
            # Keep a useful list view alongside the source-like topic text.
            topics: list[str] = []
            for raw in topic_lines:
                pieces = re.split(r"\s*[•●▪]\s*|\s*;\s*", raw)
                topics.extend(p.strip(" \t-•") for p in pieces if p.strip(" \t-•"))
            current["topics"] = topics
            sections[block_type].append(current)
            current = None

    unit_heading = re.compile(
        r"^(\d{1,2})\s+(?!\d+\.\d)([A-Za-z][A-Za-z0-9 \-/&()–—:,.+'’]*?)\s*$"
    )

    for line in lines:
        low = line.lower()

        if "suggested list of experiments" in low:
            flush()
            in_experiment_list = True
            active = False
            block_type = "practical"
            continue

        if re.match(r"^contents\s*:?\s*$", low):
            flush()
            active = True
            block_type = "practical" if in_experiment_list else "theory"
            continue

        if active and any(low.startswith(stop) for stop in STOP_CONTENTS):
            flush()
            active = False
            continue

        if not active:
            continue

        if low.startswith("unit topics") or low.startswith("unit   topics") or low == "total hours":
            continue
        if low.startswith("lecture (hours)") or low.startswith("contact hours"):
            continue

        match = unit_heading.match(line)
        if match:
            # Prevent common prose labels from becoming unit titles.
            title = match.group(2).strip(" :-")
            if title and title.lower() not in {"topics", "contact hours", "total hours"}:
                flush()
                current = {
                    "unit_number": int(match.group(1)),
                    "title": title,
                    "contact_hours": None,
                    "_topic_lines": [],
                }
                continue

        # Most syllabus tables put the unit's total hours on a separate numeric line.
        if current and line.isdigit() and current["contact_hours"] is None:
            n = int(line)
            if 0 <= n <= 100:
                current["contact_hours"] = n
                continue

        if current:
            if line not in {"Unit Topics Contact Hours", "Unit Topics"}:
                current["_topic_lines"].append(line)

    flush()
    return sections


def extract_references(text: str) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    labels = [
        ("references", r"References\s*:", r"(?:Suggested List of Experiments|Textbook\s*:|Supplementary Resources|Instructional Method|Suggested Theory Distribution)"),
        ("textbooks", r"Textbook\s*:", r"(?:Supplementary Resources|Instructional Method|Suggested Theory Distribution|Digitally signed by)"),
        ("recommended_books", r"Recommended Books\s*:", r"(?:Supplementary Resources|Instructional Method|Suggested Theory Distribution|Digitally signed by)"),
        ("supplementary_resources", r"Supplementary Resources\s*:", r"(?:Instructional Method|Suggested Theory Distribution|Digitally signed by)"),
    ]
    for key, start, end in labels:
        section = find_between(text, start, [end])
        items = []
        for line in clean_lines(section):
            if line.lower().startswith(("digitally signed", "mr.", "dr.")):
                continue
            if re.match(r"^\d+\s+", line):
                items.append(re.sub(r"^\d+\s+", "", line).strip())
            elif line and items:
                items[-1] += " " + line
        result[key] = items
    return result


def extract_scheme(text: str) -> str:
    section = find_between(
        text,
        r"Teaching and Examination Scheme",
        [r"Contents\s*:?", r"INSTITUTE DIPLOMA STUDIES", r"Suggested Theory Distribution"],
    )
    return " ".join(clean_lines(section))


def pick_pdf(subject_code: str, subject_name: str) -> tuple[Path | None, list[str]]:
    warnings: list[str] = []
    if not PDF_ROOT.exists():
        return None, [f"PDF directory not found: {PDF_ROOT.relative_to(ROOT)}"]
    matches = [
        path for path in PDF_ROOT.glob("*.pdf")
        if path.name.upper().startswith(subject_code.upper() + " ")
        or path.name.upper().startswith(subject_code.upper() + " -")
    ]
    if not matches:
        # A small number of Windows-imported names omit the expected separator.
        matches = [path for path in PDF_ROOT.glob("*.pdf")
                   if path.name.upper().startswith(subject_code.upper())]
    if not matches:
        return None, [f"No checked-in PDF matched subject code {subject_code}."]

    def rank(path: Path) -> tuple[int, int, str]:
        stem = path.stem.lower()
        name = subject_name.lower().replace("/", " ")
        title_match = 0 if name and name in stem else 1
        # Prefer the shortest title-labelled file over duplicate "course outline" files.
        outline_penalty = 1 if "course outline" in stem or "re course outline" in stem else 0
        return (title_match + outline_penalty, len(path.name), path.name.lower())

    matches.sort(key=rank)
    if len(matches) > 1:
        warnings.append(
            "Multiple PDFs share this subject-code prefix; selected "
            f"{matches[0].name!r} from {len(matches)} candidates."
        )
    return matches[0], warnings


def extract_subject(row: dict[str, str]) -> dict[str, Any]:
    subject_id = str(row["subject_id"])
    name = row["subject_name"]
    code = row["source_subject_code"]
    pdf_path, warnings = pick_pdf(code, name)

    base: dict[str, Any] = {
        "subject_id": subject_id,
        "subject_name": name,
        "course_id": int(row["course_id"]),
        "course_name": row["course_name"],
        "semester": int(row["semester"]),
        "subject_code": code,
        "catalog_status": row.get("source_status", ""),
        "catalog_action": row.get("planned_action", ""),
        "source_pdf_url": row.get("source_pdf_url", ""),
        "source_pdf_repo_path": (
            pdf_path.relative_to(ROOT).as_posix() if pdf_path else None
        ),
        "expected_pdf_sha256": row.get("pdf_sha256", ""),
        "extraction_method": "PyMuPDF native PDF text layer; no OCR",
        "extraction_status": "PDF_NOT_FOUND",
        "official_document_metadata": {
            "course_title": None,
            "course_code": None,
            "semester_label": None,
            "credits": None,
            "prerequisite": None,
        },
        "objectives": [],
        "course_outcomes": [],
        "teaching_and_examination_scheme_text": "",
        "contents": {"theory_units": [], "practical_units": []},
        "references": {},
        "page_count": 0,
        "extracted_character_count": 0,
        "source_text_by_page": [],
        "warnings": warnings,
    }
    if not pdf_path:
        return base

    try:
        actual_sha = hashlib.sha256(pdf_path.read_bytes()).hexdigest()
        base["actual_pdf_sha256"] = actual_sha
        if row.get("pdf_sha256") and actual_sha.lower() != row["pdf_sha256"].lower():
            base["warnings"].append(
                "SHA-256 of checked-in PDF differs from the catalog's source-PDF hash."
            )
        with fitz.open(pdf_path) as doc:
            page_texts = [clean_text(page.get_text("text", sort=True)) for page in doc]
        full_text = "\n\n".join(
            f"[PAGE {i + 1}]\n{page_text}" for i, page_text in enumerate(page_texts)
        ).strip()
        base["page_count"] = len(page_texts)
        base["extracted_character_count"] = len(full_text)
        base["source_text_by_page"] = [
            {"page": i + 1, "text": text} for i, text in enumerate(page_texts)
        ]

        official_title = re.search(r"COURSE TITLE\s*[:\-]?\s*([^\n]+)", full_text, re.I)
        official_code = re.search(r"COURSE CODE\s*[:\-]?\s*([A-Z0-9]+)", full_text, re.I)
        official_semester = re.search(r"\bSEMESTER\s+([A-Z0-9IVX]+)\b", full_text, re.I)
        credits = re.search(r"COURSE CREDITS\s*[:\-]?\s*([0-9.]+)", full_text, re.I)
        prereq = find_between(
            full_text, r"Pre-requisite of course\s*:\s*", [
                r"Contents\s*:?", r"Teaching and Examination Scheme",
                r"Digitally signed by",
            ],
        )
        base["official_document_metadata"] = {
            "course_title": official_title.group(1).strip() if official_title else None,
            "course_code": official_code.group(1).strip() if official_code else None,
            "semester_label": official_semester.group(1).strip() if official_semester else None,
            "credits": float(credits.group(1)) if credits and "." in credits.group(1)
                       else int(credits.group(1)) if credits else None,
            "prerequisite": " ".join(clean_lines(prereq)) or None,
        }

        objectives = find_between(
            full_text, r"Objective\s*:\s*",
            [r"Course Outcomes\s*:", r"Teaching and Examination Scheme", r"Contents\s*:?"],
        )
        outcomes = find_between(
            full_text, r"Course Outcomes\s*:",
            [r"Teaching and Examination Scheme", r"Contents\s*:?"],
        )
        base["objectives"] = split_numbered_items(objectives) or (
            [" ".join(clean_lines(objectives))] if clean_lines(objectives) else []
        )
        base["course_outcomes"] = split_numbered_items(outcomes)
        base["teaching_and_examination_scheme_text"] = extract_scheme(full_text)
        base["contents"] = parse_unit_blocks(full_text)
        base["references"] = extract_references(full_text)

        if base["extracted_character_count"] < 150:
            base["extraction_status"] = "LOW_TEXT_LAYER_OCR_REVIEW_NEEDED"
            base["warnings"].append(
                "Very little machine-readable text was extracted; inspect/ OCR this PDF."
            )
        elif not (base["contents"]["theory_units"] or base["contents"]["practical_units"]):
            base["extraction_status"] = "TEXT_EXTRACTED_CONTENTS_NEED_MANUAL_REVIEW"
            base["warnings"].append(
                "PDF text was extracted, but its Contents tables could not be confidently parsed."
            )
        else:
            base["extraction_status"] = "TEXT_EXTRACTED_AND_STRUCTURED"
        if base["official_document_metadata"]["course_code"] and (
            base["official_document_metadata"]["course_code"].upper() != code.upper()
        ):
            base["warnings"].append(
                "Official PDF course code differs from catalog code; inspect source mapping."
            )
        if base["official_document_metadata"]["semester_label"]:
            label = base["official_document_metadata"]["semester_label"].upper()
            roman_map = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6}
            if label in roman_map and roman_map[label] != int(row["semester"]):
                base["warnings"].append(
                    "Official PDF semester label differs from active catalog semester."
                )
    except Exception as exc:  # keep other subjects buildable if one PDF is malformed
        base["extraction_status"] = "EXTRACTION_ERROR"
        base["warnings"].append(f"{type(exc).__name__}: {exc}")
    return base


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--course-id", type=int, default=COURSE_ID)
    args = parser.parse_args()

    if not CATALOG.exists():
        raise FileNotFoundError(f"Active catalog not found: {CATALOG}")
    with CATALOG.open("r", encoding="utf-8-sig", newline="") as handle:
        catalog = list(csv.DictReader(handle))
    rows = [
        row for row in catalog
        if int(row.get("course_id", 0) or 0) == args.course_id
    ]
    if not rows:
        raise RuntimeError(f"No active subjects for CourseId {args.course_id}")
    rows.sort(key=lambda r: (int(r["semester"]), r["subject_name"].casefold(), r["subject_id"]))

    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    generated = datetime.now(timezone.utc).isoformat(timespec="seconds")
    grouped: dict[int, list[dict[str, Any]]] = {}
    for row in rows:
        grouped.setdefault(int(row["semester"]), []).append(extract_subject(row))

    for semester in range(1, 7):
        subjects = grouped.get(semester, [])
        payload = {
            "schema_version": "1.0",
            "generated_at_utc": generated,
            "extraction_method": (
                "PyMuPDF text-layer extraction from PDFs checked into this repository. "
                "Unit/topic parsing is a readable index; source_text_by_page preserves "
                "the extracted page text for auditing. Scanned PDFs are flagged for OCR review."
            ),
            "source_catalog": CATALOG.relative_to(ROOT).as_posix(),
            "course": {"course_id": args.course_id, "course_name": COURSE_NAME},
            "semester": semester,
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
        destination = OUTPUT_ROOT / f"semester_{semester}.json"
        destination.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(
            f"{destination.relative_to(ROOT)}: {len(subjects)} subjects; "
            f"{payload['build_summary']}"
        )
    print(f"Generated 6 semester JSON files for {len(rows)} active Computer Engineering subjects.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
