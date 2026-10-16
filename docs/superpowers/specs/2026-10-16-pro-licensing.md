# DualForge Pro licensing (DF-024)

- Date: 2026-10-16. Owners: Revenue + Product (spec), Engineering (Jarvis lead) builds it as DF-030.
- Decisions behind it (Ethan, 2026-10-16 7:07 PM, `company/decisions.md`, git-excluded): Free stays free with no account; Pro $4.99 a month, $29.99 a year, $49.99 lifetime, founder lifetime $39.99; Lemon Squeezy behind a swappable provider interface, Polar as the fallback.
- Feature split: `company/departments/product/free-vs-pro.md`. Copy: `company/departments/revenue/price-page-copy.md` (DF-023).
- Pattern: Purple Party's `jarvis/licensing` (`F:\PurpleParty\docs\licensing.md`): one license service in the trusted process, a provider client, an offline-verified founder file, limits enforced outside the UI, a fake provider for every test.

## Goals

1. A Free user never loses a feature they have in 0.3.x until a build with a configured provider ships (see "Dormant until configured").
2. Pro is bought on Lemon Squeezy and activated by pasting the key. No DualForge account, no server of our own.
3. A lapse never deletes anything. Profiles, mappings, macros and rules stay on disk; Pro outputs pause until Pro is back.
4. The provider can be swapped (Polar) by writing one class; nothing else changes.
5. Every path is testable without a real store: a fake provider drives unit tests and the Playwright click-through.

Non-goals (later tickets): the 7-day trial (DF-030b, needs Revenue to confirm trial keys), Polar's client (DF-030c), a revocation list for founder keys, account sign-in.

## Where it runs

- Main process only: `apps/desktop/src/main/licensing/`. The renderer never sees the key in full and cannot write the license state.
- State: `settings.json` gets a `license` block, written only by `LicenseService`:
  `{ key, instanceId, status ('' | 'active' | 'expired' | 'disabled' | 'invalid'), variant ('' | 'monthly' | 'yearly' | 'lifetime' | 'founder-lifetime'), expiresAt (ISO or ''), lastCheck (ISO or ''), founderKey ('' or the signed text) }`.
  The `settings:set` path keeps whatever is saved in `license` whatever the renderer sends. At every start the tier is re-derived from the founder key or the cached check, so a hand edit grants nothing beyond what the cached provider answer said.
- In a public repo this is a deterrent, not DRM (market report section 6); updates keep edited builds stale.

## Tiers and limits

One pure module, `packages/shared/src/license.ts`:

- `type Tier = 'free' | 'pro'`; `interface Entitlements { tier; enforced: boolean }`.
- `isPro(e) = !e.enforced || e.tier === 'pro'` (dormant builds behave as Pro for gating, see below).
- `PRO_FEATURES`: `keyMouse`, `macros`, `turbo`, `triggerEffects`, `gyroMouse`, `slots34`, `shareExport`, `autoSwitch`, each with its display name from DF-023.
- `FREE_SLOTS = ['p1', 'p2']`.
- `applyEntitlements(profile, e): Profile` returns a copy for the engine with Pro outputs paused when not Pro: mapping targets of type `key`, `mouse` and `macro` become `none` (dropped from a multi-target mapping, `none` when nothing is left); every mapping's turbo becomes off; trigger `effect` becomes `{ mode: 'off' }`; gyro `output: 'mouse'` becomes `'off'`; the engine copy holds no macros. The saved profile is never changed.
- `applySettingsEntitlements(settings, e)`: `turbo.modeButton` becomes null when not Pro (the on-pad combo).
- `proSettingsIn(profile): PRO_FEATURE[]` lists which Pro settings a profile holds (for the "kept, paused" note).

## Dormant until configured

