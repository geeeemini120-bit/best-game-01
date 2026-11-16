// Keyboard and pointer input. Held keys give a steering vector and a firing state; one-shot
// presses (start, restart, pause, mute, upgrade picks) are queued as bit flags and taken once
// by the loop, so a press between two frames is never lost and never counted twice. The mouse
// aims in playfield coordinates: the renderer tells input the scale and offset it draws with.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;
export const ACTION_PICK_1 = 8;
export const ACTION_PICK_2 = 16;
export const ACTION_PICK_3 = 32;

const UP = new Set(['KeyW', 'ArrowUp']);
const DOWN = new Set(['KeyS', 'ArrowDown']);
const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const MUTE = new Set(['KeyM']);
const PICK_1 = new Set(['Digit1', 'Numpad1']);
const PICK_2 = new Set(['Digit2', 'Numpad2']);
const PICK_3 = new Set(['Digit3', 'Numpad3']);

export function createInput(target) {
  const keys = new Set();
  let actions = 0;
  let mouseX = 640;
  let mouseY = 360;
  let mouseDown = false;
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)) {
      keys.add(event.code);
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (PICK_1.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PICK_1;
    } else if (PICK_2.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PICK_2;
    } else if (PICK_3.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PICK_3;
    } else {
      return;
    }
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    keys.clear();
    mouseDown = false;
  });
  target.addEventListener('pointermove', (event) => {
    const rect = target.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  });
  target.addEventListener('pointerdown', (event) => {
    const rect = target.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseDown = true;
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('pointerup', () => {
    mouseDown = false;
  });

  return {
    /** The renderer's current field-to-screen transform, for aiming with the mouse. */
    setViewport(nextScale, nextOffsetX, nextOffsetY) {
      scale = nextScale;
      offsetX = nextOffsetX;
      offsetY = nextOffsetY;
    },
    /** Normalised steering vector from the held keys: -1..1 on each axis. */
    move() {
      let x = 0;
      let y = 0;
      for (const code of keys) {
        if (LEFT.has(code)) x -= 1;
        else if (RIGHT.has(code)) x += 1;
        else if (UP.has(code)) y -= 1;
        else if (DOWN.has(code)) y += 1;
      }
      if (x !== 0 && y !== 0) {
        x *= Math.SQRT1_2;
        y *= Math.SQRT1_2;
      }
      return { x, y };
    },
    /** The mouse aim point in playfield coordinates. */
    aim() {
      return { x: (mouseX - offsetX) / scale, y: (mouseY - offsetY) / scale };
    },
    /** True while the mouse button (or Space) is held: the ship keeps firing. */
    firing() {
      return mouseDown || keys.has('Space');
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
