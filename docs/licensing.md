# DualForge Pro licensing

Date: 2026-10-16 (DF-030). Spec: `docs/superpowers/specs/2026-10-16-pro-licensing.md`. Copy: DF-023
(`company/departments/revenue/price-page-copy.md`, local only). Same pattern as Purple Party's licensing.

## Plans

|                                                                                                                                      | Free                                  | Pro                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- | ---------------------------------------------------------------------- |
| Price                                                                                                                                | free, no account                      | $4.99 a month, $29.99 a year, $49.99 lifetime, founder lifetime $39.99 |
| Remap to Xbox buttons, sticks, curves, calibration, trigger modes, gyro to the right stick, rumble, lights, Health, drivers, updates | yes                                   | yes                                                                    |
| Profile slots                                                                                                                        | 1 and 2 (share-code import into them) | 1 to 4                                                                 |
| Keyboard and mouse mappings, macros                                                                                                  | no                                    | yes                                                                    |
| Turbo (pages, dialog and the on-pad combo)                                                                                           | no                                    | yes                                                                    |
| Adaptive trigger effects                                                                                                             | no                                    | yes                                                                    |
| Gyro to the mouse                                                                                                                    | no                                    | yes                                                                    |
| Share-code export                                                                                                                    | no                                    | yes                                                                    |
| Per-game auto-switch                                                                                                                 | no                                    | yes                                                                    |

A lapse never deletes anything. Profiles keep every Pro setting on disk; the engine runs a gated copy until Pro is back.

## Dormant until configured

A build only enforces anything when it has a provider:

- **Lemon Squeezy**: a store id and at least one product id baked in at build time (below), or
- **the fake provider** in tests: `DUALFORGE_LICENSE_PROVIDER=fake` together with `DUALFORGE_DATA_DIR` (the e2e marker).

Without one (0.3.7 and every build before the Lemon Squeezy product exists) nothing changes: no Plan card, no Pro
tags, no refusals, no network call. `license:get` answers `enforced: false`.

## Where it runs

All decisions are in the main process (`apps/desktop/src/main/licensing/`); the renderer only shows them.

- `service.ts` (`createLicenseService`): the one place that decides Free or Pro. Activate, Check now, Remove license,
  the daily check (wakes hourly, validates when the last good check is 24 h old), the 14-day offline grace
  (`OFFLINE_GRACE_DAYS`), messages, log codes.
- `gate.ts`: every profile and settings push to the engine goes through it. On Free the engine gets
  `applyEntitlements(profile)` (keyboard, mouse and macro targets become none, turbo off, trigger effects off, gyro to
  the mouse off, no macros) and `turbo.modeButton: null`. On a tier change it re-sends the saved profile and settings.
- `register-ipc.ts`: on Free, `E_LICENSE_PRO` refuses saving, renaming, resetting, importing into and switching to
  slots 3 and 4, `profiles:shareCode` (share export) and `engine:runMacro`. If slot 3 or 4 is active when Pro ends it
  stays active (paused) and edits are refused.
- `game-watcher.ts`: ignores the auto-switch rules on Free (they stay saved and listed, greyed).
- Shared pure helpers: `packages/shared/src/license.ts` (`isPro`, `applyEntitlements`, `proSettingsIn`, the DF-023
  copy).

## State

`settings.json` holds a `license` block next to the settings, written only by the license service:

```json
"license": {
  "key": "",          // the store key (never sent to the renderer or the engine, never logged; the card shows the last 4)
  "instanceId": "",   // this PC's activation instance on the store
  "status": "",       // '' | active | expired | disabled | invalid
  "variant": "",      // '' | monthly | yearly | lifetime | founder-lifetime
  "expiresAt": "",    // what the store reported ('' for lifetime)
  "lastCheck": "",    // last GOOD answer from the store, ISO 8601
  "founderKey": ""    // a DFKEY1 founder or review key
}
```

- `settings:get` and the engine never see it. `settings:set` drops any `license` field the renderer sends
  (`LICENSE_PATCH_IGNORED`) and keeps the saved block.
