#!/usr/bin/env python3
"""Unit tests for recovery_runner helpers and failure cases.

These tests do not require live university websites. HTTP is mocked.
"""
from __future__ import annotations

import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from pypdf import PdfWriter  # noqa: E402

import recovery_runner as rr  # noqa: E402


def make_pdf_bytes(text: str) -> bytes:
    from pypdf.generic import ContentStream, NameObject, NumberObject, DictionaryObject
    from pypdf import PageObject

    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)
    # Minimal visible text via /Contents is fiddly; pypdf 4 can add text with _add_text?
    # Fallback: write a PDF with the text in a metadata-free stream using report-less method.
    # We inject the subject string into a page content stream as raw text so extract_text
    # may or may not see it; tests that need extract_text use PdfWriter.add_js-free
    # approach: put the string in an extra page annotation-less object via
    # writer.add_metadata and also as a comment... extract_text needs Tj operators.
    raw = (
        b"%PDF-1.4\n"
        b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
        b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
        b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]"
        b"/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n"
        b"4 0 obj<</Length 80>>stream\n"
        b"BT /F1 12 Tf 50 700 Td (" + text.encode("latin-1", "replace")[:60] + b") Tj ET\n"
        b"endstream\nendobj\n"
        b"5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n"
        b"xref\n0 6\n0000000000 65535 f \n"
        b"trailer<</Size 6/Root 1 0 R>>\nstartxref\n0\n%%EOF\n"
    )
    # Pad to MIN_PDF_BYTES
    if len(raw) < rr.MIN_PDF_BYTES:
        raw = raw + b"\n" + b"%" * (rr.MIN_PDF_BYTES - len(raw) + 8)
    _ = (PdfWriter, PageObject, ContentStream, NameObject, NumberObject, DictionaryObject, io)
    return raw


class HelperTests(unittest.TestCase):
    def test_404_is_not_transient(self):
        self.assertFalse(rr.should_retry(404, None))
        self.assertTrue(rr.should_retry(503, None))
        self.assertTrue(rr.should_retry(None, Exception("timeout")))

    def test_html_is_not_pdf_magic(self):
        self.assertFalse(rr.is_pdf_magic(b"<!DOCTYPE html><html>"))
        self.assertTrue(rr.is_pdf_magic(b"%PDF-1.5\n..."))

    def test_gtu_branch_index_is_low(self):
        conf, reason = rr.match_confidence(
            "Compiler Design",
            "01CE0601",
            "branch listing",
            "https://old26.gtu.ac.in/syllabus/Branch.aspx?tp=BE",
        )
        self.assertEqual(conf, "LOW")
        self.assertIn("branch", reason)

    def test_group_heading_detection(self):
        self.assertTrue(rr.is_group_heading("Program Elective - 1", "01IT04XX"))
        self.assertTrue(rr.is_group_heading("OPEN ELECTIVE", "01ITXXXX"))
        self.assertFalse(rr.is_group_heading("Compiler Design", "01CE0601"))

    def test_semester_not_from_code_first_digit(self):
        html = """
        <h3>SEM 6</h3>
        <a href="#">COMPILER DESIGN(01CE0601)</a>
        <h3>SEM 2</h3>
        <a href="#">Digital Electronics(01EC0102)</a>
        """
        sm = rr.parse_semester_map(html)
        self.assertEqual(sm.get("01CE0601"), "6")
        self.assertEqual(sm.get("01EC0102"), "2")
        # Code starts with 01 — must not become semester 0 or 1 from the code.
        self.assertNotEqual(sm.get("01CE0601"), "0")
        self.assertNotEqual(sm.get("01CE0601"), "1")

    def test_semester_from_tab_panels_not_last_button(self):
        html = """
        <a class="tab-link" data-tab="tabpanel-sub-one">SEM 1</a>
        <a class="tab-link" data-tab="tabpanel-sub-eight">SEM 8</a>
        <div id="tabpanel-sub-one"><a href="#">Computer Programming(01CE1101)</a></div>
        <div id="tabpanel-sub-eight"><a href="#">Major Project – 2(01IT1801)</a></div>
        """
        sm = rr.parse_semester_map(html)
        self.assertEqual(sm.get("01CE1101"), "1")
        self.assertEqual(sm.get("01IT1801"), "8")

    def test_low_match_rejected(self):
        conf, _ = rr.match_confidence(
            "Natural Language Processing",
            "01IT0713",
            "hostel fee circular academic calendar",
            "https://www.marwadiuniversity.ac.in/wp-content/uploads/2026/05/Program_Fees_2026-27.pdf",
        )
        self.assertEqual(conf, "LOW")

    def test_high_match_code_and_title(self):
        conf, _ = rr.match_confidence(
            "Digital Electronics",
            "01EC0102",
            "Marwadi University syllabus Digital Electronics 01EC0102 unit 1 logic gates",
            "https://www.marwadiuniversity.ac.in/wp-content/uploads/2025/02/01EC0102-Digital-Electronics.pdf",
        )
        self.assertEqual(conf, "HIGH")

    def test_foreign_course_code_is_low(self):
        conf, reason = rr.match_confidence(
            "Java Programming",
            "01IT0504",
            "programming using java",
            "https://www.marwadiuniversity.ac.in/wp-content/uploads/2025/03/05bc1304_programming-using-java.pdf",
        )
        self.assertEqual(conf, "LOW")
        self.assertIn("different_course_code", reason)


