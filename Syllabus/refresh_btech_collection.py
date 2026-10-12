#!/usr/bin/env python3
"""Refresh official B.Tech PDF collection, merge verified PDFs, then build JSON."""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
import shutil
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
COLLECTION = ROOT / "Syllabus/B.Tech programs"
CATALOGS = COLLECTION / "_Catalogs"
PDF_ROOT = COLLECTION / "_PDF_Library"
PROGRAMS_ROOT = COLLECTION / "Programs"
TOOLS = COLLECTION / "_Tools/Batch_2_Official_Collector"
COLLECTOR = TOOLS / "build_syllabus_archive.py"
PROGRAMS_CSV = TOOLS / "programs.csv"
RUN_OUTPUT = TOOLS / "run_output/B.Tech programs"
MANIFEST_DIR = RUN_OUTPUT / "00_Manifests"
MANIFEST = MANIFEST_DIR / "collection_manifest.csv"
PROGRAM_MAP = CATALOGS / "program_course_map.csv"
PROGRAM_CATALOG = CATALOGS / "program_catalog.csv"
PDF_INDEX = CATALOGS / "pdf_library_index.csv"
REPORTS = CATALOGS / "collection_reports"
BUILDER = ROOT / "Syllabus/build_btech_syllabus_txt.py"
MAP_FIELDS = [
    "program_name", "program_folder", "semester", "course_code", "course_title",
    "library_file", "content_sha256", "git_blob_sha_before_migration",
    "file_size_bytes", "source_batch", "source_status", "source_url", "original_path",
]
INDEX_FIELDS = [
    "library_file", "file_name", "course_code", "course_title", "content_sha256",
    "git_blob_sha_before_migration", "file_size_bytes", "source_occurrence_count",
    "unique_program_count", "programs", "source_batches",
]
SUCCESS_STATUSES = {"downloaded_from_marwadi", "downloaded_from_gtu_fallback"}


