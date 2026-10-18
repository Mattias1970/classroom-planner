@echo off
rem Dubbelklicka for att starta Classroom Planner Studio.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0starta.ps1" %*
if errorlevel 1 pause
