@echo off
REM ============================================================
REM  GMAT Verbal Trainer launcher
REM  Double-click this file to start the app correctly.
REM  It serves this folder over http, auto-picks a free port,
REM  and opens your browser. (Opening index.html directly via
REM  file:// will NOT work -- the browser blocks the JSON fetch.)
REM ============================================================

cd /d "%~dp0"

REM Run the launcher (try the py launcher first, then python).
py "%~dp0start_app.py" 2>nul || python "%~dp0start_app.py"

REM If the launcher crashed for some reason, keep the window open
REM so the error message is readable.
if errorlevel 1 (
    echo.
    echo Something went wrong starting the server.
    echo Make sure Python is installed, then try again.
    pause
)
