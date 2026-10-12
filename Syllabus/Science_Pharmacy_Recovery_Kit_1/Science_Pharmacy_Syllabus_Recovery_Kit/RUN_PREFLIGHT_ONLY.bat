@echo off
setlocal EnableExtensions
cd /d "%~dp0"
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
if not defined PYTHON_LAUNCHER (echo Python 3.10+ is required.& pause & exit /b 2)
if not exist ".venv\Scripts\python.exe" (%PYTHON_LAUNCHER% -m venv .venv)
if errorlevel 1 (echo Could not create venv.& pause & exit /b 3)
set "PYTHON_CMD=%CD%\.venv\Scripts\python.exe"
"%PYTHON_CMD%" -m pip install --disable-pip-version-check --timeout 20 --retries 2 -r requirements.txt
if errorlevel 1 (echo Dependency installation failed.& pause & exit /b 4)
"%PYTHON_CMD%" science_pharmacy_syllabus_recovery.py --preflight-only
set "RC=%ERRORLEVEL%"
echo.
if "%RC%"=="0" (echo Preflight passed.) else (echo Preflight failed with code %RC%.)
pause
exit /b %RC%
