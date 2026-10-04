// Data-driven branching dialogue.
//
// A script is an array of steps:
//   { who, text, when? }                 a line (shown only if `when` holds)
//   { choice: [{ text, say?, set?, add?, then?, if? }] }
//   { if: 'cond', then: steps|id, else: steps|id }
//   { set: { flag: value } }   { add: { counter: n } }
//   { event: 'name', arg }     fire a game event
//   { goto: 'scriptId' }
// Conditions are strings such as "met_lyra && !lyra_cold" or "memories>=3".

import { SPEAKERS } from '../data/speakers.js';
import { portrait } from '../gfx/portraits.js';
import { font, measure, panel, SANS, SERIF, txt, wrap } from '../ui/text.js';

function lookup(name, ctx) {
  if (ctx.flags && name in ctx.flags) return ctx.flags[name];
  return ctx[name];
}

export function evalCond(cond, ctx) {
  if (typeof cond === 'function') return !!cond(ctx);
  return cond.split('||').some((alt) => alt.split('&&').every((raw) => {
    let part = raw.trim();
    let neg = false;
    while (part[0] === '!') { neg = !neg; part = part.slice(1).trim(); }
    const m = part.match(/^([\w.]+)\s*(>=|<=|==|!=|>|<)\s*(-?[\w.]+)$/);
    let v;
    if (m) {
      const a = Number(lookup(m[1], ctx) ?? 0);
      const b = isNaN(+m[3]) ? Number(lookup(m[3], ctx) ?? 0) : +m[3];
      v = { '>=': a >= b, '<=': a <= b, '==': a === b, '!=': a !== b, '>': a > b, '<': a < b }[m[2]];
    } else {
      v = !!lookup(part, ctx);
    }
    return neg ? !v : v;
  }));
}

const TEXT_FONT = font(9, SERIF);
const TABLET_FONT = font(9, SERIF, 'italic');

export class Dialogue {
  constructor(host, scripts) {
    this.host = host;
    this.scripts = scripts;
    this.active = false;
    this.stack = [];
    this.line = null;
    this.lastLine = null;
    this.choice = null;
    this.t = 0;
    this.ffT = 0;
  }

  resolve(ref) {
    if (!ref) return [];
    if (Array.isArray(ref)) return ref;
    const s = this.scripts[ref];
    if (!s) console.warn('[dialogue] missing script', ref);
    return s || [];
  }

  start(id, onEnd) {
    this.stack = [{ steps: this.resolve(id), i: 0 }];
    this.active = true;
    this.onEnd = onEnd || null;
    this.lastLine = null;
    this.advance();
  }

  apply(step) {
    const flags = this.host.state().flags;
    if (step.set) Object.assign(flags, step.set);
    if (step.add) for (const k in step.add) flags[k] = (flags[k] || 0) + step.add[k];
  }

  advance() {
    this.line = null;
    this.choice = null;
    const ctx = this.host.state();
    while (this.stack.length) {
      const top = this.stack[this.stack.length - 1];
      if (top.i >= top.steps.length) { this.stack.pop(); continue; }
      const st = top.steps[top.i++];
      if (st.when && !evalCond(st.when, ctx)) continue;
      if (st.if !== undefined && st.text === undefined && !st.choice) {
        const branch = evalCond(st.if, ctx) ? st.then : st.else;
        if (branch) this.stack.push({ steps: this.resolve(branch), i: 0 });
        continue;
      }
      this.apply(st);
      if (st.event) this.host.onEvent(st.event, st.arg);
      if (st.goto) { this.stack = [{ steps: this.resolve(st.goto), i: 0 }]; continue; }
      if (st.choice) {
        const opts = st.choice.filter((o) => !o.if || evalCond(o.if, ctx));
        this.choice = { opts, sel: 0 };
        return;
      }
      if (st.text) {
        this.line = { ...st, who: st.who || 'narrator', shown: 0 };
        this.lastLine = this.line;
        return;
      }
    }
    this.finish();
  }

  finish() {
    this.active = false;
    this.line = null;
    this.choice = null;
    const cb = this.onEnd;
    this.onEnd = null;
    cb?.();
  }

