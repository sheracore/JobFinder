// Generator-driven cutscenes. A cutscene is a generator function that yields
// tasks; a task is a function (dt) => boolean that returns true when finished.

export class Cutscene {
  constructor() {
    this.gen = null;
    this.task = null;
    this.onDone = null;
  }

  get active() { return !!this.gen; }

  play(gen, onDone) {
    this.gen = gen;
    this.onDone = onDone || null;
    this.task = null;
    this.next();
  }

  next() {
    const r = this.gen.next();
    if (r.done) {
      this.gen = null;
      this.task = null;
      const cb = this.onDone;
      this.onDone = null;
      cb?.();
    } else {
      this.task = r.value || (() => true);
    }
  }

  update(dt) {
    let guard = 0;
    while (this.gen && this.task && guard++ < 64) {
      if (!this.task(dt)) return;
      dt = 0;
      this.next();
    }
  }
}

// ---- task helpers --------------------------------------------------------

export const wait = (s) => { let t = 0; return (dt) => (t += dt) >= s; };
export const call = (fn) => () => { fn(); return true; };
export const until = (fn) => () => !!fn();

export const say = (g, id) => {
  let started = false;
  return () => {
    if (!started) { started = true; g.dialogue.start(id); }
    return !g.dialogue.active;
  };
};

export const fade = (g, to, dur) => {
  let started = false;
  return () => {
    if (!started) { started = true; g.fadeTo(to, dur); }
    return g.fadeDone();
  };
};

export const camTo = (g, x, y, dur = 1) => {
  let t = 0;
  return (dt) => { g.cam.override = { x, y }; return (t += dt) >= dur; };
};

export const camRelease = (g) => () => { g.cam.override = null; return true; };

export const walk = (ent, x) => {
  let started = false;
  return () => {
    if (!started) { started = true; ent.scriptMove = { x }; }
    return !ent.scriptMove;
  };
};

export const titleCard = (g, top, main, dur) => {
  let t = -1;
  return (dt) => {
    if (t < 0) { t = 0; g.showTitle(top, main, dur); }
    return (t += dt) >= dur;
  };
};
