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

> **Stage 2 is on hold.** Do **not** create `DUALFORGE_GH_TOKEN` and do **not** schedule `post-actions.ps1` until stage 2 runs isolated from stage 1: under a separate Windows account, or from a locked copy outside the working tree that pushes from a bare mirror with hooks disabled. Today both stages would share one user account and one working tree, so code that stage 1 writes and runs (tests, npm scripts, git hooks, config) could read a User environment token or tamper with what stage 2 executes. Until then, stage 1 may run **read-only**: it prepares local branches and an `actions.json` for you to review by hand. Nothing is posted to GitHub.

Works the GitHub issues every 2 hours in **two stages**, so the part that reads untrusted issue text never holds a token:

1. **Stage 1, the LLM** ([`RESPONDER.md`](RESPONDER.md), Claude Code, no token): reads open issues with unauthenticated `curl`, reproduces bugs and watchdog failures, commits fixes on local `fix/issue-<n>` / `fix/watchdog-<check>-<date>` branches (never pushes), and writes `maintenance/outbox/actions.json`: proposed comments (fixed templates only), labels, pushes and pull requests (at most 10 comments and 2 PRs).
2. **Stage 2, a vetted script** ([`post-actions.ps1`](post-actions.ps1), no LLM, holds the token): validates `actions.json` strictly with [`scripts/post-actions-validate.mjs`](../scripts/post-actions-validate.mjs) (unknown keys, templates, labels or branch names refuse the whole file), checks every referenced issue is open, every branch is ahead of GitHub's `main`, touches no protected path (`.github/`, `maintenance/`, `package*.json`, tsconfig/vitest/eslint configs, `native/`, …) and contains no trace of the token, then pushes `<branch>:refs/heads/<branch>` (never tags or `main`), opens the PRs and posts the comments and labels. It stops at the first HTTP 403/429. Log: `maintenance/reports/post-actions-YYYY-MM-DD.log`; processed files move to `maintenance/outbox/done/`, refused ones to `maintenance/outbox/rejected/`.

### Token (one time, stage 2 only)

Create a **fine-grained personal access token** (github.com > Settings > Developer settings > Fine-grained tokens):

- Repository access: **only** `etffmc-crypto/dualforge`.
- Permissions: Issues **Read and write**, Pull requests **Read and write**, Contents **Read and write** (to push `fix/*` branches), Metadata Read. No Workflows permission.
- Expiry: 90 days or less; set a reminder to rotate it.

Store it as the **User** environment variable `DUALFORGE_GH_TOKEN` (only `post-actions.ps1` reads it):

```powershell
[Environment]::SetEnvironmentVariable('DUALFORGE_GH_TOKEN', '<paste the token>', 'User')
```

New processes of your user inherit User environment variables, including a Claude Code session, so stage 1 would have the token in its environment. Its Bash deny rules (`*DUALFORGE_GH_TOKEN*`, `printenv`, `env`, `set`) filter **command strings only**: any code stage 1 writes and then runs (a test, an npm script, a git hook) can read the environment without naming the variable on a command line. That is why stage 2 is on hold (see the box above). Stage 2 also refuses a plan or branch that contains the token, which catches only careless leaks, not deliberate ones (encoded or split). Protect `main` with a ruleset (Settings > Rules > Rulesets: require a pull request, block force pushes) so the token cannot push to `main` even if misused.

### Stage 1: run it

