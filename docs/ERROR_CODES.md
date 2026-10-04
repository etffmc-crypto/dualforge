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

## Health checks and repairs

### E_HEALTH_TIMEOUT
A health probe (`sc.exe`, PowerShell, HidHideCLI) did not answer within 5 s and was killed; the affected check shows "unknown". Cause: a busy or hung system. Fix: run the checks again.

### E_HEALTH_SC
`sc query ViGEmBus` failed for a reason other than "service not found". Fix: run the checks again; check that `sc.exe` works in a terminal.

### E_HEALTH_PNP
The PowerShell PnP query for the ViGEm bus device failed. Cause: PowerShell blocked by policy or unavailable. Fix: run the checks again; the service check still works.

### E_HEALTH_HIDHIDE
HidHideCLI.exe was found but `--app-list` or `--dev-list` failed. Cause: broken HidHide install. Fix: reinstall HidHide from the Health page.

### E_HEALTH_ELEVATION
The native addon threw while checking whether the foreground program is elevated; treated as unknown. Fix: none needed; reinstall if it repeats.

### E_HEALTH_OUTPUT_TOO_LARGE
A health probe printed more than 1 MiB and was cut off; the affected check shows "unknown". Fix: run the checks again; report with a diagnostics bundle if it repeats.

### E_HEALTH_CHECK
A whole health run failed unexpectedly; the previous results are kept. Fix: run again; report with a diagnostics bundle if it repeats.

### E_HEALTH_REQUEST
`health:repair` received a payload that failed validation (unknown repair id, extra fields, argument over 64 characters) and was rejected. Cause: a bug or tampered renderer.

### E_HEALTH_BAD_ARG
A repair got a missing or invalid argument (resetProfile needs a slot p1..p4).

### E_HEALTH_REPAIR_UNAVAILABLE
The requested repair is not available in this build (installers arrive in a later release, or the diagnostics bundle is not wired).

### E_HEALTH_REPAIR_FAILED
A repair threw an error (see `msg` in the log). Fix: retry; export a diagnostics bundle if it repeats.

### E_HEALTH_OPEN_LOGS
Explorer could not open the logs folder. Fix: open `%APPDATA%\DualForge\logs` manually.

## Driver installer

### E_DRIVER_REQUEST
`driver:install` got a payload other than `{ driver: 'vigem' | 'hidhide' }`. Fix: none; this indicates a bug.

### E_DRIVER_FETCH
The latest-release lookup on GitHub (`api.github.com`) failed: offline, rate limited, or an error status. Fix: check the connection and retry, or install the driver manually from its GitHub releases page.

### E_DRIVER_NO_ASSET
The latest release has no usable `.exe` asset (none, not served from github.com, or an unsafe file name). Fix: install manually from the project's releases page.

### E_DRIVER_DOWNLOAD
Downloading the installer failed (network error or bad status). The partial file is deleted. Fix: retry.

### E_DRIVER_TOO_LARGE
The installer is larger than the 50 MB safety cap, by its declared or its streamed size. Nothing is launched. Fix: install manually.

### E_DRIVER_SIGNATURE
The installer's Authenticode signature is not Valid (not signed, hash mismatch, not trusted) or could not be checked. The file is deleted and never launched. Fix: retry; if it repeats, do not install the driver from this download.

### E_DRIVER_SIGNER
The signature is valid but not from Nefarius Software Solutions. The file is deleted and never launched.

### E_DRIVER_LAUNCH
Windows could not start the installer (for example the UAC prompt was declined). The downloaded file stays in a `run-*` folder under `%TEMP%DualForge`. Fix: click install again and accept the prompt.

## HidHide

### E_HIDHIDE_NOT_INSTALLED
HidHide was asked to enable but `HidHideCLI.exe` was not found at its default path, `%ProgramFiles%Nefarius Software SolutionsHidHidedHidHideCLI.exe`. Fix: install HidHide from the Health page.

### E_HIDHIDE_NO_DEVICE
No connected DualSense "HID-compliant game controller" was found through PnP, so there is nothing to hide. The setting stays off. Fix: connect the controller over USB and try again.

### E_HIDHIDE_CLI
A `HidHideCLI.exe` call failed or timed out (`msg` names the command). Cause: the driver service is stopped, or the CLI needs administrator rights. Fix: restart the PC or run DualForge as administrator, then retry.

## Startup, tray and updates

### E_TRAY_ICON
The tray icon file (`resources/tray.png`) could not be loaded, so no tray was created. Close-to-tray is then ignored so the window cannot be lost. Fix: reinstall DualForge.

### E_TRAY_ACTIVATE
Switching profile from the tray menu failed (see `msg`). Fix: switch from the app window instead.

### E_UPDATE_DISABLED
"Check now" was used while Settings > Check for updates is off. Nothing was contacted. Fix: turn the setting on.

### E_UPDATE_DEV
The update check is not available: this is a development build (no `app-update.yml`). Not an error in installed builds.

### E_UPDATE_CHECK
The update check failed (offline, GitHub unreachable, bad release metadata; see `msg` in the log). Fix: try again later.

## Driver installer (redirects, integrity)

### E_DRIVER_URL
A download URL was refused: the first URL is not a Nefarius release asset on github.com, a redirect left the allowed hosts (github.com, objects.githubusercontent.com, release-assets.githubusercontent.com), was not https, had no location, or there were more than 3 hops. Nothing is launched.

### E_DRIVER_TAMPERED
The installer's SHA-256 changed between the signature check and the launch. The file is deleted and never launched. Fix: retry; scan the PC if it repeats.

### E_STARTUP_LOGIN_ITEM
Writing the start-with-Windows login item failed (see `msg`). The setting is saved but may not take effect. Fix: toggle it again.

## Diagnostics bundle

### E_BUNDLE_WRITE
The diagnostics zip could not be written (partial file removed). Cause: disk full, read-only or locked destination. Fix: choose another location.

### E_BUNDLE_CANCELLED
The user closed the save dialog, so no diagnostics bundle was written (returned by the exportBundle repair; not a fault).

### E_BUNDLE_COLLECT
The health or system part of the bundle could not be produced; the bundle is still written with an error placeholder for that file. Fix: none needed; report if it repeats.

### E_BUNDLE_EXPORT
An unexpected failure while exporting the bundle (renderer-facing wrapper; the cause is in the log). Fix: retry.

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

### BUNDLE_WRITTEN
Info: a diagnostics bundle was written (`files`, `bytes`, `skipped` = files left out to stay under 50 MB).

### HEALTH_RESULT
Warning: a health run found an `error`-status check (`id`, `status`).

### HIDHIDE_ENABLED
Info: HidHide was enabled (`instance` is the hidden HID instance path).

### DRIVER_DOWNLOADED
Info: a driver installer was downloaded (`driver`, `url`, `sha256`, `file`) and is about to be signature-checked.

### DRIVER_LAUNCHED
Info: a verified driver installer was handed to Windows (`driver`, `sha256`).

### LOGIN_ITEM_SKIPPED
Info: the start-with-Windows registry entry was not written because this is a development run.

### UPDATE_CHECK
Info: an opt-in update check finished (`available`, `version`).

### HEALTH_REPAIR
Info: a repair completed (`id`, plus a result such as `deleted`).

### LOG_PRUNE
Info/warning: startup removal of `app*.log` files older than 14 days (`deleted` count, or `msg` on failure).

### ENGINE_STDERR
Warning: the engine process wrote to stderr (`msg`).
