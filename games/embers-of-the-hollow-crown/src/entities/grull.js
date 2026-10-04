// Warden Grull, keeper of the Ashen Cells: Chapter I boss.
//
// Phase 1: Chain Sweep (parryable), Ground Slam, Lantern Flare (reflectable
// bolts), Shoulder Charge (stuns him when he hits a wall).
// Phase 2 (below 50%): the Hollow takes him. He is faster, his slams send
// shockwaves, his lantern fires more bolts and he chains sweep into slam.

import { approach, clamp, lerp, rand } from '../util.js';
import { drawGrull } from '../gfx/sprites.js';
import { Enemy } from './enemies.js';

const ATTACKS = {
  sweep: { windup: 0.7 },
  slam: { windup: 0.5 },
  lantern: { windup: 0.85 },
  charge: { windup: 0.65 },
};

export class Grull extends Enemy {
  constructor(g, x, y) {
    super(g, x, y, 'grull');
    this.boss = true;
    this.name = 'WARDEN GRULL';
    this.title = 'Keeper of the Ashen Cells';
    this.phase = 1;
    this.state = 'dormant';
    this.cool = 1;
    this.facing = -1;
    this.ballLocal = { x: 22, y: -8 };
    this.lanternGlow = 0.4;
    this.history = [];
    this.barked = {};
    this.comboNext = null;
    this.keyTaken = false;
  }

  get spd() { return this.phase === 2 ? 1.35 : 1; }
  get tele() { return this.state.endsWith('_w'); }

  activate(arena) {
    this.arena = arena;
    this.setState('idle');
    this.cool = 0.9;
  }

  hurtbox() { return { x: this.x - 13, y: this.y - 46, w: 26, h: 46 }; }

  takeHit(h) {
    if (this.state === 'dormant' || this.state === 'transform' || this.state === 'dying' || this.state === 'dead') return 'immune';
    const vulnerable = this.state === 'stunned' || this.state === 'stagger';
    const res = super.takeHit({ ...h, dmg: h.dmg * (vulnerable ? 1.3 : 1) });
    const k = this.hp / this.maxHp;
    if (k <= 0.75 && !this.barked.a) { this.barked.a = true; this.g.bark('grull', 'Your king begged at the end, you know. Begged YOU.'); }
    if (k <= 0.25 && !this.barked.b && this.phase === 2) { this.barked.b = true; this.g.bark('grullHollow', 'Light... give me your LIGHT!'); }
    if (k <= 0.5 && this.phase === 1 && this.hp > 0) {
      this.setState('transform');
      this.atkBox = null;
      this.vx = 0;
      this.g.onBossPhase(this);
    }
    return res;
  }

  die() {
    this.dead = true;
    this.hp = 0;
    this.setState('dying');
    this.vx = 0;
    this.g.onBossDefeated(this);
  }

  // Bosses stay in the world after death, so the update runs in every state.
  update(dt) {
    this.px = this.x; this.py = this.y;
    this.t += dt; this.st += dt;
    if (this.flash > 0) this.flash -= dt;
    this.atkBox = null;
    if (!this.g.freezeAI || this.state === 'slam_air') this.ai(dt);
    this.vy = Math.min(this.vy + 1500 * dt, 600);
    const wasAir = !this.onGround;
    this.physics(dt);
    if (wasAir && this.onGround && this.state === 'slam_air') this.land();
  }

  physics(dt) {
    const lv = this.g.level;
    this.x += this.vx * dt;
    this.hitWallX = 0;
    if (this.arena) {
      if (this.x < this.arena.x0 + 16) { this.x = this.arena.x0 + 16; this.hitWallX = -1; }
      if (this.x > this.arena.x1 - 16) { this.x = this.arena.x1 - 16; this.hitWallX = 1; }
    }
    this.y += this.vy * dt;
    this.onGround = false;
    const ty = Math.floor(this.y / 16);
    if (lv.solid(Math.floor(this.x / 16), ty)) { this.y = ty * 16; this.vy = 0; this.onGround = true; }
  }

  choose() {
    const { dx } = this.toPlayer();
    const adx = Math.abs(dx);
    const w = adx < 80
      ? { sweep: 3, slam: 1.2, lantern: 0.5, charge: 0.4 }
      : { sweep: 0.2, slam: 1.8, lantern: 1.6, charge: 1.8 };
    const last2 = this.history.slice(-2);
    if (last2.length === 2 && last2[0] === last2[1]) w[last2[0]] = 0;
    let total = 0;
    for (const k in w) total += w[k];
    let r = Math.random() * total;
    for (const k in w) { r -= w[k]; if (r <= 0) return k; }
    return 'sweep';
  }

  begin(kind) {
    this.history.push(kind);
    if (this.history.length > 4) this.history.shift();
    this.facePlayer();
    this.setState(kind + '_w');
    if (kind === 'sweep') this.g.app.audio.sfx('chain');
  }

