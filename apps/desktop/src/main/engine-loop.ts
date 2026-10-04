import { type OutputFrame, buildOutputReport, reconcileMacros, compileProfile, computeLightbar, createPipelineState, type CompiledProfile, parseDualSenseUsb, processReport, type Feedback } from '@dualforge/engine';
import { defaultSettings, type EngineEvent, type Profile, type Settings, type RawState, type XInputState, emptyButtons, emptyXInput } from '@dualforge/shared';

export interface InputSource {
  /** Only a physical device may drive keyboard/mouse injection; replays never do. */
  readonly kind: 'device' | 'replay';
  start(onReport: (buf: Uint8Array, tMs: number) => void, onStatus: (connected: boolean) => void, onError: (code: string, msg: string) => void): void;
  write(report: Uint8Array): Promise<void>;
  stop(): Promise<void>;
}
export interface PadSink {
  ready: boolean;
  connect(): Promise<void>;
  update(x: XInputState): void;
  onRumble(cb: (large: number, small: number) => void): void;
  disconnect(): void;
}
/** Subset of the injector the loop needs (see injector.ts). */
export interface LoopInjector {
  key(code: string, down: boolean): void;
  mouse(btn: 'left' | 'right' | 'middle', down: boolean): void;
  move(dx: number, dy: number): void;
}
export interface LoopDeps { source: InputSource; sink: PadSink; emit: (e: EngineEvent) => void; now: () => number; injector?: LoopInjector;
  /** Master injection switch; defaults to `DUALFORGE_NO_INJECT !== '1'`, read once at creation. */
  allowInject?: boolean }

