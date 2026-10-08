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

The responder is a **Claude Code GitHub Action** (`.github/workflows/responder.yml`) whose brief is [`RESPONDER.md`](RESPONDER.md). It runs in GitHub's own sandbox with the repository's `GITHUB_TOKEN` (scoped to this repo, issued per run) and the `ANTHROPIC_API_KEY` repository secret, so no token or key lives on this PC and nothing it runs can reach your files, your controller or your profiles.

**When it runs:** when an issue is opened or reopened; every 2 hours at :15 (watchdog issues are filed with the `GITHUB_TOKEN`, which raises no `issues` event, so the sweep picks them up); or by hand (Actions > responder > Run workflow, optionally with an issue number). A second job answers `@claude …` comments on issues and PRs from users with write access to the repository.

**What it does:** triages each open issue (watchdog / bug / feature / other), fixes watchdog `ci` and `site` failures and reproducible bugs on `claude/issue-<n>` or `claude/watchdog-<check>` branches with a regression test, runs typecheck, lint, prettier and the unit tests, pushes, opens a pull request against `main`, dispatches `check.yml` on that branch (pushes made with the `GITHUB_TOKEN` do not start workflows by themselves) and leaves one short comment per issue. At most 2 PRs per run. It never merges: `main` is protected by a ruleset, so every fix lands only after you review and merge the PR, and `v*` tags stay yours.

**What it may not do** (enforced by the workflow's `--allowedTools` / `--disallowedTools`, not only by the brief): no web fetches or searches, no `gh api`, no `gh pr merge`, no releases or secrets, no `npm install`/`update`, no force pushes or history rewrites, no edits under `.github/`, `native/`, `maintenance/`, `scripts/`, or to `package*.json`, tsconfig/vitest/eslint configs and `electron-builder.yml`. Issue text is treated as untrusted data (the brief says so, and only issue numbers are interpolated into the prompt). The runner is Linux: Windows-only native modules are not built there, so hardware-dependent problems get an "investigating" comment rather than a fix.

**Setup (one time):**

1. Settings > Secrets and variables > Actions > **New repository secret** `ANTHROPIC_API_KEY`: an API key from console.anthropic.com with a monthly spend limit set on that account.
2. Settings > Actions > General: keep "Read repository contents" as the default workflow permission and turn on **"Allow GitHub Actions to create and approve pull requests"**.
3. The `main` ruleset must require a pull request (it does); otherwise the token could push to `main`.

**Cost:** each run is a few cents when there is nothing to do and well under a dollar for a fix; the spend limit on the Anthropic account is the hard cap. The Actions runs themselves are free for a public repository.

**Record:** the issue comments, the `claude/*` branches and the PRs are the public record; the Actions log (Actions > responder) shows every tool call of a run. GitHub disables scheduled workflows after 60 days without repository activity; re-enable it under Actions if that happens.
