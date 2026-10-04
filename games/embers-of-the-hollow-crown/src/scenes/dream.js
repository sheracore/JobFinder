// Dream sequences between chapters: Nyx-Aurel speaks to Kael in the void.

import { H, W } from '../config.js';
import { DIALOGUE_CH1 } from '../data/dialogue_ch1.js';
import { drawKael } from '../gfx/sprites.js';
import { Dialogue } from '../systems/dialogue.js';
import { Particles } from '../systems/particles.js';
import { font, SERIF, txt } from '../ui/text.js';
import { rand } from '../util.js';

export class DreamScene {
  constructor(app, scriptId, next) {
    this.app = app;
    this.scriptId = scriptId;
    this.next = next;
  }

  enter() {
    this.t = 0;
    this.endT = -1;
    this.started = false;
    this.dialogue = new Dialogue(this, DIALOGUE_CH1);
    this.particles = new Particles(400);
    this.app.audio.music('dream');
    this.kael = { facing: 1, state: 'idle', anim: 0, vx: 0, flash: 0, hasBlade: true, atk: null, charge: 0, st: 0 };
  }

  state() {
    const s = this.app.save;
    return { flags: s?.flags || {}, memories: s?.memories.length || 0 };
  }

  onEvent() {}

  update(dt) {
    this.t += dt;
    this.kael.anim += dt;
    if (Math.random() < 0.8) {
      const hot = Math.random() < 0.3;
      this.particles.spawn({ x: rand(0, W), y: rand(0, H), vx: rand(-6, 6), vy: rand(-14, -4), color: hot ? '#d23cff' : Math.random() < 0.5 ? '#f3a6ff' : '#3a1446', size: Math.random() < 0.2 ? 2 : 1, life: rand(2, 5), add: hot });
    }
    this.particles.update(dt);
    if (!this.started && this.t > 2) {
      this.started = true;
      this.dialogue.start(this.scriptId, () => { this.endT = 0; });
    }
    this.dialogue.update(dt, this.app.input);
    if (this.endT >= 0) {
      this.endT += dt;
      if (this.endT > 2.4) { this.endT = -99; this.next(); }
    }
  }

  render(ctx) {
    ctx.fillStyle = '#05030a';
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W / 2, 90, 10, W / 2, 90, 220);
    glow.addColorStop(0, 'rgba(90,20,120,0.35)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
    this.particles.draw(ctx, 0, 0, true);

    // The eye of Nyx-Aurel slowly opens.
    const open = Math.min(1, Math.max(0, (this.t - 0.8) / 3)) * (0.85 + 0.15 * Math.sin(this.t * 1.3));
    const cx = W / 2, cy = 82, ew = 70, eh = 26 * open;
    if (eh > 0.5) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(cx, cy, ew, eh, 0, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = '#1a0624';
      ctx.fillRect(cx - ew, cy - 30, ew * 2, 60);
      const look = Math.sin(this.t * 0.4) * 8;
      const ir = ctx.createRadialGradient(cx + look, cy, 2, cx + look, cy, 26);
      ir.addColorStop(0, '#f3a6ff');
      ir.addColorStop(0.6, '#d23cff');
      ir.addColorStop(1, '#5b1673');
      ctx.fillStyle = ir;
      ctx.beginPath();
      ctx.arc(cx + look, cy, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#05030a';
      ctx.beginPath();
      ctx.ellipse(cx + look, cy, 3, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(210,60,255,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, cy, ew, eh, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    // Crown shards orbiting the eye.
    for (let i = 0; i < 5; i++) {
      const a = this.t * 0.3 + (i / 5) * Math.PI * 2;
      const x = cx + Math.cos(a) * 110, y = cy + Math.sin(a) * 34;
      ctx.fillStyle = i === 4 ? '#ffd08a' : '#c9a35a';
      ctx.fillRect(Math.round(x) - 2, Math.round(y) - 4, 4, 7);
      ctx.fillRect(Math.round(x) - 1, Math.round(y) - 6, 2, 2);
    }
    // Kael, small and alone, with an ember heart.
    const kx = W / 2, ky = 176;
    const kg = ctx.createRadialGradient(kx, ky - 12, 0, kx, ky - 12, 40);
    kg.addColorStop(0, 'rgba(255,150,70,0.35)');
    kg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = kg;
    ctx.fillRect(kx - 40, ky - 52, 80, 80);
    drawKael(ctx, kx, ky, this.kael);
    ctx.fillStyle = Math.floor(this.t * 2) % 2 ? '#ffd08a' : '#ff8a3d';
    ctx.fillRect(kx, ky - 14, 1, 1);
  }

  renderUI(u) {
    this.dialogue.render(u);
    const inA = Math.max(0, 1 - this.t / 2);
    const outA = this.endT >= 0 ? Math.min(1, this.endT / 2) : 0;
    const a = Math.max(inA, outA);
    if (this.t < 3) txt(u, 'DREAM', 240, 40, { size: 7, align: 'center', color: '#b58ac8', alpha: Math.min(1, this.t) * (1 - Math.max(0, this.t - 2)), spacing: 6 });
    if (a > 0) { u.fillStyle = `rgba(0,0,0,${a})`; u.fillRect(0, 0, W, H); }
    if (outA > 0.5) txt(u, '…', 240, 140, { font: font(14, SERIF), align: 'center', color: '#d8a6ff', alpha: outA });
  }
}
