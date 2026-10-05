# Maintenance agent

A Claude Code routine that checks DualForge health, triages app logs and crashes, and writes a dated report. The routine prompt is [`AGENT.md`](AGENT.md); it is read-only on profiles, settings, drivers and installers and never merges code into `main`.

## Run it manually

From the repo root in PowerShell, with a restricted tool set (use this exact form, also for the scheduler). The limits in `AGENT.md` are enforced by these tool rules, not only by the prompt:

```powershell
$start = git rev-parse --abbrev-ref HEAD
$ad = ($env:APPDATA -replace '\\','/') -replace '^([A-Za-z]):','//$1'
claude -p (Get-Content maintenance/AGENT.md -Raw) --permission-mode acceptEdits `
  --allowedTools "Bash(git status --porcelain)" "Bash(git status)" "Bash(git rev-parse --abbrev-ref HEAD)" "Bash(git remote)" "Bash(git branch --list maint/*)" "Bash(git checkout main)" "Bash(git checkout -b maint/*)" "Bash(git checkout $start)" "Bash(git add maintenance/reports/*)" "Bash(git add apps/*)" "Bash(git add packages/*)" "Bash(git commit -m *)" "Bash(git log:*)" "Bash(git diff:*)" "Bash(git pull --ff-only)" "Bash(npm run typecheck)" "Bash(npm run lint)" "Bash(npm run test)" "Bash(npm run format:check)" "Bash(npm run coverage)" "Bash(npm run audit)" "Bash(npm ci)" "Bash(powershell -File maintenance/run-checks.ps1 -SkipUi)" Read Write Edit Grep Glob `
  --disallowedTools "Edit(package.json)" "Edit(package-lock.json)" "Edit(maintenance/run-checks.ps1)" "Edit(maintenance/AGENT.md)" "Edit(.github/**)" "Edit(native/**)" "Edit(apps/desktop/electron-builder.yml)" "Write(package.json)" "Write(package-lock.json)" "Write(maintenance/run-checks.ps1)" "Write(maintenance/AGENT.md)" "Write(.github/**)" "Write(native/**)" "Write(apps/desktop/electron-builder.yml)" "Edit(~/AppData/Roaming/DualForge/**)" "Write(~/AppData/Roaming/DualForge/**)" "Edit($ad/DualForge/**)" "Write($ad/DualForge/**)" "Bash(git commit *--amend*)" "Bash(git commit *--no-verify*)" `
  --add-dir "$env:APPDATA\DualForge\logs" "$env:APPDATA\DualForge\crashes"
```

- `$start` is the branch you are on when the routine starts; the routine records the same name and returns to it at the end (`git checkout $start` is the only other checkout it may run).
- `$ad` is `$env:APPDATA` in Claude Code's absolute-path rule form (`//C/Users/<you>/AppData/Roaming`). `--add-dir` makes only the app logs and crash dumps readable; the `Edit`/`Write` deny rules (home-relative `~/AppData/Roaming/...` and absolute `$ad/...` forms) keep everything under `$env:APPDATA\DualForge` read-only. `git commit` with `--amend` or `--no-verify` is denied even though `git commit -m *` is allowed. Directory listings use the Glob tool.
- Git is limited to the exact commands above: no `git add` outside `maintenance/reports/`, `apps/` and `packages/`, no `git branch` other than listing `maint/*`, no other checkouts.
- The agent runs the checks with `-SkipUi`. A full run including `test:ui` launches the app and drives the DualSense, so run it yourself when you are not playing: `powershell -File maintenance/run-checks.ps1`.

Alternatively open Claude Code in the repo and paste the contents of `AGENT.md` as the prompt.

To run only the checks, without the agent:

```powershell
powershell -File maintenance/run-checks.ps1          # all steps, including test:ui
powershell -File maintenance/run-checks.ps1 -SkipUi  # without test:ui (recorded as skipped)
```

The runner never touches a DualForge you have open: before each step it records the dev Electron processes of this repo and afterwards (also on timeout) stops only the ones that step started. Installed or unpacked builds are never matched.

## Schedule it

Use the Claude Code scheduler (`/schedule`) with the contents of `AGENT.md` as the prompt and the same `--permission-mode acceptEdits`, `--allowedTools`, `--disallowedTools` and `--add-dir` lists as above, in the same PowerShell form (`$env:APPDATA`, not `%APPDATA%`; compute `$start` and `$ad` first), repo `F:\DualForge`, daily at 09:00. The machine must be on and the repo checked out; the routine reads the local app logs, so it must run on this PC.

## Where reports go

- `maintenance/reports/YYYY-MM-DD.md`: the daily report, committed by the agent (on branch `maint/YYYY-MM-DD` when it changed code, otherwise directly on `main`).
- `maintenance/reports/last-check.json`: the latest check run, overwritten each time, gitignored.

## Reading `last-check.json`

```json
{
  "ranAt": "2026-10-04T07:00:00.0000000Z",
  "node": "v24.x",
  "steps": [
    { "name": "lint", "ok": false, "skipped": false, "ms": 2100, "tail": "last 25 lines of output" }
  ],
  "ok": false
}
```

