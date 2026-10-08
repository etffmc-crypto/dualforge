# DualForge

DualForge is a Windows desktop app (Electron) that configures a PlayStation 5 DualSense controller over USB. It reads the pad, applies your profile (button mappings, macros, stick curves, deadzones, calibration, trigger effects, gyro, lights), and presents the result to games as a virtual Xbox 360 controller through ViGEm.

Version 0.3.4. See [CHANGELOG.md](CHANGELOG.md).

## Download

Get the latest installer from the download page, **https://etffmc-crypto.github.io/dualforge/**, or from [GitHub Releases](https://github.com/etffmc-crypto/dualforge/releases/latest). Each release lists SHA-256 checksums in `SHA256SUMS.txt`; compare with `Get-FileHash .\DualForge-Setup-<version>.exe` in PowerShell. A step-by-step guide for a new PC is in [docs/FRIEND-README.md](docs/FRIEND-README.md).

## Install

**From the installer (recommended).** Run `DualForge-Setup-<version>.exe` (per-user, you choose the folder). The installer is unsigned, so Windows SmartScreen may warn: click **More info**, then **Run anyway**.

**From source.** Needs Node 24 (npm 11), Windows 11 and the Visual Studio C++ build tools:

```
npm install
npm run dev
```

## Drivers

- **ViGEmBus** is required: it provides the virtual Xbox 360 pad. Install it from the Health page (only with your explicit consent).
- **HidHide** is optional: it hides the real DualSense from games so they see only the virtual pad. Without it, games see both and inputs may register twice. Install it from the Health page, then turn on Settings > Hide the DualSense from games.
  - HidHide is admin-gated on most systems: if Windows refuses the unelevated call, the first enable writes `hidhide-setup.cmd` to `%APPDATA%\DualForge` and runs it once with a UAC prompt (declining it is `E_HIDHIDE_ELEVATION_DECLINED`).
  - The pad is matched by hardware and compatible ID, so it works whatever the Windows display language.
  - Quitting (or signing out) un-hides the pad whenever DualForge hid it in that session. If that is refused for lack of rights, Health keeps warning that the DualSense stays hidden while DualForge is closed (`E_HIDHIDE_CLOAK_STUCK`); un-hide it in the HidHide Configuration Client.
  - If the pad is unplugged when DualForge starts, HidHide is applied as soon as it is plugged in.

## First run

1. Plug the DualSense in over USB.
2. Open **Health** (from the Home page or the header) and press **Run checks now**. Install ViGEmBus if it is flagged; install HidHide if you want to avoid double input.
3. Once the controller connects you land on **Overview**. Pick a profile slot and adjust pages to taste.
4. Open **Settings** to choose startup behaviour and theme.

## Auto-updates

Updates are opt-in and never automatic. Turn on **Settings > Updates > Check for updates** (off by default); DualForge then checks GitHub Releases about 10 seconds after it starts, and **Check now** checks on demand. When a newer version exists:

1. Click **Download** next to the version number. A progress bar shows the download; electron-updater verifies the file against the release's `latest.yml` (sha512).
2. Click **Install & restart**. DualForge quits (un-hiding the DualSense first if HidHide is on), the installer runs, and the new version starts.

Nothing is downloaded before the first click or installed before the second. The Health page shows an "Update available" card after a check finds one. Development builds answer `E_UPDATE_DEV`; download and install failures are `E_UPDATE_DOWNLOAD` / `E_UPDATE_INSTALL` (see [docs/ERROR_CODES.md](docs/ERROR_CODES.md)).

## Report a problem

