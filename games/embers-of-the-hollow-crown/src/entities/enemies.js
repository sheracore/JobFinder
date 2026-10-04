// Chapter I enemies. Every enemy is a small state machine; attacks are
// telegraphed by a wind-up state (red tint + cue) before the active frames.

import { TILE } from '../config.js';
import { ENEMIES } from '../data/enemies.js';
import { drawArcher, drawCrate, drawHusk, drawShield, drawWisp } from '../gfx/sprites.js';
import { groundAt, moveBody } from '../systems/physics.js';
import { approach, rand, sign } from '../util.js';

export class Enemy {
  constructor(g, x, y, type) {
    const d = ENEMIES[type];
    this.g = g; this.type = type; this.def = d;
    this.x = x; this.y = y; this.px = x; this.py = y;
    this.vx = 0; this.vy = 0; this.w = d.w; this.h = d.h;
    this.hp = d.hp; this.maxHp = d.hp;
    this.facing = -1; this.state = 'idle'; this.st = 0;
    this.t = Math.random() * 10; this.flash = 0;
    this.dead = false; this.onGround = false; this.gravity = true;
    this.home = x;
    this.atkBox = null; this.atkDone = false; this.parryable = true;
  }

  get cx() { return this.x; }
  get cy() { return this.y - this.h / 2; }
  get tele() { return this.state === 'windup' || this.state === 'aim' || this.state === 'notice'; }
  get teleTint() { return this.tele && Math.floor(this.t * 12) % 3 === 0; }

  hurtbox() { return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h }; }

  setState(s) {
    this.state = s;
    this.st = 0;
    if (s === 'windup' || s === 'aim' || s === 'notice') this.g.app.audio.sfx('tele');
  }

  toPlayer() {
    const p = this.g.player;
    return { dx: p.x - this.x, dy: p.cy - this.cy, p };
  }

  sees(range, vrange = 64) {
    const { dx, dy, p } = this.toPlayer();
    return !p.dead && Math.abs(dx) < range && Math.abs(dy) < vrange;
  }

  facePlayer() {
    const { dx } = this.toPlayer();
    if (Math.abs(dx) > 2) this.facing = sign(dx);
  }

  ledgeAhead(dir) {
    return !groundAt(this.g.level, this.x + dir * (this.w / 2 + 3), this.y);
  }

  wallAhead(dir) {
    const tx = Math.floor((this.x + dir * (this.w / 2 + 2)) / TILE);
    return this.g.level.solid(tx, Math.floor((this.y - 4) / TILE));
  }

  takeHit(h) {
    if (this.dead) return 'immune';
    this.hp -= h.dmg;
    this.flash = 0.1;
    if (this.def.kbMul) {
      this.vx = h.dir * (h.kb ?? 130) * this.def.kbMul;
      if (h.kind === 'up' && this.gravity) this.vy = -150;
    }
    if (this.hp <= 0) this.die(h);
    else this.onHurt?.(h);
    return 'hit';
  }

  die() {
    this.dead = true;
    this.g.onEnemyKilled(this);
  }

  update(dt) {
    this.px = this.x; this.py = this.y;
    this.t += dt; this.st += dt;
    if (this.flash > 0) this.flash -= dt;
    this.atkBox = null;
    if (this.dead) return;
    if (!this.g.freezeAI) this.ai(dt);
    else this.vx = approach(this.vx, 0, 600 * dt);
    if (this.gravity) {
      this.vy = Math.min(this.vy + 1500 * dt, 430);
      moveBody(this, this.g.level, dt);
      if (this.y > this.g.level.ph + 40) { this.hp = 0; this.dead = true; this.g.onEnemyKilled(this, true); }
    }
  }

  patrol(dt, speed) {
    if (this.ledgeAhead(this.facing) || this.wallAhead(this.facing) || Math.abs(this.x - this.home) > 56 && sign(this.x - this.home) === this.facing) {
      this.facing *= -1;
    }
    this.vx = approach(this.vx, this.facing * speed, 400 * dt);
  }

  lights() { return []; }
}

// ---- Hollow Husk: melee grunt ---------------------------------------------

export class Husk extends Enemy {
  constructor(g, x, y) { super(g, x, y, 'husk'); }

