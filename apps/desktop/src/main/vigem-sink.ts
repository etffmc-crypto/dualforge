import { createRequire } from 'node:module';
import type { XInputState } from '@dualforge/shared';
import type { ViGEmClient } from 'vigemclient/lib/ViGEmClient';
import type { X360Controller } from 'vigemclient/lib/X360Controller';
import type { PadSink } from './engine-loop.js';

const require = createRequire(import.meta.url);

export function createViGEmSink(): PadSink {
  let pad: X360Controller | null = null;
  let rumbleCb: ((l: number, s: number) => void) | null = null;
  const sink: PadSink = {
    ready: false,
    async connect() {
      const Ctor = require('vigemclient') as new () => ViGEmClient;
      const c = new Ctor();
      const err = c.connect();
      if (err) throw new Error(`E_VIGEM_INIT ${err.message ?? err}`);
      const p = c.createX360Controller();
      pad = p;
      p.updateMode = 'manual';
      const e2 = p.connect();
      if (e2) throw new Error(`E_VIGEM_TARGET ${e2.message ?? e2}`);
      p.on('vibration', (d: { large: number; small: number }) => rumbleCb?.(d.large / 255, d.small / 255));
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
    disconnect() { try { pad?.disconnect(); } catch { /* ignore */ } pad = null; sink.ready = false; },
  };
  return sink;
}
