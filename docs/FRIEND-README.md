# DualForge — quick start for a new PC

DualForge is a PS5 DualSense tuning app for Windows (GameSir-Connect style): remaps, stick curves and deadzones, calibration, smoothing, triggers, gyro, lights, macros, turbo, profiles with per-game auto-switch. It drives a virtual Xbox 360 controller so every PC game sees your tuned input.

## 1. Install

1. Run `DualForge-Setup-0.3.3.exe`. Windows SmartScreen will say "unknown publisher" (the installer is not code-signed yet): click **More info → Run anyway**. It installs per-user; no admin needed for the app itself.
2. Plug the DualSense in over **USB** (Bluetooth is not supported yet).
3. Open DualForge. The first page is Home; it should say "Connected · USB".

## 2. Drivers (one time, from inside the app)

Open **Health** (heart icon, top right). Two cards will be red/amber:

- **ViGEmBus — required.** Click **Install ViGEmBus** → the app downloads the official Nefarius installer, verifies its signature and launches it → accept the Windows UAC prompt → finish the installer. Without it, games cannot see the virtual controller.
- **HidHide — recommended.** Click **Install HidHide** the same way, **reboot if it asks**, then Settings → turn on **"Hide the DualSense from games"** (another UAC prompt). This stops games from seeing both the real pad and the virtual one (double input).

Click **Run checks now** afterwards; everything should be green.

## 3. Match the app to your controller (important)

The defaults were set for a modded pad. For a **stock DualSense**:

- **Triggers page** → turn **Digital (mouse-click) trigger** **OFF** for Left and Right (you have analog triggers).
- **Settings** → turn **"This controller has rumble motors"** **ON**.
- **Sticks → Calibrate** both sticks once (hold still → rotate the stick around the rim twice → Apply).

## 4. While playing

- Keep DualForge running (it hides to the tray on close; **Quit** is in the tray menu).
- Use the pad to drive the app: ✕ confirm, ○ back, L1/R1 switch tabs, D-pad moves.
- Profiles: 4 slots; **Profiles** page (icon top right) for rename, share codes, and auto-switch per game.

## 5. If something's off

- Health page shows what's wrong and offers a Repair button; **Export diagnostics bundle** makes a zip to send back.
- Logs: `%APPDATA%\DualForge\logs`.

Not affiliated with Sony or GameSir.