```powershell
$start = git rev-parse --abbrev-ref HEAD
$issues = 'https://api.github.com/repos/etffmc-crypto/dualforge/issues'
claude -p (Get-Content maintenance/RESPONDER.md -Raw) --permission-mode acceptEdits `
  --allowedTools "Bash(git status --porcelain)" "Bash(git rev-parse --abbrev-ref HEAD)" "Bash(git checkout main)" "Bash(git checkout -b fix/issue-*)" "Bash(git checkout -b fix/watchdog-*)" "Bash(git checkout $start)" "Bash(git add apps/*)" "Bash(git add packages/*)" "Bash(git add site/*)" "Bash(git commit -m *)" "Bash(git log:*)" "Bash(git diff:*)" "Bash(npm ci)" "Bash(npm run typecheck)" "Bash(npm run lint)" "Bash(npm run format:check)" "Bash(npm run test)" "Bash(curl -sS `"$issues`?state=open&per_page=50`")" Read Write Edit Grep Glob `
  --disallowedTools "Bash(git push*)" "Bash(git fetch*)" "Bash(git pull*)" "Bash(git remote*)" "Bash(git config*)" "Bash(git commit *--amend*)" "Bash(git commit *--no-verify*)" "Bash(*DUALFORGE_GH_TOKEN*)" "Bash(*GITHUB_TOKEN*)" "Bash(printenv*)" "Bash(env*)" "Bash(set*)" "Edit(.git/**)" "Write(.git/**)" "Edit(.github/**)" "Write(.github/**)" "Edit(package.json)" "Write(package.json)" "Edit(**/package.json)" "Write(**/package.json)" "Edit(package-lock.json)" "Write(package-lock.json)" "Edit(.npmrc)" "Write(.npmrc)" "Edit(**/.npmrc)" "Write(**/.npmrc)" "Edit(vitest.config.ts)" "Write(vitest.config.ts)" "Edit(**/vitest.config.ts)" "Write(**/vitest.config.ts)" "Edit(eslint.config.js)" "Write(eslint.config.js)" "Edit(**/tsconfig*.json)" "Write(**/tsconfig*.json)" "Edit(tsconfig*.json)" "Write(tsconfig*.json)" "Edit(native/**)" "Write(native/**)" "Edit(scripts/**)" "Write(scripts/**)" "Edit(apps/desktop/electron-builder.yml)" "Write(apps/desktop/electron-builder.yml)" "Edit(maintenance/*.md)" "Write(maintenance/*.md)" "Edit(maintenance/*.ps1)" "Write(maintenance/*.ps1)" "Edit(maintenance/README.md)" "Write(maintenance/README.md)"
```

Allowed, in short: git (status, branch name, checkout `main` / `fix/issue-*` / `fix/watchdog-*` / the starting branch, `add` under `apps/ packages/ site/`, `commit -m`, log, diff), `npm ci` and `npm run typecheck|lint|format:check|test`, one exact unauthenticated `curl` read (the open-issue list; its `comments` counts are enough to see new activity), and Read / Write / Edit / Glob / Grep. Write and Edit reach `maintenance/` only under `maintenance/outbox/` and `maintenance/reports/` (the deny list covers the routine's own files). No `git push`, `fetch`, `pull`, `remote` or `config` commands. These rules restrict the commands stage 1 may type. They do not sandbox the code it runs: `npm run test` executes whatever the branch contains, and that code can reach the network.

### Stage 2: run it

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File maintenance\post-actions.ps1 -DryRun   # validate and print the plan
powershell -NoProfile -ExecutionPolicy Bypass -File maintenance\post-actions.ps1           # carry it out
```

### Schedule both

- **Stage 1** runs in the **Claude desktop app's local scheduler** (Scheduled tasks), not as a `/schedule` cloud routine: it needs this PC's checkout on `F:\`, Node, the local test toolchain and the app's native build, none of which exist in a cloud sandbox. Create a local scheduled task with the stage 1 prompt and the same allowed/denied tool lists, working directory `F:\DualForge`, every 2 hours on the hour.
- **Stage 2** (**on hold**, see the box at the top of this section; for later, once it runs isolated) runs from **Windows Task Scheduler**, every 2 hours, 10 minutes after stage 1:

```powershell
schtasks /Create /TN "DualForge\Responder post-actions" /SC HOURLY /MO 2 /ST 00:10 /F /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File F:\DualForge\maintenance\post-actions.ps1"
```

Remove it with `schtasks /Delete /TN "DualForge\Responder post-actions" /F`. Responder run reports are appended to `maintenance/reports/responder-YYYY-MM-DD.md`, and the outbox and logs are gitignored. The issue comments and PRs are the public record.
