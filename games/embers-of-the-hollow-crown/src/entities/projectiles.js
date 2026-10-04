// Pooled projectiles: arrows, lantern bolts, ground shockwaves and falling
// rocks. A parried projectile changes owner and flies back at its shooter.

import { TILE } from '../config.js';
import { overlap, rand, sign } from '../util.js';

const BASE = { t: 0, life: 3, r: 3, dmg: 1, owner: 'enemy', kind: 'arrow', reflectable: true, vy: 0, grav: 0, hollow: false, src: null, pdmg: 0 };

export class Projectiles {
  constructor(g) {
    this.g = g;
    this.list = Array.from({ length: 96 }, () => ({ on: false }));
  }

  fire(o) {
    const p = this.list.find((q) => !q.on);
    if (!p) return null;
    Object.assign(p, BASE, o);
    p.on = true;
    p.px = p.x; p.py = p.y;
    if (p.kind === 'rock') p.reflectable = false;
    return p;
  }

  box(p) {
    if (p.kind === 'wave') return { x: p.x - 6, y: p.y - 15, w: 12, h: 15 };
    if (p.kind === 'rock') return { x: p.x - 5, y: p.y - 5, w: 10, h: 10 };
    return { x: p.x - p.r, y: p.y - p.r, w: p.r * 2, h: p.r * 2 };
  }

  update(dt) {
    const g = this.g, lv = g.level, pl = g.player;
    for (const p of this.list) {
      if (!p.on) continue;
      p.px = p.x; p.py = p.y;
      p.t += dt;
      if (p.t > p.life) { p.on = false; continue; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.kind === 'wave') {
        const ahead = Math.floor((p.x + sign(p.vx) * 6) / TILE);
        if (lv.solid(ahead, Math.floor((p.y - 4) / TILE)) || !lv.solid(Math.floor(p.x / TILE), Math.floor((p.y + 2) / TILE))) {
          p.on = false;
          g.dust(p.x, p.y, 4);
          continue;
        }
        g.particles.spawn({ x: p.x + rand(-4, 4), y: p.y - rand(0, 12), vx: rand(-10, 10), vy: rand(-60, -20), color: Math.random() < 0.5 ? '#d23cff' : '#f3a6ff', size: 2, life: 0.35, add: true });
      } else if (lv.solid(Math.floor(p.x / TILE), Math.floor(p.y / TILE))) {
        p.on = false;
        g.particles.burst(p.x, p.y, { n: 6, colors: p.kind === 'bolt' ? ['#ffb46a', '#fff4dc'] : ['#c9cdd6', '#8a8f9c'], speed: [30, 90], life: [0.15, 0.3] });
        if (p.kind === 'rock') g.dust(p.x, p.y, 4);
        continue;
      } else if (p.kind === 'bolt' && Math.random() < 0.8) {
        g.particles.spawn({ x: p.x, y: p.y, vx: rand(-10, 10), vy: rand(-10, 10), color: p.owner === 'player' ? '#ffd08a' : p.hollow ? '#e86bff' : '#ff9a50', size: 2, life: 0.3, add: true, shrink: true });
      }

      const box = this.box(p);
      if (p.owner === 'enemy') {
        if (!pl.dead && overlap(box, pl.hurtbox())) {
          if (pl.parrying() && p.reflectable) {
            this.reflect(p);
            g.onParry({ x: p.x, y: p.y });
          } else if (pl.hurt(p.dmg, p.x - p.vx)) {
            p.on = false;
          }
        }
      } else {
        for (const e of g.enemies) {
          if (e.dead || !overlap(box, e.hurtbox())) continue;
          const res = e.takeHit({ dmg: p.pdmg, dir: sign(p.vx) || 1, kb: 140, kind: 'proj' });
          if (res === 'hit') g.onPlayerHit(e, { third: true, kind: 'proj' }, p.x, p.y);
          p.on = false;
          break;
        }
      }
    }
  }

