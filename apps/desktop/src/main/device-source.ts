import { HIDAsync, devicesAsync } from 'node-hid';
import { DUALSENSE_PID, DUALSENSE_VID, USB_INPUT_REPORT_ID } from '@dualforge/engine';
import type { InputSource } from './engine-loop.js';

const POLL_MS = 1000;

export function createDeviceSource(): InputSource {
  let dev: HIDAsync | null = null;
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;
  let opening = false;

  let report: (code: string, msg: string) => void = () => {};
  function logErr(code: string, e: unknown) {
    report(code, e instanceof Error ? e.message : String(e));
  }

  async function tryOpen(onReport: (b: Uint8Array, t: number) => void, onStatus: (c: boolean) => void) {
    if (dev || stopped || opening) return;
    opening = true;
    try {
      const list = await devicesAsync();
      if (stopped) return;
      const info = list.find((d) => d.vendorId === DUALSENSE_VID && d.productId === DUALSENSE_PID && d.usagePage === 1 && d.usage === 5 && d.path);
      if (!info?.path) return;
      const d = await HIDAsync.open(info.path);
      if (stopped) { await d.close().catch((e) => logErr('E_HID_CLOSE', e)); return; }
      dev = d;
      d.on('data', (buf: Buffer) => {
        if (buf[0] !== USB_INPUT_REPORT_ID) return;        // Bluetooth (0x31) unsupported in v1
        onReport(new Uint8Array(buf.buffer, buf.byteOffset, buf.length), performance.now());
      });
      d.on('error', (e: Error) => {
        logErr('E_HID_READ', e);
        void d.close().catch((err) => logErr('E_HID_CLOSE', err));
        if (dev === d) { dev = null; onStatus(false); }
      });
      onStatus(true);
    } catch (e) {
      logErr('E_HID_OPEN', e);
    } finally {
      opening = false;
    }
  }

  return {
    start(onReport, onStatus, onError) {
      stopped = false; report = onError;
      void tryOpen(onReport, onStatus);
      timer = setInterval(() => void tryOpen(onReport, onStatus), POLL_MS);
    },
    write(report) { if (dev) void dev.write(Buffer.from(report)).catch((e) => logErr('E_HID_WRITE', e)); },
    stop() { stopped = true; if (timer) clearInterval(timer); if (dev) { void dev.close().catch((e) => logErr('E_HID_CLOSE', e)); dev = null; } },
  };
}