  ai(dt) {
    const { dx } = this.toPlayer();
    switch (this.state) {
      case 'idle':
        this.patrol(dt, 24);
        if (this.sees(130)) this.setState('chase');
        break;
      case 'chase':
        this.facePlayer();
        if (this.ledgeAhead(this.facing)) this.vx = approach(this.vx, 0, 600 * dt);
        else this.vx = approach(this.vx, this.facing * 58, 500 * dt);
        if (Math.abs(dx) < 28 && this.sees(40, 30)) { this.setState('windup'); this.vx = 0; }
        else if (!this.sees(200, 90)) this.setState('idle');
        break;
      case 'windup':
        this.vx = approach(this.vx, 0, 900 * dt);
        if (this.st > 0.45) { this.setState('strike'); this.atkDone = false; this.vx = this.facing * 150; }
        break;
      case 'strike':
        this.vx = approach(this.vx, 0, 700 * dt);
        this.atkBox = { x: this.facing > 0 ? this.x : this.x - 24, y: this.y - 20, w: 24, h: 18 };
        if (this.st > 0.14) this.setState('recover');
        break;
      case 'recover':
        this.vx = approach(this.vx, 0, 900 * dt);
        if (this.st > 0.55) this.setState('chase');
        break;
      case 'stagger':
        this.vx = approach(this.vx, 0, 600 * dt);
        if (this.st > 0.8) this.setState('chase');
        break;
    }
  }

  onParried() { this.setState('stagger'); this.vx = -this.facing * 120; }
  draw(ctx, sx, sy) { drawHusk(ctx, sx, sy, this); }
  lights(cam) { return [{ x: this.x - cam.x + this.facing * 4, y: this.y - 19 - cam.y, r: 14, i: 0.5, color: '220,80,255' }]; }
}

// ---- Fog Wisp: floating kamikaze --------------------------------------------

export class Wisp extends Enemy {
  constructor(g, x, y) {
    super(g, x, y, 'wisp');
    this.gravity = false;
    this.baseY = y;
    this.y = y; this.py = y;
  }

  ai(dt) {
    const { dx, dy, p } = this.toPlayer();
    switch (this.state) {
      case 'idle':
        this.x += Math.sin(this.t * 0.9) * 12 * dt;
        this.y = this.baseY + Math.sin(this.t * 2.2) * 5;
        if (!p.dead && Math.hypot(dx, dy) < 140) this.setState('notice');
        if (Math.random() < 0.3) this.trailMote();
        break;
      case 'notice':
        this.x += (Math.random() - 0.5) * 2;
        if (this.st > 0.6) {
          this.setState('dive');
          this.atkDone = false;
          const d = Math.hypot(dx, dy) || 1;
          this.vx = (dx / d) * 210;
          this.vy = (dy / d) * 210;
          this.g.app.audio.sfx('whoosh');
        }
        break;
      case 'dive': {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.trailMote();
        const r = 9;
        this.atkBox = { x: this.x - r, y: this.cy - r, w: r * 2, h: r * 2 };
        const tx = Math.floor(this.x / TILE), ty = Math.floor(this.cy / TILE);
        if (this.g.level.solid(tx, ty) || this.st > 1.3 || this.atkDone) this.explode();
        break;
      }
    }
    this.facing = sign(dx) || 1;
  }

  trailMote() {
    this.g.particles.spawn({ x: this.x + rand(-3, 3), y: this.cy + rand(-3, 3), vx: rand(-8, 8), vy: rand(-20, -5), color: Math.random() < 0.5 ? '#d23cff' : '#2a0a36', size: 2, life: 0.5, front: false });
  }

  explode() {
    if (this.dead) return;
    this.g.explode(this.x, this.cy, 22, this);
    this.hp = 0;
    this.dead = true;
    this.g.onEnemyKilled(this, true);
  }

  onParried() { this.explode(); }
  draw(ctx, sx, sy) { drawWisp(ctx, sx, sy, this); }
  lights(cam) { return [{ x: this.x - cam.x, y: this.cy - cam.y, r: 42, i: 0.8, color: '210,60,255' }]; }
}

// ---- Shieldbearer: blocks from the front, punishable by parry or flanking ---

export class Shieldbearer extends Enemy {
  constructor(g, x, y) { super(g, x, y, 'shield'); this.turnT = 0; }

