@echo off
setlocal
cd /d "%~dp0"

echo [Lifeline Manager] Checking Docker on WSL...
wsl docker info >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Docker is not running on WSL. Please start Docker in WSL and try again.
  pause
  exit /b 1
)

echo [Lifeline Manager] Starting container on WSL...
wsl docker compose up -d
if errorlevel 1 (
  echo [ERROR] Failed to start container.
  pause
  exit /b 1
)

echo [Lifeline Manager] Waiting for application health check...
set /a COUNT=0
:WAIT_LOOP
set /a COUNT+=1
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3456/api/health' -TimeoutSec 2; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
if %errorlevel%==0 goto READY

if %COUNT% GEQ 30 (
  echo [ERROR] Timed out waiting for application startup. Check logs with: wsl docker compose logs
  pause
  exit /b 1
)

timeout /t 1 /nobreak >nul
goto WAIT_LOOP

:READY
echo [Lifeline Manager] Opening browser (http://127.0.0.1:3456)...
start "" "http://127.0.0.1:3456"
exit /b 0
