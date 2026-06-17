@echo off
setlocal
set "PORT=%~1"
if "%PORT%"=="" set "PORT=8000"

net session >nul 2>&1
if not "%errorlevel%"=="0" (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -ArgumentList '%PORT%' -Verb RunAs"
  exit /b
)

netsh advfirewall firewall delete rule name="COC Generator Port %PORT%" >nul 2>&1
netsh advfirewall firewall add rule name="COC Generator Port %PORT%" dir=in action=allow protocol=TCP localport=%PORT% profile=private

echo.
echo Windows Firewall now allows TCP port %PORT% on private networks.
echo This optional helper is only needed when you intentionally expose the local server to your LAN.
pause
