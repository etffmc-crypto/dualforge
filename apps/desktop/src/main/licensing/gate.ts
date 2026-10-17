import {
  applyEntitlements,
  applySettingsEntitlements,
  type EngineCommand,
  type Entitlements,
} from '@dualforge/shared';

/**
 * Everything main sends to the engine goes through here: profiles get `applyEntitlements`, settings get the on-pad
 * turbo combo off when not Pro. The raw (saved) profile and settings are kept, so a tier change re-sends them gated.
 */
export function createEngineGate(
  engine: { send(cmd: EngineCommand): void },
  entitlements: () => Entitlements,
) {
  let lastProfile: Extract<EngineCommand, { type: 'setProfile' }> | null = null;
  let lastSettings: Extract<EngineCommand, { type: 'setSettings' }> | null = null;
  const gated = (cmd: EngineCommand): EngineCommand => {
    if (cmd.type === 'setProfile')
      return { ...cmd, profile: applyEntitlements(cmd.profile, entitlements()) };
    if (cmd.type === 'setSettings')
      return { ...cmd, settings: applySettingsEntitlements(cmd.settings, entitlements()) };
    return cmd;
  };
  return {
    send(cmd: EngineCommand): void {
      if (cmd.type === 'setProfile') lastProfile = cmd;
      else if (cmd.type === 'setSettings') lastSettings = cmd;
      engine.send(gated(cmd));
    },
    /** The tier changed: the engine gets the current settings and profile again, gated for the new tier. */
    refresh(): void {
      if (lastSettings) engine.send(gated(lastSettings));
      if (lastProfile) engine.send(gated(lastProfile));
    },
  };
}