`ok` at the top level is true only when every step passed. Steps run in order: typecheck, lint, format:check, test, coverage, test:ui, audit. Each step also has `skipped` (true only for `test:ui` under `-SkipUi`; a skipped step counts as ok). `ms` is the step duration; `tail` holds the last 25 output lines, which is usually enough to see the failure. The runner's exit code is non-zero when `ok` is false.

Error codes in the report are explained in [`docs/ERROR_CODES.md`](../docs/ERROR_CODES.md).

## Issue responder

A second Claude Code routine, every 2 hours, that works the GitHub issues: it proposes fixes for `watchdog` issues (site, release, CI) and reproducible bug reports as **pull requests** (never a push to `main`), comments a status on the issue, and labels feature requests `enhancement`. The prompt is [`RESPONDER.md`](RESPONDER.md); its guardrails come first and treat all issue text as untrusted data.

### Token (one time)

Reading public issues needs no token. To comment, label, push `fix/*` branches and open pull requests, create a **fine-grained personal access token** on github.com (Settings > Developer settings > Fine-grained tokens):

- Repository access: **only** `etffmc-crypto/dualforge`.
- Permissions: Issues **Read and write**, Pull requests **Read and write**, Contents **Read and write** (to push `fix/*` branches), Metadata Read. No Workflows permission, so the routine cannot change `.github/workflows`.
- Expiry: 90 days or less; set a reminder to rotate it.

Store it outside the repo and expose it only to the routine as `GITHUB_TOKEN`. With PowerShell SecretManagement (`Install-Module Microsoft.PowerShell.SecretManagement, Microsoft.PowerShell.SecretStore`), save it once with `Set-Secret -Name dualforge-responder` and read it in the launch command below. Without a token the routine runs read-only (report only).

Add a branch ruleset on `main` (Settings > Rules > Rulesets: require a pull request, block force pushes) so even a token with Contents write cannot push to `main` directly. `git push` of `fix/*` branches uses your normal git credentials for github.com.

### Run it

```powershell
$start = git rev-parse --abbrev-ref HEAD
$env:GITHUB_TOKEN = Get-Secret -Name dualforge-responder -AsPlainText   # omit for a read-only run
$api = 'https://api.github.com/repos/etffmc-crypto/dualforge/'
claude -p (Get-Content maintenance/RESPONDER.md -Raw) --permission-mode acceptEdits `
  --allowedTools "Bash(git status --porcelain)" "Bash(git rev-parse --abbrev-ref HEAD)" "Bash(git checkout main)" "Bash(git checkout -b fix/*)" "Bash(git checkout $start)" "Bash(git pull --ff-only)" "Bash(git add apps/*)" "Bash(git add packages/*)" "Bash(git add site/*)" "Bash(git add scripts/*)" "Bash(git commit -m *)" "Bash(git push -u origin fix/*)" "Bash(git log:*)" "Bash(git diff:*)" "Bash(npm ci)" "Bash(npm run typecheck)" "Bash(npm run lint)" "Bash(npm run format:check)" "Bash(npm run test)" "Bash(test -n `"`$GITHUB_TOKEN`" && echo write || echo read-only)" "Bash(curl -sS $api*)" "Bash(curl -sS -H * $api*)" "Bash(curl -sS -X POST -H * $api*)" Read Write Edit Grep Glob `
  --disallowedTools "Edit(package.json)" "Edit(package-lock.json)" "Edit(maintenance/RESPONDER.md)" "Edit(maintenance/AGENT.md)" "Edit(maintenance/run-checks.ps1)" "Edit(.github/**)" "Edit(native/**)" "Edit(apps/desktop/electron-builder.yml)" "Write(package.json)" "Write(package-lock.json)" "Write(maintenance/RESPONDER.md)" "Write(maintenance/AGENT.md)" "Write(maintenance/run-checks.ps1)" "Write(.github/**)" "Write(native/**)" "Write(apps/desktop/electron-builder.yml)" "Bash(git push * main*)" "Bash(git push *--force*)" "Bash(git push * -f*)" "Bash(git commit *--amend*)" "Bash(git commit *--no-verify*)"
Remove-Item Env:GITHUB_TOKEN -ErrorAction SilentlyContinue
```

Allowed tools, in short: git (status, branch name, checkout `main` / `fix/*` / the starting branch, `pull --ff-only`, `add` under `apps/ packages/ site/ scripts/`, `commit -m`, `push -u origin fix/*`, log, diff), `npm ci` and `npm run typecheck|lint|format:check|test`, `curl` to `api.github.com/repos/etffmc-crypto/dualforge/` only, and Read / Write / Edit / Glob / Grep. Everything else (other hosts, installers, `test:ui`, `dist`, pushes to `main`) is denied by omission or by the deny list.

### Schedule it

Create it with the Claude Code scheduler (`/schedule`): prompt = contents of `RESPONDER.md`, the same flags as above, repo `F:\DualForge`, every 2 hours. Compute `$start`, set `$env:GITHUB_TOKEN` from the secret store first, and clear it afterwards. Reports are appended per run to `maintenance/reports/responder-YYYY-MM-DD.md` (gitignored; the issue comments and PRs are the public record).
