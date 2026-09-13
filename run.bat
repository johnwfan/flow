@echo off
title Flow Agent Launcher
cd /d "%~dp0"
echo Starting Flow Agent (live camera)...
echo Preflight will verify the agent and HD Webcam, then the page will open for alignment.
rem No fixed --camera index: the agent now prefers the Windows camera named
rem FLOW_SENSING_CAMERA_NAME (default: HD Webcam), probes SmartSpectra's
rem numeric indices, and remembers the last-good index. List what Windows sees
rem with: Get-PnpDevice -Class Camera | Select-Object Status, FriendlyName
start "Flow Agent Core" "%~dp0apps\agent\run-real-supervised.bat"
echo Waiting for camera launch signal...

set preflight_tries=0
:preflight
set /a preflight_tries+=1
pnpm --filter @flow/agent preflight -- --launch-check
if errorlevel 1 (
  if %preflight_tries% lss 4 (
    echo.
    echo Camera launch check failed; the agent may be restarting. Retrying...
    timeout /t 3 /nobreak >nul
    goto preflight
  )
  echo.
  echo Camera launch check failed. The live session page was not opened.
  echo Check the Flow Agent Core window for the exact camera/SDK message.
  pause
  exit /b 1
)
echo Opening https://tryflow.study/session ...
start "" "https://tryflow.study/session"
pause
