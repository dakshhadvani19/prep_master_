\
@echo off
setlocal
cd /d "%~dp0"
where py >nul 2>nul
if %errorlevel%==0 (
  set "PY=py -3"
) else (
  set "PY=python"
)
%PY% --version
if errorlevel 1 (
  echo Python 3.10 or newer is required. Install Python from https://www.python.org/downloads/
  pause
  exit /b 1
)
%PY% -m pip install --upgrade pip
if errorlevel 1 goto :failed
%PY% -m pip install -r requirements.txt
if errorlevel 1 goto :failed
%PY% runner.py
if errorlevel 1 goto :failed
echo.
echo Finished. Review the output folder and RUN_SUMMARY.txt.
pause
exit /b 0
:failed
echo.
echo Runner stopped because a command failed. Check the error above and README.md.
pause
exit /b 1
