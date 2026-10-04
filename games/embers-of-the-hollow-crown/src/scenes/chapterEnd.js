// End-of-chapter card with stats, followed by the road ahead.

import { H, W } from '../config.js';
import { CHAPTERS } from '../data/chapters.js';
import { CH1 } from '../data/levels/ch1.js';
import { Particles } from '../systems/particles.js';
import { Menu } from '../ui/menu.js';
import { font, SERIF, txt } from '../ui/text.js';
import { rand } from '../util.js';

export class ChapterEndScene {
  constructor(app) { this.app = app; }

  enter() {
    const app = this.app;
    this.t = 0;
    this.particles = new Particles(300);
    app.audio.music('credits');
    this.menu = new Menu([
      { label: 'Replay Chapter I (keep upgrades & memories)', action: () => app.replayChapter() },
      { label: 'Credits', action: () => app.startCredits() },
      { label: 'Return to Title', action: () => app.toTitle() },
    ]);
  }

  update(dt) {
    this.t += dt;
    if (Math.random() < 0.4) this.particles.spawn({ x: rand(0, W), y: H + 2, vx: rand(-6, 6), vy: rand(-35, -12), color: Math.random() < 0.7 ? '#ff8a3d' : '#ffd08a', size: 1, life: rand(3, 7), add: true });
    this.particles.update(dt);
    if (this.t > 1.2) this.menu.update(this.app.input, this.app.audio, dt);
  }

  render(ctx) {
    ctx.fillStyle = '#07080d';
    ctx.fillRect(0, 0, W, H);
    this.particles.draw(ctx, 0, 0, true);
  }

  renderUI(u) {
    const s = this.app.save;
    const a = Math.min(1, this.t / 1.2);
    txt(u, 'END OF CHAPTER I', 240, 46, { size: 8, align: 'center', color: '#c9a66b', alpha: a, spacing: 4, style: 'bold' });
    txt(u, 'The Ashen Docks', 240, 70, { font: font(20, SERIF, 'italic'), align: 'center', color: '#f4e6cc', alpha: a, glow: 'rgba(255,138,61,0.7)', blur: 10 });
    if (s) {
      const mem = CH1.memories.filter((m) => s.memories.includes(m.id)).length;
      const lore = CH1.lore.filter((l) => s.lore.includes(l)).length;
      const mins = Math.floor(s.playtime / 60), secs = Math.floor(s.playtime % 60);
      const rows = [
        ['Memories recovered', `${mem} / ${CH1.memories.length}`],
        ['Lore tablets read', `${lore} / ${CH1.lore.length}`],
        ['Ember Shards', String(s.currency)],
        ['Times the ember guttered', String(s.deaths)],
        ['Time in the ash', `${mins}m ${String(secs).padStart(2, '0')}s`],
      ];
      rows.forEach(([k, v], i) => {
        txt(u, k, 168, 96 + i * 12, { font: font(8, SERIF), color: '#bdb5a8', alpha: a });
        txt(u, v, 312, 96 + i * 12, { font: font(8, SERIF), color: '#ffd08a', align: 'right', alpha: a });
      });
    }
    const next = CHAPTERS[1];
    txt(u, `Chapter ${next.roman} — ${next.title} — has not yet been forged.`, 240, 168, { font: font(8, SERIF, 'italic'), align: 'center', color: '#d8a6ff', alpha: a });
    if (this.t > 1.2) this.menu.render(u, 240, 194, { w: 280, size: 8.5, rowH: 15 });
  }
}
