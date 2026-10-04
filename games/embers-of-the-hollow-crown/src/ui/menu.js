// Vertical menu used by the title screen and every overlay.
// Item: { label, action?, left?, right?, value?: () => string, enabled?: () => bool, hint? }

import { font, SERIF, txt } from './text.js';

export class Menu {
  constructor(items, o = {}) {
    this.items = items;
    this.o = o;
    this.sel = 0;
    this.t = 0;
    if (!this.ok(this.items[0])) this.move(1);
  }

  ok(it) { return it && (it.enabled ? it.enabled() : true); }

  move(d, audio) {
    const n = this.items.length;
    for (let k = 0; k < n; k++) {
      this.sel = (this.sel + d + n) % n;
      if (this.ok(this.items[this.sel])) break;
    }
    audio?.sfx('menu');
  }

  update(inp, audio, dt = 1 / 60) {
    this.t += dt;
    if (inp.hit('up')) this.move(-1, audio);
    if (inp.hit('down')) this.move(1, audio);
    const it = this.items[this.sel];
    if (inp.hit('left') && it.left) { it.left(); audio.sfx('menu'); }
    if (inp.hit('right') && it.right) { it.right(); audio.sfx('menu'); }
    if (inp.hit('confirm')) {
      inp.consume('confirm', 'jump', 'attack', 'interact');
      if (this.ok(it) && it.action) { audio.sfx('select'); it.action(); }
      else if (!it.left) audio.sfx('deny');
    }
  }

  render(u, x, y, o = {}) {
    const rowH = o.rowH || 15, w = o.w || 180, align = o.align || 'center';
    this.items.forEach((it, i) => {
      const sel = i === this.sel;
      const ok = this.ok(it);
      const ry = y + i * rowH;
      if (sel) {
        const g = u.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
        g.addColorStop(0, 'rgba(255,138,61,0)');
        g.addColorStop(0.5, 'rgba(255,138,61,0.18)');
        g.addColorStop(1, 'rgba(255,138,61,0)');
        u.fillStyle = g;
        u.fillRect(x - w / 2, ry - 10, w, rowH - 2);
      }
      const color = !ok ? 'rgba(150,145,138,0.45)' : sel ? '#ffd08a' : '#cfc8bb';
      const size = o.size || 9;
      if (it.value) {
        txt(u, it.label, x - w / 2 + 10, ry, { font: font(size, SERIF), color });
        txt(u, it.value(), x + w / 2 - 10, ry, { font: font(size, SERIF), color, align: 'right' });
      } else {
        txt(u, it.label, align === 'center' ? x : x - w / 2 + 10, ry, { font: font(size, SERIF), color, align, glow: sel ? 'rgba(255,138,61,0.6)' : null, blur: 6 });
      }
      if (sel) {
        const bob = Math.sin(this.t * 6) * 1.5;
        txt(u, '›', x - w / 2 + 2 + bob, ry, { size: size + 1, color: '#ff8a3d' });
      }
    });
    const cur = this.items[this.sel];
    if (cur?.hint) txt(u, cur.hint, x, y + this.items.length * rowH + 4, { size: 6.5, align: 'center', color: '#9d958a', style: 'italic' });
  }
}
