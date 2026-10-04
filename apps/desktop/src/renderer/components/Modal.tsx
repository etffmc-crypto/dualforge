import { useEffect, useId, useRef, type PropsWithChildren } from 'react';
import { createPortal } from 'react-dom';
import '../styles/modal.css';

export interface ModalProps {
  open: boolean;
  title: string;
  onClose(): void;
  width?: number;
  className?: string;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Open dialogs, innermost last: only the top one answers Escape and traps Tab. */
const stack: symbol[] = [];

/** Shared dialog: focus moves in on open, Tab / Shift+Tab loop inside, Escape or a backdrop click closes, focus returns to the opener. */
export function Modal({ open, title, onClose, width, className = '', children }: PropsWithChildren<ModalProps>) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const downOnBackdrop = useRef(false);

  useEffect(() => {
    if (!open) return;
    const me = Symbol('modal');
    stack.push(me);
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus();
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
