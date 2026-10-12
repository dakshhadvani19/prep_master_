PREPMASTER MANAGEMENT STUDIES CLEANUP — PHASE 3
Date: 2026-10-12

Finding
- Live Supabase catalog CourseId 30, “Master In Global Business Management”, has 0 subject rows and 0 configured semesters.
- Source catalog audit likewise found no subjects for this course; 10 of 11 Management Studies entries had subject rows.
- This is an empty catalog entry, not a short populated program. Other programs are retained regardless of relative subject counts because program structures differ.

Changes
- Removed the empty course from mockData.js, courseMapping.json, granulated_non_eng.json, and processor_v3.cjs's recognized degree headers.

Limits
- Recovery run reports 806 subject occurrences, 317 normalized titles, 243 saved PDFs, and 74 titles with no acceptable official PDF found during that run.
- This PR does not claim all PDFs have been checked for course-code/semester scope or duplicate content. Original validation, occurrence, duplicate-title, failed-subject, and network reports remain historical evidence for PDF-level curation.
- Supabase row deletion is not included until foreign-key dependencies are confirmed.
