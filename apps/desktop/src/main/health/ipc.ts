import {
  HealthRepairRequestSchema,
  type HealthRepairResult,
  type HealthState,
} from '@dualforge/shared';
import type { HealthService } from './service.js';
import type { BundleSummary } from '../bundle.js';

type Handler = (event: unknown, ...args: unknown[]) => unknown;

/** `health:get` / `health:run` take no payload; `health:repair` is zod-validated ({ id, arg? }) before anything runs. */
export function registerHealthIpc(d: {
  ipc: { handle(channel: string, fn: Handler): void };
  service: HealthService;
  log: { error(o: object): void };
  /** Save dialog + diagnostics zip; null when the user cancels. */
  exportBundle?: () => Promise<BundleSummary | null>;
}): void {
  d.ipc.handle('health:get', (): Promise<HealthState> => d.service.get());
  d.ipc.handle('health:run', (): Promise<HealthState> => d.service.run());
  const exportBundle = d.exportBundle;
  if (exportBundle)
    d.ipc.handle('health:exportBundle', () =>
      exportBundle().catch((e: unknown) => {
        throw new Error(
          (e as Error).message === 'E_BUNDLE_WRITE' ? 'E_BUNDLE_WRITE' : 'E_BUNDLE_EXPORT',
        );
      }),
    );
  d.ipc.handle('health:repair', (_e, raw): Promise<HealthRepairResult> => {
    const parsed = HealthRepairRequestSchema.safeParse(raw);
    if (!parsed.success) {
      d.log.error({ code: 'E_HEALTH_REQUEST', msg: 'health:repair rejected' });
      throw new Error('E_HEALTH_REQUEST');
    }
    return d.service.repair(parsed.data);
  });
}