  update(dt, inp) {
    if (!this.active) return;
    this.t += dt;
    const audio = this.host.app.audio;
    if (this.choice) {
      const c = this.choice;
      if (inp.hit('up')) { c.sel = (c.sel + c.opts.length - 1) % c.opts.length; audio.sfx('menu'); }
      if (inp.hit('down')) { c.sel = (c.sel + 1) % c.opts.length; audio.sfx('menu'); }
      if (inp.hit('confirm')) {
        inp.consume('confirm', 'jump', 'attack', 'interact');
        audio.sfx('select');
        const o = c.opts[c.sel];
        this.apply(o);
        const said = o.say === false ? [] : [{ who: o.who || 'kael', text: o.say || o.text }];
        this.stack.push({ steps: [...said, ...this.resolve(o.then)], i: 0 });
        this.advance();
      }
      return;
    }
    const L = this.line;
    if (!L) return;
    const ff = inp.down('skip');
    const before = Math.floor(L.shown);
    L.shown = Math.min(L.text.length, L.shown + dt * (ff ? 420 : 50));
    const sp = SPEAKERS[L.who] || SPEAKERS.narrator;
    if (sp.blip && Math.floor(L.shown) !== before && before % 3 === 0 && L.text[before] !== ' ') {
      audio.sfx('blip', { f: sp.blip * (0.92 + Math.random() * 0.16) });
    }
    if (inp.hit('confirm')) {
      inp.consume('confirm', 'jump', 'attack', 'interact');
      if (L.shown < L.text.length) L.shown = L.text.length;
      else this.advance();
    } else if (ff && L.shown >= L.text.length) {
      this.ffT += dt;
      if (this.ffT > 0.12) { this.ffT = 0; this.advance(); }
    }
  }

  render(u) {
    if (!this.active) return;
    const L = this.line || this.lastLine;
    if (!L) return;
    const sp = SPEAKERS[L.who] || SPEAKERS.narrator;
    const style = sp.style || 'default';
    const shown = this.line ? Math.floor(L.shown) : L.text.length;
    const dim = !!this.choice;

    if (style === 'tablet') {
      this.renderTablet(u, L, shown);
    } else {
      const x = 22, y = 190, w = 436, h = 68;
      const look = {
        default: { fill: 'rgba(9,11,18,0.92)', border: sp.color },
        nyx: { fill: 'rgba(22,4,30,0.93)', border: '#d23cff' },
        memory: { fill: 'rgba(42,31,18,0.92)', border: '#c9a66b' },
        narration: { fill: 'rgba(6,7,12,0.88)', border: 'rgba(200,200,210,0.4)' },
      }[style];
      panel(u, x, y, w, h, { fill: look.fill, border: look.border, accent: look.border });
      let tx = x + 10;
      if (sp.portrait) {
        const blink = Math.floor(this.t * 10) % 37 === 0;
        u.save();
        u.imageSmoothingEnabled = false;
        u.globalAlpha = dim ? 0.6 : 1;
        u.fillStyle = 'rgba(0,0,0,0.5)';
        u.fillRect(x + 7, y + 7, 54, 54);
        u.drawImage(portrait(sp.portrait, blink), x + 8, y + 8, 52, 52);
        if (style === 'memory') {
          u.globalCompositeOperation = 'color';
          u.fillStyle = '#8a6a3a';
          u.fillRect(x + 8, y + 8, 52, 52);
        }
        u.restore();
        u.strokeStyle = look.border;
        u.lineWidth = 0.5;
        u.strokeRect(x + 7.5, y + 7.5, 53, 53);
        tx = x + 70;
      }
      if (sp.name) {
        const nw = measure(u, sp.name, font(7.5, SANS, 'bold')) + 12;
        u.fillStyle = look.fill;
        u.fillRect(tx - 4, y - 9, nw, 11);
        u.strokeStyle = look.border;
        u.lineWidth = 0.5;
        u.strokeRect(tx - 3.5, y - 8.5, nw - 1, 10);
        txt(u, sp.name, tx + 2, y - 0.5, { size: 7.5, color: sp.color, family: SANS, style: 'bold' });
      }
      const maxW = x + w - tx - 12;
      if (!L.wrapped) L.wrapped = wrap(u, L.text, maxW, TEXT_FONT);
      let left = shown;
      const color = style === 'memory' ? '#f0dfbd' : style === 'narration' ? '#cfcac0' : '#ebe6dc';
      L.wrapped.forEach((ln, i) => {
        if (left <= 0) return;
        const part = ln.slice(0, left);
        left -= ln.length + 1;
        const ly = y + 18 + i * 12;
        if (style === 'nyx') {
          u.save();
          u.font = TEXT_FONT;
          let cx = tx;
          for (let k = 0; k < part.length; k++) {
            const ch = part[k];
            const j = Math.sin(this.t * 9 + k * 1.7) * 0.6;
            u.fillStyle = 'rgba(0,0,0,0.8)';
            u.fillText(ch, cx + 0.6, ly + j + 0.6);
            u.fillStyle = k % 7 === 0 ? '#f3a6ff' : '#ead2f2';
            u.fillText(ch, cx, ly + j);
            cx += u.measureText(ch).width;
          }
          u.restore();
        } else {
          txt(u, part, tx, ly, { font: style === 'memory' ? font(9, SERIF, 'italic') : TEXT_FONT, color, alpha: dim ? 0.6 : 1 });
        }
      });
      if (this.line && shown >= L.text.length && Math.floor(this.t * 2.5) % 2 === 0) {
        txt(u, '▼', x + w - 12, y + h - 6, { size: 6, color: look.border });
      }
      txt(u, 'hold TAB to fast-forward', x + w - 4, y + h + 8, { size: 5.5, align: 'right', color: 'rgba(200,200,210,0.45)', shadow: false });
    }

    if (this.choice) this.renderChoice(u);
  }

