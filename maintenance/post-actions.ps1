<#
.SYNOPSIS
  Stage 2 of the issue responder: carries out maintenance/outbox/actions.json (written by stage 1, an LLM without a
  token) after strict validation. No LLM runs here; this script is the only place that holds the GitHub token.

.DESCRIPTION
  - Token: the User environment variable DUALFORGE_GH_TOKEN (fine-grained PAT, see maintenance/README.md).
  - Validation: scripts/post-actions-validate.mjs (allowed templates/labels only, branch names
    ^fix/(issue-\d+|watchdog-[a-z]+-\d{4}-\d{2}-\d{2})$, <= 10 comments, <= 2 PRs). One bad entry refuses the file.
  - Every referenced issue must exist and be open (not a PR). Every branch must exist locally, be ahead of origin/main,
    change no protected path, and contain no trace of the token; otherwise the whole file is refused.
  - Pushes go to https://github.com/etffmc-crypto/dualforge.git as <branch>:refs/heads/<branch> only (never tags or
    main), with the token in a per-process git config header (not on the command line, no credential helper).
  - Stops at the first HTTP 403 or 429 (permissions or rate limit) and leaves the outbox file for the next run.
  - Log: maintenance/reports/post-actions-YYYY-MM-DD.log. Processed files move to maintenance/outbox/done/,
    refused ones to maintenance/outbox/rejected/.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File maintenance\post-actions.ps1 -DryRun
#>
param(
  [switch]$DryRun,
  [string]$Outbox = ''
)
$ErrorActionPreference = 'Stop'
$Repo = 'etffmc-crypto/dualforge'
$Api = "https://api.github.com/repos/$Repo"
$RemoteUrl = "https://github.com/$Repo.git"
$Root = Split-Path -Parent $PSScriptRoot
if (-not $Outbox) { $Outbox = Join-Path $Root 'maintenance\outbox\actions.json' }
$ReportDir = Join-Path $Root 'maintenance\reports'
New-Item -ItemType Directory -Force $ReportDir | Out-Null
$LogFile = Join-Path $ReportDir ("post-actions-{0}.log" -f (Get-Date -Format 'yyyy-MM-dd'))
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'

function Log([string]$msg) {
  $line = '{0} {1}' -f (Get-Date -Format 'HH:mm:ss'), $msg
  Write-Output $line
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

function Move-Outbox([string]$kind) {
  $dir = Join-Path (Split-Path -Parent $Outbox) $kind
  New-Item -ItemType Directory -Force $dir | Out-Null
  Move-Item -Path $Outbox -Destination (Join-Path $dir "actions-$Stamp.json") -Force
}

class StopRun : System.Exception { StopRun([string]$m) : base($m) {} }

function Invoke-Gh([string]$Method, [string]$Path, $Body = $null) {
  $headers = @{
    Accept                 = 'application/vnd.github+json'
    'X-GitHub-Api-Version' = '2022-11-28'
    'User-Agent'           = 'dualforge-post-actions'
  }
  if ($script:Token) { $headers.Authorization = "Bearer $script:Token" }
  $req = @{ Method = $Method; Uri = "$Api$Path"; Headers = $headers; UseBasicParsing = $true }
  if ($null -ne $Body) {
    $req.Body = [Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 6 -Compress))
    $req.ContentType = 'application/json; charset=utf-8'
  }
  try {
    return Invoke-RestMethod @req
  } catch {
    $status = 0
    if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
    if ($status -eq 403 -or $status -eq 429) { throw [StopRun]::new("HTTP $status on $Method $Path (permissions or rate limit); stopping") }
    throw "HTTP $status on $Method $Path"
  }
}

# Runs a native program without PowerShell 5.1 turning its stderr into terminating errors.
function Invoke-Native([string]$Exe, [string[]]$Argv) {
  $old = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $all = & $Exe @Argv 2>&1
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $old
  }
  $isErr = { $_ -is [System.Management.Automation.ErrorRecord] }
  [pscustomobject]@{
    Code = $code
    Out  = @($all | Where-Object { -not (& $isErr) } | ForEach-Object { "$_" })
    Err  = @($all | Where-Object $isErr | ForEach-Object { "$_" })
  }
}

function Invoke-Git([string[]]$GitArgs) {
  $r = Invoke-Native 'git' (@('-C', $Root) + $GitArgs)
  if ($r.Code -ne 0) { throw "git $($GitArgs[0]) failed: $($r.Err -join ' ')" }
  return $r.Out
}

$Validator = Join-Path $Root 'scripts\post-actions-validate.mjs'

if (-not (Test-Path $Outbox)) { Log 'No outbox file; nothing to do.'; exit 0 }
$script:Token = [Environment]::GetEnvironmentVariable('DUALFORGE_GH_TOKEN', 'User')
if (-not $script:Token -and -not $DryRun) {
  Log 'DUALFORGE_GH_TOKEN is not set in the User environment; leaving the outbox for later.'
  exit 0
}
Log ("Start ({0}) with {1}" -f ($(if ($DryRun) { 'dry run' } else { 'live' })), $Outbox)

# 1. strict validation (the token is passed to the validator only, so it can refuse a plan that contains it)
$env:DUALFORGE_GH_TOKEN = $script:Token
try {
  $v = Invoke-Native 'node' @($Validator, $Outbox)
} finally {
  Remove-Item Env:DUALFORGE_GH_TOKEN -ErrorAction SilentlyContinue
}
if ($v.Code -ne 0) {
  Log 'REFUSED: actions.json failed validation:'
  $v.Err | ForEach-Object { Log "  $_" }
  if (-not $DryRun) { Move-Outbox 'rejected' }
  exit 1
}
$plan = ($v.Out -join "`n") | ConvertFrom-Json

