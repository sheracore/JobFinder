// Keyboard + Gamepad input. Key presses are latched between fixed updates so a
// tap shorter than one frame is never lost.

export const DEFAULT_BINDS = {
  left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'],
  jump: ['Space'], attack: ['KeyJ'], dash: ['KeyK'], burst: ['KeyL'], parry: ['KeyI'], interact: ['KeyE'],
};

// Bindings that are always active, regardless of remapping.
const FIXED = {
  left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
  confirm: ['Enter', 'Space', 'KeyJ', 'KeyE'], back: ['Escape', 'Backspace'],
  pause: ['Escape'], skip: ['Tab'], debug: ['Backquote'],
};

// Standard gamepad mapping.
const PAD = {
  jump: [0], dash: [1], attack: [2], interact: [3], parry: [5], burst: [4, 7],
  pause: [9], skip: [8], up: [12], down: [13], left: [14], right: [15],
  confirm: [0], back: [1],
};

export const REMAPPABLE = ['left', 'right', 'up', 'down', 'jump', 'attack', 'dash', 'burst', 'parry', 'interact'];
export const ACTION_LABELS = {
  left: 'Move left', right: 'Move right', up: 'Look / aim up', down: 'Aim down',
  jump: 'Jump', attack: 'Attack', dash: 'Dash', burst: 'Ember Burst', parry: 'Parry', interact: 'Interact / Talk',
};

const BLOCK_DEFAULT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Backquote']);

export function prettyKey(code) {
  if (!code) return '?';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const names = {
    Space: 'SPACE', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓', Escape: 'ESC',
    Enter: 'ENTER', ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL',
    AltLeft: 'L-ALT', AltRight: 'R-ALT', Tab: 'TAB', Semicolon: ';', Comma: ',', Period: '.', Slash: '/',
  };
  return names[code] || code;
}

export class Input {
  constructor(binds) {
    this.binds = { ...DEFAULT_BINDS, ...(binds || {}) };
    this.keys = new Set();
    this.latch = new Set();
    this.held = new Set();
    this.pressed = new Set();
    this.padPrev = new Set();
    this.anyLatch = false;
    this.any = false;
    this.rawPressed = new Set();
    this.capture = null;
    this.onGesture = null;
    this.usingPad = false;
    addEventListener('keydown', (e) => this.onDown(e));
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('pointerdown', () => { this.anyLatch = true; this.onGesture?.(); });
  }

  onDown(e) {
    this.onGesture?.();
    if (this.capture) {
      e.preventDefault();
      const cb = this.capture;
      this.capture = null;
      cb(e.code);
      return;
    }
    if (BLOCK_DEFAULT.has(e.code)) e.preventDefault();
    if (!e.repeat) {
      this.latch.add(e.code);
      this.anyLatch = true;
      this.usingPad = false;
    }
    this.keys.add(e.code);
  }

  codesFor(action) {
    return (this.binds[action] || []).concat(FIXED[action] || []);
  }

  poll() {
    const padNow = new Set();
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      p.buttons.forEach((b, i) => { if (b.pressed) padNow.add(i); });
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      if (ax < -0.45) padNow.add(14);
      if (ax > 0.45) padNow.add(15);
      if (ay < -0.55) padNow.add(12);
      if (ay > 0.55) padNow.add(13);
    }
    this.held.clear();
    this.pressed.clear();
    const actions = new Set([...Object.keys(this.binds), ...Object.keys(FIXED), ...Object.keys(PAD)]);
    for (const a of actions) {
      const codes = this.codesFor(a);
      const buttons = PAD[a] || [];
      const isHeld = codes.some((c) => this.keys.has(c)) || buttons.some((b) => padNow.has(b));
      const isPressed = codes.some((c) => this.latch.has(c)) || buttons.some((b) => padNow.has(b) && !this.padPrev.has(b));
      if (isHeld || isPressed) this.held.add(a);
      if (isPressed) this.pressed.add(a);
    }
    let padPressed = false;
    for (const b of padNow) if (!this.padPrev.has(b)) padPressed = true;
    if (padPressed) { this.usingPad = true; this.onGesture?.(); }
    this.any = this.anyLatch || padPressed;
    this.rawPressed = new Set(this.latch);
    this.padPrev = padNow;
    this.latch.clear();
    this.anyLatch = false;
  }

  down(a) { return this.held.has(a); }
  hit(a) { return this.pressed.has(a); }
  consume(...actions) { for (const a of actions) this.pressed.delete(a); }
  axisX() { return (this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0); }

  keyName(action) {
    if (this.usingPad) {
      const padNames = { jump: 'A', dash: 'B', attack: 'X', interact: 'Y', parry: 'RB', burst: 'LB', up: '↑', down: '↓', left: '←', right: '→' };
      return padNames[action] || action;
    }
    return prettyKey((this.binds[action] || [])[0]);
  }

  rebind(action, code) {
    for (const k of Object.keys(this.binds)) {
      if (k !== action) this.binds[k] = this.binds[k].filter((c) => c !== code);
    }
    this.binds[action] = [code];
  }

  resetBinds() {
    this.binds = JSON.parse(JSON.stringify(DEFAULT_BINDS));
  }
}
