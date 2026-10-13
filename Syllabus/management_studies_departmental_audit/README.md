# Management Studies departmental subject audit

Mapping:
- ESE marks are zero or no ESE assessment: isDepartmentalSubject=true.
- Positive ESE marks: isDepartmentalSubject=false.
- Unresolved evidence: preserve current value.

Audit scope: course IDs 20–30 in public."Courses" / public."Subjects".
The workflow must not write to Supabase; it reports evidence and proposed changes only.


Latest audit execution is performed by the GitHub Actions workflow; generated CSV/JSON reports are artifacts and this process does not write to Supabase.
