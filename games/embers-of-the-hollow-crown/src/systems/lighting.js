// Darkness overlay with light sources punched out of it, followed by an
// additive pass that gives each light its colour.

import { W, H } from '../config.js';
import { makeCanvas } from '../util.js';

export class Lighting {
  constructor() {
    [this.c, this.x] = makeCanvas(W, H);
  }

  render(ctx, lights, darkness, tint = '6,7,16') {
    if (darkness <= 0.01) return;
    const x = this.x;
    x.globalCompositeOperation = 'source-over';
    x.clearRect(0, 0, W, H);
    x.fillStyle = `rgba(${tint},${darkness})`;
    x.fillRect(0, 0, W, H);
    x.globalCompositeOperation = 'destination-out';
    for (const l of lights) {
      if (l.x < -l.r || l.x > W + l.r || l.y < -l.r || l.y > H + l.r) continue;
      const g = x.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
      g.addColorStop(0, `rgba(0,0,0,${l.i ?? 1})`);
      g.addColorStop(0.55, `rgba(0,0,0,${(l.i ?? 1) * 0.55})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
    }
    ctx.drawImage(this.c, 0, 0);

    ctx.globalCompositeOperation = 'lighter';
    for (const l of lights) {
      if (!l.color) continue;
      if (l.x < -l.r || l.x > W + l.r || l.y < -l.r || l.y > H + l.r) continue;
      const r = l.r * 0.8;
      const g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
      g.addColorStop(0, `rgba(${l.color},${0.22 * (l.i ?? 1) * (l.glow ?? 1)})`);
      g.addColorStop(1, `rgba(${l.color},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(l.x - r, l.y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}
