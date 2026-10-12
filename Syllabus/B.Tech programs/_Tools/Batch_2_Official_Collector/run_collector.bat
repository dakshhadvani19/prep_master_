@echo off
setlocal
cd /d "%~dp0"
echo Installing the small set of required Python packages...
py -m pip install -r requirements.txt
if errorlevel 1 goto error
echo.
echo Starting Marwadi-first syllabus collection...
py build_syllabus_archive.py
if errorlevel 1 goto error
echo.
echo Completed. Read the collection README and CSV reports for missing PDFs.
pause
exit /b 0
:error
echo.
echo The collector could not complete. Check the error above and see README.md.
pause
exit /b 1