  ai(dt) {
    const { dx } = this.toPlayer();
    const s = this.state;
    const wind = (k) => ATTACKS[k].windup / this.spd;
    const bt = this.t * 3;
    switch (s) {
      case 'dormant':
      case 'transform':
        this.vx = approach(this.vx, 0, 800 * dt);
        this.ballLocal = { x: 22 + Math.sin(bt) * 2, y: -8 + Math.abs(Math.cos(bt)) * 2 };
        break;
      case 'idle': {
        this.ballLocal = { x: 22 + Math.sin(bt) * 3, y: -8 + Math.abs(Math.cos(bt)) * 2 };
        this.lanternGlow = approach(this.lanternGlow, 0.4, dt);
        this.facePlayer();
        if (Math.abs(dx) > 100) this.vx = approach(this.vx, this.facing * 46 * this.spd, 300 * dt);
        else this.vx = approach(this.vx, 0, 400 * dt);
        this.cool -= dt * this.spd;
        if (this.cool <= 0) {
          if (this.comboNext) { this.begin(this.comboNext); this.comboNext = null; }
          else this.begin(this.choose());
        }
        break;
      }
      // Chain Sweep.
      case 'sweep_w': {
        this.vx = approach(this.vx, 0, 600 * dt);
        const k = Math.min(1, this.st / wind('sweep'));
        this.ballLocal = { x: lerp(22, -42, k), y: lerp(-8, -56, k) };
        if (this.st >= wind('sweep')) { this.setState('sweep'); this.atkDone = false; this.g.app.audio.sfx('slash', { pitch: 0.5 }); }
        break;
      }
      case 'sweep': {
        const k = Math.min(1, this.st / 0.22);
        const a = lerp(-2.6, 0.35, k);
        this.ballLocal = { x: Math.cos(a) * 50, y: -28 + Math.sin(a) * 30 };
        this.vx = this.facing * 40;
        this.parryable = true;
        this.atkBox = { x: this.facing > 0 ? this.x : this.x - 78, y: this.y - 42, w: 78, h: 40 };
        if (this.st > 0.22) {
          this.setState('sweep_r');
          this.g.cam.shake(0.25);
          this.g.dust(this.x + this.facing * 52, this.y, 6);
        }
        break;
      }
      case 'sweep_r':
        this.vx = approach(this.vx, 0, 500 * dt);
        this.ballLocal = { x: lerp(52, 24, Math.min(1, this.st / 0.6)), y: -6 };
        if (this.st > 0.6 / this.spd) {
          this.setState('idle');
          this.cool = 0.7;
          if (this.phase === 2 && Math.random() < 0.5) { this.comboNext = 'slam'; this.cool = 0.05; }
        }
        break;
      // Ground Slam.
      case 'slam_w':
        this.vx = approach(this.vx, 0, 800 * dt);
        this.ballLocal = { x: 6, y: lerp(-8, -62, Math.min(1, this.st / wind('slam'))) };
        if (this.st >= wind('slam')) {
          const p = this.g.player;
          const tx = clamp(p.x, this.arena.x0 + 30, this.arena.x1 - 30);
          const air = 0.7;
          this.vy = -(1500 * air) / 2;
          this.vx = (tx - this.x) / air;
          this.slamX = tx;
          this.setState('slam_air');
          this.g.app.audio.sfx('whoosh');
        }
        break;
      case 'slam_air':
        this.ballLocal = { x: 6, y: -62 };
        if (Math.abs(this.x - this.slamX) < 4) this.vx = 0;
        break;
      case 'slam_land':
        this.ballLocal = { x: 20, y: -4 };
        this.parryable = false;
        this.atkBox = { x: this.x - 44, y: this.y - 26, w: 88, h: 26 };
        if (this.st > 0.12) this.setState('slam_r');
        break;
      case 'slam_r':
        this.vx = 0;
        if (this.st > 0.75 / this.spd) { this.setState('idle'); this.cool = 0.6; }
        break;
      // Lantern Flare.
      case 'lantern_w':
        this.vx = approach(this.vx, 0, 700 * dt);
        this.lanternGlow = Math.min(1, this.st / wind('lantern'));
        if (Math.random() < 0.6) this.g.particles.spawn({ x: this.lanternPos().x + rand(-6, 6), y: this.lanternPos().y + rand(-6, 6), vx: 0, vy: -30, color: this.phase === 2 ? '#e86bff' : '#ffb46a', size: 2, life: 0.4, add: true });
        if (this.st >= wind('lantern')) this.fireLantern();
        break;
      case 'lantern':
        if (this.st > 0.15) this.setState('lantern_r');
        break;
      case 'lantern_r':
        this.lanternGlow = approach(this.lanternGlow, 0.4, dt * 2);
        if (this.st > 0.55 / this.spd) { this.setState('idle'); this.cool = 0.55; }
        break;
      // Shoulder Charge.
      case 'charge_w':
        this.vx = approach(this.vx, 0, 800 * dt);
        this.ballLocal = { x: -30, y: -6 };
        if (Math.random() < 0.5) this.g.dust(this.x - this.facing * 10, this.y, 1);
        if (this.st >= wind('charge')) { this.setState('charge'); this.atkDone = false; this.g.app.audio.sfx('roar'); }
        break;
      case 'charge':
        this.vx = this.facing * 265 * (this.phase === 2 ? 1.2 : 1);
        this.ballLocal = { x: -34, y: -4 };
        this.parryable = false;
        this.atkBox = { x: this.x - 16 + this.facing * 4, y: this.y - 40, w: 32, h: 38 };
        if (Math.random() < 0.6) this.g.dust(this.x - this.facing * 12, this.y, 1);
        if (this.hitWallX || this.st > 1.8) {
          this.vx = 0;
          this.setState('stunned');
          this.g.cam.shake(0.7);
          this.g.app.audio.sfx('slam');
          this.g.particles.burst(this.x + this.facing * 16, this.y - 30, { n: 22, colors: ['#5a6578', '#8a8f9c', '#3b4458'], speed: [60, 180], grav: 500, size: 3, life: [0.4, 0.9] });
          if (this.phase === 2) this.g.rockfall(3);
        }
        break;
      case 'stunned':
        this.vx = approach(this.vx, 0, 600 * dt);
        if (this.st > 1.5) { this.setState('idle'); this.cool = 0.4; }
        break;
      case 'stagger':
        this.vx = approach(this.vx, 0, 600 * dt);
        if (this.st > 1.1) { this.setState('idle'); this.cool = 0.35; }
        break;
      case 'dying':
        this.vx = 0;
        if (Math.random() < 0.4) this.g.particles.spawn({ x: this.x + rand(-14, 14), y: this.y - rand(4, 40), vx: rand(-10, 10), vy: rand(-50, -20), color: Math.random() < 0.5 ? '#d23cff' : '#ff8a3d', size: 2, life: 0.8, add: true });
        break;
    }
  }

