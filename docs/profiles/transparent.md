# Transparent — Profile 1

An example pad-side setup for games that apply their own stick response curve and deadzones. Renamed on 2026-10-16 from an earlier game-named example; the settings are unchanged. Apply it with `scripts/apply-transparent-profile.mjs` (it writes slot p1 and keeps your mappings, macros and lights). In-game settings are set in each game's own menu.

## Why the pad side is kept "transparent"

Many games apply their own response curve and deadzones to the stick. Stacking a second curve, extra deadzone or smoothing on the controller distorts the response the game expects. The pad-side configuration that leaves the game in charge is: linear curve, the smallest deadzone that stops drift, no anti-deadzone, no smoothing.

Negative smoothing is **not** applied, and positive smoothing adds latency, so both are off. Some games and anti-cheat systems do not allow input-remapping software; see the disclosure in the README and check each game's rules.

## DualForge Profile 1 (what changes)

| Setting                         | Value                              | Reason                                                                             |
| ------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------- |
| Stick deadzone center (L/R)     | 3 %                                | TMR sticks + calibration: enough to kill drift, lets in-game min deadzone sit at 0 |
| Anti-deadzone                   | 0 %                                | an anti-deadzone floor can cause drift when the game adds its own                  |
| Outer deadzone                  | 2 %                                | guarantees full deflection registers                                               |
| Trajectory                      | Circle                             | consistent magnitude on diagonals                                                  |
| Curve                           | Linear                             | the game's own curve does the shaping                                              |
| Smoothing                       | Off                                | no added latency                                                                   |
| Invert                          | Off                                | —                                                                                  |
| Triggers                        | Digital (mouse-click), effects off | matches the hardware this was written for                                          |
| Gyro                            | Off                                | —                                                                                  |
| Mappings, macros, turbo, lights | unchanged                          | your existing setup                                                                |

Run **Sticks → Calibrate** once on both sticks after plugging in, so the center offset is exact.

## What to test in-game

1. Drift check at rest: no camera creep. If it creeps, raise DualForge's center deadzone to 4–5 % rather than the game's own minimum.
2. Fine movement: slowly move the camera; movement should start the instant the stick leaves center.
3. Fast turns: if the camera feels floaty, change the game's own curve setting and leave the pad on Linear.
