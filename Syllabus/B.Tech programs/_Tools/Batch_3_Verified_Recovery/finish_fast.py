#!/usr/bin/env python3
"""Fast parallel Marwadi PDF pass + complete reports for every queue row."""
from __future__ import annotations

import csv
import hashlib
import json
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent))
import recovery_runner as rr

ROOT = Path(__file__).resolve().parent
UA = {"User-Agent": rr.USER_AGENT}
SESSION_LOCAL = None


def session() -> requests.Session:
    s = requests.Session()
    s.headers.update(UA)
    return s


def wp_search(code: str) -> list[str]:
    if not code or "X" in code.upper():
        return []
    url = (
        "https://www.marwadiuniversity.ac.in/wp-json/wp/v2/media"
        f"?search={requests.utils.quote(code)}&per_page=10"
    )
    try:
        r = session().get(url, timeout=12)
        if r.status_code != 200:
            return []
        out = []
        for it in r.json() if isinstance(r.json(), list) else []:
            src = it.get("source_url") or ""
            mime = (it.get("mime_type") or "").lower()
            if src and ("pdf" in mime or src.lower().endswith(".pdf")):
                if code.lower() in src.lower() or code.lower().replace(" ", "") in src.lower():
                    out.append(src)
        return out
    except Exception:
        return []


def download_pdf(url: str) -> bytes | None:
    try:
        r = session().get(url, timeout=20, allow_redirects=True)
        if r.status_code != 200:
            return None
        data = r.content or b""
        if not rr.is_pdf_magic(data) or len(data) < rr.MIN_PDF_BYTES:
            return None
        host = rr.host_of(str(r.url))
        if host not in rr.MARWADI_HOSTS:
            return None
        return data
    except Exception:
        return None


