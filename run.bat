@echo off
title Flow Agent
cd /d "%~dp0"
echo Starting Flow Agent (live camera)...
echo If the camera fails, close this and run run-demo.bat instead.
npx tsx apps/agent/src/index.ts --real
pause
