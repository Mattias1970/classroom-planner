# Startar Classroom Planner Studio.
#   Dubbelklicka pa starta.cmd, eller kor:  powershell -ExecutionPolicy Bypass -File .\starta.ps1
#   Parametrar:  -UtanPull   hoppa over git pull
#                -Dela       gor appen nabar fran andra enheter pa natverket (--host)
#                -Port 5173  annan port
param([switch]$UtanPull, [switch]$Dela, [int]$Port = 5173)

$ErrorActionPreference = 'Stop'
$rot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $rot
$Host.UI.RawUI.WindowTitle = "Classroom Planner - Studio (port $Port)"

function Steg($t) { Write-Host "`n== $t" -ForegroundColor Cyan }

# 1. Node maste finnas
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "Node.js saknas. Installera fran https://nodejs.org (LTS) och kor igen." -ForegroundColor Red
  Read-Host "Tryck Enter for att stanga"; exit 1
}

# 2. Senaste koden
if (-not $UtanPull -and (Test-Path '.git')) {
  Steg 'Hamtar senaste koden (git pull)'
  $gren = git rev-parse --abbrev-ref HEAD
  $status = git status --porcelain
  if ($status) { Write-Host "Osparade andringar finns - hoppar over git pull." -ForegroundColor Yellow }
  else {
    git pull --ff-only origin $gren
    if ($LASTEXITCODE -ne 0) { Write-Host "git pull misslyckades - startar anda med den kod som finns." -ForegroundColor Yellow }
  }
}

# 3. Paket - installera nar package-lock ar nyare an node_modules
$lock = Get-Item 'package-lock.json' -ErrorAction SilentlyContinue
$nm = Get-Item 'node_modules' -ErrorAction SilentlyContinue
if (-not $nm -or ($lock -and $lock.LastWriteTime -gt $nm.LastWriteTime)) {
  Steg 'Installerar paket (npm install)'
  npm install
  if ($LASTEXITCODE -ne 0) { Read-Host "npm install misslyckades. Tryck Enter for att stanga"; exit 1 }
  (Get-Item 'node_modules').LastWriteTime = Get-Date
}

# 4. Oppna webblasaren nar servern svarar, sedan starta vite i forgrunden
$url = "http://localhost:$Port/"
Steg "Startar appen pa $url  (Ctrl+C stanger)"
Start-Job -ScriptBlock {
  param($u)
  for ($i = 0; $i -lt 60; $i++) {
    try {
      Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 1 | Out-Null
      # Chrome om den finns, annars standardwebblasaren
      $chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
      if ($chrome) { Start-Process $chrome $u } else { Start-Process $u }
      break
    } catch { Start-Sleep -Milliseconds 500 }
  }
} -ArgumentList $url | Out-Null

$arg = @('run', 'dev', '--workspace', 'packages/studio', '--', '--port', "$Port", '--strictPort')
if ($Dela) { $arg += '--host' }
npm @arg
