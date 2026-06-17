@echo off
setlocal
cd /d "%~dp0\.."
set "PORT=%~1"
if "%PORT%"=="" set "PORT=8000"

echo COC Investigator Generator is starting on local port %PORT%...
echo Local: http://127.0.0.1:%PORT%/
echo Press Ctrl+C to stop the server.
python -m http.server %PORT%
