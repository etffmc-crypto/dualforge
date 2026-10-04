# Runs the check:full steps one by one and writes maintenance/reports/last-check.json.
# Exit code is non-zero when any step fails. Run from anywhere: powershell -File maintenance/run-checks.ps1
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Get-Process electron -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

$stepNames = @('typecheck', 'lint', 'format:check', 'test', 'coverage', 'test:ui', 'audit')
$results = @()
$allOk = $true

foreach ($name in $stepNames) {
  Write-Host "=== npm run $name ==="
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $out = & cmd.exe /c "npm run $name 2>&1"
  $code = $LASTEXITCODE
  $sw.Stop()
  $ok = ($code -eq 0)
  if (-not $ok) { $allOk = $false }
  $lines = @($out | ForEach-Object { "$_" })
  $tail = ($lines | Select-Object -Last 25) -join "`n"
  Write-Host ("    {0} in {1} ms" -f ($(if ($ok) { 'ok' } else { 'FAILED' })), $sw.ElapsedMilliseconds)
  $results += [ordered]@{ name = $name; ok = $ok; ms = [int]$sw.ElapsedMilliseconds; tail = $tail }
}

$report = [ordered]@{
  ranAt = (Get-Date).ToUniversalTime().ToString('o')
  node  = (& node --version)
  steps = $results
  ok    = $allOk
}
$dir = Join-Path $root 'maintenance/reports'
New-Item -ItemType Directory -Force $dir | Out-Null
$json = $report | ConvertTo-Json -Depth 6
[System.IO.File]::WriteAllText((Join-Path $dir 'last-check.json'), $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Host ("Wrote maintenance/reports/last-check.json (ok={0})" -f $allOk)
if ($allOk) { exit 0 } else { exit 1 }
