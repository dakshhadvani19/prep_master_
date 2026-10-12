@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title PrepMaster Management Studies Syllabus Recovery

echo ============================================================
echo PREPMASTER MANAGEMENT STUDIES SYLLABUS RECOVERY
echo Downloads and validates real syllabus PDFs.
echo Does NOT write to Supabase, GitHub, or the live catalog.
echo ============================================================
echo.

set "PYTHON_CMD="
set "PYTHON_LAUNCHER="
where py >nul 2>&1
if not errorlevel 1 (
  py -3 -c "import sys; raise SystemExit(0 if sys.version_info >= (3,10) else 1)" >nul 2>&1
  if not errorlevel 1 set "PYTHON_LAUNCHER=py -3"
)
if not defined PYTHON_LAUNCHER (
  where python >nul 2>&1
  if not errorlevel 1 (
    python -c "import sys; raise SystemExit(0 if sys.version_info >= (3,10) else 1)" >nul 2>&1
    if not errorlevel 1 set "PYTHON_LAUNCHER=python"
  )
)
if not defined PYTHON_LAUNCHER (
  echo ERROR: Python 3.10 or newer was not found.
  echo Install Python from https://www.python.org/downloads/windows/ and enable Add Python to PATH.
  pause
  exit /b 2
)

echo Python found. Setting up an isolated .venv so global Python packages are not changed.
if not exist ".venv\Scripts\python.exe" (
  %PYTHON_LAUNCHER% -m venv .venv
  if errorlevel 1 (
    echo ERROR: Could not create the virtual environment.
    pause
    exit /b 3
  )
)
set "PYTHON_CMD=%CD%\.venv\Scripts\python.exe"
if not exist "%PYTHON_CMD%" (
  echo ERROR: The virtual environment Python was not created correctly.
  pause
  exit /b 3
)

echo.
echo [1/3] Installing pinned dependencies inside .venv...
"%PYTHON_CMD%" -m pip install --disable-pip-version-check --timeout 20 --retries 2 -r requirements.txt
if errorlevel 1 (
  echo ERROR: Dependency installation failed. No recovery search was started.
  echo Check internet access, then run this file again.
  pause
  exit /b 4
)

echo.
echo [2/3] Running offline preflight tests before any long search...
"%PYTHON_CMD%" management_syllabus_recovery.py --preflight-only
if errorlevel 1 (
  echo ERROR: Preflight failed. The recovery search was not started.
  echo Send Output\fatal_error.txt or the console error for fixing.
  pause
  exit /b 4
)

echo.
echo [3/3] Searching official sources and collecting PDFs...
echo This may take several minutes. Keep this window open.
echo.
"%PYTHON_CMD%" management_syllabus_recovery.py
set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" (
  echo Recovery finished. Actual PDFs and reports are in the Output folder.
  echo Upload Output\Management_Studies_Syllabus_Collection_Output.zip for review.
) else (
  echo Recovery ended with code %RC%.
  echo Read Output\fatal_error.txt and Output\run_log.txt if present.
)
echo.
pause
exit /b %RC%
