# Maintenance agent

A Claude Code routine that checks DualForge health, triages app logs and crashes, and writes a dated report. The routine prompt is [`AGENT.md`](AGENT.md); it is read-only on profiles, settings, drivers and installers and never merges code into `main`.

## Run it manually

From the repo root, with a restricted tool set (use this exact form, also for the scheduler):

```powershell
claude -p (Get-Content maintenance/AGENT.md -Raw) --permission-mode acceptEdits --allowedTools "Bash(git status:*)" "Bash(git checkout:*)" "Bash(git pull:*)" "Bash(git add:*)" "Bash(git commit:*)" "Bash(git log:*)" "Bash(git diff:*)" "Bash(npm run check:*)" "Bash(npm ci)" "Bash(powershell -File maintenance/run-checks.ps1)" Read Write Edit Grep Glob
```

Alternatively open Claude Code in the repo and paste the contents of `AGENT.md` as the prompt.

To run only the checks, without the agent:

```powershell
powershell -File maintenance/run-checks.ps1
```

## Schedule it

Use the Claude Code scheduler (`/schedule`) with the contents of `AGENT.md` as the prompt and the same `--permission-mode acceptEdits` and `--allowedTools` list as above (the scheduled task on this PC must use them), repo `F:\DualForge`, daily at 09:00. The machine must be on and the repo checked out; the routine reads the local app logs, so it must run on this PC.

## Where reports go

- `maintenance/reports/YYYY-MM-DD.md`: the daily report, committed by the agent (on branch `maint/YYYY-MM-DD` when it changed code, otherwise directly on `main`).
- `maintenance/reports/last-check.json`: the latest check run, overwritten each time, gitignored.

## Reading `last-check.json`

```json
{
  "ranAt": "2026-10-04T07:00:00.0000000Z",
  "node": "v24.x",
  "steps": [{ "name": "lint", "ok": false, "ms": 2100, "tail": "last 25 lines of output" }],
  "ok": false
}
```

`ok` at the top level is true only when every step passed. Steps run in order: typecheck, lint, format:check, test, coverage, test:ui, audit. `ms` is the step duration; `tail` holds the last 25 output lines, which is usually enough to see the failure. The runner's exit code is non-zero when `ok` is false.

Error codes in the report are explained in [`docs/ERROR_CODES.md`](../docs/ERROR_CODES.md).
