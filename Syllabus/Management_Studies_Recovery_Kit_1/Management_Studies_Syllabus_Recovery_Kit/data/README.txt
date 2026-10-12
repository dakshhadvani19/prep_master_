The complete subject manifest is fetched at run time from:
https://raw.githubusercontent.com/dakshhadvani19/prep_master_/main/global-exam-prep/src/data/mockData.js
The runner validates that the content contains the expected Management Studies catalog domain before use.
This avoids embedding a stale subject list into the ZIP. If this source file changes format, the run stops
with a clear fatal_error.txt rather than silently collecting the wrong subjects.
