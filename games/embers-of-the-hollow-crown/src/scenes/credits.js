// Scrolling credits.

import { H, W } from '../config.js';
import { Particles } from '../systems/particles.js';
import { font, SERIF, txt } from '../ui/text.js';
import { rand } from '../util.js';

const LINES = [
  ['title', 'EMBERS'],
  ['sub', 'of the Hollow Crown'],
  ['gap'],
  ['head', 'A story of ash, memory and a crown that should stay broken'],
  ['gap'],
  ['role', 'Story, design & code'],
  ['name', 'Written in vanilla JavaScript and HTML5 Canvas'],
  ['gap'],
  ['role', 'Art'],
  ['name', 'Every pixel drawn procedurally at runtime'],
  ['gap'],
  ['role', 'Music & sound'],
  ['name', 'Synthesised live with the Web Audio API'],
  ['gap'],
  ['role', 'Cast'],
  ['name', 'Kael Ashborne — the disgraced ember-knight'],
  ['name', 'Lyra Venn — sky-pirate navigator'],
  ['name', 'Brother Oskar — keeper of the shrines'],
  ['name', 'Warden Grull — keeper of the Ashen Cells'],
  ['name', 'Seraphine — the Pale Regent'],
  ['name', 'Nyx-Aurel — the Sleeper beneath Veyra'],
  ['gap'],
  ['role', 'Inspired by'],
  ['name', 'Hollow Knight · Celeste · Transistor'],
  ['gap'],
  ['gap'],
  ['head', 'Thank you for playing.'],
  ['name', 'The ember still burns.'],
];

export class CreditsScene {
  constructor(app) { this.app = app; }

  enter() {
    this.t = 0;
    this.y = H + 10;
    this.particles = new Particles(300);
    this.app.audio.music('credits');
  }

  update(dt) {
    const inp = this.app.input;
    this.t += dt;
    this.y -= dt * (inp.down('confirm') || inp.down('down') ? 70 : 18);
    if (Math.random() < 0.4) this.particles.spawn({ x: rand(0, W), y: H + 2, vx: rand(-6, 6), vy: rand(-35, -12), color: Math.random() < 0.7 ? '#ff8a3d' : '#ffd08a', size: 1, life: rand(3, 7), add: true });
    this.particles.update(dt);
    if (inp.hit('back') || this.y < -LINES.length * 16 - 40) {
      inp.consume('back', 'pause');
      this.app.toTitle();
    }
  }

  render(ctx) {
    ctx.fillStyle = '#07080d';
    ctx.fillRect(0, 0, W, H);
    this.particles.draw(ctx, 0, 0, true);
  }

  renderUI(u) {
    let y = this.y;
    for (const [kind, text] of LINES) {
      if (kind === 'gap') { y += 12; continue; }
      const o = {
        title: { font: font(26, SERIF, 'bold'), color: '#ffd9a8', glow: 'rgba(255,138,61,0.8)', blur: 12, spacing: 6 },
        sub: { font: font(10, SERIF, 'italic'), color: '#d8c3a0' },
        head: { font: font(9, SERIF, 'italic'), color: '#d8a6ff' },
        role: { size: 6.5, color: '#c9a66b', style: 'bold', spacing: 2 },
        name: { font: font(8.5, SERIF), color: '#e8dcc8' },
      }[kind];
      if (y > -20 && y < H + 20) txt(u, text, 240, y, { align: 'center', ...o });
      y += kind === 'title' ? 22 : 14;
    }
    txt(u, 'hold confirm to speed up · ESC to skip', 474, 264, { size: 5.5, align: 'right', color: 'rgba(200,190,175,0.4)', shadow: false });
  }
}
