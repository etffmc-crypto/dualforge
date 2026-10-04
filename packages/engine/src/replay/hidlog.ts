export interface HidlogEntry { t: number; hex: string }

export function parseHidlog(text: string): HidlogEntry[] {
  const out: HidlogEntry[] = [];
  const bad = (n: number) => new Error(`E_HIDLOG_LINE: line ${n}`);   // never include file content
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const s = lines[i]!.trim();
    if (!s || s.startsWith('#')) continue;
    let j: unknown;
    try { j = JSON.parse(s); } catch { throw bad(i + 1); }
    if (typeof j !== 'object' || j === null) throw bad(i + 1);
    const { t, hex } = j as { t?: unknown; hex?: unknown };
    if (typeof t !== 'number' || typeof hex !== 'string' || !/^([0-9a-f]{2})*$/i.test(hex)) throw bad(i + 1);
    if (hex.length !== 128) throw bad(i + 1);
    out.push({ t, hex: hex.toLowerCase() });
  }
  return out;
}

export function serializeHidlog(entries: readonly HidlogEntry[]): string {
  return entries.map((e) => JSON.stringify({ t: e.t, hex: e.hex })).join('\n') + '\n';
}

export function entryBytes(e: HidlogEntry): Uint8Array {
  const out = new Uint8Array(e.hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(e.hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}