def read_csv(path: Path) -> list[dict[str, str]]:
    if not path.exists():
        return []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def write_csv(path: Path, rows: list[dict], fields: list[str]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows({field: row.get(field, "") for field in fields} for row in rows)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def clean_name(value: str, max_length: int = 120) -> str:
    value = re.sub(r"\s+", " ", value or "").strip()
    value = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", value).rstrip(" .")
    return (value[:max_length].rstrip(" .") or "unnamed")


def code_prefix(code: str) -> str:
    match = re.match(r"^(\d{2}[A-Z]{2,3})", (code or "").strip(), re.IGNORECASE)
    if match:
        return match.group(1).upper()
    match = re.match(r"^([A-Z0-9]{3,6})", (code or "").strip(), re.IGNORECASE)
    return match.group(1).upper() if match else "UNCLASSIFIED"


def slugify(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", value or "").strip("_") or "Unnamed_Program"


def semester_number(value: str) -> int | None:
    text = (value or "").strip()
    if not text or text.casefold() in {"unknown", "semester_unknown", "semester_not_detected"}:
        return None
    match = re.fullmatch(r"(?:semester[_\s-]*)?0?([1-8])", text, flags=re.IGNORECASE)
    return int(match.group(1)) if match else None


def normalize_semester(value: str) -> str:
    number = semester_number(value)
    return str(number) if number is not None else "Unknown"


def find_existing_pdfs() -> dict[str, str]:
    by_hash: dict[str, str] = {}
    if PDF_ROOT.exists():
        for path in sorted(PDF_ROOT.rglob("*.pdf")):
            try:
                if path.read_bytes()[:5] == b"%PDF-":
                    by_hash.setdefault(sha256_file(path), path.relative_to(COLLECTION).as_posix())
            except OSError as exc:
                print(f"WARNING: could not hash existing PDF {path}: {exc}", file=sys.stderr)
    return by_hash


def choose_library_path(code: str, title: str, digest: str) -> Path:
    directory = PDF_ROOT / code_prefix(code)
    directory.mkdir(parents=True, exist_ok=True)
    filename = clean_name(f"{code or 'NO_CODE'} - {title or code or 'Syllabus'}") + ".pdf"
    destination = directory / filename
    if destination.exists() and sha256_file(destination) != digest:
        destination = directory / (destination.stem + " - " + digest[:10] + ".pdf")
    return destination


def merge_collection() -> dict:
    if not MANIFEST.exists():
        raise FileNotFoundError(f"Official collector did not create {MANIFEST}")
    programs = read_csv(PROGRAM_CATALOG)
    mapped_rows = read_csv(PROGRAM_MAP)
    old_index = read_csv(PDF_INDEX)
    manifest = read_csv(MANIFEST)
    index_by_path = {r.get("library_file", ""): r for r in old_index}
    digest_to_library = find_existing_pdfs()
    successful = []
    skipped = []

    for row in manifest:
        status = (row.get("status") or "").strip()
        if status not in SUCCESS_STATUSES:
            continue
        local_value = (row.get("local_file") or "").replace("\\", "/").lstrip("/")
        local_pdf = (RUN_OUTPUT / local_value).resolve()
        try:
            local_pdf.relative_to(RUN_OUTPUT.resolve())
        except ValueError:
            skipped.append({"reason": "unsafe_local_path", "row": row})
            continue
        if not local_pdf.is_file() or local_pdf.read_bytes()[:5] != b"%PDF-":
            skipped.append({"reason": "collected_file_missing_or_not_pdf", "row": row})
            continue

        digest = sha256_file(local_pdf)
        code = (row.get("subject_code") or "").strip()
        title = (row.get("subject_name") or code or "Syllabus").strip()
        if digest in digest_to_library:
            relative_library = digest_to_library[digest]
            destination = COLLECTION / relative_library
        else:
            destination = choose_library_path(code, title, digest)
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(local_pdf, destination)
            if sha256_file(destination) != digest:
                raise RuntimeError(f"Hash verification failed after copying {local_pdf} to {destination}")
            relative_library = destination.relative_to(COLLECTION).as_posix()
            digest_to_library[digest] = relative_library

        successful.append({
            "program_name": (row.get("program_name") or "").strip(),
            "program_folder": (row.get("program_folder") or "").strip(),
            "semester": normalize_semester(row.get("semester") or ""),
            "course_code": code,
            "course_title": title,
            "library_file": relative_library,
            "content_sha256": digest,
            "git_blob_sha_before_migration": index_by_path.get(relative_library, {}).get("git_blob_sha_before_migration", ""),
            "file_size_bytes": str(destination.stat().st_size),
            "source_batch": "verified_gtu_fallback" if status == "downloaded_from_gtu_fallback" else "live_official_page_collector",
            "source_status": status,
            "source_url": (row.get("source_pdf_url") or "").strip(),
            "original_path": "live_collection/" + (row.get("local_file") or "").replace("\\", "/"),
        })

    # Preserve distinct links even if multiple electives use a placeholder code.
    exact_positions: dict[tuple[str, str, str], list[int]] = defaultdict(list)
    for i, old in enumerate(mapped_rows):
        exact_positions[(old.get("program_name", ""), old.get("course_code", ""), old.get("source_url", ""))].append(i)
    added = updated = 0
    for incoming in successful:
        key = (incoming["program_name"], incoming["course_code"], incoming["source_url"])
        matches = exact_positions.get(key, [])
        if matches:
            pos = matches[0]
            old = mapped_rows[pos]
            if incoming["semester"] == "Unknown" and normalize_semester(old.get("semester", "")) != "Unknown":
                incoming["semester"] = normalize_semester(old.get("semester", ""))
            mapped_rows[pos] = {**old, **{k: incoming.get(k, "") for k in MAP_FIELDS}}
            updated += 1
            continue
        code = incoming["course_code"]
        placeholder = bool(re.search(r"X{2,}$", code, flags=re.IGNORECASE))
        candidates = [
            i for i, old in enumerate(mapped_rows)
            if old.get("program_name", "") == incoming["program_name"] and old.get("course_code", "") == code
        ]
        if len(candidates) == 1 and not placeholder:
            pos = candidates[0]
            old = mapped_rows[pos]
            if incoming["semester"] == "Unknown" and normalize_semester(old.get("semester", "")) != "Unknown":
                incoming["semester"] = normalize_semester(old.get("semester", ""))
            mapped_rows[pos] = {**old, **{k: incoming.get(k, "") for k in MAP_FIELDS}}
            exact_positions[key].append(pos)
            updated += 1
        else:
            mapped_rows.append({k: incoming.get(k, "") for k in MAP_FIELDS})
            exact_positions[key].append(len(mapped_rows) - 1)
            added += 1

    # Rebuild the unique PDF index while preserving any previously indexed orphan file.
    rows_by_library: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in mapped_rows:
        if row.get("library_file"):
            rows_by_library[row["library_file"]].append(row)
    new_index: list[dict[str, str]] = []
    seen_paths = set()
    for relative, associated in sorted(rows_by_library.items()):
        path = COLLECTION / relative
        digest = (associated[0].get("content_sha256") or "").strip()
        if path.is_file():
            actual = sha256_file(path)
            if not digest or actual != digest:
                digest = actual
        old = index_by_path.get(relative, {})
        asset_programs = sorted({r.get("program_name", "") for r in associated if r.get("program_name")})
        batches = sorted({r.get("source_batch", "") for r in associated if r.get("source_batch")})
        new_index.append({
            "library_file": relative,
            "file_name": path.name,
            "course_code": associated[0].get("course_code", ""),
            "course_title": associated[0].get("course_title", ""),
            "content_sha256": digest,
            "git_blob_sha_before_migration": old.get("git_blob_sha_before_migration", associated[0].get("git_blob_sha_before_migration", "")),
            "file_size_bytes": str(path.stat().st_size) if path.is_file() else associated[0].get("file_size_bytes", ""),
            "source_occurrence_count": str(len(associated)),
            "unique_program_count": str(len(asset_programs)),
            "programs": "; ".join(asset_programs),
            "source_batches": "; ".join(batches),
        })
        seen_paths.add(relative)
    for old in old_index:
        relative = old.get("library_file", "")
        if relative and relative not in seen_paths and (COLLECTION / relative).is_file():
            new_index.append(old)
            seen_paths.add(relative)

    write_csv(PROGRAM_MAP, mapped_rows, MAP_FIELDS)
    write_csv(PDF_INDEX, new_index, INDEX_FIELDS)

    rows_by_program: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in mapped_rows:
        rows_by_program[row.get("program_name", "")].append(row)
    for program in programs:
        associated = rows_by_program.get(program.get("program_name", ""), [])
        program["source_pdf_occurrences"] = str(len(associated))
        program["unique_pdf_assets_linked"] = str(len({r.get("library_file", "") for r in associated if r.get("library_file")}))
    catalog_fields = list(programs[0].keys()) if programs else [
        "program_name", "program_folder", "official_program_url", "listing_status", "notes",
        "source_pdf_occurrences", "unique_pdf_assets_linked",
    ]
    write_csv(PROGRAM_CATALOG, programs, catalog_fields)

    # Make collection problems visible in version control rather than leaving them
    # only in temporary collector output that is ignored by Git.
    REPORTS.mkdir(parents=True, exist_ok=True)
    report_names = {
        "source_page_status.csv": "latest_source_page_status.csv",
        "missing_marwadi_pdfs.csv": "latest_missing_marwadi_pdfs.csv",
        "gtu_fallback_needed.csv": "latest_gtu_fallback_needed.csv",
        "discovered_course_links.csv": "latest_discovered_course_links.csv",
    }
    for source_name, destination_name in report_names.items():
        source = MANIFEST_DIR / source_name
        if source.exists():
            shutil.copy2(source, REPORTS / destination_name)

    source_status_rows = read_csv(MANIFEST_DIR / "source_page_status.csv")
    missing_rows = read_csv(MANIFEST_DIR / "missing_marwadi_pdfs.csv")
    links = read_csv(MANIFEST_DIR / "discovered_course_links.csv")
    status_by_program = {r.get("program_name", ""): r for r in source_status_rows}
for program in programs:
        program_name = program.get("program_name", "")
        if program_name not in status_by_program:
            status_by_program[program_name] = {
                "status": "not_scanned_missing_only",
                "pdf_link_count": "",
                "course_code_link_count": "",
                "note": "This run targeted only programs with zero or one mapped PDF association.",
            }
    missing_by_program: dict[str, list[dict[str, str]]] = defaultdict(list)
    links_by_program: dict[str, list[dict[str, str]]] = defaultdict(list)
    for row in missing_rows:
        missing_by_program[row.get("program_name", "")].append(row)
    for row in links:
        links_by_program[row.get("program_name", "")].append(row)

    # Add the PDFs and semester JSONs to each program's own README index.
    for program in programs:
        name = program.get("program_name", "")
        folder = program.get("program_folder", "")
        official_url = program.get("official_program_url", "")
        slug = slugify(folder)
        associated = sorted(
            rows_by_program.get(name, []),
            key=lambda r: (semester_number(r.get("semester", "")) or 99, r.get("course_code", ""), r.get("course_title", "").casefold()),
        )
        out = [
            f"# B.Tech {folder}", "",
            f"- **Program name:** {name}",
            f"- **Program folder:** {folder}",
            f"- **Official program page:** {official_url or 'Not confirmed in the current program catalog'}",
            f"- **Mapped source PDF associations:** {len(associated)}",
            f"- **Distinct PDF files linked:** {len({r.get('library_file', '') for r in associated if r.get('library_file')})}",
            "",
            "Source PDFs are stored once in the shared PDF library. The links below point to the stored original PDF; duplicate content across programs reuses the same file.",
            "", "## Generated JSON", "",
            "- [Program JSON index](../../../syllabus_txt.B.Tech/index.json)".replace("syllabus_txt.B.Tech", "syllabus_txt/B.Tech"),
        ]
        for sem in range(1, 9):
            out.append(f"- [Semester {sem} JSON](../../../syllabus_txt/B.Tech/{slug}/semester_{sem}.json)")
        out.append(f"- [Unknown-semester JSON](../../../syllabus_txt/B.Tech/{slug}/semester_unknown.json)")
        out.extend(["", "## Collected source PDFs", ""])
        if associated:
            out.extend(["| Semester | Course code | Course title | Stored PDF | Official PDF URL |", "|---|---|---|---|---|"])
            for row in associated:
                relative = row.get("library_file", "")
                stored_link = quote("../../" + relative, safe="/._-()")
                title = (row.get("course_title") or "").replace("|", "\\|").replace("\n", " ")
                code = (row.get("course_code") or "").replace("|", "\\|")
                sem = normalize_semester(row.get("semester", ""))
                sem_label = "Semester " + sem if sem != "Unknown" else "Unknown"
                source = row.get("source_url", "")
                source_link = f"[Original]({source})" if source else "Not recorded"
                out.append(f"| {sem_label} | {code} | {title} | [PDF]({stored_link}) | {source_link} |")
        else:
            out.extend([
                "No source PDFs have been successfully mapped for this program yet.", "",
                "This is a collection gap, not proof that an official syllabus does not exist. Check the latest collection reports and verify the official source before accepting a substitute.",
            ])
        page_status = status_by_program.get(name, {})
        out.extend(["", "## Latest collection check", ""])
        if page_status:
            out.append(f"- **Page status:** {page_status.get('status', 'not reported')}")
            out.append(f"- **PDF links detected:** {page_status.get('pdf_link_count', '0')}")
            out.append(f"- **Course-code links detected:** {page_status.get('course_code_link_count', '0')}")
            if page_status.get("note"):
                out.append(f"- **Collector note:** {page_status['note']}")
        else:
            out.append("- No source-page status was produced for this program.")
        if missing_by_program.get(name):
            out.append(f"- **Items requiring review:** {len(missing_by_program[name])}")
            out.append("- Review the latest missing-PDF report in the collection reports folder.")
        out.append("- [All collection reports](../../_Catalogs/collection_reports/)")
        target = PROGRAMS_ROOT / folder / "README.md"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("\n".join(out) + "\n", encoding="utf-8")

    summary = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "program_count": len(programs),
        "mapped_course_program_associations": len(mapped_rows),
        "new_associations_added": added,
        "existing_associations_updated": updated,
        "source_pdfs_downloaded_successfully_this_run": len(successful),
        "collector_manifest_success_rows": sum(1 for r in manifest if r.get("status") in SUCCESS_STATUSES),
        "collection_rows_skipped_during_sync": len(skipped),
        "important_policy": "Only source PDF text is converted. No content is fabricated for missing PDFs, and semesters are never inferred from course-code digits.",
        "programs": [],
    }
    for program in programs:
        name = program.get("program_name", "")
        status = status_by_program.get(name, {})
        associated = rows_by_program.get(name, [])
        summary["programs"].append({
            "program_name": name,
            "program_folder": program.get("program_folder", ""),
            "official_program_url": program.get("official_program_url", ""),
            "catalog_association_count": len(associated),
            "unique_pdf_count": len({r.get("library_file", "") for r in associated if r.get("library_file")}),
            "source_page_status": status.get("status", "not_reported"),
            "detected_pdf_links": status.get("pdf_link_count", ""),
            "detected_course_code_links": status.get("course_code_link_count", ""),
            "page_note": status.get("note", ""),
            "missing_or_review_rows": len(missing_by_program.get(name, [])),
        })
    (REPORTS / "latest_collection_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return {"program_count": len(programs), "association_count": len(mapped_rows), "added": added,
            "updated": updated, "successful_manifest_rows": len(successful), "skipped": len(skipped)}


def main() -> int:
    parser = argparse.ArgumentParser(description="Refresh B.Tech PDF sources and generate syllabus JSON.")
    parser.add_argument(
        "--missing-only",
        action="store_true",
        help="Collect only programs currently having zero or one mapped source PDF association.",
    )
    args = parser.parse_args()
    if not COLLECTOR.is_file():
        raise FileNotFoundError(f"Official PDF collector is missing: {COLLECTOR}")

    if args.missing_only:
        catalog = read_csv(PROGRAM_CATALOG)
        current_program_rows = read_csv(PROGRAMS_CSV)
        counts = {}
        for row in catalog:
            try:
                counts[row.get("program_name", "")] = int(row.get("source_pdf_occurrences") or 0)
            except ValueError:
                counts[row.get("program_name", "")] = 0
        selected_names = {name for name, count in counts.items() if count <= 1}
        selected_rows = [row for row in current_program_rows if row.get("program_name", "") in selected_names]
        if not selected_rows:
            print("No empty or incomplete source mappings were found; rebuilding the existing JSON only.")
            subprocess.run([sys.executable, str(BUILDER)], cwd=ROOT, check=True)
            return 0
        original_program_config = PROGRAMS_CSV.read_bytes()
        write_csv(PROGRAMS_CSV, selected_rows, list(current_program_rows[0].keys()))
        print("Step 1/3: collecting only the empty/incomplete program set:")
        for row in selected_rows:
            print(" - " + row.get("program_name", ""))
        try:
            subprocess.run([sys.executable, str(COLLECTOR)], cwd=ROOT, check=True)
        finally:
            PROGRAMS_CSV.write_bytes(original_program_config)
    else:
        print("Step 1/3: collecting PDFs from all configured official course pages.")
        subprocess.run([sys.executable, str(COLLECTOR)], cwd=ROOT, check=True)

    print("Step 2/3: verifying hashes, deduplicating PDFs, updating catalogs and reports.")
    print(json.dumps(merge_collection(), indent=2))
    print("Step 3/3: extracting the collected PDFs into B.Tech semester JSON.")
    subprocess.run([sys.executable, str(BUILDER)], cwd=ROOT, check=True)
    print("B.Tech source refresh and JSON build completed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