- Enforcement is on only when a provider is configured: a Lemon Squeezy store id and at least one product id baked into the build (`DUALFORGE_LS_STORE_ID`, `DUALFORGE_LS_PRODUCT_IDS` (a comma-separated list; the old single `DUALFORGE_LS_PRODUCT_ID` is still read as a one-item list), `DUALFORGE_LS_CHECKOUT_URL`, `DUALFORGE_LS_PORTAL_URL`, optional `DUALFORGE_LS_VARIANT_MONTHLY` / `_YEARLY` / `_LIFETIME` / `_FOUNDER`) at build time through electron-vite `define`. The build takes each from the environment, else from `F:\DualForge\.env.licensing` (git-ignored by `.env*`); no file and no variables = a dormant build. Or the fake provider in tests (`DUALFORGE_LICENSE_PROVIDER=fake`, honoured only when `DUALFORGE_DATA_DIR` is set, the existing test-run marker).
- Not configured: `enforced: false`, every feature works as in 0.3.x, the Plan card is not shown, no network call is made. This is how 0.3.7 and any build before the Lemon Squeezy product exists behave.
- Configured: the Plan card shows and the gates apply.

## Provider interface

`apps/desktop/src/main/licensing/provider.ts`:

```ts
interface LicenseProvider {
  readonly name: string; // 'lemonsqueezy' | 'fake' | later 'polar'
  activate(key: string, instanceName: string): Promise<ProviderAnswer>;
  validate(key: string, instanceId: string): Promise<ProviderAnswer>;
  deactivate(key: string, instanceId: string): Promise<{ reached: boolean }>;
}
interface ProviderAnswer {
  reached: boolean; // false on network error, timeout or 5xx
  ok: boolean; // the key is valid for this product and active
  status: string; // active | inactive | expired | disabled | invalid
  instanceId?: string;
  expiresAt?: string | null; // null = lifetime
  variant?: string; // mapped from the provider's variant id or name
  error?: 'bad-key' | 'limit' | 'wrong-product' | 'unreachable' | string;
}
```

- `LemonSqueezyProvider`: the License API (no API key): `POST https://api.lemonsqueezy.com/v1/licenses/activate` (`license_key`, `instance_name`), `/validate` (`license_key`, `instance_id`), `/deactivate`. Form-encoded, `Accept: application/json`, 10 s timeout. Refuses an answer whose `meta.store_id` differs from the baked store id or whose `meta.product_id` is not in `DUALFORGE_LS_PRODUCT_IDS` (`wrong-product`); a key from any listed product is accepted (the one-time lifetime and founder variants may live in their own product if the dashboard will not mix them with subscriptions). The variant comes from the explicit variant ids when set, else from `meta.variant_name` (case-insensitive: contains Founder = `founder-lifetime`, else Lifetime, Yearly, Monthly). Maps the activation-limit error to `limit`. Base URL fixed to `https://api.lemonsqueezy.com`; tests inject a fetch.
- `FakeLicenseProvider`: scripted keys read from `<dataDir>/fake-license-server.json` on every call, so a test can lapse or restore a key between clicks: `{ "keys": { "FAKE-MONTHLY": { "status": "active", "variant": "monthly", "expiresAt": "2026-11-16T00:00:00Z", "limit": 2 }, ... }, "down": false }`. Unknown key: `bad-key`. `down: true`: `reached: false`.

## License service

`apps/desktop/src/main/licensing/service.ts`, `createLicenseService({ provider, settingsStore, founderVerifier, clock, log, enforced })`:

- `view()`: `{ enforced, tier, source ('none' | 'key' | 'founder'), status, variant, expiresAt, lastCheck, keyHint (last 4), message, prices, checkoutUrl (boolean: a link is baked in), portalUrl (boolean), founderName, hasLicense }`.
- `activate(text)`: a text starting `DFKEY1.` goes to the founder verifier; anything else is a store key: 8 to 200 characters, `provider.activate(key, os.hostname())`. Pro at once when ok.
- `check()`: validate the saved key now.
- `remove()`: deactivate (best effort), clear the block, back to Free. Profiles untouched.
- Daily check: on start (if the last good check is older than 24 h) and then while running: the service wakes every hour and validates once the last good check is 24 h old (so a PC that slept still checks within the hour), re-deriving the tier on every wake.
- Pasting the saved key again on the same PC validates the instance it holds instead of activating a second one.
- Answers: `active` keeps or grants Pro and moves `lastCheck`; `expired`, `disabled` or `invalid` drop to Free with the DF-023 message; unreachable keeps the cached state, Pro is kept for 14 days after the last good check (`OFFLINE_GRACE_DAYS = 14`), then Free with the "past grace" message until a check succeeds.
- Emits `license:changed` to the renderer and re-sends the profile and settings to the engine through `applyEntitlements` whenever the tier changes.
- Log codes: `LICENSE_ACTIVATED`, `LICENSE_REMOVED`, `LICENSE_LAPSED` (info), `E_LICENSE_CHECK` (warn, unreachable, once per day), never the full key.

