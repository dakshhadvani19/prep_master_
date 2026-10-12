#!/usr/bin/env python3
"""Extract consolidated B.Tech syllabus PDFs into program/semester JSON files.

Uses the checked-in program-to-PDF map and shared PDF library. Semester is taken
only from the map's explicit semester field; Unknown remains Unknown. No network
requests, Supabase access, OCR, or source-PDF changes are performed.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import shutil
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import fitz  # PyMuPDF


ROOT = Path(__file__).resolve().parents[1]
COLLECTION_ROOT = ROOT / "Syllabus/B.Tech programs"
PDF_ROOT = COLLECTION_ROOT / "_PDF_Library"
CATALOG_ROOT = COLLECTION_ROOT / "_Catalogs"
PROGRAM_MAP = CATALOG_ROOT / "program_course_map.csv"
PROGRAM_CATALOG = CATALOG_ROOT / "program_catalog.csv"
LIBRARY_INDEX = CATALOG_ROOT / "pdf_library_index.csv"
OUTPUT_ROOT = ROOT / "Syllabus/syllabus_txt/B.Tech"

SEMESTER_FILES: tuple[int | None, ...] = (1, 2, 3, 4, 5, 6, 7, 8, None)
STOP_SECTION = (
    r"references?",
    r"recommended books?",
    r"text ?books?",
    r"suggested readings?",
    r"course outcomes?",
    r"teaching and examination scheme",
    r"evaluation scheme",
    r"prerequisite",
    r"pre-requisite",
    r"course objectives?",
    r"objective",
    r"aim",
)


def clean_text(text: str) -> str:
    text = text.replace("\x00", "").replace("\u00ad", "").replace("\ufeff", "")
    text = "".join(ch for ch in text if ch in "\n\r\t" or ord(ch) >= 32)
    return text.replace("\r\n", "\n").replace("\r", "\n").strip()


def clean_lines(text: str) -> list[str]:
    result = []
    for line in clean_text(text).split("\n"):
        line = re.sub(r"\s+", " ", line).strip()
        if line:
            result.append(line)
    return result


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        raise FileNotFoundError(f"Required catalog is missing: {path}")
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, rows: list[dict[str, str]], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows({field: row.get(field, "") for field in fields} for row in rows)


PROGRAM_MAP_FIELDS = [
    "program_name", "program_folder", "semester", "course_code", "course_title",
    "library_file", "content_sha256", "git_blob_sha_before_migration",
    "file_size_bytes", "source_batch", "source_status", "source_url", "original_path",
]
PDF_INDEX_FIELDS = [
    "library_file", "file_name", "course_code", "course_title", "content_sha256",
    "git_blob_sha_before_migration", "file_size_bytes", "source_occurrence_count",
    "unique_program_count", "programs", "source_batches",
]


def slugify(value: str) -> str:
    value = re.sub(r"[^A-Za-z0-9]+", "_", value).strip("_")
    return value or "Unnamed_Program"


def map_semester(value: str) -> int | None:
    """Convert only explicitly labelled semesters; never infer from course codes."""
    value = (value or "").strip()
    if not value or value.casefold() in {"unknown", "semester_unknown", "semester_not_detected"}:
        return None
    match = re.fullmatch(r"(?:semester[_\s-]*)?0?([1-8])", value, flags=re.IGNORECASE)
    if match:
        return int(match.group(1))
    match = re.fullmatch(r"semester[_\s-]*0?([1-8])", value, flags=re.IGNORECASE)
    return int(match.group(1)) if match else None


def find_section(text: str, start_patterns: list[str], end_patterns: list[str]) -> str:
    for pattern in start_patterns:
        start = re.search(pattern, text, flags=re.IGNORECASE | re.MULTILINE)
        if not start:
            continue
        tail = text[start.end():]
        stops = [
            match.start()
            for stop in end_patterns
            if (match := re.search(stop, tail, flags=re.IGNORECASE | re.MULTILINE))
        ]
        return tail[:min(stops)] if stops else tail
    return ""


def split_list_items(text: str) -> list[str]:
    items: list[str] = []
    for line in clean_lines(text):
        line = re.sub(r"^\s*(?:[-•●▪*]+|\(?\d{1,2}[.)]|CO\s*\d+[:.)]?)\s*", "", line, flags=re.IGNORECASE).strip()
        if line and line not in {":", "-"}:
            items.append(line)
    return items


def extract_references(text: str) -> dict[str, list[str]]:
    sections = {
        "textbooks": [r"Text\s*Books?\s*[:\n]"],
        "references": [r"References?\s*[:\n]", r"Reference\s*Books?\s*[:\n]"],
        "suggested_reading": [r"Suggested\s+Readings?\s*[:\n]", r"Further\s+Readings?\s*[:\n]"],
    }
    result: dict[str, list[str]] = {}
    stops = [r"^(?:" + "|".join(STOP_SECTION) + r")\b"]
    for key, starts in sections.items():
        section = find_section(text, starts, stops)
        result[key] = split_list_items(section)
    return result


def parse_units(text: str) -> tuple[dict[str, list[dict[str, Any]]], list[str]]:
    """Parse both explicit Unit/Module headings and numbered syllabus-table rows."""
    sections: dict[str, list[dict[str, Any]]] = {
        "theory_units": [],
        "practical_units": [],
    }
    warnings: list[str] = []
    active = False
    in_experiment_list = False
    section_name = "theory_units"
    current: dict[str, Any] | None = None
    roman = {"I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7, "VIII": 8}
    explicit_heading = re.compile(
        r"^(?:UNIT|MODULE)\s*[-:#.]?\s*(VIII|VII|VI|IV|V|III|II|I|[1-8])"
        r"\s*(?:[-:.)–—]\s*)?(.*)$",
        flags=re.IGNORECASE,
    )
    # Marwadi's PDF tables commonly extract as: "1 Unit Title 4" where the last
    # number is contact hours. Also accept the hours on a following numeric line.
    table_row = re.compile(r"^(\d{1,2})\s+(.+?)\s+(\d{1,2})$")
    unit_row_without_hours = re.compile(r"^(\d{1,2})\s+([A-Za-z].+)$")

    def flush() -> None:
        nonlocal current
        if current:
            topic_lines = [line for line in current.pop("_topic_lines", []) if line]
            current["topic_lines"] = topic_lines
            current["topics_text"] = " ".join(topic_lines).strip()
            current["topics"] = split_list_items("\n".join(topic_lines))
            sections[section_name].append(current)
            current = None

    for line in clean_lines(text):
        low = line.casefold()
        if re.fullmatch(r"\[PAGE\s+\d+\]", line, flags=re.IGNORECASE):
            continue

        if low.startswith(("digitally signed by", "mr.", "dr.")) or "digitally signed by" in low:
            flush()
            active = False
            continue

        if "suggested list of experiments" in low or "list of experiments" in low:
            flush()
            section_name = "practical_units"
            in_experiment_list = True
            active = True
            continue

        # "Contents :" sometimes shares its line with the extracted table headings.
        if "contents" in low and (
            low.strip().startswith("contents")
            or "unit" in low
            or "topics" in low
            or "contact hours" in low
        ):
            flush()
            active = True
            section_name = "practical_units" if in_experiment_list else "theory_units"
            continue

        if active and any(
            re.match(r"^\s*" + stop + r"\b", line, flags=re.IGNORECASE)
            for stop in STOP_SECTION
        ):
            flush()
            active = False
            continue

        if not active:
            continue

        if low.startswith((
            "unit topics", "topics unit", "unit no", "unit number",
            "contact hours", "lecture hours", "total hours", "course contents",
            "course content", "contents", "topics", "unit",
        )):
            continue

        explicit = explicit_heading.match(line)
        if explicit:
            flush()
            token = explicit.group(1).upper()
            number = int(token) if token.isdigit() else roman.get(token)
            title = explicit.group(2).strip(" :-–—.") if explicit.group(2) else ""
            current = {
                "unit_number": number,
                "title": title or None,
                "contact_hours": None,
                "_topic_lines": [],
            }
            continue

        table = table_row.match(line)
        if table:
            number = int(table.group(1))
            title = table.group(2).strip(" :-–—.")
            hours = int(table.group(3))
            if 1 <= number <= 20 and title and hours <= 100:
                flush()
                current = {
                    "unit_number": number,
                    "title": title,
                    "contact_hours": hours,
                    "_topic_lines": [],
                }
                continue

        no_hours = unit_row_without_hours.match(line)
        if no_hours and 1 <= int(no_hours.group(1)) <= 20:
            # Support table rows where contact hours are extracted as a separate line.
            flush()
            current = {
                "unit_number": int(no_hours.group(1)),
                "title": no_hours.group(2).strip(" :-–—."),
                "contact_hours": None,
                "_topic_lines": [],
            }
            continue

        if current and line.isdigit() and current.get("contact_hours") is None:
            hours = int(line)
            if 0 <= hours <= 100:
                current["contact_hours"] = hours
                continue

        if current:
            current["_topic_lines"].append(line)

    flush()

    # Detect repeated numbering within each contents table without inventing corrections.
    for kind, units in sections.items():
        seen: set[int] = set()
        for unit in units:
            number = unit.get("unit_number")
            if number is not None and number in seen:
                warnings.append(f"Repeated {kind} unit number {number}; inspect the source PDF.")
            if number is not None:
                seen.add(number)
    return sections, warnings


def extract_course(row: dict[str, str], program: dict[str, str], semester: int | None) -> dict[str, Any]:
    library_rel = (row.get("library_file") or "").replace("\\", "/").lstrip("/")
    pdf_path = COLLECTION_ROOT / library_rel
    expected_hash = (row.get("content_sha256") or "").strip().lower()
    course: dict[str, Any] = {
        "course_code": row.get("course_code", "").strip(),
        "course_title": row.get("course_title", "").strip(),
        "program_name": row.get("program_name", ""),
        "program_folder": row.get("program_folder", ""),
        "semester": semester if semester is not None else "Unknown",
        "semester_source_value": row.get("semester", ""),
        "semester_assignment_note": (
            "Explicit semester from the source map."
            if semester is not None
            else "Semester is unknown in the source map; not inferred from the course code."
        ),
        "source_pdf_url": row.get("source_url", ""),
        "source_pdf_repo_path": library_rel or None,
        "original_source_path": row.get("original_path", ""),
        "source_batch": row.get("source_batch", ""),
        "source_status": row.get("source_status", ""),
        "expected_pdf_sha256": expected_hash or None,
        "actual_pdf_sha256": None,
        "extraction_method": "PyMuPDF native PDF text layer; no OCR",
        "extraction_status": "PDF_NOT_FOUND",
        "page_count": 0,
        "extracted_character_count": 0,
        "objective_text": "",
        "objectives": [],
        "course_outcomes_text": "",
        "course_outcomes": [],
        "contents": {"theory_units": [], "practical_units": []},
        "references": {},
        "source_text_by_page": [],
        "warnings": [],
    }

    if not pdf_path.is_file():
        course["warnings"].append(f"Mapped PDF was not found in the shared library: {library_rel}")
        return course

    try:
        actual_hash = hashlib.sha256(pdf_path.read_bytes()).hexdigest()
        course["actual_pdf_sha256"] = actual_hash
        if expected_hash and actual_hash.lower() != expected_hash:
            course["warnings"].append("Actual PDF SHA-256 differs from the program map.")
        with fitz.open(pdf_path) as document:
            page_texts = [clean_text(page.get_text("text", sort=True)) for page in document]
        full_text = "\n\n".join(text for text in page_texts if text).strip()
        course["page_count"] = len(page_texts)
        course["extracted_character_count"] = len(full_text)
        course["source_text_by_page"] = [
            {"page": i + 1, "text": page_text}
            for i, page_text in enumerate(page_texts)
        ]

        objective_section = find_section(
            full_text,
            [r"Course\s+Objectives?\s*:?", r"Objectives?\s*:", r"\bAim\s*:"],
            [
                r"Course\s+Outcomes?\b", r"\bCO\s*[- ]?1\b", r"Course\s+Contents?\b",
                r"\bContents?\s*:", r"\bUNIT\s*[-:#.]?\s*(?:VIII|VII|VI|IV|V|III|II|I|[1-8])",
                r"\bMODULE\s*[-:#.]?\s*(?:VIII|VII|VI|IV|V|III|II|I|[1-8])", r"\bText\s*Books?\b",
                r"\bReferences?\b", r"Teaching\s+and\s+Examination\s+Scheme",
            ],
        )
        outcomes_section = find_section(
            full_text,
            [r"Course\s+Outcomes?\s*:?", r"\bCourse\s+Outcome\s*:"],
            [
                r"\bUNIT\s*[-:#.]?\s*(?:VIII|VII|VI|IV|V|III|II|I|[1-8])",
                r"\bMODULE\s*[-:#.]?\s*(?:VIII|VII|VI|IV|V|III|II|I|[1-8])",
                r"\bCourse\s+Contents?\b", r"\bContents?\s*:", r"\bText\s*Books?\b",
                r"\bReferences?\b", r"Teaching\s+and\s+Examination\s+Scheme",
            ],
        )
        course["objective_text"] = " ".join(clean_lines(objective_section))
        course["objectives"] = split_list_items(objective_section)
        course["course_outcomes_text"] = " ".join(clean_lines(outcomes_section))
        course["course_outcomes"] = split_list_items(outcomes_section)
        course["references"] = extract_references(full_text)
        course["contents"], unit_warnings = parse_units(full_text)
        course["warnings"].extend(unit_warnings)

        if len(full_text) < 100:
            course["extraction_status"] = "LOW_TEXT_LAYER_OCR_REVIEW_NEEDED"
            course["warnings"].append("Very little native PDF text was extracted; OCR/manual review may be needed.")
        elif expected_hash and actual_hash.lower() != expected_hash:
            course["extraction_status"] = "PDF_HASH_MISMATCH_NEEDS_REVIEW"
        elif not (course["contents"]["theory_units"] or course["contents"]["practical_units"]):
            course["extraction_status"] = "TEXT_EXTRACTED_CONTENTS_NEED_MANUAL_REVIEW"
            course["warnings"].append("PDF text was extracted, but syllabus units/topics could not be parsed confidently.")
        else:
            course["extraction_status"] = "TEXT_EXTRACTED_AND_STRUCTURED"
    except Exception as exc:
        course["extraction_status"] = "EXTRACTION_ERROR"
        course["warnings"].append(f"{type(exc).__name__}: {exc}")

    return course


def make_payload(
    program: dict[str, str],
    semester: int | None,
    rows: list[dict[str, str]],
    generated_at: str,
) -> dict[str, Any]:
    courses = [extract_course(row, program, semester) for row in rows]
    statuses = Counter(course["extraction_status"] for course in courses)
    return {
        "schema_version": "1.0",
        "generated_at_utc": generated_at,
        "program": {
            "program_name": program["program_name"],
            "program_folder": program["program_folder"],
            "official_program_url": program.get("official_program_url", ""),
            "listing_status": program.get("listing_status", ""),
            "catalog_notes": program.get("notes", ""),
            "output_slug": slugify(program["program_folder"]),
        },
        "semester": semester if semester is not None else "Unknown",
        "semester_label": f"Semester {semester}" if semester is not None else "Unknown (not assigned in source map)",
        "source_catalog": PROGRAM_MAP.relative_to(ROOT).as_posix(),
        "extraction_method": (
            "PyMuPDF native text-layer extraction from the consolidated shared PDF library. "
            "Explicit Unit/Module headings are indexed where detectable. The complete extracted "
            "page text is preserved in source_text_by_page. Unknown semesters are not inferred."
        ),
        "course_count": len(courses),
        "courses": courses,
        "build_summary": {
            "structured": statuses.get("TEXT_EXTRACTED_AND_STRUCTURED", 0),
            "manual_review": statuses.get("TEXT_EXTRACTED_CONTENTS_NEED_MANUAL_REVIEW", 0),
            "ocr_review": statuses.get("LOW_TEXT_LAYER_OCR_REVIEW_NEEDED", 0),
            "hash_mismatch": statuses.get("PDF_HASH_MISMATCH_NEEDS_REVIEW", 0),
            "missing_pdf": statuses.get("PDF_NOT_FOUND", 0),
            "extraction_errors": statuses.get("EXTRACTION_ERROR", 0),
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create program/semester syllabus JSON for every B.Tech program in the catalog."
    )
    parser.add_argument(
        "--program",
        default=None,
        help="Optional exact program name to build only one B.Tech program.",
    )
    args = parser.parse_args()

    programs = read_csv(PROGRAM_CATALOG)
    mapped_rows = read_csv(PROGRAM_MAP)
    if not programs:
        raise RuntimeError(f"No programs found in {PROGRAM_CATALOG}")
    program_names = {p["program_name"] for p in programs}
    unexpected = sorted({r.get("program_name", "") for r in mapped_rows} - program_names)
    if unexpected:
        raise RuntimeError(f"Program map contains names absent from program catalog: {unexpected}")
    if args.program and args.program not in program_names:
        raise RuntimeError(
            f"Program {args.program!r} not found. Available programs: " +
            ", ".join(sorted(program_names))
        )

    # Keep only course associations backed by an existing, hash-verified PDF.
    # Unavailable/corrupt mappings are removed from the source map and indexes.
    verified_rows: list[dict[str, str]] = []
    rejected_rows: list[dict[str, str]] = []
    for row in mapped_rows:
        library_rel = (row.get("library_file") or "").replace("\\", "/").lstrip("/")
        pdf_path = COLLECTION_ROOT / library_rel
        reason = ""
        if not library_rel or not pdf_path.is_file():
            reason = "PDF_NOT_FOUND"
        else:
            try:
                if pdf_path.read_bytes()[:5] != b"%PDF-":
                    reason = "NOT_A_VALID_PDF"
                else:
                    expected = (row.get("content_sha256") or "").strip().lower()
                    actual = hashlib.sha256(pdf_path.read_bytes()).hexdigest()
                    if expected and expected != actual:
                        reason = "PDF_HASH_MISMATCH"
            except OSError as exc:
                reason = f"PDF_READ_ERROR: {exc}"
        if reason:
            rejected_rows.append({**row, "prune_reason": reason})
        else:
            verified_rows.append(row)

    if rejected_rows:
        print(f"Pruning {len(rejected_rows)} course associations without a verified source PDF.")
        mapped_rows = verified_rows
        write_csv(PROGRAM_MAP, mapped_rows, PROGRAM_MAP_FIELDS)
        used_paths = {row.get("library_file", "") for row in mapped_rows}
        prior_index = read_csv(LIBRARY_INDEX)
        clean_index = [row for row in prior_index if row.get("library_file", "") in used_paths]
        write_csv(LIBRARY_INDEX, clean_index, PDF_INDEX_FIELDS)
        for catalog_program in programs:
            associated = [
                row for row in mapped_rows
                if row.get("program_name") == catalog_program.get("program_name")
            ]
            catalog_program["source_pdf_occurrences"] = str(len(associated))
            catalog_program["unique_pdf_assets_linked"] = str(
                len({row.get("library_file", "") for row in associated if row.get("library_file")})
            )
        write_csv(PROGRAM_CATALOG, programs, list(programs[0].keys()))
        prune_report = CATALOG_ROOT / "collection_reports" / "pruned_unverified_course_rows.csv"
        write_csv(prune_report, rejected_rows, PROGRAM_MAP_FIELDS + ["prune_reason"])
    else:
        mapped_rows = verified_rows

    generated_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    summary_programs: list[dict[str, Any]] = []
    excluded_programs: list[dict[str, str]] = []
    all_statuses: Counter[str] = Counter()
    overall_courses = 0

    for program in programs:
        if args.program and program["program_name"] != args.program:
            continue
        program_rows = [row for row in mapped_rows if row.get("program_name") == program["program_name"]]
        grouped: dict[int | None, list[dict[str, str]]] = {semester: [] for semester in SEMESTER_FILES}
        for row in program_rows:
            semester = map_semester(row.get("semester", ""))
            if semester not in grouped:
                semester = None
            grouped[semester].append(row)

        output_dir = OUTPUT_ROOT / slugify(program["program_folder"])
        if not program_rows:
            # Do not publish nine empty placeholder JSONs for programs with no
            # verified syllabus PDFs. Preserve their program catalog entry for future recovery.
            if output_dir.exists():
                shutil.rmtree(output_dir)
            excluded_programs.append({
                "program_name": program["program_name"],
                "program_folder": program["program_folder"],
                "official_program_url": program.get("official_program_url", ""),
                "reason": "No verified source syllabus PDFs remain for this program; empty JSON placeholders removed.",
            })
            readme_path = COLLECTION_ROOT / "Programs" / program["program_folder"] / "README.md"
            if readme_path.parent.exists():
                readme_path.write_text(
                    f"# B.Tech {program['program_folder']}\n\n"
                    f"- **Program name:** {program['program_name']}\n"
                    f"- **Official program page:** {program.get('official_program_url') or 'Not confirmed'}\n\n"
                    "## Syllabus availability\n\n"
                    "No verified source syllabus PDFs are currently available in the repository for this program. "
                    "It has therefore been excluded from generated syllabus JSON rather than represented by empty files. "
                    "The program remains in the program catalog for future source recovery.\n",
                    encoding="utf-8",
                )
            print(f"PROGRAM EXCLUDED: {program['program_name']}: no verified source syllabus PDF.")
            continue

        output_dir.mkdir(parents=True, exist_ok=True)
        program_statuses: Counter[str] = Counter()
        files_created = 0
        for semester in SEMESTER_FILES:
            rows = grouped[semester]
            payload = make_payload(program, semester, rows, generated_at)
            filename = f"semester_{semester}.json" if semester is not None else "semester_unknown.json"
            destination = output_dir / filename
            destination.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            files_created += 1
            for course in payload["courses"]:
                program_statuses[course["extraction_status"]] += 1
                all_statuses[course["extraction_status"]] += 1
            print(
                f"{destination.relative_to(ROOT)}: {payload['course_count']} courses; "
                f"{payload['build_summary']}"
            )

        overall_courses += len(program_rows)
        summary_programs.append({
            "program_name": program["program_name"],
            "program_folder": program["program_folder"],
            "output_slug": slugify(program["program_folder"]),
            "official_program_url": program.get("official_program_url", ""),
            "catalog_course_associations": len(program_rows),
            "semester_counts": {
                "semester_" + str(sem) if sem is not None else "semester_unknown": len(grouped[sem])
                for sem in SEMESTER_FILES
            },
            "extraction_status_counts": dict(sorted(program_statuses.items())),
            "output_files": files_created,
            "catalog_note": program.get("notes", ""),
            "coverage_note": (
                "No PDF associations were present in the consolidated map for this program; "
                "empty semester files record that collection gap without inventing syllabus content."
                if not program_rows else
                "Only mapped, checked-in PDFs are represented. Uncollected subjects are not synthesized."
            ),
        })
        print(
            f"PROGRAM SUMMARY: {program['program_name']}: {len(program_rows)} course associations; "
            f"{dict(program_statuses)}"
        )

    index = {
        "schema_version": "1.0",
        "generated_at_utc": generated_at,
        "program_catalog": PROGRAM_CATALOG.relative_to(ROOT).as_posix(),
        "program_course_map": PROGRAM_MAP.relative_to(ROOT).as_posix(),
        "unique_pdf_index": LIBRARY_INDEX.relative_to(ROOT).as_posix(),
        "output_root": OUTPUT_ROOT.relative_to(ROOT).as_posix(),
        "semester_policy": "Only explicit source-map semester labels are used; otherwise semester_unknown.json.",
        "catalog_program_count": len(programs),
        "program_count": len(summary_programs),
        "programs_without_verified_syllabus_json": len(excluded_programs),
        "excluded_programs_without_verified_syllabus": excluded_programs,
        "removed_unverified_course_rows": len(rejected_rows),
        "course_association_count": overall_courses,
        "extraction_status_counts": dict(sorted(all_statuses.items())),
        "programs": summary_programs,
    }
    if not args.program:
        OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
        (OUTPUT_ROOT / "index.json").write_text(
            json.dumps(index, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
    print(f"OVERALL SUMMARY: {json.dumps({k: index[k] for k in ('catalog_program_count', 'program_count', 'programs_without_verified_syllabus_json', 'removed_unverified_course_rows', 'course_association_count', 'extraction_status_counts')}, ensure_ascii=False)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