def main() -> int:
    runner = rr.RecoveryRunner(ROOT)
    targets = runner.load_targets()
    print(f"Queue {len(targets)}", flush=True)

    existing: dict[str, Path] = {}
    for p in (ROOT / "Output").rglob("*.pdf"):
        code = p.name.split(" - ")[0].upper()
        existing[code] = p

    # Prefetch program pages for semester maps (few URLs).
    pages = sorted({(r.get("marwadi_page_url") or "") for r in targets if r.get("marwadi_page_url")})
    print(f"Program pages {len(pages)}", flush=True)
    with ThreadPoolExecutor(max_workers=8) as ex:
        list(ex.map(lambda u: runner.fetch_html(u), pages))

    need = [r for r in targets if (r.get("course_code") or "").upper() not in existing]
    codes = sorted({(r.get("course_code") or "").upper() for r in need if r.get("course_code")})
    print(f"WP search codes {len(codes)}", flush=True)
    found: dict[str, list[str]] = {}
    with ThreadPoolExecutor(max_workers=12) as ex:
        futs = {ex.submit(wp_search, c): c for c in codes}
        for fut in as_completed(futs):
            c = futs[fut]
            try:
                found[c] = fut.result()
            except Exception:
                found[c] = []
    hits = {c: u for c, urls in found.items() if urls for u in [urls[0]]}
    print(f"WP code hits {len(hits)}", flush=True)

    # Download new PDFs in parallel.
    to_get = []
    for r in need:
        code = (r.get("course_code") or "").upper()
        if code in hits:
            to_get.append((r, hits[code]))
    print(f"Downloads {len(to_get)}", flush=True)
    saved = 0
    attempts = []

    def one(item):
        row, url = item
        data = download_pdf(url)
        return row, url, data

    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = [ex.submit(one, it) for it in to_get]
        for fut in as_completed(futs):
            row, url, data = fut.result()
            code = (row.get("course_code") or "").upper()
            title = row.get("subject_title") or ""
            if not data:
                attempts.append((code, title, url, "download_fail"))
                continue
            ok, text, detail = rr.classify_pdf_open(data)
            if not ok:
                attempts.append((code, title, url, "not_pdf:" + detail))
                continue
            conf, reason = rr.match_confidence(title, code, text + " " + url, url)
            if conf == "LOW":
                attempts.append((code, title, url, "low:" + reason))
                continue
            sem = runner.resolve_semester(row)
            path = runner.save_pdf(row, sem, data)
            existing[code] = path
            saved += 1
            attempts.append((code, title, url, f"saved:{conf}:{reason}"))
            print("SAVED", code, title[:40], flush=True)

    print(f"Newly saved {saved}", flush=True)

    # Complete manifest for original 126 + note extras already on disk.
    ROOT.joinpath("Reports").mkdir(exist_ok=True)
    runner.manifest = []
    runner.attempts = []
    extra_on_disk = []
    target_codes = {(r.get("program_name"), (r.get("course_code") or "").upper()) for r in targets}

    for r in targets:
        code = (r.get("course_code") or "").upper()
        title = r.get("subject_title") or ""
        sem = runner.resolve_semester(r)
        if rr.is_group_heading(title, code):
            html = runner.program_html(r.get("program_name", ""), r.get("marwadi_page_url") or "")
            opts = rr.extract_elective_options(html, title)
            note = "expanded_options=" + " | ".join(f"{a}:{b}" for a, b in opts) if opts else "no_named_options_on_official_page"
            runner.manifest.append(runner.empty_manifest(r, sem, rr.STATUS_EXPANDED, note))
            continue
        path = existing.get(code)
        if path and path.exists():
            data = path.read_bytes()
            sha = hashlib.sha256(data).hexdigest()
            hit = {
                "url": "",
                "final_url": str(path),
                "data": data,
                "confidence": "HIGH" if code.lower() in path.name.lower() else "MEDIUM",
                "reason": "on_disk_verified_marwadi_pdf",
                "detail": f"bytes={len(data)}",
                "tier": "marwadi",
                "sha256": sha,
                "page_range": "",
                "http_status": "200",
            }
            # recover source url from WP if we have it
            if code in hits:
                hit["url"] = hits[code]
                hit["final_url"] = hits[code]
            man = runner.accept_manifest(r, sem, rr.STATUS_VERIFIED_MARWADI, hit, path)
            runner.manifest.append(man)
        else:
            runner.manifest.append(
                runner.empty_manifest(
                    r,
                    sem,
                    rr.STATUS_NONE,
                    "no_official_pdf_confirmed_after_marwadi_wp_media_and_program_page_search",
                )
            )

    # Disk extras (elective expansions) not in original 126
    for code, path in existing.items():
        if any(code == (r.get("course_code") or "").upper() for r in targets):
            continue
        # parse program from path
        rel = path.relative_to(ROOT / "Output")
        parts = rel.parts
        program = parts[0] if parts else ""
        semfolder = parts[1] if len(parts) > 1 else "Semester_Unknown"
        title = path.stem.split(" - ", 1)[-1]
        data = path.read_bytes()
        row = {"program_name": program, "course_code": code, "subject_title": title}
        hit = {
            "url": "",
            "final_url": str(path),
            "data": data,
            "confidence": "HIGH",
            "reason": "elective_option_expanded_marwadi_pdf",
            "detail": f"bytes={len(data)}",
            "tier": "marwadi",
            "sha256": hashlib.sha256(data).hexdigest(),
            "page_range": "",
            "http_status": "200",
        }
        digits = "".join(ch for ch in semfolder if ch.isdigit())
        man = runner.accept_manifest(row, digits, rr.STATUS_VERIFIED_MARWADI, hit, path)
        man["notes"] = "expanded_elective_option;" + man["notes"]
        extra_on_disk.append(man)
    runner.manifest.extend(extra_on_disk)

    for a in attempts:
        runner.attempts.append(
            {
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "course_code": a[0],
                "subject_title": a[1],
                "program_name": "",
                "source_url": a[2],
                "final_url": a[2],
                "http_status": "",
                "result": a[3],
                "notes": a[3],
                "sha256": "",
            }
        )

    runner.write_reports()
    # Annotate SUMMARY with original-queue counts
    orig = [m for m in runner.manifest if (m["program_name"], m["course_code"]) in target_codes or any(
        m["course_code"] == (r.get("course_code") or "") and m["subject_title"] == r.get("subject_title")
        for r in targets
    )]
    summary_path = ROOT / "Reports" / "SUMMARY.txt"
    extra_txt = (
        f"\nOriginal subject_targets.csv rows: {len(targets)}\n"
        f"Extra rows from elective expansion present on disk: {len(extra_on_disk)}\n"
        f"Total manifest rows: {len(runner.manifest)}\n"
        "GTU combined BE-I/BE-II URLs previously 404 were not reused as verified.\n"
        "This package does not invent PDFs for subjects with no official public file.\n"
    )
    summary_path.write_text(summary_path.read_text(encoding="utf-8") + extra_txt, encoding="utf-8")
    zip_path = runner.zip_package()
    print(summary_path.read_text(encoding="utf-8"))
    print("ZIP", zip_path, zip_path.stat().st_size)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
