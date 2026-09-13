@echo off
title Flow Agent
cd /d "%~dp0"
echo Starting Flow Agent (live camera)...
echo If the camera fails, close this and run run-demo.bat instead.
rem No fixed --camera index: the agent now probes device indices 0-3 on
rem its own and retries after a failed open (see src/index.ts's camera
rem auto-probe), since whichever webcam a hardcoded index pointed at may
rem not be the one plugged in right now. List what Windows currently sees
rem with: Get-PnpDevice -Class Camera | Select-Object Status, FriendlyName
echo Opening https://tryflow.study/session ...
start "" "https://tryflow.study/session"
npx tsx apps/agent/src/index.ts --real
pause
