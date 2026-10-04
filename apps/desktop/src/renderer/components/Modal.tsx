import { useEffect, useId, useRef, type PropsWithChildren, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import '../styles/modal.css';

export interface ModalProps {
  open: boolean;
  title: string;
  onClose(): void;
  width?: number;
  className?: string;
  /** Control focused on open (the safe choice in a confirm), instead of the dialog panel itself. */
  initialFocus?: RefObject<HTMLElement | null>;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Open { close(): void; panel: HTMLDivElement | null }
/** Open dialogs, innermost last: only the top one answers Escape (or B on the pad) and traps Tab. */
const stack: Open[] = [];

/** The innermost open dialog's panel, or null when none is open. */
export function topModalPanel(): HTMLElement | null {
  return stack.at(-1)?.panel ?? null;
}

/** Closes the innermost open dialog as Escape would; false when none is open. */
export function closeTopModal(): boolean {
  const top = stack.at(-1);
  if (!top) return false;
  top.close();
  return true;
}

/** Shared dialog: focus moves in on open, Tab / Shift+Tab loop inside, Escape or a backdrop click closes, focus returns to the opener. */
export function Modal({ open, title, onClose, width, className = '', initialFocus, children }: PropsWithChildren<ModalProps>) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const downOnBackdrop = useRef(false);
  const firstFocus = useRef(initialFocus);
  firstFocus.current = initialFocus;

  useEffect(() => {
    if (!open) return;
    const me: Open = { close: () => close.current(), panel: panel.current };
    stack.push(me);
    const opener = document.activeElement as HTMLElement | null;
    const first = firstFocus.current?.current;
    if (first) first.focus({ focusVisible: true } as FocusOptions);
    else panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (stack.at(-1) !== me || !panel.current) return;
      if (e.key === 'Escape') { e.preventDefault(); close.current(); return; }
      if (e.key !== 'Tab') return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) { e.preventDefault(); panel.current.focus(); return; }
      const first = items[0]!, last = items.at(-1)!;
      const active = document.activeElement as HTMLElement | null;
      const inside = !!active && panel.current.contains(active) && active !== panel.current;
      if (e.shiftKey && (!inside || active === first)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (!inside || active === last)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(me), 1);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, [open]);

  if (!open) return null;
  // portalled to <body> so no ancestor (e.g. the draggable header) can clip it or swallow its clicks
  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => { if (downOnBackdrop.current && e.target === e.currentTarget) onClose(); downOnBackdrop.current = false; }}
    >
      <div
        className={`modal ${className}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} ref={panel}
        style={width ? { width: `min(${width}px, 100%)` } : undefined}
      >
        <h2 className="modal-title" id={titleId}>{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}
