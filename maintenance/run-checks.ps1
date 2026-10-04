# Runs the check:full steps one by one and writes maintenance/reports/last-check.json.
# Each step has a timeout; on timeout the process tree is killed. Exit code: 0 all ok, 1 a step failed, 2 no node.
# Run from anywhere: powershell -File maintenance/run-checks.ps1
$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$env:NO_COLOR = '1'
$env:FORCE_COLOR = '0'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'node not found on PATH'
  exit 2
}

# Only stop Electron processes that belong to this repo (dev electron or the unpacked release build).
function Stop-RepoElectron {
  $prefixes = @(
    (Join-Path $root 'node_modules\electron\'),
    (Join-Path $root 'apps\desktop\release\')
  )
  Get-Process -ErrorAction SilentlyContinue | Where-Object {
    $p = $null
    try { $p = $_.Path } catch {}
    if (-not $p) { return $false }
    foreach ($pre in $prefixes) { if ($p.StartsWith($pre, [System.StringComparison]::OrdinalIgnoreCase)) { return $true } }
    return $false
  } | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }
}

$steps = @(
  @{ name = 'typecheck';    minutes = 5 },
  @{ name = 'lint';         minutes = 5 },
  @{ name = 'format:check'; minutes = 3 },
  @{ name = 'test';         minutes = 10 },
  @{ name = 'coverage';     minutes = 10 },
  @{ name = 'test:ui';      minutes = 10 },
  @{ name = 'audit';        minutes = 3 }
)
$results = @()
$allOk = $true
$tmp = Join-Path ([System.IO.Path]::GetTempPath()) ('dualforge-check-' + [guid]::NewGuid().ToString('N') + '.log')

Stop-RepoElectron
try {
  foreach ($s in $steps) {
    $name = $s.name
    Write-Host "=== npm run $name ==="
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $proc = Start-Process -FilePath 'cmd.exe' -ArgumentList "/c npm run $name > `"$tmp`" 2>&1" -WorkingDirectory $root -NoNewWindow -PassThru
    $null = $proc.Handle # cache the handle so ExitCode is readable
    $finished = $proc.WaitForExit($s.minutes * 60 * 1000)
    if ($finished) { $proc.WaitForExit() }
    $timedOut = -not $finished
    if ($timedOut) { & taskkill /T /F /PID $proc.Id 2>&1 | Out-Null }
    $sw.Stop()
    if ($name -eq 'test:ui' -or $timedOut) { Stop-RepoElectron }
    $ok = (-not $timedOut) -and ($proc.ExitCode -eq 0)
    if ($timedOut) {
      $tail = 'timeout'
    } else {
      $lines = @()
      if (Test-Path $tmp) { $lines = @(Get-Content $tmp -ErrorAction SilentlyContinue) }
      $tail = ($lines | Select-Object -Last 25) -join "`n"
    }
    if (-not $ok) { $allOk = $false }
    Write-Host ("    {0} in {1} ms" -f ($(if ($ok) { 'ok' } elseif ($timedOut) { 'TIMEOUT' } else { 'FAILED' })), $sw.ElapsedMilliseconds)
    $results += [ordered]@{ name = $name; ok = $ok; ms = [int]$sw.ElapsedMilliseconds; tail = $tail }
  }
} finally {
  Stop-RepoElectron
  Remove-Item $tmp -ErrorAction SilentlyContinue
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
