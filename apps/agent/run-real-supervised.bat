@echo off
title Flow Agent Core
cd /d "%~dp0"

pnpm dev:real
set "exit_code=%errorlevel%"

echo.
echo Flow Agent exited with code %exit_code%.
exit /b %exit_code%
