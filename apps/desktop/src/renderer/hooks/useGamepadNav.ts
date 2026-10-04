import { useEffect, useRef } from 'react';
import { useStore, type SubTabPage } from '../store';

const PRESSED = 0.5;

/** Calls `onLt` / `onRt` on a rising edge of LT / RT on the pad (only while the window has focus). */
export function useShoulderNav(onLt: () => void, onRt: () => void): void {
  const lt = useStore((s) => (s.snapshot?.out.lt ?? 0) > PRESSED);
  const rt = useStore((s) => (s.snapshot?.out.rt ?? 0) > PRESSED);
  const prev = useRef({ lt, rt });
  const cb = useRef({ onLt, onRt });
  cb.current = { onLt, onRt };
  useEffect(() => {
    const was = prev.current;
    prev.current = { lt, rt };
    if (!document.hasFocus()) return;
    if (lt && !was.lt) cb.current.onLt();
    else if (rt && !was.rt) cb.current.onRt();
  }, [lt, rt]);
}

/** LT / RT on the pad switch the page's Left / Right sub-tab. */
export function useGamepadNav(page: SubTabPage): void {
  const setSubTab = useStore((s) => s.setSubTab);
  useShoulderNav(() => setSubTab(page, 'left'), () => setSubTab(page, 'right'));
}