## Founder and review keys

- Format: `DFKEY1.<base64url payload>.<base64url Ed25519 signature>`, one line, pasted in the same key box.
- Payload: `{ v: 1, id, kind: 'founder' | 'review', name, issuedAt, expiresAt: null | ISO, note }`. Signature over `"DualForge founder key v1\n"` plus the payload bytes (domain separation).
- Verified offline with `node:crypto` (`verify(null, data, publicKey, sig)`) against the public key built into the app (`FOUNDER_PUBLIC_KEY`, base64 SPKI/raw). Tests use their own keypair through the verifier's constructor.
- Ethan's side: `scripts/license-tool.mjs keygen | issue --name <n> --kind founder|review [--expires <date>] --out <file> | verify <file>`. The private key lives at `F:\DualForge\secrets\founder-ed25519.pem`, git-ignored (`secrets/`, `*.pem`); `keygen` refuses to overwrite it; `issue` refuses a key that does not match the built-in public key and self-verifies what it wrote. The tool never prints the private key.
- Not bound to a person (DualForge has no accounts); the list is small and CEO-approved. A revocation list is a later ticket.

## Gates (only when enforced and not Pro)

Enforced in main, shown in the renderer. Copy from DF-023 ("{Feature} is part of DualForge Pro." with a Get Pro link to the Plan card; a **Pro** tag on the control).

| Feature                             | Main-process rule                                                                                                                                           | Renderer                                                                                                                                                               |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keyboard and mouse mappings, macros | engine gets `applyEntitlements` (targets to none)                                                                                                           | Key, Mouse and Macro tabs in the mapping dialog show the Pro line instead of the picker; existing ones stay listed with "paused"                                       |
| Turbo                               | engine gets turbo off; on-pad turbo combo off (`turbo.modeButton` sent as null)                                                                             | Turbo page and dialog controls disabled with the Pro line                                                                                                              |
| Adaptive trigger effects            | engine gets `effect: off`                                                                                                                                   | Effect section disabled with the Pro line                                                                                                                              |
| Gyro to the mouse                   | engine gets `output: off` for mouse                                                                                                                         | the Mouse option disabled with the Pro tag                                                                                                                             |
| Profile slots 3 and 4               | `profiles:set` / `profile:set`, rename, reset, duplicate into, file import into, share-code import into and switching to p3/p4 refused with `E_LICENSE_PRO` | slots 3 and 4 show the Pro tag; their content stays on disk. If the active slot is 3 or 4 when Pro ends it stays active, its Pro outputs paused, and edits are refused |
| Share-code export                   | `profiles:shareCode` refused with `E_LICENSE_PRO`                                                                                                           | Copy code disabled with the Pro line; import stays free (into slots 1 and 2)                                                                                           |
| Per-game auto-switch                | the game watcher ignores the rules                                                                                                                          | the card shows the rules, greyed, with the Pro line                                                                                                                    |

Never gated: Health, driver install, diagnostics, updates, calibration, deadzones, curves, smoothing, trigger modes, gyro to the right stick, rumble, lights, two slots, share import.

## Plan card

Settings > Plan (above Data), only when enforced. Badge, the DF-023 lines, the key box with Activate, Check now, Remove license, the status, the plan line ("Pro (monthly) or Pro (yearly). Manage or cancel it in your Lemon Squeezy billing portal.", with "billing portal" a link when `DUALFORGE_LS_PORTAL_URL` is baked in; "Lifetime: all future updates included." for lifetime and founder keys; no renewal date, because the License API does not promise one; a date only for a founder or review key issued with an end date), last check (while Pro), message, and Get Pro (opens the baked checkout URL in the browser; hidden when blank).

## Tests (done when)