const SNAPSHOT_MS = 1000 / 60;
const IDLE_MS = 100;
const ANIM_MS = 1000 / 30;
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
  let connecting: Promise<void> | null = null;
  let graceTimer: ReturnType<typeof setTimeout> | null = null;
  let reports = 0, hzWindowStart = t0, reportHz = 0;
  const latencies = new Float64Array(LAT_RING);
  let latIdx = 0, latCount = 0;
  let rumble = { large: 0, small: 0 };
  let lastRaw: RawState | null = null, lastOut: XInputState | null = null;
  let settings: Settings = defaultSettings();
  // Safe until main reports otherwise: never type into the DualForge window itself.
  let uiFocused = true;
  const allowInject = d.allowInject ?? process.env.DUALFORGE_NO_INJECT !== '1';
  const heldKeys = new Set<string>();
  const heldMouse = new Set<'left' | 'right' | 'middle'>();
  let animated = false;

  function feedback(now: number): Feedback {
    const p = profile!;
    const lb = computeLightbar(p.lights, Math.floor((now - t0) / ANIM_MS) * ANIM_MS, lastRaw?.battery ?? { percent: 0, state: 'unknown' });
    animated = lb.animated;
    const rl = settings.hasRumble ? rumble.large * (p.vibration.left / 100) : 0;
    const rr = settings.hasRumble ? rumble.small * (p.vibration.right / 100) : 0;
    return {
      rumbleLeft: rl, rumbleRight: rr,
      lightbar: { r: lb.r, g: lb.g, b: lb.b },
      brightness: lb.brightness, playerLeds: lb.playerLeds, micLed: lb.micLed,
      triggers: { left: p.triggers.left.effect, right: p.triggers.right.effect },
    };
  }
  function releaseInjected() {
    const inj = d.injector;
    for (const k of heldKeys) inj?.key(k, false);
    for (const b of heldMouse) inj?.mouse(b, false);
    heldKeys.clear(); heldMouse.clear();
  }
  function inject(out: OutputFrame) {
    const inj = d.injector;
    if (!inj || !allowInject || d.source.kind !== 'device') return;
    for (const e of out.keys) {
      if (e.down) { if (uiFocused) continue; heldKeys.add(e.code); inj.key(e.code, true); }
      else if (heldKeys.delete(e.code)) inj.key(e.code, false);
    }
    for (const e of out.mouse) {
      if (e.down) { if (uiFocused) continue; heldMouse.add(e.button); inj.mouse(e.button, true); }
      else if (heldMouse.delete(e.button)) inj.mouse(e.button, false);
    }
    if (!uiFocused && (out.mouseMove.dx !== 0 || out.mouseMove.dy !== 0)) inj.move(out.mouseMove.dx, out.mouseMove.dy);
  }
  function maybeWriteOutput(now: number, force = false) {
    if (!profile || !connected) return;
    const rep = buildOutputReport(feedback(now));
    if (force || !sameBytes(rep, lastOutBytes) || now - lastOutWrite >= KEEPALIVE_MS) { void d.source.write(rep); lastOutBytes = rep; lastOutWrite = now; }
  }
  function safeReport(): Uint8Array {
    return buildOutputReport({ ...feedback(d.now()), rumbleLeft: 0, rumbleRight: 0, triggers: { left: { mode: 'off' }, right: { mode: 'off' } } });
  }
  function onReport(buf: Uint8Array, t: number) {
    if (!profile || !compiled) return;
    const start = d.now();
    let raw: RawState;
    try { raw = parseDualSenseUsb(buf); } catch (e) { d.emit({ type: 'error', code: 'E_REPORT_PARSE', msg: (e as Error).message }); return; }
    let out: OutputFrame;
    try {
      out = processReport(raw, compiled, state, t - t0);
      if (d.sink.ready) d.sink.update(out.xinput);
      inject(out);
    } catch (e) {
      // Never leave injected keys / a pressed virtual pad behind because of a pipeline fault; keep serving reports.
      neutralize();
      onError('E_PIPELINE', (e as Error).message);
      return;
    }
    lastRaw = raw; lastOut = out.xinput;
    latencies[latIdx] = d.now() - start; latIdx = (latIdx + 1) % LAT_RING; if (latCount < LAT_RING) latCount++;
    reports++;
    const now = d.now();
    if (now - hzWindowStart >= 1000) { reportHz = reports / ((now - hzWindowStart) / 1000); reports = 0; hzWindowStart = now; }
    maybeWriteOutput(now);
    if (now - lastSnap >= SNAPSHOT_MS) { lastSnap = now; emitSnapshot(now); }
  }
  function neutralize() {
    releaseInjected();
    if (d.sink.ready) d.sink.update(emptyXInput());
    state = createPipelineState();
    lastRaw = null; lastOut = null; reportHz = 0; reports = 0;
  }
  function armGrace() {
    if (graceTimer) clearTimeout(graceTimer);
    graceTimer = setTimeout(() => { graceTimer = null; d.sink.disconnect(); d.emit({ type: 'status', connected, vigemReady: d.sink.ready }); }, GRACE_MS);
  }
  // One connect at a time; failures go through the deduped error path (one E_VIGEM_INIT per 30 s).
  function ensureConnected(): Promise<void> {
    if (d.sink.ready) return Promise.resolve();
    if (connecting) return connecting;
    connecting = d.sink.connect()
      .catch((e: unknown) => onError('E_VIGEM_INIT', (e as Error).message))
      .finally(() => { connecting = null; });
    return connecting;
  }
  function onStatus(c: boolean) {
    connected = c;
    if (!c) {
      neutralize();
      if (graceTimer) clearTimeout(graceTimer);
      armGrace();
    } else {
      if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; }
      if (!d.sink.ready) void ensureConnected().then(() => d.emit({ type: 'status', connected, vigemReady: d.sink.ready }));
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
  let swapping: Promise<void> = Promise.resolve();

  return {
    // Pipeline state (filters, hair-trigger hysteresis, turbo) is deliberately preserved so live edits do not jump.
    setSettings(s: Settings) {
      settings = s;
      if (!s.hasRumble) rumble = { large: 0, small: 0 };
      maybeWriteOutput(d.now(), true);
    },
    setUiFocused(focused: boolean) {
      uiFocused = focused;
      if (focused) releaseInjected();
    },
    setProfile(p: Profile) {
      const prev = compiled;
      profile = p; compiled = compileProfile(p);
      if (prev) reconcileMacros(state.macros, prev.macros, compiled.macros, Math.max(0, state.lastMs));
      maybeWriteOutput(d.now(), true);
    },
    /** Synchronously releases every injected key/mouse button and neutralizes the virtual pad (crash / fault path). */
    releaseAll() { neutralize(); },
    async start() {
      await ensureConnected();
      d.sink.onRumble((large, small) => { if (!settings.hasRumble) return; rumble = { large, small }; maybeWriteOutput(d.now()); });
      d.source.start(onReport, onStatus, onError);
      let lastIdle = d.now();
      // 30 Hz while the lightbar animates (writes only when the bytes change), otherwise 10 Hz.
      idle = setInterval(() => {
        const now = d.now();
        if (!animated && now - lastIdle < IDLE_MS - 1) return;
        lastIdle = now;
        if (now - lastSnap >= SNAPSHOT_MS) { lastSnap = now; emitSnapshot(now); }
        maybeWriteOutput(now);
      }, ANIM_MS);
    },
    async stop() {
      if (idle) clearInterval(idle);
      releaseInjected();
      if (graceTimer) { clearTimeout(graceTimer); graceTimer = null; }
      if (profile) await d.source.write(safeReport());   // rumble + trigger effects off before the handle closes
      await d.source.stop();
      d.sink.disconnect();
    },
    // Concurrent swaps are serialised: a second call waits for the first to finish, then proceeds.
    swapSource(src: InputSource): Promise<void> {
      const run = swapping.catch(() => {}).then(() => doSwap(src));
      swapping = run;
      return run;
    },
  };
  async function doSwap(src: InputSource) {
    if (profile && connected) await d.source.write(safeReport()).catch(() => {});
    await d.source.stop(); d.source = src;
    connected = false; lastOutBytes = null;
    neutralize();
    armGrace();   // a never-connecting new source still releases the pad
    d.emit({ type: 'status', connected: false, vigemReady: d.sink.ready });
    const now = d.now(); lastSnap = now; emitSnapshot(now);
    d.source.start(onReport, onStatus, onError);
  }
}
