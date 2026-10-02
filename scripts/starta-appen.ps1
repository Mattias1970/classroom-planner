# Startar Classroom Planner Studio på den här datorn (Windows PowerShell).
#
#   Första gången på en ny dator:   .\scripts\starta-appen.ps1
#   Nästa gång:                     samma kommando — hämtar senaste version och startar
#
# Kräver Git och Node.js 22 (https://nodejs.org). Appen öppnas på http://localhost:4173
# och kan även nås från andra datorer på samma nätverk via datorns IP-adress.
$ErrorActionPreference = 'Stop'
$rot = Split-Path -Parent $PSScriptRoot
Set-Location $rot
Write-Host "Hämtar senaste version …"
git pull --ff-only
Write-Host "Installerar beroenden …"
npm install
Write-Host "Bygger och startar appen (Ctrl+C stoppar) …"
Start-Process "http://localhost:4173/"
npm run start
