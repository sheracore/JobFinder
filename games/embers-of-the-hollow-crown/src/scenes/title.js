// Title screen: animated logo over drifting islands, then the main menu.

import { H, W } from '../config.js';
import { Parallax } from '../gfx/background.js';
import { Particles } from '../systems/particles.js';
import { Menu } from '../ui/menu.js';
import { ConfirmBox, SettingsMenu } from '../ui/overlays.js';
import { font, SERIF, txt, UI } from '../ui/text.js';
import { rand } from '../util.js';

export class TitleScene {
  constructor(app) { this.app = app; }

  enter() {
    const app = this.app;
    this.t = 0;
    this.started = !!app.audio.ctx;
    this.bg = new Parallax('title');
    this.particles = new Particles(300);
    this.menu = new Menu([
      { label: 'Continue', enabled: () => !!app.save, action: () => app.continueGame() },
      {
        label: 'New Game',
        action: () => {
          if (app.save) app.push(new ConfirmBox(app, 'Begin a new journey?', 'Your current progress will be overwritten.', () => app.startGame({ fresh: true })));
          else app.startGame({ fresh: true });
        },
      },
      { label: 'Settings', action: () => app.push(new SettingsMenu(app)) },
      { label: 'Credits', action: () => app.startCredits() },
    ]);
    if (this.started) app.audio.music('title');
  }

  update(dt) {
    const app = this.app, inp = app.input;
    this.t += dt;
    if (Math.random() < 0.5) {
      this.particles.spawn({ x: rand(0, W), y: H + 2, vx: rand(-8, 4), vy: rand(-40, -15), color: Math.random() < 0.7 ? '#ff8a3d' : '#ffd08a', size: Math.random() < 0.2 ? 2 : 1, life: rand(3, 7), add: true });
    }
    this.particles.update(dt);
    if (!this.started) {
      if (inp.any) {
        this.started = true;
        app.audio.init();
        app.audio.music('title');
        app.audio.sfx('bell');
        inp.consume('confirm', 'jump', 'attack', 'interact');
      }
      return;
    }
    this.menu.update(inp, app.audio, dt);
  }

  render(ctx) {
    this.bg.draw(ctx, this.t * 9, 0, this.t);
    this.particles.draw(ctx, 0, 0, true);
    this.bg.drawFront(ctx, this.t * 9, 0, 1 / 60);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0.35)');
    g.addColorStop(0.5, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.5)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  drawCrown(u, cx, cy) {
    // A shattered crown: five shards drifting apart, held together by a magenta crack.
    const t = this.t;
    const shards = [
      [[-34, 8], [-26, -14], [-18, 8]],
      [[-18, 8], [-9, -22], [0, 8]],
      [[0, 8], [9, -30], [18, 8]],
      [[18, 8], [27, -22], [36, 8]],
      [[36, 8], [44, -14], [50, 8]],
    ];
    u.save();
    u.translate(cx - 8, cy);
    shards.forEach((s, i) => {
      const drift = Math.sin(t * 0.8 + i * 1.3) * 1.5;
      const spread = (i - 2) * (1.5 + Math.sin(t * 0.5) * 0.8);
      u.save();
      u.translate(spread, drift);
      u.rotate(Math.sin(t * 0.6 + i) * 0.03);
      u.beginPath();
      u.moveTo(s[0][0], s[0][1]); u.lineTo(s[1][0], s[1][1]); u.lineTo(s[2][0], s[2][1]); u.closePath();
      const gr = u.createLinearGradient(0, -30, 0, 8);
      gr.addColorStop(0, '#ffe2a8');
      gr.addColorStop(1, '#a8701e');
      u.fillStyle = gr;
      u.shadowColor = 'rgba(255,170,80,0.6)';
      u.shadowBlur = 10 * UI.scale;
      u.fill();
      u.restore();
    });
    u.fillStyle = '#c9a35a';
    u.fillRect(-36, 8, 88, 4);
    u.strokeStyle = `rgba(230,90,255,${0.6 + 0.3 * Math.sin(t * 3)})`;
    u.lineWidth = 1;
    u.shadowColor = '#d23cff';
    u.shadowBlur = 8 * UI.scale;
    u.beginPath();
    u.moveTo(9, -26); u.lineTo(6, -12); u.lineTo(12, -2); u.lineTo(8, 12);
    u.stroke();
    u.restore();
  }

  renderUI(u) {
    const t = this.t;
    const appear = Math.min(1, t / 1.5);
    u.globalAlpha = appear;
    this.drawCrown(u, 240, 58);
    u.globalAlpha = 1;
    txt(u, 'EMBERS', 240, 112, { font: font(40, SERIF, 'bold'), align: 'center', color: '#ffd9a8', alpha: appear, glow: `rgba(255,${120 + Math.sin(t * 2) * 30},50,0.9)`, blur: 16, spacing: 8 });
    txt(u, 'of the Hollow Crown', 240, 130, { font: font(11, SERIF, 'italic'), align: 'center', color: '#d8c3a0', alpha: appear, spacing: 2 });

    if (!this.started) {
      const a = 0.5 + 0.5 * Math.sin(t * 3);
      txt(u, 'press any key', 240, 186, { font: font(9, SERIF, 'italic'), align: 'center', color: '#e8dcc8', alpha: a * appear });
    } else {
      this.menu.render(u, 240, 162, { w: 150, size: 10, rowH: 17 });
    }
    txt(u, 'A 2D action-adventure · Chapter I build', 6, 264, { size: 5.5, color: 'rgba(200,190,175,0.5)', shadow: false });
    txt(u, '` debug · chapter select', 474, 264, { size: 5.5, align: 'right', color: 'rgba(200,190,175,0.35)', shadow: false });
  }
}
