# DualForge error codes

Stable codes that appear in logs (`%APPDATA%\DualForge\logs\app.*.log`, field `code`), IPC rejections and the footer error chip.
`apps/desktop/test/error-codes.test.ts` fails if an `E_*` code in the source is missing here, so every code has a `### CODE` heading.
Each entry: meaning, typical cause, what the user can do.

## Device and input

### E_HID_OPEN
The DualSense could not be opened. Cause: another program holds the pad exclusively (Steam Input, DS4Windows, HidHide without DualForge whitelisted) or it was just unplugged. Fix: close the other program, or whitelist DualForge in HidHide; replug the controller.

### E_HID_READ
Reading input reports from the pad failed; the engine closes and reopens the device. Cause: cable or Bluetooth drop, USB power-saving. Fix: replug; disable USB selective suspend.

### E_HID_WRITE
Writing an output report (rumble, lightbar) failed. Cause: pad disconnected mid-write. Fix: replug.

### E_HID_CLOSE
Closing the HID handle failed. Cause: the device vanished first. Usually harmless; no action needed.

### E_REPORT_PARSE
An input report could not be parsed and was dropped. Cause: truncated or unexpected report (Bluetooth mode, a different pad). Fix: connect over USB.

### E_REPORT_LEN
Input report shorter than the 64-byte USB report. Cause: pad in Bluetooth mode or a partial read. Fix: connect over USB.

### E_REPORT_ID
Input report id is not 0x01. Cause: pad in Bluetooth mode or a non-DualSense device. Fix: connect a DualSense over USB.

### E_HIDLOG_LINE
A line of a `.hidlog` replay file is malformed (the message gives the line number, never the content). Fix: re-record or use a different file.

### E_REPLAY_OPEN
The replay file could not be opened by the engine. Cause: file moved, unreadable or invalid. Fix: choose another `.hidlog`.

### E_REPLAY_PATH
A replay path was rejected in main: not a `.hidlog`, not an absolute local path, or larger than 16 MiB. Fix: pick a valid recording.

### E_USE_DEVICE
The renderer's "back to controller" request failed. Cause: engine not running. Fix: restart the engine from Health.

## Virtual controller (ViGEm)

### E_VIGEM_INIT
Could not connect to the ViGEmBus driver; retried at most once per 30 s. Cause: ViGEmBus not installed, disabled or restarting. Fix: install or repair ViGEmBus from the Health page.

### E_VIGEM_TARGET
Connected to ViGEmBus but could not plug in the virtual Xbox 360 pad. Cause: bus driver in a bad state or another client monopolising ports. Fix: reinstall ViGEmBus; reboot.

## Engine process

### E_PIPELINE
An exception inside the per-report pipeline (mapping, motion, macros); that frame is skipped. Cause: a bug or a profile value the engine did not expect. Fix: reset the active profile; report with a diagnostics bundle.

### E_ENGINE_SWAP
Switching between device and replay source failed. Fix: restart the engine.

### E_ENGINE_UNCAUGHT
An uncaught exception killed the engine process; main restarts it with backoff. Fix: report with a diagnostics bundle if it repeats.

### E_ENGINE_RESTART_LIMIT
The engine crashed 5 times within 60 s and automatic restarts stopped. Cause: persistent fault (driver, corrupt profile, native module). Fix: use "Restart engine" on the Health page; reset the profile; export a diagnostics bundle.

### E_IPC_COMMAND
The engine received a command that failed schema validation and ignored it. Cause: a bug or main/engine version skew. Fix: restart the app.

### E_IPC_EVENT
Main received an engine event that failed schema validation and dropped it. Fix: restart the app.

## Key and mouse injection

### E_INJECT_LOAD
The native SendInput addon could not be loaded, so key/mouse output and per-game auto-switch are disabled. Logged once per run (the host dedupes engine respawns). Cause: addon not built for this Electron ABI. Fix: reinstall the app or run `npm run rebuild`.

### E_INJECT_KEY
A mapping refers to a key name that has no virtual-key code; the key is skipped (logged once per key). Fix: pick the key again in the Buttons page.

### E_AUTOSWITCH
Per-game profile auto-switch failed to apply a profile. Cause: the target profile could not be loaded. Fix: check the profile slot; reset it.

## Profiles and settings

### E_PROFILE_ID
An unknown profile id was requested. Cause: a bug or tampered IPC. Fix: none for users; restart.

### E_PROFILE_SCHEMA
A profile failed validation: a file on disk (moved to `profiles/corrupt/`, defaults restored), an imported file, or a `profiles:set` rejected by main. Fix: re-import a good copy or reset the slot.

### E_PROFILE_WRITE
Saving a profile to disk failed (logged, never thrown). Cause: disk full, folder read-only or locked by antivirus. Fix: free space; check folder permissions.

### E_PROFILE_INVALID
The renderer refused a profile edit because the result failed the schema; nothing was applied. Fix: adjust the value.

### E_PROFILE_SEND
The renderer could not send a profile change to main. Fix: retry; restart the app.

### E_PROFILE_LOAD
The renderer could not load the current profile. Fix: restart; check Health.

### E_PROFILE_LIST
The renderer could not list profile slots. Fix: restart; check Health.

### E_PROFILE_ACTIVATE
Activating a profile slot failed. Fix: reset or re-import that slot.

### E_PROFILE_RENAME
Renaming a slot failed. Fix: retry; the name must be 1-40 characters.

### E_PROFILE_DUPLICATE
Copying a slot failed. Fix: retry.

### E_PROFILE_RESET
Resetting a slot to defaults failed. Fix: retry; check disk permissions.

### E_PROFILE_EXPORT
Exporting a slot to a file failed. Fix: pick another location.

### E_PROFILE_IMPORT
The chosen file is not a valid DualForge profile; the slot was left unchanged. Fix: pick a file exported from DualForge.

### E_SHARE_CODE
A share code could not be created or decoded (invalid, corrupt or larger than 16 KiB). Fix: copy the whole code again.

### E_SETTINGS_SCHEMA
Settings failed validation (the file on disk is moved to `corrupt/` and defaults restored, or `settings:set` was rejected). Fix: none needed for the quarantine; retry the change.

### E_SETTINGS_SEND
Main rejected a settings change; the UI reverted it. Fix: retry.

### E_SETTINGS_LOAD
The renderer could not load settings. Fix: restart.

## UI actions

### E_MACRO_TEST
"Test macro" did not run. Cause: engine not running or the macro id is unknown. Fix: check engine status.

### E_RUMBLE_TEST
"Test rumble" did not play. Cause: engine not running or rumble disabled in settings. Fix: enable rumble; check engine status.

### E_CLIPBOARD
Copying to the clipboard failed. Fix: copy manually.

### E_OPEN_DATA_DIR
Could not open the data folder in Explorer. Fix: open `%APPDATA%\DualForge` manually.

### E_PROCESSES
Listing running programs for the auto-switch picker failed. Fix: type the exe name manually.

## Process-level

### E_UNCAUGHT
An uncaught exception in the main process (logged with stack). Fix: restart; report with a diagnostics bundle.

## Other structured log codes (not `E_`, not enforced by the registry test)

### APP_START
Info: the app started (`version` field).

### ENGINE_STATUS
Info: the engine reported a connection transition (`connected`, `vigemReady`).

### ENGINE_EXIT
Warning: the engine process exited (`exitCode`); main restarts it unless stopping or past the restart limit.

### LOG_PRUNE
Info/warning: startup removal of `app*.log` files older than 14 days (`deleted` count, or `msg` on failure).

### ENGINE_STDERR
Warning: the engine process wrote to stderr (`msg`).
