@echo off
setlocal
cd /d "%~dp0"
title Marwadi B.Tech Syllabus Collector - Batch 1

echo ================================================================
echo Marwadi B.Tech syllabus collector - first five programs
echo ================================================================
echo This downloads real PDFs from Marwadi's official pages to this PC.
echo Failed/missing PDFs are recorded for later GTU fallback research.
echo.

set "PY=python"
where py >nul 2>nul
if %errorlevel%==0 set "PY=py -3"
%PY% --version >nul 2>nul
if errorlevel 1 (
  echo Python was not found in PATH.
  echo Install Python 3.10+ from https://www.python.org/downloads/windows/ or run this from Anaconda Prompt.
  echo Then open this folder in Anaconda Prompt and run: python collect_batch1.py
  pause
  exit /b 1
)

echo Installing required packages if missing...
%PY% -m pip install -r requirements.txt
if errorlevel 1 (
  echo Dependency installation failed. See the error above.
  pause
  exit /b 1
)

echo.
echo Starting collection. Keep this window open.
%PY% collect_batch1.py
if errorlevel 1 (
  echo Collection ended with an error. Check output\reports\run_log.txt if it exists.
  pause
  exit /b 1
)
echo.
echo Finished. Your ZIP is in the output folder.
echo Upload output\Marwadi_BTech_Batch1_Actual_Files.zip back to this chat so the missing-subject list can be mapped to GTU.
pause
