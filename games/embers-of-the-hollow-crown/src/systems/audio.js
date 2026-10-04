// Procedural audio: every sound effect and every note of music is synthesised
// with the Web Audio API. Nothing is loaded from disk or the network.

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.vol = { master: 0.8, music: 0.6, sfx: 0.8 };
    this.mode = null;
    this.pendingMode = null;
    this.step = 0;
    this.nextNote = 0;
    this.pad = [];
    this.lastPlay = {};
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.8, 2.4);
    const rv = ctx.createGain();
    rv.gain.value = 0.55;
    this.reverb.connect(rv);
    rv.connect(this.master);
    const len = ctx.sampleRate;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    this.timer = setInterval(() => this.schedule(), 40);
    if (this.pendingMode) {
      const m = this.pendingMode;
      this.pendingMode = null;
      this.music(m);
    }
  }

  impulse(sec, decay) {
    const ctx = this.ctx, rate = ctx.sampleRate, len = Math.floor(rate * sec);
    const buf = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const data = buf.getChannelData(c);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  setVolumes(v) {
    Object.assign(this.vol, v);
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.master.gain.value = this.vol.master;
    this.musicBus.gain.value = this.vol.music * 0.55;
    this.sfxBus.gain.value = this.vol.sfx;
  }

  // ---- primitives -------------------------------------------------------

  osc({ type = 'sine', f = 440, f2 = 0, at = 0, t = 0, dur = 0.2, vol = 0.2, a = 0.005, bus, rev = 0, detune = 0, filter = null }) {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = at || ctx.currentTime + t;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, now);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(f2, 1), now + dur);
    o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), now + a);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    let node = o;
    if (filter) {
      const bq = ctx.createBiquadFilter();
      bq.type = filter.type || 'lowpass';
      bq.frequency.setValueAtTime(filter.f, now);
      if (filter.f2) bq.frequency.exponentialRampToValueAtTime(filter.f2, now + dur);
      bq.Q.value = filter.q || 1;
      o.connect(bq);
      node = bq;
    }
    node.connect(g);
    g.connect(bus || this.sfxBus);
    if (rev) {
      const s = ctx.createGain();
      s.gain.value = rev;
      g.connect(s);
      s.connect(this.reverb);
    }
    o.start(now);
    o.stop(now + dur + 0.05);
  }

  noise({ at = 0, t = 0, dur = 0.2, vol = 0.2, a = 0.004, filter = { type: 'bandpass', f: 1000 }, bus, rev = 0 }) {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = at || ctx.currentTime + t;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const bq = ctx.createBiquadFilter();
    bq.type = filter.type;
    bq.frequency.setValueAtTime(filter.f, now);
    if (filter.f2) bq.frequency.exponentialRampToValueAtTime(filter.f2, now + dur);
    bq.Q.value = filter.q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), now + a);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(bq);
    bq.connect(g);
    g.connect(bus || this.sfxBus);
    if (rev) {
      const s = ctx.createGain();
      s.gain.value = rev;
      g.connect(s);
      s.connect(this.reverb);
    }
    src.start(now, Math.random() * 0.5);
    src.stop(now + dur + 0.05);
  }

  // ---- sound effects ----------------------------------------------------

  sfx(name, opt = {}) {
    if (!this.ctx) return;
    // Throttle identical sounds so swarms don't clip.
    const now = this.ctx.currentTime;
    if (this.lastPlay[name] && now - this.lastPlay[name] < 0.025) return;
    this.lastPlay[name] = now;
    const p = opt.pitch || 1;
    switch (name) {
      case 'slash':
        this.noise({ dur: 0.13, vol: 0.22, filter: { type: 'bandpass', f: 2600 * p, f2: 600, q: 1.4 } });
        this.osc({ type: 'triangle', f: 900 * p, f2: 280, dur: 0.09, vol: 0.05 });
        break;
      case 'hit':
        this.osc({ f: 170, f2: 48, dur: 0.16, vol: 0.5 });
        this.noise({ dur: 0.08, vol: 0.28, filter: { type: 'lowpass', f: 2200 } });
        break;
      case 'heavyhit':
        this.osc({ f: 140, f2: 36, dur: 0.28, vol: 0.6 });
        this.noise({ dur: 0.18, vol: 0.38, filter: { type: 'lowpass', f: 3000, f2: 300 } });
        this.osc({ type: 'square', f: 90, f2: 40, dur: 0.15, vol: 0.06 });
        break;
      case 'clang':
        this.osc({ type: 'square', f: 1180, dur: 0.18, vol: 0.06, rev: 0.25 });
        this.osc({ type: 'square', f: 1690, dur: 0.14, vol: 0.04, rev: 0.25 });
        this.noise({ dur: 0.1, vol: 0.15, filter: { type: 'highpass', f: 3000 } });
        break;
      case 'parry':
        this.osc({ f: 1900, dur: 0.6, vol: 0.22, rev: 0.7 });
        this.osc({ f: 2850, dur: 0.45, vol: 0.1, rev: 0.7 });
        this.osc({ type: 'triangle', f: 950, dur: 0.25, vol: 0.12 });
        this.noise({ dur: 0.06, vol: 0.2, filter: { type: 'highpass', f: 4000 } });
        break;
      case 'parryswing':
        this.noise({ dur: 0.08, vol: 0.08, filter: { type: 'bandpass', f: 3500, q: 2 } });
        break;
      case 'dash':
        this.noise({ dur: 0.2, vol: 0.22, filter: { type: 'bandpass', f: 500, f2: 2600, q: 0.8 } });
        break;
      case 'jump':
        this.osc({ type: 'square', f: 210, f2: 420, dur: 0.08, vol: 0.035, filter: { type: 'lowpass', f: 1400 } });
        break;
      case 'land':
        this.noise({ dur: 0.07, vol: 0.13, filter: { type: 'lowpass', f: 420 } });
        break;
      case 'hurt':
        this.osc({ type: 'sawtooth', f: 320, f2: 70, dur: 0.32, vol: 0.18, filter: { type: 'lowpass', f: 1600 } });
        this.noise({ dur: 0.2, vol: 0.25, filter: { type: 'lowpass', f: 1200 } });
        break;
      case 'charge':
        this.osc({ type: 'sawtooth', f: 110, f2: 440, dur: 0.24, vol: 0.08, filter: { type: 'lowpass', f: 900, f2: 3000 } });
        break;
      case 'burst':
        this.osc({ f: 90, f2: 28, dur: 0.7, vol: 0.6 });
        this.noise({ dur: 0.7, vol: 0.38, filter: { type: 'lowpass', f: 1600, f2: 120 } });
        this.osc({ type: 'sawtooth', f: 330, f2: 60, dur: 0.45, vol: 0.08, rev: 0.6 });
        break;
      case 'pickup':
        this.osc({ type: 'triangle', f: 1320 * p, dur: 0.08, vol: 0.05 });
        this.osc({ type: 'triangle', f: 1760 * p, t: 0.04, dur: 0.1, vol: 0.04 });
        break;
      case 'heal':
        [660, 880, 1100].forEach((f, i) => this.osc({ f, t: i * 0.06, dur: 0.4, vol: 0.06, rev: 0.5 }));
        break;
      case 'memory':
        [523, 659, 784, 1046, 1318].forEach((f, i) => this.osc({ f, t: i * 0.12, dur: 1.8, vol: 0.07, rev: 0.9 }));
        break;
      case 'explode':
        this.noise({ dur: 0.45, vol: 0.4, filter: { type: 'lowpass', f: 1400, f2: 90 } });
        this.osc({ f: 130, f2: 38, dur: 0.35, vol: 0.4 });
        break;
      case 'arrow':
        this.noise({ dur: 0.12, vol: 0.1, filter: { type: 'highpass', f: 2200 } });
        this.osc({ type: 'triangle', f: 900, f2: 500, dur: 0.1, vol: 0.04 });
        break;
      case 'bolt':
        this.noise({ dur: 0.3, vol: 0.14, filter: { type: 'bandpass', f: 700, f2: 1500 } });
        this.osc({ type: 'sawtooth', f: 220, f2: 120, dur: 0.25, vol: 0.05, filter: { type: 'lowpass', f: 900 } });
        break;
      case 'tele':
        this.osc({ f: 620, f2: 980, dur: 0.14, vol: 0.05 });
        break;
      case 'roar':
        this.osc({ type: 'sawtooth', f: 95, f2: 52, dur: 1.3, vol: 0.28, a: 0.06, filter: { type: 'lowpass', f: 700 } });
        this.osc({ type: 'square', f: 62, f2: 45, dur: 1.2, vol: 0.12, a: 0.06, detune: 15, filter: { type: 'lowpass', f: 500 } });
        this.noise({ dur: 1.3, vol: 0.3, a: 0.08, filter: { type: 'bandpass', f: 500, f2: 260, q: 0.7 } });
        break;
      case 'slam':
        this.osc({ f: 75, f2: 26, dur: 0.6, vol: 0.7 });
        this.noise({ dur: 0.5, vol: 0.45, filter: { type: 'lowpass', f: 900, f2: 80 } });
        break;
      case 'chain':
        for (let i = 0; i < 4; i++) this.osc({ type: 'square', f: 1400 + Math.random() * 900, t: i * 0.035, dur: 0.05, vol: 0.025 });
        this.noise({ dur: 0.25, vol: 0.12, filter: { type: 'bandpass', f: 1800, f2: 700 } });
        break;
      case 'door':
        this.noise({ dur: 0.6, vol: 0.5, filter: { type: 'lowpass', f: 1200, f2: 90 } });
        this.osc({ f: 80, f2: 34, dur: 0.6, vol: 0.45 });
        for (let i = 0; i < 5; i++) this.osc({ type: 'square', f: 600 + Math.random() * 1400, t: 0.05 + i * 0.07, dur: 0.12, vol: 0.03, rev: 0.4 });
        break;
      case 'gate':
        this.noise({ dur: 0.5, vol: 0.25, filter: { type: 'lowpass', f: 600 } });
        this.osc({ type: 'square', f: 70, f2: 50, dur: 0.4, vol: 0.06 });
        break;
      case 'shrine':
        [440, 554, 659, 880].forEach((f, i) => this.osc({ f, t: i * 0.08, dur: 1.8, vol: 0.06, rev: 0.8 }));
        break;
      case 'blip':
        this.osc({ type: 'square', f: opt.f || 300, dur: 0.035, vol: 0.022, filter: { type: 'lowpass', f: 2200 } });
        break;
      case 'menu':
        this.osc({ type: 'triangle', f: 660, dur: 0.06, vol: 0.05 });
        break;
      case 'select':
        this.osc({ type: 'triangle', f: 880, f2: 1320, dur: 0.12, vol: 0.06 });
        break;
      case 'deny':
        this.osc({ type: 'square', f: 180, f2: 140, dur: 0.14, vol: 0.05, filter: { type: 'lowpass', f: 900 } });
        break;
      case 'bell':
        [294, 440, 587].forEach((f, i) => this.osc({ f, t: i * 0.02, dur: 2.5, vol: 0.08, rev: 0.9 }));
        break;
      case 'death':
        this.osc({ f: 440, f2: 90, dur: 1.6, vol: 0.2, rev: 0.8 });
        this.noise({ dur: 1.2, vol: 0.2, filter: { type: 'lowpass', f: 1000, f2: 100 } });
        break;
      case 'crate':
        this.noise({ dur: 0.18, vol: 0.3, filter: { type: 'bandpass', f: 600, q: 0.8 } });
        this.osc({ type: 'triangle', f: 180, f2: 90, dur: 0.12, vol: 0.12 });
        break;
      case 'gunshot':
        this.noise({ dur: 0.25, vol: 0.5, filter: { type: 'lowpass', f: 3000, f2: 200 } });
        this.osc({ f: 200, f2: 40, dur: 0.15, vol: 0.4 });
        break;
      case 'whoosh':
        this.noise({ dur: 0.4, vol: 0.12, filter: { type: 'bandpass', f: 300, f2: 1400, q: 1.2 } });
        break;
      case 'unlock':
        [392, 523, 659, 784, 1046].forEach((f, i) => this.osc({ type: 'triangle', f, t: i * 0.07, dur: 0.6, vol: 0.06, rev: 0.6 }));
        break;
    }
  }

  // ---- generative music ---------------------------------------------------

  music(mode) {
    if (!this.ctx) { this.pendingMode = mode; return; }
    if (mode === this.mode) return;
    this.mode = mode;
    this.stopPad();
    const M = MODES[mode];
    if (!M) return;
    if (M.pad) this.startPad(M);
    this.step = 0;
    this.nextNote = this.ctx.currentTime + 0.15;
  }

  startPad(M) {
    const ctx = this.ctx, now = ctx.currentTime;
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, now);
    out.gain.exponentialRampToValueAtTime(M.padVol || 0.05, now + 2.5);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = M.padCut || 700;
    lp.Q.value = 0.7;
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = (M.padCut || 700) * 0.45;
    lfo.connect(lfoGain);
    lfoGain.connect(lp.frequency);
    lp.connect(out);
    out.connect(this.musicBus);
    const send = ctx.createGain();
    send.gain.value = 0.35;
    out.connect(send);
    send.connect(this.reverb);
    const nodes = [lfo];
    for (const n of M.pad) {
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = M.padWave || 'sawtooth';
        o.frequency.value = midi(n);
        o.detune.value = det;
        o.connect(lp);
        o.start(now);
        nodes.push(o);
      }
    }
    lfo.start(now);
    this.pad.push({ out, nodes });
  }

  stopPad() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const p of this.pad) {
      p.out.gain.cancelScheduledValues(now);
      p.out.gain.setValueAtTime(Math.max(p.out.gain.value, 0.0001), now);
      p.out.gain.exponentialRampToValueAtTime(0.0001, now + 1.4);
      for (const n of p.nodes) n.stop(now + 1.5);
    }
    this.pad = [];
  }

  schedule() {
    const M = MODES[this.mode];
    if (!M || !this.ctx) return;
    const spb = 60 / M.bpm / 2;
    while (this.nextNote < this.ctx.currentTime + 0.3) {
      M.play(this, this.step, this.nextNote, spb);
      this.nextNote += spb;
      this.step++;
    }
  }

  note(n, at, opt = {}) {
    this.osc({ f: midi(n), at, bus: this.musicBus, ...opt });
  }
}

