import { describe, expect, it, vi } from 'vitest';
import { openPathOrThrow } from '../src/main/open-path.js';

describe('openPathOrThrow', () => {
  it('resolves quietly when openPath returns an empty string', async () => {
    const log = { error: vi.fn() };
    await expect(openPathOrThrow(async () => '', '/data', log)).resolves.toBeUndefined();
    expect(log.error).not.toHaveBeenCalled();
  });

  it('rejects and logs E_OPEN_DATA_DIR when openPath returns an error string', async () => {
    const log = { error: vi.fn() };
    const open = vi.fn(async () => 'Failed to open path');
    await expect(openPathOrThrow(open, '/data', log)).rejects.toThrow('Failed to open path');
    expect(open).toHaveBeenCalledWith('/data');
    expect(log.error).toHaveBeenCalledWith({ code: 'E_OPEN_DATA_DIR', msg: 'Failed to open path' });
  });
});