  lanternPos() {
    const up = this.state === 'lantern_w' || this.state === 'lantern';
    return { x: this.x - this.facing * 18, y: this.y - (up ? 54 : 18) };
  }

  fireLantern() {
    const lp = this.lanternPos();
    const p = this.g.player;
    const base = Math.atan2(p.cy - lp.y, p.x - lp.x);
    const n = this.phase === 2 ? 5 : 3;
    const spread = this.phase === 2 ? 0.22 : 0.26;
    for (let i = 0; i < n; i++) {
      const a = base + (i - (n - 1) / 2) * spread;
      const sp = this.phase === 2 ? 170 : 150;
      this.g.projectiles.fire({ kind: 'bolt', x: lp.x, y: lp.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, owner: 'enemy', src: this, life: 4, hollow: this.phase === 2 });
    }
    this.g.app.audio.sfx('bolt');
    this.lanternGlow = 1;
    this.setState('lantern');
  }

  land() {
    this.vx = 0;
    this.setState('slam_land');
    this.atkDone = false;
    this.g.cam.shake(0.8);
    this.g.app.audio.sfx('slam');
    this.g.dust(this.x - 20, this.y, 8);
    this.g.dust(this.x + 20, this.y, 8);
    this.g.particles.burst(this.x, this.y - 2, { n: 24, colors: ['#5a6578', '#8a8f9c', '#c9cdd6'], speed: [80, 220], angle: -Math.PI / 2, spread: 2.6, grav: 700, size: 2, life: [0.3, 0.7] });
    if (this.phase === 2) {
      for (const dir of [-1, 1]) this.g.projectiles.fire({ kind: 'wave', x: this.x + dir * 30, y: this.y - 1, vx: dir * 175, vy: 0, owner: 'enemy', src: this, life: 3, reflectable: false });
    }
  }

  onParried() {
    if (this.state !== 'sweep') return;
    this.setState('stagger');
    this.vx = -this.facing * 60;
    this.g.cam.shake(0.3);
  }

  draw(ctx, sx, sy) { drawGrull(ctx, sx, sy, this); }

  lights(cam) {
    const lp = this.lanternPos();
    const col = this.phase === 2 ? '220,80,255' : '255,160,80';
    const L = [{ x: lp.x - cam.x, y: lp.y - cam.y, r: 60 + this.lanternGlow * 70, i: 0.9, color: col }];
    if (this.phase === 2) L.push({ x: this.x - cam.x, y: this.y - 40 - cam.y, r: 34, i: 0.6, color: '210,60,255' });
    return L;
  }
}
