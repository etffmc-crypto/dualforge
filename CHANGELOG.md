# Changelog

## 0.3.7

### Keyboard and screen-reader navigation

- **The section tabs and the sub-tabs now work with the arrow keys.** Left and Right move to the previous or next tab and open that page; Home and End jump to the first or last. Only the selected tab is in the Tab order now, so one press of Tab gets you past the whole strip instead of stopping on every tab.
- **Profile slot tabs: arrows move, Enter opens, F2 renames.** The arrow keys only move the focus between the four slots (switching a slot reloads the profile, so that still needs Enter or Space). With a slot focused, **F2** starts the rename, the same as right-click. The slot tooltip now says "right-click or F2 to rename".
- **Screen readers now link each section tab to the page it shows.** The page body is named after the selected section tab.
- **While a dialog is open, the page behind it is switched off for the keyboard and for screen readers.** Tab can no longer wander out of a dialog into the window behind it. When the last dialog closes everything comes back and focus returns to where you were.
- **The Controller, Keyboard, Mouse and Macro tabs in the button-mapping dialog are now linked to their panel for screen readers.**

### Calibration wizard

- **New Back button on steps 2 and 3.** Step 3 goes back to tracing the edge with what you already traced; step 2 goes back to measuring the center again. Before, a slip meant Cancel and starting over.
- **The wizard does less work while it measures.** It no longer redraws the dialog twice for every controller update. The measured result is unchanged.

### Macros

- **A macro play-test now stops when you close the macro editor or when DualForge loses focus (for example Alt+Tab).** Before, a play-test that was still running could keep sending its keys into the program you had just switched to. Only a play-test you started from the editor is stopped; a macro your pad triggered is left alone.

### HidHide

- **If you decline the Windows administrator (UAC) prompt for HidHide, DualForge now remembers that after a restart.** It used to ask again at every launch. Automatic setup (at startup, or when settings are re-applied) no longer asks again after a decline; the message says "administrator rights were declined earlier; not prompting again until you retry from Health".
- **To be asked again,** switch on **Settings > Hide the DualSense from games** yourself, or use the repair button on the Health page, and accept the Windows prompt. That clears the remembered decline.

### ViGEmBus installer

- **Install ViGEmBus on the Health page now asks for release v1.22.0 instead of "latest".** Today that is also ViGEmBus's newest release, so what gets installed does not change. HidHide still uses its latest release.

### Window layout

- **Fixed: near the minimum window width (1000 px) the tab strip ran under the Profiles, Health and Settings buttons and swallowed their clicks.** Below 1200 px the L1/R1 hints are now hidden and the tabs show their icons only; hover a tab for its name (screen readers still read it).

### Smaller fixes

- **Number boxes (curve editor points and macro step times) no longer keep stale text.** If the value changed under you while you were typing (for example by switching preset), the box now shows the new value instead of committing your old half-typed number over it.
- **DualForge now recognises its own windows by process ID instead of by program name** when it checks whether a game or DualForge is in front. In normal use you will not notice a difference.
- **If DualForge's background engine restarts while a recorded input replay is playing, the replay now resumes.** Before, a restart switched the virtual pad back to the live controller.

### Updating

- From 0.3.5 or newer, use **Settings > Updates**: turn on **Check for updates**, click **Download**, then **Install & restart**. If you are still on 0.3.3 or 0.3.4, install this version from the download page once, as for 0.3.5.
- Profiles, share codes and settings from 0.3.6 load unchanged.

### Your settings and profiles survive more

