// Interactive and decorative props: shrines, NPCs, lore tablets, memory
// shards, signs, doors, gates, torches and Lyra's skiff.

import { GATE, EMPTY } from '../systems/level.js';
import { drawDoor, drawGate, drawLyra, drawMemory, drawOskar, drawShrine, drawSign, drawSkiff, drawTablet, drawTorch } from '../gfx/sprites.js';
import { approach, rand, sign } from '../util.js';

class Actor {
  constructor(g, x, y) {
    this.g = g;
    this.x = x; this.y = y; this.px = x; this.py = y;
    this.t = Math.random() * 10;
    this.interactable = false;
    this.prompt = '';
    this.removed = false;
  }
  near(dist = 22, vdist = 34) {
    const p = this.g.player;
    return Math.abs(p.x - this.x) < dist && Math.abs(p.y - this.y) < vdist;
  }
  update(dt) { this.px = this.x; this.py = this.y; this.t += dt; }
  draw() {}
  lights() { return []; }
}

export class Shrine extends Actor {
  constructor(g, x, y, id) {
    super(g, x, y);
    this.id = id;
    this.lit = !!g.save.flags['shrine_' + id];
    this.interactable = true;
    this.prompt = 'Rest';
  }
  update(dt) {
    super.update(dt);
    if (!this.lit && this.near(30) && !this.g.player.dead) this.kindle();
    if (this.lit && Math.random() < 0.25) {
      this.g.particles.spawn({ x: this.x + rand(-4, 4), y: this.y - 28, vx: rand(-6, 6), vy: rand(-40, -18), color: Math.random() < 0.5 ? '#ffd08a' : '#ff8a3d', size: 1, life: rand(0.5, 1.1), add: true, front: false });
    }
  }
  kindle() {
    const g = this.g;
    this.lit = true;
    g.save.flags['shrine_' + this.id] = true;
    g.app.audio.sfx('shrine');
    g.particles.burst(this.x, this.y - 26, { n: 30, colors: ['#ffd08a', '#ff8a3d', '#fff4dc'], speed: [30, 120], life: [0.4, 1], add: true, grav: -40 });
    g.setCheckpoint(this.id, true);
    g.toast('Shrine kindled — progress saved');
  }
  interact() { this.g.rest(this); }
  draw(ctx, sx, sy) { drawShrine(ctx, sx, sy, this, this.t); }
  lights(cam) {
    const fl = Math.sin(this.t * 11) * 4;
    return this.lit
      ? [{ x: this.x - cam.x, y: this.y - 26 - cam.y, r: 115 + fl, i: 1, color: '255,160,80' }]
      : [{ x: this.x - cam.x, y: this.y - 14 - cam.y, r: 34, i: 0.5, color: '120,140,200' }];
  }
}

export class NPC extends Actor {
  constructor(g, x, y, who) {
    super(g, x, y);
    this.who = who;
    this.facing = -1;
    this.vx = 0;
    this.interactable = true;
    this.prompt = 'Talk';
    this.scriptMove = null;
    this.alpha = 1;
  }
  update(dt) {
    super.update(dt);
    if (this.scriptMove) {
      const d = this.scriptMove.x - this.x;
      if (Math.abs(d) < 2) { this.scriptMove = null; this.vx = 0; }
      else { this.vx = sign(d) * (this.scriptMove.speed || 80); this.facing = sign(d); this.x += this.vx * dt; }
    } else {
      this.vx = approach(this.vx, 0, 400 * dt);
      const p = this.g.player;
      if (Math.abs(p.x - this.x) < 90 && Math.abs(p.x - this.x) > 4) this.facing = sign(p.x - this.x);
    }
    if (this.fadeOut) this.alpha = Math.max(0, this.alpha - dt * 1.5);
    if (this.alpha <= 0) this.removed = true;
  }
  interact() { this.g.talk(this); }
  draw(ctx, sx, sy) {
    ctx.globalAlpha = this.alpha;
    if (this.who === 'lyra') drawLyra(ctx, sx, sy, this);
    else drawOskar(ctx, sx, sy, this);
    ctx.globalAlpha = 1;
  }
  lights(cam) {
    if (this.who === 'oskar') return [{ x: this.x - cam.x + this.facing * 6, y: this.y - 31 - cam.y, r: 58, i: 0.85, color: '255,190,110' }];
    return [{ x: this.x - cam.x, y: this.y - 14 - cam.y, r: 30, i: 0.5 }];
  }
}

