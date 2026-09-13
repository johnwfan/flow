@echo off
title Flow Agent Launcher
cd /d "%~dp0"
echo Starting Flow Agent (live camera)...
echo Preflight will prove the HD Webcam before the session page opens.
rem No fixed --camera index: the agent now prefers the Windows camera named
rem FLOW_SENSING_CAMERA_NAME (default: HD Webcam), probes SmartSpectra's
rem numeric indices, and remembers the last-good index. List what Windows sees
rem with: Get-PnpDevice -Class Camera | Select-Object Status, FriendlyName
start "Flow Agent Core" cmd /k "cd /d ""%~dp0apps\agent"" && pnpm dev:real"
echo Waiting for live camera samples...
pnpm --filter @flow/agent preflight
if errorlevel 1 (
  echo.
  echo Camera preflight failed. The live session page was not opened.
  echo Check the Flow Agent Core window for the exact camera/SDK message.
  pause
  exit /b 1
)
echo Opening https://tryflow.study/session ...
start "" "https://tryflow.study/session"
pause
