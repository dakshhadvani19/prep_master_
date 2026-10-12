@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo ================================================================
echo Marwadi B.Tech Verified Syllabus Recovery
echo Working directory: %CD%
echo ================================================================

where python >nul 2>&1
if errorlevel 1 (
    where py >nul 2>&1
    if errorlevel 1 (
        echo ERROR: Python 3 was not found on PATH.
        echo Install Python 3 from https://www.python.org/downloads/
        echo and tick "Add python.exe to PATH".
        set EXITCODE=1
        goto :hold
    )
    set PY=py -3
) else (
    set PY=python
)

echo Using: %PY%
%PY% --version
if errorlevel 1 (
    echo ERROR: Python did not start.
    set EXITCODE=1
    goto :hold
)

if exist requirements.txt (
    echo Checking Python packages from requirements.txt ...
    %PY% -m pip install -r requirements.txt
    if errorlevel 1 (
        echo ERROR: pip install failed.
        set EXITCODE=1
        goto :hold
    )
)

echo.
echo Running recovery_runner.py ...
%PY% recovery_runner.py
set EXITCODE=%ERRORLEVEL%
echo.
if not "%EXITCODE%"=="0" (
    echo recovery_runner.py exited with code %EXITCODE%
) else (
    echo recovery_runner.py finished successfully.
)

:hold
echo.
pause
exit /b %EXITCODE%
