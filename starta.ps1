# Startar Classroom Planner Studio.
#   Dubbelklicka på starta.cmd, eller kör:  powershell -ExecutionPolicy Bypass -File .\starta.ps1
#   Parametrar:  -UtanPull   hoppa över git pull
#                -Dela       gör appen nåbar från andra enheter på nätverket (--host)
#                -Port 5173  annan port
param([switch]$UtanPull, [switch]$Dela, [int]$Port = 5173)

$ErrorActionPreference = 'Stop'
$rot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $rot
$Host.UI.RawUI.WindowTitle = "Classroom Planner – Studio (port $Port)"

function Steg($t) { Write-Host "`n== $t" -ForegroundColor Cyan }

# 1. Node måste finnas
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js saknas. Installera från https://nodejs.org (LTS) och kör igen." -ForegroundColor Red
  Read-Host "Tryck Enter för att stänga"; exit 1
}

# 2. Senaste koden
if (-not $UtanPull -and (Test-Path '.git')) {
  Steg 'Hämtar senaste koden (git pull)'
  $gren = git rev-parse --abbrev-ref HEAD
  $status = git status --porcelain
  if ($status) { Write-Host "Osparade ändringar finns – hoppar över git pull." -ForegroundColor Yellow }
  else {
    git pull --ff-only origin $gren
    if ($LASTEXITCODE -ne 0) { Write-Host "git pull misslyckades – startar ändå med den kod som finns." -ForegroundColor Yellow }
  }
}

# 3. Paket – installera när package-lock är nyare än node_modules
$lock = Get-Item 'package-lock.json' -ErrorAction SilentlyContinue
$nm = Get-Item 'node_modules' -ErrorAction SilentlyContinue
if (-not $nm -or ($lock -and $lock.LastWriteTime -gt $nm.LastWriteTime)) {
  Steg 'Installerar paket (npm install)'
  npm install
  if ($LASTEXITCODE -ne 0) { Read-Host "npm install misslyckades. Tryck Enter för att stänga"; exit 1 }
  (Get-Item 'node_modules').LastWriteTime = Get-Date
}

# 4. Öppna webbläsaren när servern svarar, sedan starta vite i förgrunden
$url = "http://localhost:$Port/"
Steg "Startar appen på $url  (Ctrl+C stänger)"
Start-Job -ScriptBlock {
  param($u)
  for ($i = 0; $i -lt 60; $i++) {
    try { Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 1 | Out-Null; Start-Process $u; break } catch { Start-Sleep -Milliseconds 500 }
  }
} -ArgumentList $url | Out-Null

$arg = @('run', 'dev', '--workspace', 'packages/studio', '--', '--port', "$Port", '--strictPort')
if ($Dela) { $arg += '--host' }
npm @arg