- At every start and hourly wake the tier is re-derived: Pro only for a founder key that verifies, or a key whose
  status is `active` with a good check in the last 14 days. A hand edit (a `tier` field, `active` without a check, a
  check dated in the future, an unsigned founder key) grants nothing. In a public repo this is a deterrent, not DRM.
- The diagnostics bundle includes `settings.json` with the key cut to its last 4 characters and a founder key shown
  only as `present`.

## Provider

`provider.ts` is the interface; swapping to Polar (DF-030c) means writing one class.

- `LemonSqueezyProvider` (`lemonsqueezy.ts`) uses the License API, which needs no API key:
  `POST https://api.lemonsqueezy.com/v1/licenses/activate` (`license_key`, `instance_name` = the PC name), `/validate`
  (`license_key`, `instance_id`), `/deactivate`. Form-encoded, `Accept: application/json`, 10 s timeout, base URL
  fixed. An answer whose `meta.store_id` is not ours, or whose `meta.product_id` is not in the product list, is
  refused (`wrong-product`). The activation-limit error is `limit`. Network errors, timeouts and 5xx are "not
  reached": the PC keeps its cached state.
- Variants: explicit variant ids win (`DUALFORGE_LS_VARIANT_MONTHLY`, `_YEARLY`, `_LIFETIME`, `_FOUNDER`); otherwise
  the variant name decides, case-insensitive: contains "Founder" = founder-lifetime, else "Lifetime" = lifetime, else
  "Yearly" = yearly, else "Monthly" = monthly.
- Pasting the same key again on the same PC validates the instance it already holds, so a reactivation never uses a
  second seat.
- `FakeLicenseProvider` (`fake.ts`, tests only) reads `<dataDir>/fake-license-server.json` on every call:
  `{ "keys": { "FAKE-MONTHLY": { "status": "active", "variant": "monthly", "expiresAt": "2026-11-16T00:00:00Z", "limit": 2 } }, "down": false }`
  (`status` active | expired | disabled, `wrongProduct: true` answers as another product, unknown key = bad key,
  `down: true` = unreachable). In a fake run `DUALFORGE_LS_CHECKOUT_URL`, `DUALFORGE_LS_PORTAL_URL` and
  `DUALFORGE_FOUNDER_PUBLIC_KEY` may come from the environment, so tests use their own founder keypair.

## Build config Ethan fills in

The build reads these from the environment, and for any that are not set there from `F:\DualForge\.env.licensing`
(git-ignored via `.env*`; no file and no variables = a dormant build). They are baked into the main bundle by
`apps/desktop/electron.vite.config.ts` (`__LICENSE_CONFIG__`).

```ini
# F:\DualForge\.env.licensing
DUALFORGE_LS_STORE_ID=12345
# every product whose keys are DualForge Pro, comma-separated (a separate one-time product is fine)
DUALFORGE_LS_PRODUCT_IDS=67890,67891
# "Get Pro" on the Plan card opens this (https only; blank hides the button)
DUALFORGE_LS_CHECKOUT_URL=https://dualforge.lemonsqueezy.com/buy/xxxxxxxx
# "billing portal" in the subscription line becomes a link to this (blank = plain text)
DUALFORGE_LS_PORTAL_URL=https://dualforge.lemonsqueezy.com/billing
# optional: variant ids, only if the variant names do not contain Monthly / Yearly / Lifetime / Founder
DUALFORGE_LS_VARIANT_MONTHLY=
DUALFORGE_LS_VARIANT_YEARLY=
DUALFORGE_LS_VARIANT_LIFETIME=
DUALFORGE_LS_VARIANT_FOUNDER=
```

`DUALFORGE_LS_PRODUCT_ID` (singular) still works and is added to the list.

How the store maps to plans:

| Plan                     | Lemon Squeezy                        | Variant name (or id variable)                         |
| ------------------------ | ------------------------------------ | ----------------------------------------------------- |
| Pro monthly, $4.99       | subscription variant                 | contains "Monthly" (`DUALFORGE_LS_VARIANT_MONTHLY`)   |
| Pro yearly, $29.99       | subscription variant                 | contains "Yearly" (`DUALFORGE_LS_VARIANT_YEARLY`)     |
| Pro lifetime, $49.99     | single-payment variant               | contains "Lifetime" (`DUALFORGE_LS_VARIANT_LIFETIME`) |
| Founder lifetime, $39.99 | single-payment variant (launch only) | contains "Founder" (`DUALFORGE_LS_VARIANT_FOUNDER`)   |

