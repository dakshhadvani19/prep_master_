@echo off
setlocal
cd /d "%~dp0"
title Marwadi University Diploma Syllabus Collector

echo ============================================================
echo MARWADI UNIVERSITY - OFFICIAL DIPLOMA SYLLABUS COLLECTION
echo Source: six official Marwadi course pages + Marwadi media index
echo Does NOT use Supabase or GitHub subject lists
echo ============================================================
echo.
where py >nul 2>nul
if errorlevel 1 (
  echo Python launcher "py" was not found. Install Python 3.11+ from python.org and enable Add Python to PATH.
  pause
  exit /b 2
)

if not exist .venv\Scripts\python.exe (
  echo Creating isolated Python environment...
  py -3 -m venv .venv
  if errorlevel 1 (
    echo Failed to create .venv.
    pause
    exit /b 2
  )
)

echo [1/3] Installing pinned dependencies in .venv...
.venv\Scripts\python.exe -m pip install --upgrade pip
if errorlevel 1 goto :failed
.venv\Scripts\python.exe -m pip install -r requirements.txt
if errorlevel 1 goto :failed

echo.
echo [2/3] Running offline preflight tests...
.venv\Scripts\python.exe collect_marwadi_diploma_syllabi.py --self-test
if errorlevel 1 goto :failed

echo.
echo [3/3] Downloading official Marwadi syllabi. Keep internet connected.
.venv\Scripts\python.exe collect_marwadi_diploma_syllabi.py
if errorlevel 1 goto :failed

echo.
echo Finished. Open Marwadi_Diploma_Complete_Syllabus_Collection.zip and review Reports\SUMMARY.txt.
echo The report distinguishes verified files from review items and failures.
pause
exit /b 0

:failed
echo.
echo Collection stopped due to an error. Read the message above and try again.
pause
exit /b 1
