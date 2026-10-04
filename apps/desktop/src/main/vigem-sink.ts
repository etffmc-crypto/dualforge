import { createRequire } from 'node:module';
import type { XInputState } from '@dualforge/shared';
import type { PadSink } from './engine-loop.js';

const require = createRequire(import.meta.url);

export function createViGEmSink(): PadSink {
  let client: any = null;   // eslint-disable-line @typescript-eslint/no-explicit-any
  let pad: any = null;      // eslint-disable-line @typescript-eslint/no-explicit-any
  let rumbleCb: ((l: number, s: number) => void) | null = null;
  const sink: PadSink = {
    ready: false,
    async connect() {
      const ViGEmClient = require('vigemclient');
      client = new ViGEmClient();
      const err = client.connect();
      if (err) throw new Error(`E_VIGEM_INIT ${err.message ?? err}`);
      pad = client.createX360Controller();
      pad.updateMode = 'manual';
      const e2 = pad.connect();
      if (e2) throw new Error(`E_VIGEM_TARGET ${e2.message ?? e2}`);
      pad.on('vibration', (d: { largeMotor: number; smallMotor: number }) => rumbleCb?.(d.largeMotor / 255, d.smallMotor / 255));
      sink.ready = true;
    },
    update(x: XInputState) {
      if (!pad) return;
      const B = pad.button, A = pad.axis;
      B.A.setValue(x.buttons.A); B.B.setValue(x.buttons.B); B.X.setValue(x.buttons.X); B.Y.setValue(x.buttons.Y);
      B.LEFT_SHOULDER.setValue(x.buttons.LB); B.RIGHT_SHOULDER.setValue(x.buttons.RB);
      B.LEFT_THUMB.setValue(x.buttons.LS); B.RIGHT_THUMB.setValue(x.buttons.RS);
      B.BACK.setValue(x.buttons.BACK); B.START.setValue(x.buttons.START); B.GUIDE.setValue(x.buttons.GUIDE);
      A.dpadHorz.setValue(x.buttons.DPAD_RIGHT ? 1 : x.buttons.DPAD_LEFT ? -1 : 0);
      A.dpadVert.setValue(x.buttons.DPAD_UP ? 1 : x.buttons.DPAD_DOWN ? -1 : 0);
      A.leftX.setValue(x.lx); A.leftY.setValue(x.ly); A.rightX.setValue(x.rx); A.rightY.setValue(x.ry);
      A.leftTrigger.setValue(x.lt); A.rightTrigger.setValue(x.rt);
      pad.update();
    },
    onRumble(cb) { rumbleCb = cb; },
    disconnect() { try { pad?.disconnect(); } catch { /* ignore */ } pad = null; client = null; sink.ready = false; },
  };
  return sink;
}
