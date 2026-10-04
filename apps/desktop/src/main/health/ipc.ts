import { HealthRepairRequestSchema, type HealthRepairResult, type HealthState } from '@dualforge/shared';
import type { HealthService } from './service.js';

type Handler = (event: unknown, ...args: unknown[]) => unknown;

/** `health:get` / `health:run` take no payload; `health:repair` is zod-validated ({ id, arg? }) before anything runs. */
export function registerHealthIpc(d: {
  ipc: { handle(channel: string, fn: Handler): void };
  service: HealthService;
  log: { error(o: object): void };
}): void {
  d.ipc.handle('health:get', (): Promise<HealthState> => d.service.get());
  d.ipc.handle('health:run', (): Promise<HealthState> => d.service.run());
  d.ipc.handle('health:repair', (_e, raw): Promise<HealthRepairResult> => {
    const parsed = HealthRepairRequestSchema.safeParse(raw);
    if (!parsed.success) { d.log.error({ code: 'E_HEALTH_REQUEST', msg: 'health:repair rejected' }); throw new Error('E_HEALTH_REQUEST'); }
    return d.service.repair(parsed.data);
  });
}
