@echo off
setlocal
cd /d "%~dp0\.."
where npm >nul 2>&1
if not "%errorlevel%"=="0" (
  echo Install Node.js 22.12 or later before starting this app.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Install dependencies first with npm ci.
  pause
  exit /b 1
)
echo Starting COC Investigator Archive on http://127.0.0.1:5173/
echo Press Ctrl+C to stop the server.
call npm run dev
