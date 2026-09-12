@echo off
title Flow Agent
cd /d "%~dp0"
echo Starting Flow Agent...
npx ts-node --esm apps/agent/src/index.ts --mock
pause
