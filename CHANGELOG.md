# Changelog

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
- HidHide support so games see only the virtual pad (no double input).
- Tray icon, start with Windows, start minimized and close to tray.
- Update check on start (nothing is downloaded or installed without you).

### Reliability

- Profile files that fail validation are quarantined and the slot falls back to defaults.
- Stable error codes in logs and the footer chip (see `docs/ERROR_CODES.md`).
- Focus gating by foreground process, so the pad drives the UI only when DualForge is in front.
- A scheduled maintenance agent checks health and logs and writes a dated report (see `maintenance/README.md`).
