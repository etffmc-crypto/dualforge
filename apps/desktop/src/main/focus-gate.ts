/**
 * Combines the two "DualForge is in front" signals into the engine's `uiFocused` gate (which blocks key/mouse injection).
 * Window focus/blur is the fast path; the foreground-pid sample keeps the gate closed while a native dialog (file picker,
 * message box) owned by this process is in front even though the main window has blurred.
 */
export function createFocusGate(send: (uiFocused: boolean) => void, initial = true) {
  let windowFocused = initial;
  let ownForeground = false;
  let last: boolean | null = null;
  function update(force = false) {
    const v = windowFocused || ownForeground;
    if (force || v !== last) {
      last = v;
      send(v);
    }
  }
  return {
    windowFocus(focused: boolean) {
      windowFocused = focused;
      update();
    },
    ownForeground(own: boolean) {
      ownForeground = own;
      update();
    },
    /** Re-sends the current value (e.g. after an engine respawn). */
    resend() {
      update(true);
    },
    isUiFocused: () => windowFocused || ownForeground,
  };
}
