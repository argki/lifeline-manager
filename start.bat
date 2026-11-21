@echo off
setlocal
cd /d "%~dp0"

set "STARTING_FILE=%~dp0public\starting.html"
set "TARGET_URL=http://127.0.0.1:3456"
if exist "%STARTING_FILE%" (
  for /f "usebackq delims=" %%U in (`powershell -NoProfile -Command "[System.Uri]::new('%STARTING_FILE%').AbsoluteUri"`) do set "TARGET_URL=%%U"
)

echo [Lifeline Manager] Opening browser (%TARGET_URL%)...
set "EDGE_EXE="
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
  set "EDGE_EXE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
) else if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
  set "EDGE_EXE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
)

if defined EDGE_EXE (
  start "" "%EDGE_EXE%" --app="%TARGET_URL%"
) else (
  powershell -NoProfile -Command "Start-Process '%TARGET_URL%'"
)

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
echo [Lifeline Manager] Keeping WSL session active while container is running...
powershell -NoProfile -Command "$q = [char]34; Start-Process -FilePath 'wsl.exe' -WindowStyle Hidden -ArgumentList ('-e sh -c ' + $q + 'exec 9>/tmp/lifeline-manager-keepalive.lock && flock -n 9 && while docker inspect -f {{.State.Running}} lifeline-manager 2>/dev/null | grep -qx true; do sleep 10; done' + $q)"

echo [Lifeline Manager] Application is ready at http://127.0.0.1:3456
timeout /t 1 /nobreak >nul
exit /b 0
