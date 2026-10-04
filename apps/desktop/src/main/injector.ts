import { createRequire } from 'node:module';
import { VK } from '@dualforge/shared';

export interface SendInputAddon {
  sendKey(vk: number, down: boolean): void;
  sendMouseButton(button: 0 | 1 | 2, down: boolean): void;
  sendMouseMove(dx: number, dy: number): void;
  foregroundProcessName(): string;
  /** Absent in addon builds that predate it. */
  foregroundElevated?(): boolean | null;
}
export interface Injector {
  readonly available: boolean;
  key(code: string, down: boolean): void;
  mouse(btn: 'left' | 'right' | 'middle', down: boolean): void;
  move(dx: number, dy: number): void;
  foreground(): string;
  /** Whether the foreground process runs elevated; null when unknown (no addon, protected process, old addon). */
  foregroundElevated(): boolean | null;
}
export type InjectLog = (code: string, msg: string) => void;

const BUTTON = { left: 0, right: 1, middle: 2 } as const;

function loadAddon(): SendInputAddon {
  return createRequire(import.meta.url)('@dualforge/sendinput') as SendInputAddon;
}

/** Loads the native addon lazily; if it is missing the injector is a logged no-op (E_INJECT_LOAD, once). */
export function createInjector(log: InjectLog, load: () => SendInputAddon = loadAddon): Injector {
  let addon: SendInputAddon | null = null;
  try { addon = load(); }
  catch (e) { log('E_INJECT_LOAD', (e as Error).message); }
  const badKeys = new Set<string>();
  return {
    available: addon !== null,
    key(code, down) {
      if (!addon) return;
      const vk = Object.hasOwn(VK, code) ? VK[code] : undefined;
      if (vk === undefined) {
        if (!badKeys.has(code)) { badKeys.add(code); log('E_INJECT_KEY', `unknown key ${code}`); }
        return;
      }
      addon.sendKey(vk, down);
    },
    mouse(btn, down) { addon?.sendMouseButton(BUTTON[btn], down); },
    move(dx, dy) { if (dx !== 0 || dy !== 0) addon?.sendMouseMove(dx, dy); },
    foregroundElevated() { try { return addon?.foregroundElevated?.() ?? null; } catch { return null; } },
    foreground() { try { return addon?.foregroundProcessName() ?? ''; } catch { return ''; } },
  };
}
