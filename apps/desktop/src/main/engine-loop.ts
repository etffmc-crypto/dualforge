import { buildOutputReport, createPipelineState, parseDualSenseUsb, processReport, type Feedback } from '@dualforge/engine';
import { type EngineEvent, type Profile, type RawState, type XInputState, emptyButtons } from '@dualforge/shared';

export interface InputSource {
  start(onReport: (buf: Uint8Array, tMs: number) => void, onStatus: (connected: boolean) => void): void;
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

export function createEngineLoop(d: LoopDeps) {
  let profile: Profile | null = null;
  let state = createPipelineState();
  let connected = false;
  const t0 = d.now();
  let lastSnap = 0, lastOutWrite = 0, lastOutHex = '';
  let reports = 0, hzWindowStart = t0, reportHz = 0;
  const latencies: number[] = [];
  let rumble = { large: 0, small: 0 };
  let lastRaw: RawState | null = null, lastOut: XInputState | null = null;

  function feedback(): Feedback {
    const p = profile!;
    return {
      rumbleLeft: rumble.large * (p.vibration.left / 100), rumbleRight: rumble.small * (p.vibration.right / 100),
      lightbar: { r: p.lights.r, g: p.lights.g, b: p.lights.b },
      brightness: p.lights.brightness as 0 | 1 | 2, playerLeds: p.lights.playerLeds, micLed: 0,
    };
  }
  function maybeWriteOutput(now: number, force = false) {
    if (!profile || !connected) return;
    const rep = buildOutputReport(feedback());
    const hex = Buffer.from(rep).toString('hex');
    if (force || hex !== lastOutHex || now - lastOutWrite >= KEEPALIVE_MS) { d.source.write(rep); lastOutHex = hex; lastOutWrite = now; }
  }
  function onReport(buf: Uint8Array, t: number) {
    if (!profile) return;
    const start = d.now();
    let raw: RawState;
    try { raw = parseDualSenseUsb(buf); } catch (e) { d.emit({ type: 'error', code: 'E_REPORT_PARSE', msg: (e as Error).message }); return; }
    const out = processReport(raw, profile, state, t - t0);
    if (d.sink.ready) d.sink.update(out.xinput);
    lastRaw = raw; lastOut = out.xinput;
    latencies.push(d.now() - start); if (latencies.length > 1000) latencies.shift();
    reports++;
    const now = d.now();
    if (now - hzWindowStart >= 1000) { reportHz = reports / ((now - hzWindowStart) / 1000); reports = 0; hzWindowStart = now; }
    maybeWriteOutput(now);
    if (now - lastSnap >= SNAPSHOT_MS) { lastSnap = now; emitSnapshot(now); }
  }
  function onStatus(c: boolean) {
    connected = c;
    d.emit({ type: 'status', connected, vigemReady: d.sink.ready });
    if (c) maybeWriteOutput(d.now(), true);
  }
  function emitSnapshot(now: number) {
    const sorted = [...latencies].sort((a, b) => a - b);
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
    setProfile(p: Profile) { profile = p; state = createPipelineState(); maybeWriteOutput(d.now(), true); },
    async start() {
      try { await d.sink.connect(); } catch (e) { d.emit({ type: 'error', code: 'E_VIGEM_INIT', msg: (e as Error).message }); }
      d.sink.onRumble((large, small) => { rumble = { large, small }; maybeWriteOutput(d.now()); });
      d.source.start(onReport, onStatus);
      idle = setInterval(() => { const now = d.now(); if (now - lastSnap >= SNAPSHOT_MS) { lastSnap = now; emitSnapshot(now); } maybeWriteOutput(now); }, 100);
    },
    stop() { if (idle) clearInterval(idle); d.source.stop(); d.sink.disconnect(); },
    swapSource(src: InputSource) {
      d.source.stop(); d.source = src;
      connected = false; lastOutHex = '';
      d.emit({ type: 'status', connected: false, vigemReady: d.sink.ready });
      d.source.start(onReport, onStatus);
    },
  };
}
