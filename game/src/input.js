// Keyboard and mouse, collapsed into edge-triggered actions the loop reads once a frame.
// Movement is polled as a held direction; anything that fires once (start, restart, pause,
// ping) is returned as a bit and cleared, so a key held down across a screen change cannot
// skip that screen.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_PING = 4;
export const ACTION_MUTE = 8;

/** Keys that fire once, as a keydown the page never repeats. */
const ONCE = new Map([
  ['Space', ACTION_CONFIRM],
  ['Enter', ACTION_CONFIRM],
  ['KeyR', ACTION_CONFIRM],
  ['KeyP', ACTION_PAUSE],
  ['Escape', ACTION_PAUSE],
  ['KeyE', ACTION_PING],
  ['KeyM', ACTION_MUTE],
]);

const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);

export function createInput(canvas) {
  const held = new Set();
  let pending = 0;
  let pointerX = null;
  let pointerY = null;

  function onKeyDown(event) {
    if (event.repeat) return;
    const action = ONCE.get(event.code);
    if (action !== undefined) {
      pending |= action;
      // Space and the arrows would scroll the page; the canvas is the whole page.
      event.preventDefault();
    }
    held.add(event.code);
  }

  function onKeyUp(event) {
    held.delete(event.code);
  }

  function onPointerMove(event) {
    const rect = canvas.getBoundingClientRect();
    pointerX = ((event.clientX - rect.left) / rect.width) * canvas.logicalWidth;
    pointerY = ((event.clientY - rect.top) / rect.height) * canvas.logicalHeight;
  }

  function onPointerDown(event) {
    onPointerMove(event);
    pending |= ACTION_CONFIRM;
  }

  // A window that loses focus never delivers the keyup, which would leave the sub moving.
  function onBlur() {
    held.clear();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', onPointerDown);

  return {
    /** The actions since the last call, as a bit mask. Cleared by reading it. */
    takeActions() {
      const actions = pending;
      pending = 0;
      return actions;
    },
    /** Horizontal input: -1 left, 1 right, 0 neither or both. */
    horizontal() {
      const left = held.has('ArrowLeft') || held.has('KeyA');
      const right = held.has('ArrowRight') || held.has('KeyD');
      // The mouse steers too when it has moved: its last position pulls the sub toward it.
      if (!left && !right) return 0;
      return (right ? 1 : 0) - (left ? 1 : 0);
    },
    /** Vertical input: -1 up (climb), 1 down (dive), 0 neither or both. */
    vertical() {
      const up = held.has('ArrowUp') || held.has('KeyW');
      const down = held.has('ArrowDown') || held.has('KeyS');
      return (down ? 1 : 0) - (up ? 1 : 0);
    },
    /** Where the pointer last was inside the field, or null before it moves. */
    pointer() {
      return pointerX === null ? null : { x: pointerX, y: pointerY };
    },
    /** Held keys, for the renderer's control hints. */
    isHeld(code) {
      return held.has(code);
    },
    destroy() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
    },
  };
}
