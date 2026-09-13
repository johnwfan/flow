@echo off
title Flow Agent (Demo Mode)
cd /d "%~dp0"
echo Starting Flow Agent in demo mode (replaying pre-recorded session)...
echo Opening https://tryflow.study/session ...
start "" "https://tryflow.study/session"
npx tsx apps/agent/src/index.ts --demo
pause
