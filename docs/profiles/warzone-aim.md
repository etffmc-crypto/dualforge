# Warzone Aim — Profile 1

Applied 2026-10-05 from community research (setup.gg, Dexerto S5 2026, SCUF, Beebom, mitchcactus, leprestore; GameSir/HyperStrike notes via gamepadla and user threads). Pad-side settings live in DualForge Profile 1 ("Warzone Aim"); in-game settings must be set in Warzone's menu.

## Why the pad side is kept "transparent"

Warzone applies its own aim response curve and deadzones. Stacking a second curve, extra deadzone or smoothing on the controller distorts the response the game expects and weakens aim assist tracking. The best pad-side configuration is therefore: linear curve, the smallest deadzone that stops drift, no anti-deadzone, no smoothing.

The HyperStrike "RC filter / negative smoothing" trick (adds micro-jitter to farm aim assist) is **not** applied: Apex Legends ruled it bannable in July 2026 and Ricochet's policy is unstated. Positive smoothing adds latency. Both are off.

## DualForge Profile 1 (what changed)

| Setting                         | Value                              | Reason                                                                             |
| ------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------- |
| Stick deadzone center (L/R)     | 3 %                                | TMR sticks + calibration: enough to kill drift, lets in-game min deadzone sit at 0 |
| Anti-deadzone                   | 0 %                                | an anti-deadzone floor causes drift in Warzone                                     |
| Outer deadzone                  | 2 %                                | guarantees full deflection registers                                               |
| Trajectory                      | Circle                             | consistent magnitude on diagonals                                                  |
| Curve                           | Linear                             | Warzone's Dynamic curve does the shaping                                           |
| Smoothing / RC filter           | Off                                | no added latency, no exploit risk                                                  |
| Invert                          | Off                                | —                                                                                  |
| Triggers                        | Digital (mouse-click), effects off | your hardware                                                                      |
| Gyro                            | Off                                | not used in Warzone                                                                |
| Mappings, macros, turbo, lights | unchanged                          | your existing setup                                                                |

Run **Sticks → Calibrate** once on both sticks after plugging in, so the center offset is exact.

## Warzone in-game settings to pair with it

| Setting                                      | Value                                                                               |
| -------------------------------------------- | ----------------------------------------------------------------------------------- |
| Horizontal / Vertical sensitivity            | 1.60 / 1.60 (scale is 0.10–4.00; start here, adjust ±0.2)                           |
| ADS Sensitivity Multiplier (Focus)           | 0.90 (0.85 for precision, 1.00 for snappier)                                        |
| Other ADS / 3rd-person / vehicle multipliers | 1.00                                                                                |
| ADS transition                               | Instant                                                                             |
| Aim Response Curve Type                      | **Dynamic** (majority); Linear is a legitimate alternative some creators prefer     |
| Aim Assist                                   | Target + ADS on; type **Black Ops** if offered, else Default                        |
| Left stick deadzone min / max                | 0 / 80 (raise min only if drift appears)                                            |
| Right stick deadzone min / max               | 0 / 99                                                                              |
| Trigger deadzones                            | 0                                                                                   |
| Button layout                                | Tactical (your paddles mirror face buttons, so pick what matches them)              |
| Controller vibration                         | Off                                                                                 |
| FOV                                          | 105 (100–110 range); ADS FOV Affected; Weapon FOV Wide; FOV Sensitivity Scaling Off |
| Sprint assist                                | On, delay 0                                                                         |
| Slide / dive                                 | Hybrid                                                                              |

## What to test in-game

1. Drift check at rest: no camera creep. If it creeps, raise DualForge center deadzone to 4–5 % (not the in-game min).
2. Fine tracking: slowly track a moving target — movement should start the instant the stick leaves center.
3. Flick + settle: Dynamic curve should feel progressive; if it feels floaty, try Linear in-game (leave the pad Linear).
4. Compare 1.60 vs 1.40 / 1.80 sensitivity over a few matches before changing ADS multiplier.

## Sources

- https://www.setup.gg/game/warzone/best-controller-settings/
- https://www.dexerto.com/wikis/warzone/best-controller-settings-warzone/
- https://www.scufgaming.com/us/en/gaming/games/call-of-duty-black-ops-7/black-ops-7-best-controller-settings/
- https://beebom.com/best-controller-settings-for-black-ops-7/
- https://mitchcactus.co/blog/call-of-duty/bo7-controller-settings/
- https://leprestore.com/guides/cod-guides/bo7-best-controller-settings/
- https://apexranked.com/apex-legends-rc-filter-controller-drama-negative-smoothing-aim-assist (RC filter ruling)
- https://x.com/kawstuh/status/2065164327909572767 (HyperStrike sampling/quantization notes)