- **One bad per-game rule no longer costs you the whole list.** If `settings.json` had a single invalid auto-switch rule, DualForge dropped every rule and showed an empty list. It now keeps each valid rule (up to 32) and drops only the broken one. The original file is moved to the `corrupt` folder and `E_SETTINGS_SALVAGED` is still logged. What to do: open the per-game list once after updating and re-add any rule that is missing.
- **A failed settings save now carries a code.** If Windows cannot write `settings.json` (disk full, file locked, read-only folder), the change is not saved, the previous value stays, and the error is `E_SETTINGS_WRITE` with the cause in the log. Before, this was an uncoded error. What to do: make sure `%APPDATA%\DualForge` is writable, then change the setting again. The code already existed (see docs/ERROR_CODES.md); it now covers every settings save, not only the HidHide switch.
- **Settings and profile files are flushed to disk before they replace the old copy.** A crash or power cut right after saving is less likely to leave a damaged or empty file behind.
- **A damaged file can be set aside even when Windows has it locked for a moment.** Moving a bad file to the `corrupt` folder is now retried (3 more tries, 50 ms apart) when Windows answers "busy" or "permission denied", which an antivirus scan or the search indexer can cause. Before, one such answer left the bad file where it was.
- **A "Section" trigger effect whose start is not below its end is now rejected.** Hand-edited or damaged profiles and share codes with such a section no longer load.
- **A per-game rule's program name must be a bare file name ending in `.exe`** (for example `RocketLeague.exe`): no folder path, drive letter or wildcard. A rule in `settings.json` that breaks this is dropped on load like any other bad rule (see the first bullet in this group); the other rules stay. Rules added in the app already use bare names, so nothing changes for them.

### Virtual pad

- **Fixed: if the virtual pad could not be reset after a disconnect or fault, the reset step itself failed.** DualForge now finishes the reset, logs `E_VIGEM_UPDATE` (at most once every 30 seconds) and carries on. The usual cause is the ViGEmBus driver going away or crashing while a pad was plugged in; the virtual pad may stay on its last frame until it is unplugged or you restart DualForge, and if it keeps happening, reinstall ViGEmBus from the Health page.

### About and disclosure

- **Settings has a new About section** with the DualForge version and this disclosure: DualForge creates a virtual controller. Some games and anti-cheat systems don't allow input-remapping software. Using DualForge in those games is at your own risk, so check each game's rules.
- **The negative-smoothing notice on the Sticks page no longer names games.** It says that some games and anti-cheat systems treat stick jitter as an exploit and may ban for it, and to check each game's rules. The setting itself is unchanged.

## 0.3.6

### HidHide: enabling works when the pad is already hidden

- If HidHide was already hiding the DualSense (for example after setting it up by hand in the HidHide Configuration Client), **Settings > Hide the DualSense from games** answered `E_HIDHIDE_NO_DEVICE` ("Connect the DualSense over USB") even though the pad was plugged in, and DualForge itself could not see the controller. Cause: a hidden pad reports an empty compatible-ID list to Windows (that is how HidHide hides it), and DualForge only accepted the game-controller collection by that ID. A DualSense instance with no compatible IDs is now accepted, so enabling registers DualForge with HidHide (admin prompt) and the pad connects again.

## 0.3.5

### Updates and HidHide work again in the installed app

- **Update checks never worked in 0.3.3 and 0.3.4.** In the installed app every "Check now" (and the startup check) failed with `E_UPDATE_CHECK` "Cannot set properties of undefined (setting 'autoDownload')": DualForge could not find the updater inside its own package, so it never contacted GitHub. Fixed. If the updater ever fails to load again it says so plainly (new code `E_UPDATE_LOAD`, logged once, shown in Health and Settings) instead of looking like a network problem. Because 0.3.3 / 0.3.4 cannot update themselves, install 0.3.5 from the download page once; later versions arrive through **Settings > Updates** as intended.
- **Turning HidHide on could fail and flip straight back off.** On some PCs `HidHideCLI.exe` does not refuse when it lacks administrator rights; it simply never answers. DualForge waited 5 seconds, gave up with `E_HIDHIDE_CLI … timed out after 5000 ms`, and never offered the one-time Windows (UAC) prompt that fixes it. A command that hangs is now treated like "access denied": DualForge asks for administrator rights once and runs the setup elevated, for turning HidHide on and off. Automatic attempts (startup, re-applying the setting) still never ask again after you declined the prompt; clicking the switch does.
- When the HidHide switch does fail, the footer now says what happened in words, "HidHide needs administrator rights — accept the Windows prompt" or "HidHide command timed out — open the HidHide Configuration Client, or retry", with the error code kept in the chip, instead of the raw `E_SETTINGS_SEND Error: Error invoking remote method …` text.
- Health and the HidHide switch now use the same rule for "needs administrator rights" (refused, elevation required, or hung).
- Test runs of the packaged build no longer share the single-instance lock with an installed DualForge.

