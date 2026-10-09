# Rocket League — Profile 2

Applied 2026-10-09 from community research (Gamer Guides 2026, trophi.ai, TheSpike, DiamondLobby, Steam and reWASD forum threads on stick shape). Pad-side settings live in DualForge Profile 2 ("Rocket League", built by `scripts/build-rocket-league-profile.mjs`); in-game settings must be set in Rocket League's menu.

## Why the pad side is kept transparent — and square

Rocket League applies its own controller deadzone, dodge deadzone and sensitivity, so anything added on the pad stacks on top of that and makes the car feel heavy or late. Stick **shape** matters more here than in a shooter: aerials and air roll want diagonal inputs that reach 1.0, and the game's own deadzone shape (Cross by default, Square for some players) assumes the native square stick range. A circular normalisation would cap diagonals at about 0.71. So: Raw trajectory, tiny deadzone, linear, no smoothing.

## DualForge Profile 2

| Setting                     | Value                                       | Reason                                                                                                                                                                                                                                                                                           |
| --------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Stick deadzone center (L/R) | 2 %                                         | kills TMR drift only; the in-game 0.05 deadzone does the rest                                                                                                                                                                                                                                    |
| Anti-deadzone               | 0 %                                         | a floor makes the car creep                                                                                                                                                                                                                                                                      |
| Outer deadzone              | 2 %                                         | full deflection always registers                                                                                                                                                                                                                                                                 |
| Trajectory                  | **Raw** (square)                            | diagonals reach 1.0; the in-game Cross/Square shape works as designed                                                                                                                                                                                                                            |
| Curve                       | Linear                                      | the in-game sensitivity is the only curve wanted                                                                                                                                                                                                                                                 |
| Smoothing / RC filter       | Off                                         | no added latency                                                                                                                                                                                                                                                                                 |
| Invert                      | Off                                         | —                                                                                                                                                                                                                                                                                                |
| Triggers                    | Digital (mouse-click), effects off          | throttle/reverse full-on, which is how the game is played anyway                                                                                                                                                                                                                                 |
| Gyro, turbo, macros         | Off / none                                  | —                                                                                                                                                                                                                                                                                                |
| Lightbar                    | orange (255, 110, 0), static                | shows at a glance which profile is live                                                                                                                                                                                                                                                          |
| Buttons                     | Xbox layout with **Cross ↔ Circle swapped** | paddle fix: the old pad's paddles were wired left = Circle / right = Cross; the new pad's are mirrored (left = Cross / right = Circle). Swapping the two makes each new paddle send what the old one did. Face ✕ and ○ share those wires, so they swap too (unavoidable with hard-wired paddles) |
| Auto-switch                 | `RocketLeague.exe` → Profile 2              | the profile applies while the game is in front; the active profile returns                                                                                                                                                                                                                       |

## Paddle capture (2026-10-09)

Captured on the Input Test page (window unfocused so the pad does not navigate the app): old right paddle → Cross, old left paddle → Circle; new right paddle → Circle, new left paddle → Cross. Hence the Cross ↔ Circle swap in `scripts/build-rocket-league-profile.mjs`. Verify after import: Input Test → Virtual Xbox output shows **A** for the right paddle and **B** for the left one.

## Rocket League in-game settings to pair with it

| Setting                             | Value                                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| Steering / Aerial sensitivity       | 1.30 / 1.30 (pro range 1.20–1.50; raise if turns feel slow)                             |
| Controller deadzone                 | 0.05 (raise to 0.08 only if the car creeps at rest)                                     |
| Dodge deadzone                      | 0.65 (0.60–0.70 avoids accidental back-flips in 50/50s)                                 |
| Controller vibration                | Off                                                                                     |
| Ball camera mode                    | Toggle                                                                                  |
| Camera                              | FOV 110, Distance 270, Height 100, Angle −3, Stiffness 0.45, Swivel 5.0, Transition 1.0 |
| Bindings (common pro layout)        | Jump ✕ · Boost ○ · Powerslide + Air roll L1 · Air roll left □ · Air roll right R1       |
| Steam Input (if launched via Steam) | per-game **Forced Off**, so Steam does not reshape the stick                            |

## What to test in-game

1. Free play, car at rest: no creep. If it creeps, raise the in-game deadzone to 0.08 first; only then the pad deadzone.
2. Hold the stick fully diagonal in free play and watch the car: it should turn at full rate (Raw shape). If it ever feels slower on diagonals, check Steam Input is off.
3. Dodge test: a few fast-aerial and 50/50 attempts — no unintended back-flips at 0.65; lower to 0.60 if dodges feel late.

## Sources

- https://gamer-guides.com/rocket-league/best-controller-settings/
- https://www.trophi.ai/post/the-best-settings-for-rocket-league
- https://www.thespike.gg/rocket-league/settings
- https://diamondlobby.com/rocket-league/best-settings-rocket-league/
- https://steamcommunity.com/app/252950/discussions/0/3032599335599554447 (square vs circle stick input)
- https://forum.rewasd.com/forum/rewasd/suggestions-aa/30700-converting-circle-stick-input-to-a-square (why circular virtual sticks hurt RL)
