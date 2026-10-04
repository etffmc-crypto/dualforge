import { useEffect, useRef } from 'react';
import { useStore, type SubTabPage } from '../store';

const PRESSED = 0.5;

/** LT / RT on the pad switch the page's Left / Right sub-tab (rising edge, only while the window has focus). */
export function useGamepadNav(page: SubTabPage): void {
  const lt = useStore((s) => (s.snapshot?.out.lt ?? 0) > PRESSED);
  const rt = useStore((s) => (s.snapshot?.out.rt ?? 0) > PRESSED);
  const setSubTab = useStore((s) => s.setSubTab);
  const prev = useRef({ lt, rt });
  useEffect(() => {
    const was = prev.current;
    prev.current = { lt, rt };
    if (!document.hasFocus()) return;
    if (lt && !was.lt) setSubTab(page, 'left');
    else if (rt && !was.rt) setSubTab(page, 'right');
  }, [lt, rt, page, setSubTab]);
}
