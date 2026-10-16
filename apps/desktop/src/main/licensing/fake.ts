import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { UNREACHABLE, type LicenseProvider, type ProviderAnswer } from './provider.js';

export const FAKE_SERVER_FILE = 'fake-license-server.json';

const FakeKeySchema = z.object({
  status: z.enum(['active', 'inactive', 'expired', 'disabled']).default('active'),
  variant: z.string().default('monthly'),
  expiresAt: z.string().nullable().default(null),
  limit: z.number().int().min(1).default(1),
  /** Answer as if the key belonged to another product. */
  wrongProduct: z.boolean().default(false),
});
const FakeServerSchema = z.object({
  keys: z.record(z.string(), FakeKeySchema).default({}),
  down: z.boolean().default(false),
});

/**
 * Test-only provider (DUALFORGE_LICENSE_PROVIDER=fake with DUALFORGE_DATA_DIR): reads `<dataDir>/fake-license-server.json`
 * on every call, so a test can lapse, restore or take the "server" down between clicks. Instances live in memory.
 */
export class FakeLicenseProvider implements LicenseProvider {
  readonly name = 'fake';
  private readonly instances = new Map<string, Set<string>>();
  constructor(private readonly dataDir: string) {}

  private server(): z.infer<typeof FakeServerSchema> {
    try {
      return FakeServerSchema.parse(
        JSON.parse(readFileSync(join(this.dataDir, FAKE_SERVER_FILE), 'utf8')),
      );
    } catch {
      return { keys: {}, down: false };
    }
  }

  private judge(key: string): ProviderAnswer | z.infer<typeof FakeKeySchema> {
    const s = this.server();
    if (s.down) return UNREACHABLE;
    const k = s.keys[key];
    if (!k) return { reached: true, ok: false, status: 'invalid', error: 'bad-key' };
    if (k.wrongProduct)
      return { reached: true, ok: false, status: 'invalid', error: 'wrong-product' };
    if (k.status === 'expired' || k.status === 'disabled')
      return { reached: true, ok: false, status: k.status, error: k.status };
    return k;
  }

  private good(k: z.infer<typeof FakeKeySchema>, instanceId: string): ProviderAnswer {
    return {
      reached: true,
      ok: true,
      status: 'active',
      instanceId,
      expiresAt: k.expiresAt,
      variant: k.variant,
    };
  }

  async activate(key: string): Promise<ProviderAnswer> {
    const k = this.judge(key);
    if ('reached' in k) return k;
    const set = this.instances.get(key) ?? new Set<string>();
    if (set.size >= k.limit) return { reached: true, ok: false, status: 'active', error: 'limit' };
    const id = randomUUID();
    set.add(id);
    this.instances.set(key, set);
    return this.good(k, id);
  }

  async validate(key: string, instanceId: string): Promise<ProviderAnswer> {
    const k = this.judge(key);
    if ('reached' in k) return k;
    return this.good(k, instanceId);
  }

  async deactivate(key: string, instanceId: string): Promise<{ reached: boolean }> {
    if (this.server().down) return { reached: false };
    this.instances.get(key)?.delete(instanceId);
    return { reached: true };
  }
}