  renderTablet(u, L, shown) {
    const x = 70, y = 34, w = 340, h = 190;
    u.save();
    u.fillStyle = 'rgba(0,0,0,0.55)';
    u.fillRect(0, 0, 480, 270);
    const g = u.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#3a4152');
    g.addColorStop(1, '#232836');
    u.fillStyle = g;
    u.fillRect(x, y, w, h);
    u.strokeStyle = '#6b7ea8';
    u.lineWidth = 1;
    u.strokeRect(x + 4.5, y + 4.5, w - 9, h - 9);
    u.restore();
    if (!L.wrapped) L.wrapped = wrap(u, L.text, w - 44, TABLET_FONT);
    let left = shown;
    const startY = y + h / 2 - (L.wrapped.length * 12) / 2 + 8;
    L.wrapped.forEach((ln, i) => {
      if (left <= 0) return;
      const part = ln.slice(0, left);
      left -= ln.length + 1;
      txt(u, part, x + w / 2, startY + i * 12, { font: TABLET_FONT, align: 'center', color: '#d6e2ff', glow: 'rgba(120,170,255,0.5)', blur: 4 });
    });
    if (this.line && shown >= L.text.length && Math.floor(this.t * 2.5) % 2 === 0) {
      txt(u, '▼', x + w / 2, y + h - 10, { size: 6, align: 'center', color: '#9fb6e8' });
    }
  }

  renderChoice(u) {
    const c = this.choice;
    const w = 220, rowH = 13;
    const h = c.opts.length * rowH + 10;
    const x = 480 - w - 24, y = 182 - h;
    panel(u, x, y, w, h, { fill: 'rgba(9,11,18,0.95)', border: '#ff8a3d' });
    c.opts.forEach((o, i) => {
      const sel = i === c.sel;
      const oy = y + 13 + i * rowH;
      if (sel) {
        u.fillStyle = 'rgba(255,138,61,0.16)';
        u.fillRect(x + 3, oy - 9, w - 6, rowH - 1);
      }
      txt(u, (sel ? '› ' : '  ') + o.text, x + 8, oy, { size: 8, family: SERIF, color: sel ? '#ffd08a' : '#bdb7ab' });
    });
  }
}
