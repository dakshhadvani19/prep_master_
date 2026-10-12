@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title PrepMaster Law and Arts Syllabus Recovery
set "PYTHON_LAUNCHER="
set "PYTHON_CMD="
echo ============================================================
echo PREPMASTER LAW AND ARTS SYLLABUS RECOVERY
echo Downloads and validates real syllabus PDFs.
echo Does NOT write to Supabase, GitHub or the website catalog.
echo ============================================================
echo.
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
  echo Install from https://www.python.org/downloads/windows/ and select Add Python to PATH.
  pause
  exit /b 2
)
echo Creating/reusing an isolated .venv so global Python packages are not changed.
if not exist ".venv\Scripts\python.exe" (
  %PYTHON_LAUNCHER% -m venv .venv
  if errorlevel 1 (echo ERROR: Could not create .venv.& pause & exit /b 3)
)
set "PYTHON_CMD=%CD%\.venv\Scripts\python.exe"
if not exist "%PYTHON_CMD%" (echo ERROR: venv Python is missing.& pause & exit /b 3)
echo.
echo [1/3] Installing pinned dependencies into .venv...
"%PYTHON_CMD%" -m pip install --disable-pip-version-check --timeout 20 --retries 2 -r requirements.txt
if errorlevel 1 (echo ERROR: Dependency installation failed. No search started.& pause & exit /b 4)
echo.
echo [2/3] Running offline preflight tests...
"%PYTHON_CMD%" law_arts_syllabus_recovery.py --preflight-only
if errorlevel 1 (echo ERROR: Preflight failed; no search started.& pause & exit /b 5)
echo.
echo [3/3] Searching official sources and collecting PDFs...
echo Keep this window open until recovery completes.
echo.
"%PYTHON_CMD%" law_arts_syllabus_recovery.py
set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" (echo Finished. See Output\RUN_SUMMARY.txt and Output\Law_Arts_Syllabus_Collection_Output.zip.) else (echo Recovery failed with code %RC%. Check Output\fatal_error.txt and Output\run_log.txt.)
echo.
pause
exit /b %RC%
