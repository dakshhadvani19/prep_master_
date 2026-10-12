@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "PYTHON_LAUNCHER="
set "PYTHON_CMD="
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
  echo Python 3.10 or newer was not found. Install it from https://www.python.org/downloads/windows/.
  set "RC=2"
  goto done
)
if not exist ".venv\Scripts\python.exe" (
  echo Creating isolated .venv...
  %PYTHON_LAUNCHER% -m venv .venv
  if errorlevel 1 (
    echo Could not create .venv.
    set "RC=3"
    goto done
  )
)
set "PYTHON_CMD=%CD%\.venv\Scripts\python.exe"
if not exist "%PYTHON_CMD%" (
  echo .venv Python was not found.
  set "RC=3"
  goto done
)
echo Installing dependencies inside .venv; global Python packages are not changed.
"%PYTHON_CMD%" -m pip install --disable-pip-version-check --timeout 20 --retries 2 -r requirements.txt
if errorlevel 1 (
  echo Dependency installation failed.
  set "RC=4"
  goto done
)
"%PYTHON_CMD%" management_syllabus_recovery.py --preflight-only
set "RC=%ERRORLEVEL%"
:done
echo.
if "%RC%"=="0" (echo Preflight passed.) else (echo Preflight failed with code %RC%.)
pause
exit /b %RC%