- Unit (vitest): `applyEntitlements` for each feature and that the input is not mutated; `isPro` for dormant, Free, Pro; the service with the fake provider and a fake clock: activate ok, bad key, limit, wrong product, unreachable; daily check ok; lapse (expired, disabled) drops to Free with the message and keeps every profile; offline within 14 days keeps Pro, past 14 days drops; reactivate after a lapse; remove; restart re-derives the tier; a hand-edited `license` block grants nothing; founder key good, tampered payload, flipped signature, wrong prefix, expired, other keypair; `settings:set` cannot write `license`; IPC refusals for slots 3/4 and share export; dormant mode makes no provider call.
- Playwright (`e2e/licensing.spec.ts`, fake provider): Plan card on Free with screenshots; a locked control; activate `FAKE-MONTHLY` and see Pro and the lock gone; lapse it in the fake server, Check now, back to Free with the message, profiles intact; restore and reactivate; a founder key; Remove license. Screenshots saved under `apps/desktop/test-results/licensing/` and looked at.
- `npm run check:full` green. A second review pass (code-review) before merge.

## Ethan's side (DF-012, in Jarvis needs.md)

Create the Lemon Squeezy product in the same account as Purple Party, with monthly, yearly and lifetime variants and license keys; paste the store id, the product ids (`DUALFORGE_LS_PRODUCT_IDS`), the checkout link and the billing portal link into the build config (`F:\DualForge\.env.licensing`, git-ignored); see `docs/licensing.md` for the exact keys. DF-031 then proves a test-mode key activates, lapses and reactivates on the real store.

## Deviations (as built, 2026-10-16)

- Share export is the existing `profiles:shareCode` channel (there is no `share:export`); it is the one refused. The slot gate also covers rename, reset, duplicate into, file import into and share-code import into slots 3 and 4, not only `profile:set` and switching, so nothing on disk in those slots changes on Free.
- `engine:runMacro` (the macro play-test) is refused on Free, and the engine copy from `applyEntitlements` has no macros, so a paused macro cannot run by any path.
- The `license` block lives in `settings.json` but outside the `Settings` schema (`settingsStore.getLicense/setLicense`), so `settings:get` and the engine never receive the key. `settings:set` drops a `license` field (log `LICENSE_PATCH_IGNORED`) and applies the rest of the patch rather than refusing it.
- The daily check is an hourly wake that validates when the last good check is 24 h old (see License service).
- Copy (fact-checked DF-023, 2026-10-16): the subscription line replaces "Renews or ends on {date}"; "Lapsed (disabled)" is "This key was turned off, so this PC is back on Free. Your profiles are kept." Two lines are new and not in DF-023: "Ends on {date}." for a founder or review key with an end date, and "Couldn't reach the license server. Try again when you're online." for an activation while offline (nothing is saved yet, so "Check now" would not help). A wrong-product key shows the bad-key line.
- A test run may also set `DUALFORGE_FOUNDER_PUBLIC_KEY` (honoured only with the fake provider) so the Playwright founder-key step uses the test's own keypair; `DUALFORGE_LS_CHECKOUT_URL` and `DUALFORGE_LS_PORTAL_URL` may come from the environment in that mode too.
- `LICENSE_FOUNDER_REFUSED` (info) is logged when a pasted founder key does not verify, and `E_LICENSE_LOAD` / `E_LICENSE_IPC` are the renderer's codes for a failed license read or Plan card action.
- The diagnostics bundle redacts the license block in `settings.json` (key to its last 4 characters, founder key to "present").
- Activating a founder key keeps a saved store key (Remove license clears and deactivates both).
- From the code review (2026-10-16): the fake provider (and `DUALFORGE_FOUNDER_PUBLIC_KEY`) is honoured only in an unpackaged run (`!app.isPackaged`), so a shipped build cannot be unlocked with two environment variables. A 429, or an error status whose body is not a License API answer (a proxy or captive-portal page), counts as unreachable, so it gets the offline grace instead of dropping a paying user to Free. Pasting the saved key again re-activates when the store no longer knows the held instance. Activating a different key deactivates the old key's instance (best effort) so its seat is freed. `settings:set` with `activeProfile` p3/p4 is refused on Free like `profiles:activate`.
- Remove license while offline still clears this PC (spec: best effort); the store keeps the seat used until the key is removed from the Lemon Squeezy dashboard or the instance is deactivated another way. No DF-023 line covers that case, so the card shows none.
