@echo off
title Flow Agent
cd /d "%~dp0"
echo Starting Flow Agent (live camera)...
echo If the camera fails, close this and run run-demo.bat instead.
rem --camera 1 selects the external USB webcam on this machine (index 0
rem is the laptop's built-in camera, which SmartSpectra can't use).
rem If you plug the webcam into a different port and the index changes,
rem edit the number below -- or list devices in PowerShell with:
rem   Get-PnpDevice -Class Camera | Select-Object Status, FriendlyName
npx tsx apps/agent/src/index.ts --real --camera 1
pause
