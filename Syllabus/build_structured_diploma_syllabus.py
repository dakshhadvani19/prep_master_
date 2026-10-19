#!/usr/bin/env python3
"""Create minimal per-subject Diploma syllabus JSON and optional practical JSON.

Source of truth: the already extracted Diploma semester JSON files. This script
only restructures source-derived content; it does not invent missing syllabus text.
"""
from __future__ import annotations

import json
import re
import shutil
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = ROOT / "Syllabus" / "syllabus_txt" / "Diploma"
OUTPUT_ROOT = ROOT / "Syllabus_Structured" / "Diploma"


def slugify(value: str) -> str:
    value = re.sub(r"[^A-Za-z0-9]+", "_", value).strip("_")
    return value or "unnamed_subject"


def content_lines(unit: dict[str, Any]) -> list[str]:
    lines = unit.get("topic_lines")
    if isinstance(lines, list):
        return [str(line).strip() for line in lines if str(line).strip()]
    topics = unit.get("topics")
    if isinstance(topics, list):
        return [str(topic).strip() for topic in topics if str(topic).strip()]
    text = str(unit.get("topics_text") or "").strip()
    return [text] if text else []


def normalized_units(units: Any, practical: bool = False) -> list[dict[str, Any]]:
    result: list[dict[str, Any]] = []
    if not isinstance(units, list):
        return result
    for index, unit in enumerate(units, start=1):
        if not isinstance(unit, dict):
            continue
        title = str(unit.get("title") or unit.get("name") or "").strip()
        content = content_lines(unit)
        entry: dict[str, Any] = {
            ("practical_number" if practical else "chapter_number"):
                unit.get("unit_number", index),
            ("title" if practical else "chapter_name"): title or f"Item {index}",
            "content": content,
        }
        if unit.get("contact_hours") is not None:
            entry["contact_hours"] = unit["contact_hours"]
        result.append(entry)
    return result


def main() -> int:
    if not SOURCE_ROOT.is_dir():
        raise FileNotFoundError(f"Existing Diploma extraction directory not found: {SOURCE_ROOT}")

    if OUTPUT_ROOT.exists():
        shutil.rmtree(OUTPUT_ROOT)
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)

    semester_files = sorted(SOURCE_ROOT.glob("*/*semester_*.json"))
    # The expected layout is course/semester_N.json, so use a direct recursive
    # glob as a compatibility fallback for course folder naming.
    if not semester_files:
        semester_files = sorted(SOURCE_ROOT.glob("**/semester_*.json"))

    subject_count = 0
    chapter_count = 0
    practical_subject_count = 0
    empty_content_count = 0

    for semester_path in semester_files:
        try:
            data = json.loads(semester_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            print(f"SKIP unreadable source JSON {semester_path}: {exc}")
            continue

        course = data.get("course") if isinstance(data.get("course"), dict) else {}
        course_name = str(course.get("course_name") or semester_path.parent.name)
        course_slug = str(course.get("output_slug") or semester_path.parent.name)
        semester = data.get("semester")
        subjects = data.get("subjects")
        if not isinstance(subjects, list):
            continue

        for subject in subjects:
            if not isinstance(subject, dict):
                continue
            subject_name = str(subject.get("subject_name") or "Unnamed Subject").strip()
            subject_code = str(subject.get("subject_code") or subject.get("subject_id") or "").strip()
            subject_semester = subject.get("semester", semester)
            safe_name = slugify(subject_name)
            prefix = f"{slugify(subject_code)}_" if subject_code else ""
            filename = f"{prefix}{safe_name}.json"
            subject_dir = OUTPUT_ROOT / course_slug / f"semester_{subject_semester}"
            subject_dir.mkdir(parents=True, exist_ok=True)

            contents = subject.get("contents") if isinstance(subject.get("contents"), dict) else {}
            chapters = normalized_units(contents.get("theory_units"))
            practicals = normalized_units(contents.get("practical_units"), practical=True)

            syllabus = {
                "subject": subject_name,
                "subject_code": subject_code or None,
                "course": course_name,
                "semester": subject_semester,
                "chapters": chapters,
                "source": {
                    "pdf_repo_path": subject.get("source_pdf_repo_path"),
                    "extraction_status": subject.get("extraction_status", "UNKNOWN"),
                },
            }
            out_path = subject_dir / filename
            out_path.write_text(
                json.dumps(syllabus, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            subject_count += 1
            chapter_count += len(chapters)
            if not chapters:
                empty_content_count += 1

            if practicals:
                practical_path = subject_dir / f"{prefix}{safe_name}_practicals.json"
                practical_data = {
                    "subject": subject_name,
                    "subject_code": subject_code or None,
                    "course": course_name,
                    "semester": subject_semester,
                    "practicals": practicals,
                    "source": {
                        "pdf_repo_path": subject.get("source_pdf_repo_path"),
                        "extraction_status": subject.get("extraction_status", "UNKNOWN"),
                    },
                }
                practical_path.write_text(
                    json.dumps(practical_data, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8",
                )
                practical_subject_count += 1

    print(f"Diploma structured syllabus subjects: {subject_count}")
    print(f"Chapters/units extracted: {chapter_count}")
    print(f"Subjects with separate practical files: {practical_subject_count}")
    print(f"Subjects with no parsed theory chapters (must be reviewed): {empty_content_count}")
    if subject_count == 0:
        raise RuntimeError("No Diploma subjects were transformed; refusing to report success.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