export class Tablet extends Actor {
  constructor(g, x, y, loreId) {
    super(g, x, y);
    this.loreId = loreId;
    this.interactable = true;
    this.prompt = 'Read';
  }
  interact() { this.g.readLore(this); }
  draw(ctx, sx, sy) { drawTablet(ctx, sx, sy, this.t, this.g.save.lore.includes(this.loreId)); }
  lights(cam) { return [{ x: this.x - cam.x, y: this.y - 12 - cam.y, r: 34, i: 0.6, color: '120,170,255' }]; }
}

export class MemoryShard extends Actor {
  constructor(g, x, y, mem) {
    super(g, x, y);
    this.mem = mem;
  }
  update(dt) {
    super.update(dt);
    if (Math.random() < 0.35) {
      const a = this.t * 3 + Math.random() * 6;
      this.g.particles.spawn({ x: this.x + Math.cos(a) * 9, y: this.y - 10 + Math.sin(a) * 9, vx: 0, vy: -12, color: Math.random() < 0.5 ? '#fff4dc' : '#ffd08a', size: 1, life: 0.6, add: true });
    }
    const p = this.g.player;
    if (!p.dead && Math.abs(p.x - this.x) < 12 && Math.abs(p.cy - (this.y - 10)) < 16) {
      this.removed = true;
      this.g.collectMemory(this);
    }
  }
  draw(ctx, sx, sy) { drawMemory(ctx, sx, sy, this.t); }
  lights(cam) { return [{ x: this.x - cam.x, y: this.y - 10 - cam.y, r: 52 + Math.sin(this.t * 3) * 6, i: 0.9, color: '255,225,170' }]; }
}

export class Sign extends Actor {
  constructor(g, x, y, text) {
    super(g, x, y);
    this.text = text;
    this.show = 0;
  }
  update(dt) {
    super.update(dt);
    const on = this.near(56, 60) && this.g.controls;
    this.show = approach(this.show, on ? 1 : 0, dt * 5);
  }
  draw(ctx, sx, sy) { drawSign(ctx, sx, sy); }
}

// Occupies a 1x4 column of tiles while closed.
export class Door extends Actor {
  constructor(g, tx, ty) {
    super(g, tx * 16 + 8, (ty + 1) * 16);
    this.tx = tx; this.ty = ty;
    this.setSolid(true);
  }
  setSolid(on) {
    for (let k = 0; k < 4; k++) this.g.level.set(this.tx, this.ty - k, on ? GATE : EMPTY);
  }
  shatter() {
    const g = this.g;
    this.setSolid(false);
    this.removed = true;
    g.app.audio.sfx('door');
    g.cam.shake(0.6);
    g.particles.burst(this.x, this.y - 32, { n: 40, colors: ['#5a6578', '#7d8698', '#3b4458', '#ff8a3d'], speed: [80, 240], grav: 600, size: 2, life: [0.4, 1], jitter: 16 });
  }
  draw(ctx, sx, sy) { drawDoor(ctx, sx, sy); }
}

export class Gate extends Actor {
  constructor(g, tx, ty, closed) {
    super(g, tx * 16 + 8, (ty + 1) * 16);
    this.tx = tx; this.ty = ty;
    this.closed = closed;
    this.lift = closed ? 0 : 1;
    this.magic = false;
    this.apply();
  }
  apply() {
    for (let k = 0; k < 4; k++) this.g.level.set(this.tx, this.ty - k, this.closed ? GATE : EMPTY);
  }
  setClosed(c) {
    if (c === this.closed) return;
    this.closed = c;
    this.apply();
    this.g.app.audio.sfx('gate');
    if (c) this.g.dust(this.x, this.y, 6);
  }
  update(dt) {
    super.update(dt);
    this.lift = approach(this.lift, this.closed ? 0 : 1, dt * (this.closed ? 6 : 1.2));
  }
  draw(ctx, sx, sy) { if (this.lift < 1) drawGate(ctx, sx, sy, this); }
}

export class Torch extends Actor {
  update(dt) {
    super.update(dt);
    if (Math.random() < 0.15) this.g.particles.spawn({ x: this.x + rand(-1, 1), y: this.y - 6, vx: rand(-5, 5), vy: rand(-30, -14), color: '#ffb070', size: 1, life: 0.6, add: true, front: false });
  }
  draw(ctx, sx, sy) { drawTorch(ctx, sx, sy, this.t); }
  lights(cam) { return [{ x: this.x - cam.x, y: this.y - 4 - cam.y, r: 74 + Math.sin(this.t * 13) * 3, i: 0.9, color: '255,140,60' }]; }
}

export class Skiff extends Actor {
  draw(ctx, sx, sy) { drawSkiff(ctx, sx, sy, this.t); }
  lights(cam) { return [{ x: this.x + 34 - cam.x, y: this.y - 16 - cam.y, r: 50, i: 0.8, color: '255,200,110' }]; }
}