If the dashboard will not mix subscription and single-payment variants in one product, make two products (Pro
subscription, Pro lifetime) and list both ids in `DUALFORGE_LS_PRODUCT_IDS`. Turn on license keys for every variant.
Find the store id under Settings, General; product and variant ids in their dashboard URLs; the checkout link under
the product's Share; the billing portal is `https://<store-subdomain>.lemonsqueezy.com/billing`. Then rebuild
(`npm run dist:installer`). DF-031 proves a test-mode key activates, lapses and reactivates on the real store.

## Plan card

Settings > Plan, above Data, only when enforced. Badge (Free / Pro / Pro (founder key)), the DF-023 lines, the
subscription plan or "Lifetime", Last checked, the message, Get Pro (opens the baked checkout link in the browser;
the renderer never passes a URL), the key box with Activate, Check now (store keys) and Remove license. Gate lines
("{Feature} is part of DualForge Pro." with a Get Pro link) open this card.

Messages: bad key, activation limit, wrong product (shown as the bad-key line), expired, disabled, offline within the
grace ("Pro stays on for N more days"), offline past the grace ("for N days, so this PC is back on Free"), and, not in
DF-023, "Couldn't reach the license server. Try again when you're online." for an activation while offline.

## Founder and review keys

One line pasted into the same key box: `DFKEY1.<base64url payload>.<base64url Ed25519 signature>`.

- Payload: `{ v: 1, id, kind: 'founder' | 'review', name, issuedAt, expiresAt: null | ISO, note }`.
- Signature over `"DualForge founder key v1\n"` plus the payload bytes (domain separation), verified offline with
  `node:crypto` against `FOUNDER_PUBLIC_KEY` (`apps/desktop/src/main/licensing/founder-key.ts`, base64 SPKI DER).
- Works offline forever (or until `expiresAt`). Not bound to a person; the list is small and CEO-approved. No
  revocation list yet (later ticket). Remove license clears it.

### The tool (Ethan's side)

The private key is `F:\DualForge\secrets\founder-ed25519.pem`, created once on 2026-10-16 and git-ignored
(`secrets/`, `*.pem`). Back it up offline; losing it means a new keypair and an app update. Never paste it anywhere.

```sh
node scripts/license-tool.mjs keygen      # refuses to overwrite an existing key; prints only the public key
node scripts/license-tool.mjs issue --name "Ryda" --kind founder --out ryda.dfkey
node scripts/license-tool.mjs issue --name "Reviewer" --kind review --expires 2026-12-31 --note "press" --out r.dfkey
node scripts/license-tool.mjs verify ryda.dfkey
```

`issue` refuses a private key that does not match the public key built into the app, refuses to overwrite `--out`,
and verifies what it wrote. Send the one line in the `.dfkey` file; the recipient pastes it into Settings > Plan.

## Log codes

`LICENSE_ACTIVATED`, `LICENSE_REMOVED`, `LICENSE_LAPSED`, `LICENSE_FOUNDER_REFUSED`, `LICENSE_PATCH_IGNORED` (info or
warn) and `E_LICENSE_PRO`, `E_LICENSE_CHECK` (warn, at most once a day), `E_LICENSE_LOAD`, `E_LICENSE_IPC`; see
`docs/ERROR_CODES.md`. Only the last 4 characters of a key are ever logged.

## Tests

- Unit: `packages/shared/test/license.test.ts`, `apps/desktop/test/licensing/*.test.ts`,
  `apps/desktop/test/scripts/license-tool.test.ts`, `apps/desktop/test/renderer/Licensing.test.tsx`.
- E2E: `apps/desktop/e2e/licensing.spec.ts` (fake provider; screenshots in `apps/desktop/test-results/licensing/`).