  // Parried projectiles fly back at whoever fired them.
  reflect(p) {
    p.owner = 'player';
    p.pdmg = p.kind === 'bolt' ? 28 : 20;
    p.t = 0;
    const speed = Math.hypot(p.vx, p.vy) * 1.7;
    const s = p.src;
    if (s && !s.dead) {
      const dx = s.x - p.x, dy = s.cy - p.y, d = Math.hypot(dx, dy) || 1;
      p.vx = (dx / d) * speed;
      p.vy = (dy / d) * speed;
    } else {
      p.vx *= -1.7;
      p.vy *= -1.7;
    }
  }

  // Cancel enemy projectiles touched by a player attack. Returns true if any.
  cut(box) {
    let any = false;
    for (const p of this.list) {
      if (!p.on || p.owner !== 'enemy' || p.kind === 'wave') continue;
      if (overlap(this.box(p), box)) {
        p.on = false;
        any = true;
        this.g.particles.burst(p.x, p.y, { n: 8, colors: ['#fff4dc', '#ffd08a'], speed: [40, 120], life: [0.1, 0.3], line: true });
      }
    }
    return any;
  }

  clearEnemy() {
    for (const p of this.list) if (p.on && p.owner === 'enemy') p.on = false;
  }

  draw(ctx, cam, alpha) {
    for (const p of this.list) {
      if (!p.on) continue;
      const x = Math.round(p.px + (p.x - p.px) * alpha - cam.x);
      const y = Math.round(p.py + (p.y - p.py) * alpha - cam.y);
      if (p.kind === 'arrow') {
        const d = Math.hypot(p.vx, p.vy) || 1, ux = p.vx / d, uy = p.vy / d;
        ctx.fillStyle = p.owner === 'player' ? '#ffd08a' : '#c9cdd6';
        for (let i = 0; i < 9; i++) ctx.fillRect(Math.round(x - ux * i), Math.round(y - uy * i), 1, 1);
        ctx.fillStyle = '#e8e8f0';
        ctx.fillRect(x - 1, y - 1, 2, 2);
        ctx.fillStyle = '#8a2b3a';
        ctx.fillRect(Math.round(x - ux * 8), Math.round(y - uy * 8), 2, 1);
      } else if (p.kind === 'bolt') {
        const core = p.owner === 'player' ? '#fff4dc' : p.hollow ? '#f3a6ff' : '#ffd08a';
        const rim = p.owner === 'player' ? '#ff8a3d' : p.hollow ? '#d23cff' : '#ff8a3d';
        ctx.fillStyle = rim;
        ctx.fillRect(x - 3, y - 2, 6, 4);
        ctx.fillRect(x - 2, y - 3, 4, 6);
        ctx.fillStyle = core;
        ctx.fillRect(x - 1, y - 1, 2, 2);
      } else if (p.kind === 'wave') {
        const h = 10 + Math.floor(Math.sin(p.t * 30) * 3);
        ctx.fillStyle = '#5b1673';
        ctx.fillRect(x - 5, y - h, 10, h);
        ctx.fillStyle = '#d23cff';
        ctx.fillRect(x - 3, y - h + 2, 6, h - 2);
        ctx.fillStyle = '#f3a6ff';
        ctx.fillRect(x - 1, y - h + 4, 2, h - 4);
      } else if (p.kind === 'rock') {
        ctx.fillStyle = '#5a6578';
        ctx.fillRect(x - 5, y - 5, 10, 10);
        ctx.fillStyle = '#7d8698';
        ctx.fillRect(x - 5, y - 5, 10, 2);
        ctx.fillStyle = '#3b4458';
        ctx.fillRect(x + 2, y - 2, 3, 6);
      }
    }
  }

  lights(cam) {
    const L = [];
    for (const p of this.list) {
      if (!p.on) continue;
      if (p.kind === 'bolt') L.push({ x: p.x - cam.x, y: p.y - cam.y, r: 34, i: 0.9, color: p.hollow ? '220,80,255' : '255,160,80' });
      else if (p.kind === 'wave') L.push({ x: p.x - cam.x, y: p.y - 8 - cam.y, r: 30, i: 0.7, color: '210,60,255' });
    }
    return L;
  }
}
