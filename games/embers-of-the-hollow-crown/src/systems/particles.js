// Pooled particle system. Nothing is allocated after construction.

import { rand } from '../util.js';

const DEFAULTS = {
  vx: 0, vy: 0, grav: 0, drag: 0, size: 2, color: '#fff', life: 0.5,
  add: false, fade: true, shrink: false, line: false, front: true,
};

export class Particles {
  constructor(n = 900) {
    this.pool = Array.from({ length: n }, () => ({ on: false }));
    this.cursor = 0;
  }

  spawn(o) {
    const n = this.pool.length;
    let p = null;
    for (let i = 0; i < n; i++) {
      const c = this.pool[(this.cursor + i) % n];
      if (!c.on) { p = c; this.cursor = (this.cursor + i + 1) % n; break; }
    }
    if (!p) { p = this.pool[this.cursor]; this.cursor = (this.cursor + 1) % n; }
    Object.assign(p, DEFAULTS, o);
    p.on = true;
    p.max = p.life;
    return p;
  }

  // Radial or directional burst.
  burst(x, y, o = {}) {
    const n = o.n ?? 10;
    const ang = o.angle ?? 0, spread = o.spread ?? Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const a = ang + (Math.random() - 0.5) * spread;
      const sp = rand(o.speed?.[0] ?? 40, o.speed?.[1] ?? 140);
      const colors = o.colors || [o.color || '#fff'];
      this.spawn({
        x: x + rand(-(o.jitter ?? 0), o.jitter ?? 0), y: y + rand(-(o.jitter ?? 0), o.jitter ?? 0),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        grav: o.grav ?? 0, drag: o.drag ?? 2, size: o.size ?? 2,
        color: colors[(Math.random() * colors.length) | 0],
        life: rand(o.life?.[0] ?? 0.25, o.life?.[1] ?? 0.6),
        add: o.add ?? false, shrink: o.shrink ?? false, line: o.line ?? false, front: o.front ?? true,
      });
    }
  }

  update(dt) {
    for (const p of this.pool) {
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) { p.on = false; continue; }
      if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  draw(ctx, cx, cy, front) {
    for (const additive of [false, true]) {
      ctx.globalCompositeOperation = additive ? 'lighter' : 'source-over';
      for (const p of this.pool) {
        if (!p.on || p.add !== additive || p.front !== front) continue;
        const k = p.life / p.max;
        ctx.globalAlpha = p.fade ? Math.min(1, k * 1.6) : 1;
        ctx.fillStyle = p.color;
        const s = p.shrink ? Math.max(1, p.size * k) : p.size;
        const x = p.x - cx, y = p.y - cy;
        if (p.line) {
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(Math.round(x), Math.round(y));
          ctx.lineTo(Math.round(x - p.vx * 0.03), Math.round(y - p.vy * 0.03));
          ctx.stroke();
        } else {
          ctx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), Math.ceil(s), Math.ceil(s));
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  clear() { for (const p of this.pool) p.on = false; }
}