class ClassifyPdfTests(unittest.TestCase):
    def test_html_body_fails_open(self):
        ok, text, err = rr.classify_pdf_open(b"<html>not a pdf</html>" + b" " * 1000)
        self.assertFalse(ok)
        self.assertIn("not_pdf_magic", err)

    def test_too_small_pdf(self):
        ok, _, err = rr.classify_pdf_open(b"%PDF-1.4 tiny")
        self.assertFalse(ok)
        self.assertIn("too_small", err)


class MockedHttpTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / "data").mkdir()
        (self.root / "Output").mkdir()
        (self.root / "Reports").mkdir()
        # Minimal targets file
        (self.root / "data" / "subject_targets.csv").write_text(
            "program_name,course_code,subject_title,semester\n"
            "B.Tech Information Technology,01IT0504,PYTHON PROGRAMMING,\n",
            encoding="utf-8",
        )
        (self.root / "data" / "source_catalog.csv").write_text(
            "source_id,source_name,base_url,source_type,priority,notes\n"
            "gtu,GTU,https://old26.gtu.ac.in/syllabus/Branch.aspx?tp=BE,index,2,index\n",
            encoding="utf-8",
        )
        self.runner = rr.RecoveryRunner(self.root)

    def tearDown(self):
        self.tmp.cleanup()

    def test_404_not_accepted(self):
        row = {
            "program_name": "B.Tech Information Technology",
            "course_code": "01IT0504",
            "subject_title": "PYTHON PROGRAMMING",
        }
        self.runner.http.request = lambda url, **k: {
            "ok": False,
            "status": 404,
            "final_url": url,
            "content": b"not found",
            "error": "",
            "attempts": 1,
            "content_type": "text/html",
        }
        hit = self.runner.validate_remote(
            row, "https://www.marwadiuniversity.ac.in/missing.pdf", "marwadi"
        )
        self.assertIsNone(hit)
        self.assertTrue(any(a.get("result") == "http_404" for a in self.runner.attempts))

    def test_html_200_not_accepted(self):
        row = {
            "program_name": "B.Tech Information Technology",
            "course_code": "01IT0504",
            "subject_title": "PYTHON PROGRAMMING",
        }
        html = b"<!DOCTYPE html><html><body>Python Programming syllabus page</body></html>" + b" " * 900
        self.runner.http.request = lambda url, **k: {
            "ok": True,
            "status": 200,
            "final_url": url,
            "content": html,
            "error": "",
            "attempts": 1,
            "content_type": "text/html",
        }
        hit = self.runner.validate_remote(
            row, "https://www.marwadiuniversity.ac.in/python/", "marwadi"
        )
        self.assertIsNone(hit)
        self.assertTrue(any(a.get("result") == "not_valid_pdf" for a in self.runner.attempts))

    def test_unofficial_host_rejected(self):
        row = {
            "program_name": "B.Tech Information Technology",
            "course_code": "01IT0504",
            "subject_title": "PYTHON PROGRAMMING",
        }
        self.runner.http.request = lambda url, **k: {
            "ok": True,
            "status": 200,
            "final_url": "https://random-blog.example/python.pdf",
            "content": make_pdf_bytes("PYTHON PROGRAMMING 01IT0504 syllabus"),
            "error": "",
            "attempts": 1,
            "content_type": "application/pdf",
        }
        hit = self.runner.validate_remote(
            row, "https://www.marwadiuniversity.ac.in/x.pdf", "marwadi"
        )
        self.assertIsNone(hit)
        self.assertTrue(
            any(a.get("result") == "redirected_off_official_host" for a in self.runner.attempts)
        )

    def test_group_heading_expands_without_pdf(self):
        html = """
        <h3>Department Elective – 1</h3>
        <a href="#">Advanced Computer Network (01IT1503)</a>
        <a href="#">Image Processing(01IT0508)</a>
        """
        self.runner.page_html[
            "https://www.marwadiuniversity.ac.in/btech-in-information-technology-colleges/"
        ] = html
        extra = []
        row = {
            "program_name": "B.Tech Information Technology",
            "course_code": "01ITXXXX",
            "subject_title": "Department Elective – 1",
        }
        man = self.runner.process_row(row, extra)
        self.assertEqual(man["status"], rr.STATUS_EXPANDED)
        self.assertEqual(len(extra), 2)
        self.assertEqual(extra[0]["course_code"], "01IT1503")


if __name__ == "__main__":
    unittest.main()
