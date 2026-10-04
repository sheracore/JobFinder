// Kael Ashborne: movement, combat and the player state machine.
//
// States: sleep, idle, run, jump, fall, wall, dash, parry, burst, hurt, dead.
// Attacks are tracked separately (this.atk) and may overlap movement states.

import { COMBAT, PHYS } from '../config.js';
import { moveBody, touchingWall } from '../systems/physics.js';
import { approach, sign } from '../util.js';

const NOINPUT = { down: () => false, hit: () => false, axisX: () => 0 };

export class Player {
  constructor(g, x, y) {
    this.g = g;
    this.x = x; this.y = y; this.px = x; this.py = y;
    this.w = 10; this.h = 22;
    this.vx = 0; this.vy = 0;
    this.facing = 1;
    this.state = 'idle'; this.st = 0;
    this.onGround = false;
    this.coyote = 0; this.jumpBuf = 0; this.airJumps = 0; this.airDash = true; this.jumping = false;
    this.dashCD = 0; this.dashT = 0; this.dashJump = false;
    this.inv = 0; this.flash = 0;
    this.atk = null; this.atkBuf = 0; this.combo = 0; this.comboT = 0;
    this.parryT = 0; this.parryHit = false; this.counterT = 0;
    this.charge = 0;
    this.anim = 0;
    this.trail = [];
    this.safe = { x, y };
    this.scriptMove = null;
    this.hasBlade = true;
    this.burstFired = false;
    this.refreshStats(true);
  }

  get ab() { return this.g.save.abilities; }

  refreshStats(full) {
    const u = this.g.save.upgrades;
    this.maxHp = 5 + u.hp;
    this.emberMax = 100 + 25 * u.ember;
    this.dmgMult = 1 + 0.2 * u.dmg;
    if (full) { this.hp = this.maxHp; this.ember = 0; }
    this.hp = Math.min(this.hp, this.maxHp);
  }

