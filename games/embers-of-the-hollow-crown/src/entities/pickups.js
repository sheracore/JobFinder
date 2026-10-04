// Ember Shards (currency) and health motes. They spill out, bounce, then get
// pulled towards Kael.

import { moveBody } from '../systems/physics.js';
import { approach, rand } from '../util.js';

export class Pickups {
  constructor(g) {
    this.g = g;
    this.list = [];
  }

  spawn(kind, x, y, n = 1) {
    for (let i = 0; i < n; i++) {
      this.list.push({
        kind, x: x + rand(-4, 4), y, px: x, py: y,
        vx: rand(-80, 80), vy: rand(-230, -100), w: 4, h: 4, t: rand(0, 0.15), onGround: false,
      });
    }
  }

  update(dt) {
    const g = this.g, p = g.player;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const k = this.list[i];
      k.px = k.x; k.py = k.y;
      k.t += dt;
      const dx = p.x - k.x, dy = p.cy - (k.y - 2), d = Math.hypot(dx, dy) || 1;
      if (k.t > 0.5 && d < 96 && !p.dead) {
        const sp = 280;
        k.vx = approach(k.vx, (dx / d) * sp, 1100 * dt);
        k.vy = approach(k.vy, (dy / d) * sp, 1100 * dt);
        k.x += k.vx * dt;
        k.y += k.vy * dt;
      } else {
        k.vy = Math.min(k.vy + 900 * dt, 320);
        if (k.onGround) k.vx = approach(k.vx, 0, 300 * dt);
        moveBody(k, g.level, dt);
        if (k.landed && k.landVy > 90) k.vy = -k.landVy * 0.35;
      }
      if (d < 11 && k.t > 0.3 && !p.dead) {
        this.collect(k);
        this.list.splice(i, 1);
      } else if (k.t > 30 || k.y > g.level.ph + 20) {
        this.list.splice(i, 1);
      }
    }
  }

  collect(k) {
    const g = this.g;
    if (k.kind === 'shard') {
      g.save.currency += 1;
      g.shardFlash = 0.3;
      g.app.audio.sfx('pickup', { pitch: 1 + Math.random() * 0.2 });
      g.particles.burst(k.x, k.y - 2, { n: 4, colors: ['#ffd08a', '#ff8a3d'], speed: [20, 60], life: [0.15, 0.3], add: true });
    } else if (k.kind === 'heal') {
      if (g.player.hp < g.player.maxHp) {
        g.player.hp++;
        g.hpFlash = 0.4;
      }
      g.app.audio.sfx('heal');
      g.particles.burst(k.x, k.y - 2, { n: 10, colors: ['#ff6a5a', '#ffd08a'], speed: [20, 70], life: [0.3, 0.5], add: true });
    }
  }

  draw(ctx, cam, alpha) {
    for (const k of this.list) {
      const x = Math.round(k.px + (k.x - k.px) * alpha - cam.x);
      const y = Math.round(k.py + (k.y - k.py) * alpha - cam.y) - 3;
      if (k.kind === 'shard') {
        const tw = Math.floor(k.t * 8) % 4 === 0;
        ctx.fillStyle = '#c2410c';
        ctx.fillRect(x - 1, y - 2, 3, 5);
        ctx.fillStyle = tw ? '#fff4dc' : '#ff8a3d';
        ctx.fillRect(x, y - 3, 1, 6);
        ctx.fillRect(x - 1, y - 1, 3, 2);
      } else {
        const pulse = Math.floor(k.t * 6) % 2;
        ctx.fillStyle = '#ff5a4a';
        ctx.fillRect(x - 2, y - 2, 2, 2);
        ctx.fillRect(x + 1, y - 2, 2, 2);
        ctx.fillRect(x - 2, y, 5, 1);
        ctx.fillRect(x - 1, y + 1, 3, 1);
        ctx.fillRect(x, y + 2, 1, 1);
        if (pulse) { ctx.fillStyle = '#ffd08a'; ctx.fillRect(x - 1, y - 1, 1, 1); }
      }
    }
  }

  lights(cam) {
    return this.list.map((k) => ({ x: k.x - cam.x, y: k.y - 3 - cam.y, r: 12, i: 0.6, color: k.kind === 'shard' ? '255,150,70' : '255,90,80' }));
  }
}