  ai(dt) {
    const { dx } = this.toPlayer();
    const behind = sign(dx) !== this.facing && Math.abs(dx) > 4;
    if (this.state !== 'broken' && this.state !== 'thrust') {
      if (behind && this.sees(160)) {
        this.turnT += dt;
        if (this.turnT > 0.55) { this.facing *= -1; this.turnT = 0; }
      } else this.turnT = 0;
    }
    switch (this.state) {
      case 'idle':
        this.patrol(dt, 18);
        if (this.sees(140)) this.setState('walk');
        break;
      case 'walk':
        if (!behind && !this.ledgeAhead(this.facing) && Math.abs(dx) > 30) this.vx = approach(this.vx, this.facing * 34, 300 * dt);
        else this.vx = approach(this.vx, 0, 400 * dt);
        if (!behind && Math.abs(dx) < 42 && this.sees(50, 30)) { this.setState('windup'); }
        if (!this.sees(220, 100)) this.setState('idle');
        break;
      case 'windup':
        this.vx = approach(this.vx, 0, 600 * dt);
        if (this.st > 0.6) { this.setState('thrust'); this.atkDone = false; this.vx = this.facing * 90; }
        break;
      case 'thrust':
        this.vx = approach(this.vx, 0, 500 * dt);
        this.atkBox = { x: this.facing > 0 ? this.x + 2 : this.x - 34, y: this.y - 18, w: 32, h: 8 };
        if (this.st > 0.18) this.setState('recover');
        break;
      case 'recover':
        this.vx = approach(this.vx, 0, 600 * dt);
        if (this.st > 0.65) this.setState('walk');
        break;
      case 'broken':
        this.vx = approach(this.vx, 0, 400 * dt);
        if (this.st > 1.7) this.setState('walk');
        break;
    }
  }

  takeHit(h) {
    if (this.dead) return 'immune';
    const fromFront = sign(h.dir) === -this.facing;
    if (this.state !== 'broken' && fromFront && h.kind !== 'down' && h.kind !== 'burst' && h.kind !== 'heavy') {
      this.vx = h.dir * 40;
      return 'blocked';
    }
    return super.takeHit(h);
  }

  onParried() {
    this.setState('broken');
    this.vx = -this.facing * 90;
    this.g.particles.burst(this.x + this.facing * 7, this.y - 14, { n: 10, colors: ['#c9cdd6', '#ffffff'], speed: [60, 150], life: [0.15, 0.35], line: true });
  }

  draw(ctx, sx, sy) { drawShield(ctx, sx, sy, this); }
}

// ---- Archer: keeps distance and fires telegraphed arrows -------------------

export class Archer extends Enemy {
  constructor(g, x, y) { super(g, x, y, 'archer'); this.cool = rand(0.3, 1); }

  ai(dt) {
    const { dx, dy } = this.toPlayer();
    this.cool -= dt;
    switch (this.state) {
      case 'idle':
        this.vx = approach(this.vx, 0, 400 * dt);
        if (this.sees(230, 150)) {
          this.facePlayer();
          if (Math.abs(dx) < 54 && Math.abs(dy) < 30 && !this.ledgeAhead(-this.facing) && !this.wallAhead(-this.facing)) this.setState('retreat');
          else if (this.cool <= 0) { this.setState('aim'); this.aimAt = null; }
        }
        break;
      case 'retreat':
        this.vx = approach(this.vx, -this.facing * 62, 500 * dt);
        if (this.st > 0.5 || this.ledgeAhead(-this.facing) || this.wallAhead(-this.facing)) this.setState('idle');
        break;
      case 'aim': {
        this.vx = approach(this.vx, 0, 600 * dt);
        this.facePlayer();
        const p = this.g.player;
        if (this.st < 0.6) this.aimAt = { x: p.x, y: p.cy };
        if (this.st > 0.85) {
          const sx = this.x + this.facing * 8, sy = this.y - 17;
          const a = this.aimAt || { x: p.x, y: p.cy };
          const d = Math.hypot(a.x - sx, a.y - sy) || 1;
          this.g.projectiles.fire({ kind: 'arrow', x: sx, y: sy, vx: ((a.x - sx) / d) * 250, vy: ((a.y - sy) / d) * 250, owner: 'enemy', src: this });
          this.g.app.audio.sfx('arrow');
          this.setState('shoot');
        }
        break;
      }
      case 'shoot':
        if (this.st > 0.3) { this.setState('idle'); this.cool = 1.3; }
        break;
    }
  }

  draw(ctx, sx, sy) { drawArcher(ctx, sx, sy, this); }
}

// ---- Crate: breakable loot container ----------------------------------------

export class Crate extends Enemy {
  constructor(g, x, y) { super(g, x, y, 'crate'); this.passive = true; }
  ai() {}
  takeHit(h) {
    const r = super.takeHit(h);
    this.g.app.audio.sfx('crate');
    return r;
  }
  draw(ctx, sx, sy) { drawCrate(ctx, sx, sy, this); }
}