  hurtbox() { return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h }; }
  get cx() { return this.x; }
  get cy() { return this.y - this.h / 2; }

  setState(s) { if (this.state !== s) { this.state = s; this.st = 0; } }
  parrying() { return this.state === 'parry' && this.parryT > 0; }
  get dead() { return this.state === 'dead'; }

  update(dt) {
    const g = this.g;
    const inp = g.controls ? g.input : NOINPUT;
    this.px = this.x; this.py = this.y;
    this.anim += dt; this.st += dt;
    for (const k of ['inv', 'flash', 'dashCD', 'coyote', 'jumpBuf', 'atkBuf', 'comboT', 'counterT', 'parryT']) {
      if (this[k] > 0) this[k] = Math.max(0, this[k] - dt);
    }
    if (this.trail.length && (this.state !== 'dash' || this.trail.length > 6)) this.trail.shift();

    if (this.state === 'sleep' || this.state === 'kneel') {
      this.vy = Math.min(this.vy + PHYS.gravity * dt, PHYS.maxFall);
      moveBody(this, g.level, dt);
      return;
    }
    if (this.state === 'dead') {
      this.vx = approach(this.vx, 0, 500 * dt);
      this.vy = Math.min(this.vy + PHYS.gravity * dt, PHYS.maxFall);
      moveBody(this, g.level, dt);
      return;
    }
    if (this.state === 'hurt') {
      this.vy = Math.min(this.vy + PHYS.gravity * dt, PHYS.maxFall);
      moveBody(this, g.level, dt);
      if (this.st > 0.24) this.setState(this.onGround ? 'idle' : 'fall');
      this.checkHazards();
      return;
    }

    let ax = inp.axisX();
    if (this.scriptMove) {
      const d = this.scriptMove.x - this.x;
      if (Math.abs(d) < 3) { this.scriptMove = null; this.vx = 0; ax = 0; }
      else ax = sign(d);
    }
    const up = inp.down('up'), dn = inp.down('down');
    if (inp.hit('jump')) this.jumpBuf = PHYS.jumpBuffer;
    if (inp.hit('attack')) this.atkBuf = 0.16;

    if (this.onGround) {
      this.coyote = PHYS.coyote;
      this.airJumps = this.ab.doubleJump ? 1 : 0;
      this.airDash = true;
      this.dashJump = false;
    }

    // ---- locked states -------------------------------------------------
    if (this.state === 'dash') {
      this.dashT -= dt;
      this.vx = this.facing * PHYS.dashSpeed;
      this.vy = 0;
      this.trail.push({ x: this.x, y: this.y, f: this.facing });
      if (this.jumpBuf > 0 && this.coyote > 0) {
        this.doJump();
        this.dashJump = true;
        this.vx = this.facing * PHYS.dashJumpSpeed;
        this.setState('jump');
      } else if (this.dashT <= 0) {
        this.vx = this.facing * PHYS.run;
        this.setState(this.onGround ? 'run' : 'fall');
      }
      moveBody(this, g.level, dt);
      this.checkHazards();
      return;
    }
    if (this.state === 'burst') {
      this.vx = approach(this.vx, 0, 900 * dt);
      this.vy = this.onGround ? this.vy : Math.min(this.vy + 200 * dt, 40);
      if (this.st >= 0.2 && !this.burstFired) { this.burstFired = true; g.playerBurst(); }
      if (this.st >= 0.42) this.setState(this.onGround ? 'idle' : 'fall');
      moveBody(this, g.level, dt);
      return;
    }
    if (this.state === 'parry') {
      this.vx = approach(this.vx, 0, 1300 * dt);
      this.vy = Math.min(this.vy + PHYS.gravity * 0.6 * dt, PHYS.maxFall);
      moveBody(this, g.level, dt);
      // A successful parry can be cancelled straight into a counter-attack.
      const done = this.st >= 0.32 || (this.parryHit && this.st >= 0.08 && (this.atkBuf > 0 || inp.hit('dash')));
      if (done) { this.setState(this.onGround ? 'idle' : 'fall'); this.parryT = 0; }
      this.checkHazards();
      return;
    }

    // ---- free movement -------------------------------------------------
    const target = ax * PHYS.run;
    const groundAttack = this.atk && this.onGround && this.atk.kind !== 'down';
    if (this.wallLock > 0) {
      this.wallLock -= dt;
    } else if (!this.onGround && Math.abs(this.vx) > PHYS.run && sign(ax) !== -sign(this.vx)) {
      // Dash-jump momentum bleeds off slowly unless the player steers against it.
      this.vx = approach(this.vx, target, (this.dashJump ? 90 : 260) * dt);
    } else {
      const accel = this.onGround ? PHYS.accelGround : PHYS.accelAir;
      this.vx = approach(this.vx, groundAttack ? target * 0.3 : target, accel * dt);
    }
    if (ax !== 0 && !this.atk && !(this.wallLock > 0)) this.facing = ax;

    // Wall slide (unlockable).
    const wasWall = this.state === 'wall';
    let onWall = false;
    if (this.ab.wallJump && !this.onGround && this.vy > 0 && ax !== 0 && touchingWall(this, g.level, ax)) onWall = true;

    // Jumping.
    if (this.jumpBuf > 0 && !this.atkLockJump()) {
      if (this.coyote > 0) {
        this.doJump();
      } else if (onWall) {
        this.vy = -PHYS.wallJumpY;
        this.vx = -ax * PHYS.wallJumpX;
        this.facing = -ax;
        this.wallLock = 0.14;
        this.jumpBuf = 0;
        this.jumping = true;
        onWall = false;
        g.app.audio.sfx('jump');
        g.dust(this.x + ax * 5, this.y - 8, 4);
      } else if (this.airJumps > 0) {
        this.airJumps--;
        this.doJump();
        g.particles.burst(this.x, this.y, { n: 8, colors: ['#ffd08a', '#ff8a3d'], speed: [30, 80], angle: Math.PI / 2, spread: 2, life: [0.2, 0.4], add: true });
      }
    }
    if (this.jumping && !inp.down('jump') && this.vy < 0) { this.vy *= PHYS.jumpCut; this.jumping = false; }
    if (this.vy >= 0) this.jumping = false;

    // Gravity with a softer apex while jump is held.
    let grav = PHYS.gravity;
    if (this.jumping && Math.abs(this.vy) < 60) grav *= 0.55;
    this.vy = Math.min(this.vy + grav * dt, onWall ? PHYS.wallSlide : PHYS.maxFall);

    // Actions.
    const canAct = !this.atk || this.atk.t > this.atk.a1;
    if (inp.hit('dash') && this.dashCD <= 0 && canAct && (this.onGround || (this.ab.airDash && this.airDash))) {
      this.startDash(ax);
      moveBody(this, g.level, dt);
      return;
    }
    if (inp.hit('parry') && canAct) {
      this.atk = null;
      this.setState('parry');
      this.parryT = COMBAT.parryWindow;
      this.parryHit = false;
      g.app.audio.sfx('parryswing');
      moveBody(this, g.level, dt);
      return;
    }
    if (inp.hit('burst') && canAct) {
      if (this.ember >= COMBAT.burstCost) {
        this.atk = null;
        this.ember -= COMBAT.burstCost;
        this.setState('burst');
        this.burstFired = false;
        this.inv = Math.max(this.inv, 0.5);
        this.vy = Math.min(this.vy, 0);
        g.app.audio.sfx('charge');
      } else {
        g.notEnoughEmber();
      }
    }

    // Attacks, plus the charged heavy strike when unlocked.
    if (this.atk) {
      this.atk.t += dt;
      if (this.atk.t >= this.atk.dur) {
        if (this.atk.kind === 'side') this.comboT = 0.34;
        this.atk = null;
      }
    }
    if (this.ab.heavy && !this.atk && inp.down('attack') && this.state !== 'burst') {
      this.charge += dt;
      if (this.charge >= 0.6 && this.charge - dt < 0.6) { g.app.audio.sfx('charge'); g.particles.burst(this.x, this.cy, { n: 10, colors: ['#ffd08a', '#fff4dc'], speed: [20, 60], life: [0.2, 0.4], add: true }); }
    } else if (this.charge > 0 && !inp.down('attack')) {
      if (this.charge >= 0.6 && !this.atk) this.startAttack(false, false, true);
      this.charge = 0;
    }
    if (!this.atk && this.atkBuf > 0 && this.state !== 'burst') {
      this.startAttack(up, dn, false);
      this.atkBuf = 0;
    }

    moveBody(this, g.level, dt);
    if (this.landed) {
      g.app.audio.sfx('land');
      if (this.landVy > 250) g.dust(this.x, this.y, 5);
    }

    if (this.state !== 'burst' && this.state !== 'parry') {
      if (onWall && !this.onGround) {
        this.setState('wall');
        if (Math.random() < 0.3) g.particles.spawn({ x: this.x + ax * 5, y: this.y - 10, vx: 0, vy: -20, color: '#8a8f9c', size: 1, life: 0.3 });
      } else if (this.onGround) this.setState(Math.abs(this.vx) > 12 ? 'run' : 'idle');
      else this.setState(this.vy < 0 ? 'jump' : 'fall');
    }
    if (wasWall && !onWall && !this.onGround) this.setState('fall');

    this.checkHazards();
    this.trackSafe();
  }

  atkLockJump() {
    return this.atk && this.atk.t < this.atk.a1 && this.onGround;
  }

  doJump() {
    this.vy = -PHYS.jumpVel;
    this.coyote = 0;
    this.jumpBuf = 0;
    this.jumping = true;
    this.onGround = false;
    this.g.app.audio.sfx('jump');
    this.g.dust(this.x, this.y, 3);
  }

  startDash(ax) {
    if (ax) this.facing = ax;
    this.atk = null;
    this.setState('dash');
    this.dashT = PHYS.dashTime;
    this.dashCD = PHYS.dashCooldown;
    this.inv = Math.max(this.inv, PHYS.dashTime + 0.04);
    if (!this.onGround) this.airDash = false;
    this.g.app.audio.sfx('dash');
    this.g.dust(this.x - this.facing * 4, this.y, 4);
  }

  startAttack(up, dn, heavy) {
    let kind;
    if (heavy) kind = 'heavy';
    else if (dn && !this.onGround) kind = 'down';
    else if (up) kind = 'up';
    else kind = 'side';
    if (kind === 'side') this.combo = this.comboT > 0 ? (this.combo % 3) + 1 : 1;
    const third = kind === 'side' && this.combo === 3;
    const counter = this.counterT > 0;
    if (counter) this.counterT = 0;
    let dmg = COMBAT.baseDamage * this.dmgMult;
    if (third) dmg *= 1.5;
    if (heavy) dmg *= 2.6;
    if (counter) dmg *= COMBAT.counterMult;
    // The down-strike stays active longer so pogo bounces are forgiving.
    const down = kind === 'down';
    this.atk = {
      kind, combo: kind === 'side' ? this.combo : 0, third, counter,
      t: 0, a0: heavy ? 0.06 : down ? 0.02 : 0.035, a1: heavy ? 0.2 : third ? 0.16 : down ? 0.2 : 0.12,
      dur: heavy ? 0.42 : third ? 0.34 : down ? 0.26 : 0.25,
      hit: new Set(), dmg, pogoed: false,
    };
    if ((kind === 'side' || kind === 'heavy') && this.onGround) this.vx += this.facing * (heavy ? 160 : 45);
    this.g.app.audio.sfx('slash', { pitch: heavy ? 0.7 : 1 + (this.combo - 1) * 0.12 });
  }

  attackBox() {
    const a = this.atk;
    if (!a || a.t < a.a0 || a.t > a.a1) return null;
    const big = a.counter || a.kind === 'heavy' ? 1.4 : a.third ? 1.15 : 1;
    if (a.kind === 'side' || a.kind === 'heavy') {
      const w = 30 * big, h = 24 * big;
      return { x: this.facing > 0 ? this.x + 2 : this.x - 2 - w, y: this.y - this.h / 2 - h / 2 - 1, w, h };
    }
    if (a.kind === 'up') {
      const w = 28 * big, h = 32 * big;
      return { x: this.x - w / 2, y: this.y - this.h - h + 8, w, h };
    }
    const w = 24 * big, h = 28 * big;
    return { x: this.x - w / 2, y: this.y - 6, w, h };
  }

  pogo() {
    if (!this.atk || this.atk.pogoed) return;
    this.atk.pogoed = true;
    this.vy = -PHYS.pogoVel;
    this.jumping = false;
    this.airDash = true;
    this.airJumps = this.ab.doubleJump ? 1 : 0;
    this.dashCD = 0;
  }

  hurt(dmg, fromX) {
    const g = this.g;
    if (this.inv > 0 || this.dead || this.state === 'sleep') return false;
    if (g.app.debug.god) { this.flash = 0.1; this.inv = 0.4; return false; }
    this.hp -= dmg;
    this.inv = COMBAT.iframes;
    this.flash = 0.16;
    this.atk = null;
    this.charge = 0;
    const dir = sign(this.x - fromX) || -this.facing;
    this.vx = dir * 170;
    this.vy = -210;
    this.setState('hurt');
    g.onPlayerHurt();
    if (this.hp <= 0) this.die();
    return true;
  }

  die() {
    this.hp = 0;
    this.setState('dead');
    this.vx *= 0.5;
    this.g.onPlayerDeath();
  }

  checkHazards() {
    if (this.dead) return;
    const hz = this.g.level.hazardAt(this.hurtbox());
    if (hz) this.g.hazardHit(hz);
  }

  trackSafe() {
    if (!this.onGround || this.state === 'hurt' || this.atk) return;
    const lv = this.g.level;
    const TILE = 16;
    const ty = Math.floor((this.y + 2) / TILE);
    // Require solid footing under Kael and no hazard within a tile either side.
    const l = Math.floor((this.x - 8) / TILE), r = Math.floor((this.x + 8) / TILE);
    for (let tx = l; tx <= r; tx++) if (!(lv.solid(tx, ty) || lv.plat(tx, ty))) return;
    for (let tx = l - 1; tx <= r + 1; tx++) {
      const above = lv.get(tx, ty - 1), below = lv.get(tx, ty);
      if (above === 4 || above === 5 || below === 4 || below === 5) return;
    }
    this.safe = { x: this.x, y: this.y };
  }

  lights(cam) {
    const fl = Math.sin(this.anim * 13) * 3 + Math.sin(this.anim * 7.3) * 2;
    const L = [{ x: this.x - cam.x, y: this.y - 12 - cam.y, r: 66 + fl, i: 0.95, color: '255,150,70', glow: 0.8 }];
    if (this.atk && this.atk.t < this.atk.a1 + 0.05) {
      const b = this.attackBox() || { x: this.x - 10, y: this.y - 20, w: 20, h: 16 };
      L.push({ x: b.x + b.w / 2 - cam.x, y: b.y + b.h / 2 - cam.y, r: 46, i: 0.8, color: this.atk.counter ? '240,90,255' : '255,170,90' });
    }
    if (this.state === 'burst') L.push({ x: this.x - cam.x, y: this.y - 14 - cam.y, r: 90 + this.st * 200, i: 1, color: '255,170,90' });
    return L;
  }
}