## 0.3.4

### Packaged-app fixes and update status

- Test and development runs no longer write into your real log (`%APPDATA%\DualForge\logs`). They used to add `APP_START` lines (some reporting Electron's version, 44.5.1) and HidHide timeouts, which is what made the log look like repeated starts and timeouts. Runs with `DUALFORGE_DATA_DIR` now log inside that folder.
- Hardening: the app and the Health page report DualForge's own version even if `app.getVersion()` does not, and a second launch exits immediately, before any logging.
- HidHide: the CLI is probed with a short 2 s timeout (`--version` first). If it hangs or needs administrator rights (including a spawn that fails with "elevation required"), Health shows "HidHide installed — state unknown (CLI unresponsive, likely needs administrator)" with a **Retry now** button, and DualForge stops re-probing (and re-logging) for 30 minutes instead of every 5-minute run.
- Share codes: whitespace and line breaks in a pasted code are ignored, and the import error says a valid code is one line starting with `DUALFORGE:`.
- Settings > Updates shows the app version and the result of the startup check as soon as you open it: "Not checked yet.", "Up to date (0.3.4).", "Version x.y.z is available." with its Download button, or a failed check. The Health app card words each state the same way, and a failed re-check no longer hides an update that was already found.

## 0.3.3

### Release pipeline and in-app updates

- DualForge now has a download page (GitHub Pages) with the latest installer, its size and SHA-256, the SmartScreen steps, a quick start and the requirements.
- Releases are built and published by GitHub Actions from a version tag: installer, `latest.yml` for the updater and `SHA256SUMS.txt`.
- In-app updates: turn on **Settings > Updates > Check for updates** (off by default). When a new version is found, click **Download** next to the version number (a progress bar shows the download), then **Install & restart**. Nothing is downloaded or installed without those two clicks. Install & restart un-hides the DualSense (HidHide) before the installer starts. The Health page's update card points there.
- New error codes `E_UPDATE_NOT_READY`, `E_UPDATE_DOWNLOAD`, `E_UPDATE_INSTALL` (see docs/ERROR_CODES.md).
- Bug report and feature request forms on GitHub; the diagnostics export now suggests attaching the bundle to an issue, and warns that it may contain your Windows user name and device serial numbers (review it first; issues are public).
- A watchdog workflow checks the download page, the latest release and CI every 30 minutes and opens an issue when something breaks.

## 0.3.2

### Negative smoothing rewritten

- Negative smoothing rewritten: game-visible oscillation. In 0.3.1 the overshoot rang out within about a millisecond, far faster than a game reads the controller, so it had no felt effect. Now, while the stick moves, a small oscillation (up to 8 % of full deflection at -100) is added to the aim input at a steady rate that games polling at 60–250 Hz actually see. A still stick is passed through untouched.
- New **Jitter rate** setting (10–60 Hz, default 37 Hz, chosen so it never lines up with 60/120 fps polling) on the Sticks page while any negative smoothing is set.
- The risk notice describes the new behaviour; the center deadzone advice (at least 2–3 %) stays.
- Profiles from 0.3.1 load unchanged (Jitter rate defaults to 37 Hz).

## 0.3.1

### Negative smoothing

- Stick smoothing now runs from -100 to 100. Below 0 is **negative smoothing**: each stick movement overshoots and rings back (the "RC filter" jitter that keeps aim assist engaged); above 0 is the existing smoothing, unchanged.
- The Basic slider has a centre detent at Off when dragged (arrow keys and the D-pad step through it one value at a time), labelled ends (Negative (jitter) / Smoothing) and a signed readout ("-40 (jitter)", "+30 (smooth)", "Off").
- The Advanced speed curve also runs from -100 to 100, with the jitter band shaded below a dashed zero line.
- While negative smoothing is set, the Sticks page shows a risk notice with **Set to Off** (**Remove jitter** in Advanced): Apex Legends treats it as a bannable exploit; Call of Duty has not published a policy. Keep a center deadzone of at least 2–3 % so the stick reads exactly zero at rest; at −100 the filter amplifies sensor noise up to ~39×.
- The Overview Sticks card shows each stick's smoothing, marked when it adds jitter.
- Profiles from 0.3.0 load unchanged. Profiles or share codes with negative smoothing cannot be imported by 0.3.0.

## 0.3.0

### Turbo mode

- New **Turbo** page (after Buttons): every button's turbo on the pad diagram; pick a button to set its mode and speed.
- Two modes: **Hold** fires repeatedly while the button is held; **Toggle** starts auto-fire with one press and stops it with the next.
- Speeds: Slow 8 Hz, Medium 12 Hz, Fast 20 Hz, or Custom 1-30 Hz. The mapping dialog on Buttons uses the same controls.
- Set turbo from the controller: hold the mode button (Touchpad by default) and press a button to step it Slow → Medium → Fast → Off; double-tap the mode button to clear all turbo. A quick tap of the mode button still sends its own output. Changes are saved to the running profile and show up in the app at once.
- The lightbar pulses red while any button has turbo set; the Turbo page shows a live "Turbo active" indicator. Overview lists turbo buttons with their speed.
- Settings → Turbo: on-pad assignment on/off, mode button (or None), lightbar pulse on/off.
- Profiles from 0.2.0 load unchanged: a button's old turbo speed becomes Hold at that speed.
- Turbo never re-triggers a macro; buttons mapped only to macros have no turbo. Key and mouse outputs repeat with turbo like controller buttons.
- While the mode button is held the pad does not navigate the DualForge window, so a combo never clicks anything.
- Share codes and exported profiles from 0.3.0 cannot be imported by 0.2.0 (the turbo format changed); 0.3.0 still imports 0.2.0 ones.

## 0.2.0

First installable release.

### Controller and profiles

- Reads a DualSense over USB and presents it to games as a virtual Xbox 360 controller.
- Button remapping to Xbox buttons, keys, mouse buttons or macros, with turbo.
- Stick deadzones, response curves, calibration, invert and smoothing; per-trigger digital mode, hair trigger, ranges and adaptive trigger effects.
- Gyro aim and steering, rumble strength and motor tests, lightbar, player LEDs and mic LED.
- Macro builder with recording and play-test.
- Four profile slots with rename, duplicate, reset, share codes (`DUALFORGE:...`) and per-game auto-switch.
- Gamepad navigation of the whole UI while DualForge has focus.

### Install, drivers and Health

- NSIS per-user installer (unsigned: SmartScreen shows "More info", then "Run anyway").
- New Health page: checks the controller, ViGEmBus, HidHide, the native addon, startup and updates, with driver install (ViGEmBus required, HidHide optional) and a diagnostics bundle export.
- HidHide support so games see only the virtual pad (no double input). HidHide is admin-gated on most systems: the first enable shows a UAC prompt. The pad is found by hardware ID (works with any Windows language), toggles are serialized, and quitting always un-hides a pad this session hid.
- Tray icon, start with Windows, start minimized and close to tray.
- Optional update check (off by default; never downloads or installs). Shown in Settings only in builds that publish to a real release owner.

### Reliability

- Profile files that fail validation are quarantined and the slot falls back to defaults.
- Stable error codes in logs and the footer chip (see `docs/ERROR_CODES.md`).
- Focus gating by foreground process, so the pad drives the UI only when DualForge is in front.
- A scheduled maintenance agent checks health and logs and writes a dated report (see `maintenance/README.md`).
