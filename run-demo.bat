@echo off
title Flow Agent (Demo Mode)
cd /d "%~dp0"
echo Starting Flow Agent in demo mode (replaying pre-recorded session)...
npx tsx apps/agent/src/index.ts --demo
pause