1. Open **Health**, click **Run checks now** and try the suggested repair.
2. Click **Export diagnostics bundle** (logs, crash dumps, profiles, settings, health and system info; no personal files).
3. [Open an issue](https://github.com/etffmc-crypto/dualforge/issues/new/choose) with the bug report form: version (footer), Windows build, controller and mods, what happened, steps, the error code from the footer chip, and attach the bundle.

Feature ideas use the feature request form on the same page.

## Tray and startup

DualForge lives in the notification area. In **Settings** you can start it with Windows, start it minimized, and make the close button hide it to the tray so your profile keeps working (use **Quit** in the tray menu to exit).

## Pages

- **Home** - controller status (USB / replay, battery) and driver hints.
- **Overview** - dashboard: live pad render with tiles summarising Buttons, Sticks, Triggers, Motion and Lights, with quick edits.
- **Buttons** - remap any DualSense button to Xbox buttons, keys, mouse buttons or a macro, with turbo.
- **Turbo** - turbo mode and speed for every button at a glance (see [Turbo](#turbo)).
- **Sticks** - per-stick deadzones, response curves (presets or custom points), calibration, invert, smoothing and negative smoothing (see [Stick smoothing](#stick-smoothing)).
- **Triggers** - per-trigger digital (mouse-click) mode, hair trigger, ranges and adaptive trigger effects.
- **Motion** - gyro aim / steering to the right stick or the mouse, sensitivities and calibration.
- **Vibrations** - rumble strength and motor tests (greyed out until "This controller has rumble motors" is on).
- **Lights** - lightbar colour and animation, player LEDs, mic LED.
- **Macros** - build or record step sequences, play-test them on the virtual pad, assign them on Buttons.
- **Input Test** - raw DualSense input next to the virtual Xbox output, gyro and touchpad; shows REPLAY during a recording.
- **Health** - status of the controller, drivers, native addon, startup and updates; driver install; recent log lines; diagnostics bundle.
- **Profiles** (header) - four slots: rename, duplicate, reset, share codes, per-game auto-switch rules.
- **Settings** (header) - theme (dark / light), hardware (rumble motors, HidHide), startup, tray, optional updates (off by default; download and install are separate clicks, see [Auto-updates](#auto-updates)) and data folder.

## Stick smoothing

**Smoothing (RC)** on the Sticks page runs from -100 to 100, with Off at 0 (the slider clicks into the centre).

- **Positive (Smoothing)** filters the stick: higher values remove more shake but add lag.
- **Negative (jitter)** is the jitter-aim technique (the "RC filter" jitter popularised by HyperStrike): while the stick is moving, DualForge adds a small, fast back-and-forth oscillation to the aim input so aim assist stays engaged. At -100 the wobble is up to 8 % of full deflection; -50 is half that. It scales with how fast you move the stick, reaching full size at slow tracking speeds (about 4 % of the stick's range per 100 ms), and is zero when the stick is still, so the aim settles exactly where you hold it.
- **Jitter rate** (10–60 Hz, default 37 Hz) appears while any negative value is set. It sets how fast the wobble swings, in real time, so it is the same on any controller report rate and slow enough for a game reading the pad at 60–250 Hz to see it. The 37 Hz default avoids lining up with 60/120 fps polling (at exactly 30 Hz a 60 fps game can sample the same point of every swing and see almost nothing); raise it if the wobble is visible on screen, lower it if aim assist doesn't engage. Avoid exactly half or all of your game's frame rate (30 or 60 Hz at 60 fps, 60 Hz at 120 fps).
- **Advanced** sets the strength by stick speed with five points from -100 to 100, so you can, for example, add jitter to slow aim and smooth fast flicks. Points below the dashed zero line add jitter.

**Deadzone required:** keep a center deadzone of at least 2–3 % so the stick reads exactly zero at rest. Sensor noise that gets past the deadzone counts as movement and starts the wobble while you are not touching the stick.

**Risk:** Apex Legends treats negative smoothing as a bannable exploit; Call of Duty has not published a policy. Use it at your own risk. While any negative value is set, the Sticks page shows this notice with a **Set to Off** button (**Remove jitter** in Advanced, which lifts the negative points to 0).

## Turbo

Each button has its own turbo, saved in the profile:

- **Off** - one press, one output.
- **Hold** - while the button is held its outputs fire on and off (50 % duty) at the chosen speed.
- **Toggle** - one press starts auto-fire that keeps going after you let go; the next press stops it.

Speeds are Slow 8 Hz, Medium 12 Hz, Fast 20 Hz or Custom (1-30 Hz). Set them on the **Turbo** page or in the Buttons mapping dialog; both use the same controls. Many games read the controller once per frame, so at 60 fps speeds above about 20 Hz can alias (presses merge or get skipped); stay at or below Fast if a game misses presses.

Turbo repeats every output of the button: controller buttons, keys and mouse buttons (each repeat is a fresh key / click). An analog trigger in non-digital mode is released in the off phase and keeps its pull in the on phase. Macros are never re-triggered by turbo: a button mapped only to macros has no turbo (its controls are greyed out).

**On the controller:** hold the mode button (Touchpad by default) and press any other button to step its turbo Slow → Medium → Fast → Off. Double-tap the mode button to clear all turbo. The mode button's own output is held back while you use it this way: a quick tap (under 250 ms) still sends it as a short press, a longer hold without a combo sends it normally, and any press used for a combo is swallowed, as is the button you pressed with it. Changes made on the pad are saved to the running profile and appear in the app at once (an edit you are making in the app at the same moment is kept). While the mode button is held, the pad does not navigate the DualForge window. Settings → Turbo picks the mode button (or None) and can switch the shortcut off; it warns when the chosen button has an output of its own (a face or shoulder button, or any mapping), because that output is delayed or swallowed while the button acts as the mode button.

**Lightbar:** while any button has turbo set, the lightbar pulses red twice a second instead of the profile colour (turn this off in Settings → Turbo). The Turbo page shows a live "Turbo active" dot while turbo is firing.

## Profiles, share codes and auto-switch

Four profile slots live in `%APPDATA%\DualForge\profiles\p1.json` .. `p4.json` (override the data dir with `DUALFORGE_DATA_DIR`). `settings.json` next to it holds the active profile and settings. A file that fails validation is moved to `profiles\corrupt\` (quarantine) and the slot falls back to defaults; the failure is logged.

**Share codes:** a profile can be exported as a text code starting with `DUALFORGE:` (deflated, base64url) and imported into any slot.

**Auto-switch:** `settings.autoSwitch` maps process names (e.g. `game.exe`, case-insensitive) to a profile. While that process is in the foreground the profile is applied; otherwise the active profile returns. Needs the native addon.

## Gamepad navigation

While the DualForge window has focus the pad drives the UI (it is ignored when a game has focus, and while a macro is being recorded or play-tested):

| Pad     | Action                                                                                                                            |
| ------- | --------------------------------------------------------------------------------------------------------------------------------- |
| LB / RB | previous / next page (inside a dialog: its tabs)                                                                                  |
| LT / RT | previous / next sub-tab on the page (e.g. Left / Right stick)                                                                     |
| D-pad   | move focus to the nearest control in that direction (repeats every 150 ms while held); left / right on a slider changes its value |
| A       | press the focused control                                                                                                         |
| B       | close the open dialog, otherwise go back to Overview                                                                              |

Navigation reads the processed virtual-pad output, so it follows your button mappings.

## Your controller (notes)

- **Digital triggers:** triggers default to digital (click) mode, matching the author's modified pad. Stock DualSense users should turn off **Digital (mouse-click) trigger** on the Triggers page (each side).
- **No rumble:** rumble defaults to off (`hasRumble: false`). With a stock pad turn on **This controller has rumble motors** on the Vibrations or Settings page.
- **Back paddles:** the two back paddles are wired to face buttons, so they follow those buttons' mappings; they cannot be remapped separately.

## Health and diagnostics

The Health page runs checks on demand (and in the background) and shows a lamp in the header. Each problem comes with the action that fixes it. **Export diagnostics bundle** writes a file with recent logs and system information to share when reporting a problem. Logs live in `%APPDATA%\DualForge\logs`. Error codes are explained in [docs/ERROR_CODES.md](docs/ERROR_CODES.md).

## Maintenance

A Claude Code routine can check the project health, triage logs and crashes and write a dated report. See [maintenance/README.md](maintenance/README.md) for running and scheduling it. Its limits are enforced by tool rules in the launch command (exact git commands only, protected files and the AppData folders read-only). It runs the checks with `powershell -File maintenance/run-checks.ps1 -SkipUi`, so it never launches the app while you play; run the full check including `test:ui` yourself when the pad is free. The check runner only stops Electron processes it started itself, never a DualForge you have open.

## Development

```
npm run check            # typecheck, lint, unit tests, UI e2e
npm run check:full       # check plus prettier, coverage and dependency audit
npm run dev              # start the app in development
npm run rebuild -w @dualforge/desktop   # Electron-ABI native modules
npm run dist             # unpacked app: apps/desktop/release/win-unpacked/DualForge.exe
npm run dist:installer   # also builds apps/desktop/release/DualForge-Setup-<version>.exe
npm run test:packaged    # smoke-launch win-unpacked with Playwright (needs `npm run dist`)
```

### Native modules

`native/sendinput` (keyboard/mouse injection and foreground-process lookup) is built by `npm install`. If npm skips install scripts, or after changing Electron versions, build it explicitly:

```
cd native/sendinput && npx node-gyp rebuild    # for Node (scripts, ad-hoc checks)
cd ../.. && npm run rebuild -w @dualforge/desktop   # for Electron: node-hid, vigemclient, @dualforge/sendinput
```

If the addon is missing the app still runs, but keyboard/mouse mappings and per-game auto-switch are disabled (`E_INJECT_LOAD` is logged).

### Packaging

Config: `apps/desktop/electron-builder.yml` (NSIS, per-user, directory choice, GitHub publish provider `etffmc-crypto/dualforge`; local builds never publish, releases come from CI, see [Release process](#release-process-maintainer)). Native `.node` files are `asarUnpack`ed and the tray icons ship via `extraResources`. The app icon is generated by `node apps/desktop/scripts/make-icon.mjs`. electron-builder runs with `npmRebuild: false` (we rebuild ourselves) and an explicit `electronVersion`/`electronDist`, because Electron is hoisted to the root `node_modules`; bump `electronVersion` with the Electron dependency. The update check needs a real `owner`/`repo` in `publish`: `electron.vite.config.ts` reads the owner at build time and defines `__UPDATES_ENABLED__` (false while it is the `dualforge` placeholder, e.g. in a fork that has not set its own owner), which hides the Settings Updates section and disables `updates:check`, `updates:download` and `updates:install`.

### Release process (maintainer)

1. On a branch: bump `version` in `package.json` and `apps/desktop/package.json` (and the two lockfile entries plus the e2e footer asserts), add a `## <version>` section at the top of `CHANGELOG.md`, run `npm run check:full`, merge to `main`.
2. Tag the merge commit and push the tag: `git tag v<version>` then `git push origin v<version>`.
3. `.github/workflows/release.yml` runs on the tag in two jobs. **build** (Windows, `contents: read`, no npm cache) checks out `refs/tags/<tag>` without persisted credentials, fails unless the tag's commit is on `main` and the tag equals `v` + `package.json` version, builds the native modules and the NSIS installer, runs typecheck, lint and unit tests (no e2e on CI), and uploads the files as an artifact. **publish** (`contents: write`, no checkout, no npm) downloads that artifact and creates the GitHub release with `DualForge-Setup-<version>.exe`, its `.blockmap`, `latest.yml` and `SHA256SUMS.txt`; the release text is that version's CHANGELOG section (`scripts/release.mjs`). All actions are pinned to commit SHAs; Dependabot (`.github/dependabot.yml`) proposes updates weekly.
4. The download page and the in-app updater pick up the new release at once; within 30 minutes the watchdog verifies the installer hash.

To rebuild an existing tag (for example after a failed upload), run the release workflow manually (Actions > release > Run workflow) with that tag. A tag containing `-` (e.g. `v0.4.0-beta.1`) is published as a pre-release, which the updater and the download page ignore.

### Watchdog and responder

- **Watchdog** (`.github/workflows/watchdog.yml`, every 30 minutes, `scripts/watchdog.mjs`): the download page answers and offers "Download for Windows"; the latest release has one installer, `latest.yml` and `SHA256SUMS.txt`, `latest.yml` matches the tag, and the asset size, GitHub's asset digest and `SHA256SUMS.txt` agree on every run; the installer itself is downloaded and its size, sha512 and sha256 verified only when the asset changes (id, upload time and digest are cached). The newest finished `check.yml` push run on `main` must have passed. Before the first release the release check is skipped. Each failing check opens, updates or (if closed within 7 days) reopens one issue by `github-actions[bot]` labelled `watchdog` ("Watchdog: <check> failing"), which closes itself when the check passes again. The workflow stays green when it filed issues and fails only when the watchdog itself breaks.
- **Responder** (`.github/workflows/responder.yml`, [maintenance/RESPONDER.md](maintenance/RESPONDER.md)): a Claude Code GitHub Action that runs in GitHub's sandbox with the repository's own `GITHUB_TOKEN` and the `ANTHROPIC_API_KEY` repository secret, so no token or key lives on the maintainer's PC. It starts when an issue is opened or reopened, every 2 hours (watchdog issues are filed by the token and raise no event), or by hand; a second job answers `@claude` comments from users with write access. It triages issues, fixes watchdog failures and reproducible bugs on `claude/*` branches with a regression test, opens pull requests (never merges; `main` is protected), dispatches `check.yml` on the branch (token-made pushes do not start workflows by themselves) and leaves one short comment per issue. Issue text is treated as untrusted data; tools are restricted to the repo's npm scripts, git on `claude/*`, and `gh issue`/`gh pr` (no web, no `gh api`, protected paths read-only). Setup: [maintenance/README.md](maintenance/README.md#issue-responder).
- GitHub disables scheduled workflows (the watchdog) after **60 days without repository activity**; re-enable it under Actions > watchdog if that happens.

### GitHub setup (one time)

- **Pages:** Settings > Pages > Build and deployment > Source: **GitHub Actions**. `.github/workflows/pages.yml` then deploys `site/` on every push to `main` that touches it (or run it manually once).
- **Actions:** Settings > Actions > General > Workflow permissions: the workflows declare their own permissions; keep "Read repository contents" as the default, and turn on **"Allow GitHub Actions to create and approve pull requests"** (the responder opens PRs with the `GITHUB_TOKEN`).
- **Secret:** Settings > Secrets and variables > Actions > `ANTHROPIC_API_KEY` (an Anthropic console API key with a monthly spend limit; only the responder workflow reads it).
- **Rulesets:** protect `main` (require a pull request, block force pushes) so the responder's token cannot push to it, and protect `v*` tags (only the maintainer may create them) so a release can only be cut deliberately.
- **Dependabot:** `.github/dependabot.yml` opens weekly PRs for the pinned actions; review the new SHA's release notes before merging.

### Folder map

- `packages/shared` - types and schemas shared across packages
- `packages/engine` - pure processing pipeline (stick/trigger stages, profiles)
- `apps/desktop` - Electron app (main, preload, renderer)
- `native/sendinput` - native addon for key/mouse injection and foreground-process lookup
- `maintenance` - maintenance agent prompt, check script and reports
- `docs/superpowers/{specs,plans}` - design specs and implementation plans
- `docs/reference` - reference material
- [`docs/ERROR_CODES.md`](docs/ERROR_CODES.md) - registry of stable `E_*` error codes (a test enforces completeness)
- [`docs/BACKLOG.md`](docs/BACKLOG.md) - deferred review findings

Not affiliated with Sony or GameSir.
