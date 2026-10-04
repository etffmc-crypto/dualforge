import { buildOutputReport, compileProfile, createPipelineState, type CompiledProfile, parseDualSenseUsb, processReport, type Feedback } from '@dualforge/engine';
import { type EngineEvent, type Profile, type RawState, type XInputState, emptyButtons, emptyXInput } from '@dualforge/shared';

export interface InputSource {
  start(onReport: (buf: Uint8Array, tMs: number) => void, onStatus: (connected: boolean) => void, onError: (code: string, msg: string) => void): void;
  write(report: Uint8Array): void;
  stop(): void;
}
export interface PadSink {
  ready: boolean;
  connect(): Promise<void>;
  update(x: XInputState): void;
  onRumble(cb: (large: number, small: number) => void): void;
  disconnect(): void;
}
export interface LoopDeps { source: InputSource; sink: PadSink; emit: (e: EngineEvent) => void; now: () => number }

const SNAPSHOT_MS = 1000 / 60;
const KEEPALIVE_MS = 250;
const ERROR_DEDUPE_MS = 30_000;
export const GRACE_MS = 2000;
const LAT_RING = 1024;

function sameBytes(a: Uint8Array, b: Uint8Array | null): boolean {
  if (!b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function createEngineLoop(d: LoopDeps) {
  let profile: Profile | null = null;
  let compiled: CompiledProfile | null = null;
  let state = createPipelineState();
  let connected = false;
  const t0 = d.now();
  let lastSnap = 0, lastOutWrite = 0;
  let lastOutBytes: Uint8Array | null = null;   // last written output report (byte-compare, no hex string)
  let graceTimer: ReturnType<typeof setTimeout> | null = null;
  let reports = 0, hzWindowStart = t0, reportHz = 0;
  const latencies = new Float64Array(LAT_RING);
  let latIdx = 0, latCount = 0;
  let rumble = { large: 0, small: 0 };
  let lastRaw: RawState | null = null, lastOut: XInputState | null = null;

  function feedback(): Feedback {
    const p = profile!;
    return {
      rumbleLeft: rumble.large * (p.vibration.left / 100), rumbleRight: rumble.small * (p.vibration.right / 100),
      lightbar: { r: p.lights.r, g: p.lights.g, b: p.lights.b },
      brightness: p.lights.brightness as 0 | 1 | 2, playerLeds: p.lights.playerLeds, micLed: 0,
      triggers: { left: p.triggers.left.effect, right: p.triggers.right.effect },
    };
  }
  function maybeWriteOutput(now: number, force = false) {
    if (!profile || !connected) return;
    const rep = buildOutputReport(feedback());
    if (force || !sameBytes(rep, lastOutBytes) || now - lastOutWrite >= KEEPALIVE_MS) { d.source.write(rep); lastOutBytes = rep; lastOutWrite = now; }
  }
  function onReport(buf: Uint8Array, t: number) {
    if (!profile || !compiled) return;
    const start = d.now();
    let raw: RawState;
    try { raw = parseDualSenseUsb(buf); } catch (e) { d.emit({ type: 'error', code: 'E_REPORT_PARSE', msg: (e as Error).message }); return; }
    const out = processReport(raw, compiled, state, t - t0);
    if (d.sink.ready) d.sink.update(out.xinput);
    lastRaw = raw; lastOut = out.xinput;
    latencies[latIdx] = d.now() - start; latIdx = (latIdx + 1) % LAT_RING; if (latCount < LAT_RING) latCount++;
    reports++;
    const now = d.now();
    if (now - hzWindowStart >= 1000) { reportHz = reports / ((now - hzWindowStart) / 1000); reports = 0; hzWindowStart = now; }
    maybeWriteOutput(now);
    if (now - lastSnap >= SNAPSHOT_MS) { lastSnap = now; emitSnapshot(now); }
  }
  function neutralize() {
    if (d.sink.ready) d.sink.update(emptyXInput());
    state = createPipelineState();
    lastRaw = null; lastOut = null; reportHz = 0; reports = 0;
  }
  function onStatus(c: boolean) {
    connected = c;
    if (!c) {
      neutralize();
      if (graceTimer) clearTimeout(graceTimer);
      graceTimer = setTimeout(() => { graceTimer = null; d.sink.disconnect(); d.emit({ type: 'status', connected, vigemReady: d.sink.ready }); }, GRACE_MS);
    } else {
      if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; }
      if (!d.sink.ready) {
        d.sink.connect().then(
          () => d.emit({ type: 'status', connected, vigemReady: d.sink.ready }),
          (e: unknown) => onError('E_VIGEM_INIT', (e as Error).message),
        );
      }
    }
    d.emit({ type: 'status', connected, vigemReady: d.sink.ready });
    if (!c) { const now = d.now(); lastSnap = now; emitSnapshot(now); }
    if (c) maybeWriteOutput(d.now(), true);
  }
  const errSeen = new Map<string, { at: number; suppressed: number }>();
  function onError(code: string, msg: string) {
    const now = d.now();
    const e = errSeen.get(code);
    if (e && now - e.at < ERROR_DEDUPE_MS) { e.suppressed++; return; }
    const n = e?.suppressed ?? 0;
    errSeen.set(code, { at: now, suppressed: 0 });
    d.emit({ type: 'error', code, msg: n > 0 ? `${msg} (x${n})` : msg });
  }
  function emitSnapshot(now: number) {
    const sorted = latencies.slice(0, latCount).sort();   // copy only at snapshot time
    const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
    const raw = lastRaw, out = lastOut;
    d.emit({ type: 'snapshot', snapshot: {
      t: now - t0, connected, vigemReady: d.sink.ready, reportHz, pipelineP99Ms: p99,
      battery: raw?.battery ?? { percent: 0, state: 'unknown' },
      raw: raw ? { lx: raw.lx, ly: raw.ly, rx: raw.rx, ry: raw.ry, l2: raw.l2, r2: raw.r2, buttons: raw.buttons, gyro: raw.gyro }
               : { lx: 0, ly: 0, rx: 0, ry: 0, l2: 0, r2: 0, buttons: emptyButtons(), gyro: { x: 0, y: 0, z: 0 } },
      out: out ? { lx: out.lx, ly: out.ly, rx: out.rx, ry: out.ry, lt: out.lt, rt: out.rt, buttons: out.buttons }
               : { lx: 0, ly: 0, rx: 0, ry: 0, lt: 0, rt: 0, buttons: {} },
    } });
  }
  let idle: NodeJS.Timeout | null = null;

  return {
    // Pipeline state (filters, hair-trigger hysteresis, turbo) is deliberately preserved so live edits do not jump.
    setProfile(p: Profile) { profile = p; compiled = compileProfile(p); maybeWriteOutput(d.now(), true); },
    async start() {
      try { await d.sink.connect(); } catch (e) { d.emit({ type: 'error', code: 'E_VIGEM_INIT', msg: (e as Error).message }); }
      d.sink.onRumble((large, small) => { rumble = { large, small }; maybeWriteOutput(d.now()); });
      d.source.start(onReport, onStatus, onError);
      idle = setInterval(() => { const now = d.now(); if (now - lastSnap >= SNAPSHOT_MS) { lastSnap = now; emitSnapshot(now); } maybeWriteOutput(now); }, 100);
    },
    stop() {
      if (idle) clearInterval(idle);
      if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; }
      if (profile) d.source.write(buildOutputReport({ ...feedback(), rumbleLeft: 0, rumbleRight: 0 }));
      d.source.stop(); d.sink.disconnect();
    },
    swapSource(src: InputSource) {
      d.source.stop(); d.source = src;
      connected = false; lastOutBytes = null;
      if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; }
      neutralize();
      d.emit({ type: 'status', connected: false, vigemReady: d.sink.ready });
      const now = d.now(); lastSnap = now; emitSnapshot(now);
      d.source.start(onReport, onStatus, onError);
    },
  };
}
