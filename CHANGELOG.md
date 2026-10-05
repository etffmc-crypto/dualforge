# Changelog

## 0.3.3

### Release pipeline and in-app updates

- DualForge now has a download page (GitHub Pages) with the latest installer, its size and SHA-256, the SmartScreen steps, a quick start and the requirements.
- Releases are built and published by GitHub Actions from a version tag: installer, `latest.yml` for the updater and `SHA256SUMS.txt`.
- In-app updates: turn on **Settings > Updates > Check for updates** (off by default). When a new version is found, click **Download** next to the version number (a progress bar shows the download), then **Install & restart**. Nothing is downloaded or installed without those two clicks. The Health page's update card points there.
- New error codes `E_UPDATE_NOT_READY`, `E_UPDATE_DOWNLOAD`, `E_UPDATE_INSTALL` (see docs/ERROR_CODES.md).
- Bug report and feature request forms on GitHub; the diagnostics export now suggests attaching the bundle to an issue.
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
