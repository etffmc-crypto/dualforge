import { z } from 'zod';

export const HEALTH_STATUSES = ['ok', 'warn', 'error'] as const;
export const HealthStatusSchema = z.enum(HEALTH_STATUSES);
export type HealthStatus = z.infer<typeof HealthStatusSchema>;

/** One-click fixes the Health page can offer. */
export const REPAIR_IDS = [
  'installViGEm',
  'installHidHide',
  'enableHidHide',
  'retryHidHide',
  'restartEngine',
  'resetProfile',
  'clearLogs',
  'openLogs',
  'exportBundle',
] as const;
export const RepairIdSchema = z.enum(REPAIR_IDS);
export type RepairId = z.infer<typeof RepairIdSchema>;

export const HealthResultSchema = z.object({
  id: z.string().min(1).max(64),
  status: HealthStatusSchema,
  title: z.string(),
  detail: z.string(),
  repair: RepairIdSchema.optional(),
  /** Argument for `repair` (the profile slot for resetProfile). */
  repairArg: z.string().max(64).optional(),
});
export type HealthResult = z.infer<typeof HealthResultSchema>;

export const HealthStateSchema = z.object({
  results: z.array(HealthResultSchema),
  ranAt: z.number(),
});
export type HealthState = z.infer<typeof HealthStateSchema>;

export const HealthRepairRequestSchema = z
  .object({ id: RepairIdSchema, arg: z.string().max(64).optional() })
  .strict();
export type HealthRepairRequest = z.infer<typeof HealthRepairRequestSchema>;

export const HealthRepairResultSchema = z.object({
  ok: z.boolean(),
  code: z.string().optional(),
  msg: z.string().optional(),
});
export type HealthRepairResult = z.infer<typeof HealthRepairResultSchema>;