const scaleNote = (root, scale, deg) => root + scale[((deg % scale.length) + scale.length) % scale.length] + 12 * Math.floor(deg / scale.length);

const MODES = {
  title: {
    bpm: 64, pad: [50, 57, 62, 65], padVol: 0.045, padCut: 900,
    play(a, s, at) {
      const sc = [0, 2, 3, 5, 7, 8, 10];
      if (s % 16 === 0) a.note(38, at, { type: 'sine', dur: 4, vol: 0.12, a: 0.3 });
      if (Math.random() < 0.28) a.note(scaleNote(62, sc, Math.floor(Math.random() * 9)), at, { type: 'sine', dur: 2.2, vol: 0.05, rev: 0.7, a: 0.01 });
    },
  },
  ch1: {
    bpm: 72, pad: [45, 52, 57, 60], padVol: 0.04, padCut: 650,
    play(a, s, at) {
      const sc = [0, 1, 3, 5, 7, 8, 10];
      if (s % 16 === 0) a.note(33, at, { type: 'sine', dur: 3.5, vol: 0.13, a: 0.2 });
      if (s % 32 === 24) a.note(40, at, { type: 'sawtooth', dur: 2.5, vol: 0.025, a: 0.8, filter: { type: 'lowpass', f: 500 } });
      if (Math.random() < 0.22) a.note(scaleNote(57, sc, Math.floor(Math.random() * 10)), at, { type: 'triangle', dur: 1.6, vol: 0.045, rev: 0.6, filter: { type: 'lowpass', f: 1800 } });
    },
  },
  boss: {
    bpm: 150, pad: [40, 47], padVol: 0.03, padCut: 500,
    play(a, s, at) {
      const bass = [0, 0, 12, 0, 3, 0, 10, 7, 0, 0, 12, 0, 1, 0, 3, 5];
      if (s % 4 === 0) a.osc({ f: 130, f2: 38, at, dur: 0.22, vol: 0.32, bus: a.musicBus });
      if (s % 8 === 4) a.noise({ at, dur: 0.12, vol: 0.08, filter: { type: 'bandpass', f: 1800 }, bus: a.musicBus });
      if (s % 2 === 1) a.noise({ at, dur: 0.03, vol: 0.025, filter: { type: 'highpass', f: 7000 }, bus: a.musicBus });
      a.note(28 + bass[s % 16], at, { type: 'sawtooth', dur: 0.18, vol: 0.06, filter: { type: 'lowpass', f: 700, f2: 300 } });
      if (s % 32 === 0) [52, 55, 59].forEach((n) => a.note(n, at, { type: 'sawtooth', dur: 0.5, vol: 0.025, filter: { type: 'lowpass', f: 1600 } }));
      if (s % 32 === 16) a.note(Math.random() < 0.5 ? 64 : 65, at, { type: 'square', dur: 0.9, vol: 0.02, rev: 0.5, filter: { type: 'lowpass', f: 1400 } });
    },
  },
  dream: {
    bpm: 48, pad: [37, 49, 56], padVol: 0.05, padCut: 500, padWave: 'triangle',
    play(a, s, at) {
      const sc = [0, 2, 4, 6, 8, 10];
      if (Math.random() < 0.2) a.note(scaleNote(73, sc, Math.floor(Math.random() * 8)), at, { type: 'sine', dur: 3, vol: 0.04, rev: 0.95, a: 0.4 });
      if (s % 24 === 0) a.note(25, at, { type: 'sine', dur: 6, vol: 0.12, a: 1 });
    },
  },
  credits: {
    bpm: 70, pad: [48, 55, 60, 64], padVol: 0.04, padCut: 1100,
    play(a, s, at) {
      const sc = [0, 2, 4, 7, 9];
      if (s % 16 === 0) a.note(36, at, { type: 'sine', dur: 4, vol: 0.12, a: 0.3 });
      if (Math.random() < 0.35) a.note(scaleNote(67, sc, Math.floor(Math.random() * 8)), at, { type: 'triangle', dur: 1.8, vol: 0.05, rev: 0.7 });
    },
  },
};