try {
  # 2. every referenced issue exists, is open and is not a pull request
  $issues = @()
  $issues += @($plan.comments | ForEach-Object { $_.issue })
  $issues += @($plan.labels | ForEach-Object { $_.issue })
  $issues += @($plan.prs | ForEach-Object { $_.issue })
  foreach ($n in ($issues | Where-Object { $_ } | Sort-Object -Unique)) {
    $i = Invoke-Gh GET "/issues/$n"
    if ($i.state -ne 'open' -or $i.pull_request) { throw "issue #$n is not an open issue" }
  }

  # 3. branches: local, ahead of origin/main, no protected paths, no token
  if (@($plan.pushes).Count) { Invoke-Git @('fetch', '--no-tags', $RemoteUrl, '+refs/heads/main:refs/remotes/origin/main') | Out-Null }
  foreach ($p in $plan.pushes) {
    $b = $p.branch
    if ((Invoke-Native 'git' @('-C', $Root, 'rev-parse', '--verify', '--quiet', "refs/heads/$b")).Code -ne 0) {
      throw "branch $b does not exist locally"
    }
    $count = [int](Invoke-Git @('rev-list', '--count', "refs/remotes/origin/main..refs/heads/$b"))
    if ($count -lt 1 -or $count -gt 20) { throw "branch $b has $count commits over origin/main (expected 1..20)" }
    $paths = Join-Path $env:TEMP "post-actions-paths-$Stamp.txt"
    (Invoke-Git @('diff', '--name-only', "refs/remotes/origin/main...refs/heads/$b")) | Set-Content -Path $paths -Encoding UTF8
    $chk = Invoke-Native 'node' @($Validator, '--check-paths', $paths)
    Remove-Item $paths -Force
    if ($chk.Code -ne 0) { throw "branch $b changes protected paths: $($chk.Err -join '; ')" }
    if ($script:Token) {
      $patch = (Invoke-Git @('log', '-p', '--format=%B', "refs/remotes/origin/main..refs/heads/$b")) | Out-String
      if ($patch.Contains($script:Token)) { throw "branch $b contains the GitHub token" }
    }
  }
} catch {
  Log "REFUSED: $($_.Exception.Message)"
  if (-not $DryRun -and $_.Exception -isnot [StopRun]) { Move-Outbox 'rejected' }
  exit 1
}

if ($DryRun) {
  Log 'Dry run: validated. Would do:'
  foreach ($p in $plan.pushes) { Log "  push $($p.branch) -> refs/heads/$($p.branch)" }
  foreach ($p in $plan.prs) { Log "  open PR '$($p.title)' from $($p.branch) for #$($p.issue)" }
  foreach ($c in $plan.comments) { Log "  comment '$($c.templateId)' on #$($c.issue)" }
  foreach ($l in $plan.labels) { Log "  label #$($l.issue) +$($l.add -join ',')" }
  exit 0
}

try {
  # 4. pushes: explicit URL and refspec, token only in this process's git config environment
  $basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("x-access-token:$script:Token"))
  foreach ($p in $plan.pushes) {
    $b = $p.branch
    $env:GIT_CONFIG_COUNT = '1'
    $env:GIT_CONFIG_KEY_0 = 'http.https://github.com/.extraHeader'
    $env:GIT_CONFIG_VALUE_0 = "Authorization: Basic $basic"
    $env:GIT_TERMINAL_PROMPT = '0'
    try {
      Invoke-Git @('-c', 'credential.helper=', 'push', $RemoteUrl, "refs/heads/${b}:refs/heads/$b") | Out-Null
    } finally {
      Remove-Item Env:GIT_CONFIG_COUNT, Env:GIT_CONFIG_KEY_0, Env:GIT_CONFIG_VALUE_0 -ErrorAction SilentlyContinue
    }
    Log "pushed $b"
  }

  # 5. pull requests (reuse an open one for the same branch)
  $prNumbers = @{}
  foreach ($p in $plan.prs) {
    $owner = $Repo.Split('/')[0]
    $existing = @(Invoke-Gh GET "/pulls?state=open&head=${owner}:$($p.branch)")
    if ($existing.Count -gt 0) {
      $prNumbers[$p.branch] = $existing[0].number
      Log "PR #$($existing[0].number) already open for $($p.branch)"
      continue
    }
    $pr = Invoke-Gh POST '/pulls' @{ title = $p.title; head = $p.branch; base = 'main'; body = $p.body; maintainer_can_modify = $true }
    $prNumbers[$p.branch] = $pr.number
    Log "opened PR #$($pr.number) for $($p.branch) (#$($p.issue))"
  }

  # 6. comments (fixed texts from the validator; fix-proposed gets its PR number) and labels
  foreach ($c in $plan.comments) {
    $text = $c.text
    if ($c.templateId -eq 'fix-proposed') {
      $n = $prNumbers[$c.vars.branch]
      if (-not $n) { Log "skipped fix-proposed on #$($c.issue): no PR for $($c.vars.branch)"; continue }
      $text = $text.Replace('{{PR}}', [string]$n)
    }
    Invoke-Gh POST "/issues/$($c.issue)/comments" @{ body = $text } | Out-Null
    Log "commented '$($c.templateId)' on #$($c.issue)"
  }
  foreach ($l in $plan.labels) {
    Invoke-Gh POST "/issues/$($l.issue)/labels" @{ labels = @($l.add) } | Out-Null
    Log "labelled #$($l.issue) +$($l.add -join ',')"
  }
} catch {
  Log "STOPPED: $($_.Exception.Message)"
  exit 1
}

Move-Outbox 'done'
Log 'Done.'
exit 0
