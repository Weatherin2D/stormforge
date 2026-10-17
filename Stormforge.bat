@echo off
cd /d "%~dp0"
title Stormforge
echo Starting Stormforge...
call npm start
if errorlevel 1 (
  echo.
  echo Stormforge failed to start. Is Node.js installed and on PATH?
  pause
)
