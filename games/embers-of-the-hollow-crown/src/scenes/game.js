// The playable chapter: owns the level, entities, combat resolution,
// cutscenes, dialogue, lighting and the HUD.

import { COMBAT, H, rankFor, TILE, W } from '../config.js';
import { CUTSCENES_CH1 } from '../data/cutscenes_ch1.js';
import { DIALOGUE_CH1 } from '../data/dialogue_ch1.js';
import { CH1 } from '../data/levels/ch1.js';
import { SPEAKERS } from '../data/speakers.js';
import { Archer, Crate, Husk, Shieldbearer, Wisp } from '../entities/enemies.js';
import { Grull } from '../entities/grull.js';
import { Pickups } from '../entities/pickups.js';
import { Player } from '../entities/player.js';
import { Projectiles } from '../entities/projectiles.js';
import { Door, Gate, MemoryShard, NPC, Shrine, Sign, Skiff, Tablet, Torch } from '../entities/props.js';
import { Parallax } from '../gfx/background.js';
import { drawKael, drawSlash } from '../gfx/sprites.js';
import { Camera } from '../systems/camera.js';
import { Cutscene } from '../systems/cutscene.js';
import { Dialogue } from '../systems/dialogue.js';
import { FOG } from '../systems/level.js';
import { Level } from '../systems/level.js';
import { Lighting } from '../systems/lighting.js';
import { Particles } from '../systems/particles.js';
import { writeSave } from '../systems/save.js';
import { drawBossBar, drawCombo, drawHUD } from '../ui/hud.js';
import { PauseMenu, ShopMenu, ChapterSelect } from '../ui/overlays.js';
import { font, panel, SANS, SERIF, txt, wrap } from '../ui/text.js';
import { approach, clamp, lerp, overlap, rand, sign } from '../util.js';

const ENEMY_TYPES = { husk: Husk, wisp: Wisp, shield: Shieldbearer, archer: Archer, crate: Crate };
const MARKER_ENEMY = { h: 'husk', w: 'wisp', s: 'shield', a: 'archer', c: 'crate' };

export class GameScene {
  constructor(app, opts = {}) {
    this.app = app;
    this.opts = opts;
    this.input = app.input;
    this.save = app.save;
  }

  enter() { this.build(); }

  // ---- construction --------------------------------------------------------

  build() {
    const def = (this.def = CH1);
    this.level = new Level(def);
    this.level.prerender(def.theme);
    this.bg = new Parallax('ashen');
    this.particles = new Particles();
    this.projectiles = new Projectiles(this);
    this.pickups = new Pickups(this);
    this.lighting = new Lighting();
    this.cam = new Camera();
    this.cam.shakeOn = this.app.settings.shake;
    this.dialogue = new Dialogue(this, DIALOGUE_CH1);
    this.cutscene = new Cutscene();
    this.enemies = [];
    this.actors = [];
    this.triggers = [];
    this.gates = [];
    this.shrines = {};
    this.rings = [];
    this.flashes = [];
    this.toasts = [];
    this.time = 0;
    this.stop = 0;
    this.timeScale = 1;
    this.slowT = 0;
    this.fade = { v: 0, from: 0, to: 0, t: 0, dur: 0 };
    this.combo = 0; this.comboT = 0; this.rankPulse = 0;
    this.redFlash = 0; this.whiteFlash = 0; this.whiteColor = '255,255,255';
    this.memoryFx = 0; this.memoryTarget = 0;
    this.hpFlash = 0; this.shardFlash = 0; this.emberDeny = 0;
    this.bossBar = null; this.bossChip = null;
    this.barkMsg = null; this.titleCardData = null;
    this.deathText = 0; this.hideHud = false; this.hazardBusy = false;
    this.controls = true; this.freezeAI = false;
    this.heldPresses = new Set();

    this.applyDebugJump();
    this.spawnAll();

    const cp = this.save.checkpoint && this.shrines[this.save.checkpoint];
    const start = cp ? { x: cp.x + 16, y: cp.y } : this.startPos;
    this.player = new Player(this, start.x, start.y);
    this.player.facing = 1;
    if (!this.save.flags.ch1_intro) this.player.hasBlade = false;

    this.room = this.level.roomAt(this.player.x);
    this.dark = this.room.dark;
    this.cam.snap(this.player.x, this.player.y, this.room);
    this.app.audio.music(this.musicFor());

    if (!this.save.flags.ch1_intro) this.play('intro');
    else if (this.opts.respawn) { this.fadeSet(1); this.fadeTo(0, 0.8); }
    else { this.fadeSet(1); this.fadeTo(0, 0.6); this.showTitle('CHAPTER I', def.title, 2.6); }
  }

  applyDebugJump() {
    const j = this.opts.debugJump;
    if (!j) return;
    const f = this.save.flags;
    f.ch1_intro = true;
    if (j === 'docks') this.save.checkpoint = 'ch1_s1';
    if (j === 'boss') {
      f.met_lyra = true;
      f.met_oskar = true;
      f.shrine_ch1_s1 = true;
      f.shrine_ch1_s2 = true;
      this.save.checkpoint = 'ch1_s2';
    }
  }

  addActor(a) { this.actors.push(a); return a; }

  spawnEnemy(type, x, y) {
    const e = new ENEMY_TYPES[type](this, x, y);
    this.enemies.push(e);
    return e;
  }

  spawnNPC(who, x, y) { return this.addActor(new NPC(this, x, y, who)); }

  spawnAll() {
    const lv = this.level, def = this.def, f = this.save.flags;
    let sign = 0, lore = 0, mem = 0, shrine = 0, gate = 0;
    for (const m of lv.markers) {
      const x = m.tx * TILE + 8, y = (m.ty + 1) * TILE;
      switch (m.ch) {
        case 'P': this.startPos = { x, y }; break;
        case 'D': if (!f.ch1_intro) this.door = this.addActor(new Door(this, m.tx, m.ty)); break;
        case 't': this.addActor(new Sign(this, x, y, def.signs[sign++] || '')); break;
        case 'T': this.addActor(new Tablet(this, x, y, def.lore[lore++])); break;
        case 'M': {
          const mm = def.memories[mem++];
          if (mm && !this.save.memories.includes(mm.id)) this.addActor(new MemoryShard(this, x, y, mm));
          break;
        }
        case 'S': {
          const id = def.shrines[shrine++];
          this.shrines[id] = this.addActor(new Shrine(this, x, y, id));
          break;
        }
        case 'O': this.addActor(new NPC(this, x, y, 'oskar')); break;
        case 'L':
          if (!f.met_lyra) {
            this.lyraNPC = this.spawnNPC('lyra', x, y);
            this.lyraNPC.interactable = false;
            this.triggers.push({ x0: x - 130, x1: x - 60, run: () => this.play('meetLyra') });
          }
          break;
        case 'i': this.addActor(new Torch(this, x, m.ty * TILE + 8)); break;
        case 'G': {
          const closed = gate > 0 && !f.boss_grull;
          this.gates.push(this.addActor(new Gate(this, m.tx, m.ty, closed)));
          gate++;
          break;
        }
        case 'B': if (!f.boss_grull) { this.boss = new Grull(this, x, y); this.enemies.push(this.boss); } break;
        case 'E':
          this.exitPos = { x, y };
          this.addActor(new Skiff(this, x + 50, y));
          if (f.boss_grull) this.lyraExit = this.spawnNPC('lyra', x + 14, y);
          this.triggers.push({ x0: x - 30, x1: x + 400, cond: () => f.boss_grull, run: () => this.play('ch1End') });
          break;
        default:
          if (MARKER_ENEMY[m.ch]) this.spawnEnemy(MARKER_ENEMY[m.ch], x, y);
      }
    }
    this.arenaRoom = lv.rooms.find((r) => r.arena);
    if (this.boss) {
      const A = this.arenaRoom;
      this.triggers.push({ x0: A.x0 + 40, x1: A.x1, run: () => this.play('grullIntro') });
    }
  }

  // ---- shared helpers used by entities, cutscenes and dialogue -------------

  state() {
    return { flags: this.save.flags, memories: this.chapterMemories(), currency: this.save.currency };
  }

  chapterMemories() {
    return this.def.memories.filter((m) => this.save.memories.includes(m.id)).length;
  }

  flag(name, v = true) { this.save.flags[name] = v; }
  persist() { writeSave(this.save); }
  musicFor() { return this.bossBar ? 'boss' : this.def.music; }

  play(name, arg) {
    const fn = CUTSCENES_CH1[name];
    if (!fn) { console.warn('[cutscene] missing', name); return; }
    if (this.cutscene.active && name !== 'death') return;
    this.cutscene.play(fn(this, arg));
  }

  onEvent(name) {
    if (name === 'shop') this.app.push(new ShopMenu(this.app, this));
  }

  setCheckpoint(id, persist) {
    this.save.checkpoint = id;
    this.save.chapter = 1;
    if (persist) this.persist();
  }

  rest(shrine) {
    const p = this.player;
    p.hp = p.maxHp;
    this.hpFlash = 0.6;
    if (!shrine.lit) shrine.kindle();
    this.setCheckpoint(shrine.id, true);
    this.app.audio.sfx('heal');
    this.particles.burst(p.x, p.cy, { n: 20, colors: ['#ffd08a', '#ff8a3d'], speed: [20, 80], grav: -60, life: [0.5, 1], add: true });
    this.toast('Rested. Health restored and progress saved.');
  }

  talk(npc) {
    if (npc.who === 'oskar') this.dialogue.start(this.save.flags.met_oskar ? 'oskar_greet' : 'oskar_meet');
    else if (npc.who === 'lyra' && this.save.flags.boss_grull) this.play('ch1End');
  }

  readLore(tablet) {
    if (!this.save.lore.includes(tablet.loreId)) this.save.lore.push(tablet.loreId);
    this.dialogue.start(tablet.loreId);
  }

  collectMemory(shard) {
    this.particles.burst(shard.x, shard.y - 10, { n: 40, colors: ['#fff4dc', '#ffd08a', '#ffffff'], speed: [40, 200], life: [0.4, 1], add: true });
    this.flashScreen(0.7, '255,240,210');
    this.play('memory', shard.mem);
  }

  bladeAppear() {
    const p = this.player;
    p.hasBlade = true;
    this.app.audio.sfx('burst');
    this.cam.shake(0.5);
    this.flashScreen(0.6, '255,200,140');
    this.rings.push({ x: p.x, y: p.cy, r0: 4, r1: 70, t: 0, dur: 0.6, color: '255,170,90' });
    this.particles.burst(p.x, p.cy, { n: 50, colors: ['#ffd08a', '#ff8a3d', '#fff4dc'], speed: [40, 180], life: [0.4, 1], add: true, grav: -40 });
  }

  lockArena(on) {
    const A = this.arenaRoom;
    if (on) {
      this.cam.lock = { x0: A.x0, x1: A.x1, y0: A.y0, y1: A.y1 };
      this.gates[0]?.setClosed(true);
    } else {
      this.cam.lock = null;
    }
  }

  startBoss(b) {
    b.activate({ x0: this.arenaRoom.x0 + 32, x1: this.arenaRoom.x1 - 32 });
    this.bossBar = b;
    this.bossChip = b.hp;
    this.app.audio.music('boss');
  }

  onBossPhase() { this.play('grullPhase2'); }

  onBossDefeated(b) {
    this.slowmo(0.2, 1.3);
    this.hitstop(0.15);
    this.cam.shake(1);
    this.flashScreen(0.8, '255,255,255');
    this.app.audio.sfx('roar');
    this.projectiles.clearEnemy();
    for (const e of this.enemies) if (e !== b && !e.dead) { e.dead = true; this.onEnemyKilled(e); }
    this.pickups.spawn('shard', b.x, b.y - 30, b.def.shards);
    this.play('grullDefeat');
  }

  completeChapter() {
    const s = this.save;
    s.flags.ch1_complete = true;
    s.chapter = 2;
    s.checkpoint = null;
    this.persist();
    this.app.startDream('dream_ch1', () => this.app.startChapterEnd());
  }

  respawn() {
    this.app.setScene(new GameScene(this.app, { respawn: true }));
  }

  returnToSafe() {
    const p = this.player;
    p.x = p.px = p.safe.x;
    p.y = p.py = p.safe.y;
    p.vx = 0; p.vy = 0;
    p.setState('idle');
    p.inv = Math.max(p.inv, 0.8);
  }

  toast(text) { this.toasts.push({ text, t: 0 }); }
  bark(who, text) { this.barkMsg = { who, text, t: 0, dur: 3.4 }; }
  showTitle(top, main, dur) { this.titleCardData = { top, main, t: 0, dur }; }
  flashScreen(a, color = '255,255,255') { this.whiteFlash = a; this.whiteColor = color; }
  hitstop(s) { this.stop = Math.max(this.stop, s); }
  slowmo(scale, dur) { this.timeScale = scale; this.slowT = Math.max(this.slowT, dur); }
  dust(x, y, n = 4) {
    this.particles.burst(x, y - 1, { n, colors: ['#8a8f9c', '#5d6474', '#b0b4bd'], speed: [10, 50], angle: -Math.PI / 2, spread: 2.4, life: [0.25, 0.5], grav: -20, size: 2, drag: 4 });
  }

  fadeSet(v) { this.fade = { v, from: v, to: v, t: 0, dur: 0 }; }
  fadeTo(to, dur) { this.fade = { v: this.fade.v, from: this.fade.v, to, t: 0, dur }; }
  fadeDone() { return this.fade.t >= this.fade.dur; }

  notEnoughEmber() {
    this.emberDeny = 0.4;
    this.app.audio.sfx('deny');
  }

  rockfall(n) {
    const A = this.arenaRoom;
    for (let i = 0; i < n; i++) {
      this.projectiles.fire({ kind: 'rock', x: rand(A.x0 + 48, A.x1 - 48), y: A.y0 + 40 - i * 30, vx: 0, vy: 30, grav: 500, owner: 'enemy', life: 4 });
    }
  }

  // ---- combat events ---------------------------------------------------------

  onPlayerHit(e, a, hx = e.x, hy = e.cy) {
    const heavy = a.third || a.counter || a.kind === 'heavy' || a.kind === 'proj';
    this.hitstop(heavy ? 0.085 : 0.045);
    this.cam.shake(heavy ? 0.3 : 0.14);
    this.app.audio.sfx(heavy ? 'heavyhit' : 'hit');
    const dir = sign(e.x - this.player.x) || this.player.facing;
    this.particles.burst(hx, hy, { n: heavy ? 16 : 9, colors: ['#fff4dc', '#ffd08a', '#ff8a3d'], speed: [90, 240], angle: dir > 0 ? 0 : Math.PI, spread: 1.8, life: [0.1, 0.28], line: true, add: true });
    this.particles.burst(hx, hy, { n: 6, colors: e.passive ? ['#5a4334', '#7a5c44'] : ['#5b1673', '#2a0a36', '#7a1f2b'], speed: [20, 80], life: [0.3, 0.6], size: 3, drag: 3, grav: e.passive ? 400 : 0 });
    this.rings.push({ x: hx, y: hy, r0: 2, r1: heavy ? 22 : 14, t: 0, dur: 0.18, color: a.counter ? '255,120,240' : '255,220,170' });
    if (e.passive) return;
    this.combo++;
    this.comboT = 2.6;
    this.rankPulse = 0.2;
    const p = this.player;
    p.ember = Math.min(p.emberMax, p.ember + COMBAT.emberPerHit * rankFor(this.combo).mult);
    if (a.kind === 'side' && p.onGround) p.vx -= p.facing * 45;
  }

  onBlocked(e, hx, hy) {
    const p = this.player;
    this.hitstop(0.04);
    this.cam.shake(0.12);
    this.app.audio.sfx('clang');
    this.particles.burst(hx, hy, { n: 10, colors: ['#e8eef8', '#9fc0ff', '#ffffff'], speed: [80, 200], life: [0.1, 0.25], line: true, add: true });
    p.vx = -p.facing * 180;
  }

  onParry(pt, e) {
    const p = this.player;
    p.parryHit = true;
    p.counterT = COMBAT.counterWindow;
    p.inv = Math.max(p.inv, 0.35);
    p.ember = Math.min(p.emberMax, p.ember + COMBAT.emberPerParry);
    this.slowmo(0.25, 0.32);
    this.hitstop(0.06);
    this.cam.shake(0.25);
    this.flashScreen(0.3, '255,245,230');
    this.app.audio.sfx('parry');
    const x = pt.x ?? (e ? (e.x + p.x) / 2 : p.x), y = pt.y ?? p.cy;
    this.rings.push({ x, y, r0: 4, r1: 36, t: 0, dur: 0.35, color: '255,240,220' });
    this.particles.burst(x, y, { n: 18, colors: ['#ffffff', '#fff4dc', '#9fc0ff'], speed: [100, 260], life: [0.1, 0.3], line: true, add: true });
    this.combo++;
    this.comboT = 2.6;
    this.rankPulse = 0.25;
  }

  playerBurst() {
    const p = this.player, R = COMBAT.burstRadius;
    this.app.audio.sfx('burst');
    this.cam.shake(0.6);
    this.hitstop(0.07);
    this.flashScreen(0.45, '255,200,140');
    this.rings.push({ x: p.x, y: p.cy, r0: 6, r1: R, t: 0, dur: 0.35, color: '255,170,90' });
    this.rings.push({ x: p.x, y: p.cy, r0: 2, r1: R * 0.6, t: 0, dur: 0.25, color: '255,240,210' });
    this.particles.burst(p.x, p.cy, { n: 60, colors: ['#ffd08a', '#ff8a3d', '#fff4dc', '#c2410c'], speed: [80, 260], life: [0.3, 0.8], add: true });
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - p.x, e.cy - p.cy);
      if (d > R + e.w / 2) continue;
      const res = e.takeHit({ dmg: COMBAT.burstDamage * p.dmgMult, dir: sign(e.x - p.x) || 1, kb: 320, kind: 'burst' });
      if (res === 'hit' && !e.passive) { this.combo++; this.comboT = 2.6; }
    }
    this.projectiles.cut({ x: p.x - R, y: p.cy - R, w: R * 2, h: R * 2 });
  }

  explode(x, y, r) {
    this.app.audio.sfx('explode');
    this.cam.shake(0.35);
    this.rings.push({ x, y, r0: 3, r1: r + 6, t: 0, dur: 0.3, color: '210,60,255' });
    this.particles.burst(x, y, { n: 26, colors: ['#d23cff', '#f3a6ff', '#2a0a36'], speed: [40, 200], life: [0.2, 0.6], add: true, size: 3 });
    this.flashes.push({ x, y, r: 90, t: 0.25, color: '210,60,255' });
    const p = this.player;
    if (Math.hypot(p.x - x, p.cy - y) < r + 8 && !p.parrying()) p.hurt(1, x);
  }

  onEnemyKilled(e, silent) {
    if (e.boss) return;
    if (!silent || e.type === 'wisp') {
      this.pickups.spawn('shard', e.x, e.cy, e.def.shards);
      if (Math.random() < e.def.heal) this.pickups.spawn('heal', e.x, e.cy, 1);
    }
    if (e.type === 'crate') {
      this.app.audio.sfx('crate');
      this.particles.burst(e.x, e.cy, { n: 16, colors: ['#5a4334', '#7a5c44', '#3e2e24'], speed: [60, 200], grav: 600, size: 3, life: [0.4, 0.9] });
      return;
    }
    this.app.audio.sfx('explode');
    this.particles.burst(e.x, e.cy, { n: 22, colors: ['#2a0a36', '#5b1673', '#3a3346'], speed: [30, 140], life: [0.4, 0.9], size: 3, drag: 2, grav: -30 });
    this.particles.burst(e.x, e.cy, { n: 12, colors: ['#ffd08a', '#ff8a3d'], speed: [40, 120], life: [0.3, 0.7], add: true, grav: -80 });
    this.flashes.push({ x: e.x, y: e.cy, r: 70, t: 0.25, color: '255,160,90' });
  }

  onPlayerHurt() {
    this.combo = 0;
    this.comboT = 0;
    this.redFlash = 0.5;
    this.hitstop(0.11);
    this.cam.shake(0.55);
    this.app.audio.sfx('hurt');
    const p = this.player;
    this.particles.burst(p.x, p.cy, { n: 16, colors: ['#ff4a4a', '#ffd08a', '#7a1f2b'], speed: [60, 180], life: [0.2, 0.5], line: true });
  }

  onPlayerDeath() {
    this.save.deaths++;
    this.bossBar = null;
    this.app.audio.sfx('death');
    this.app.audio.music(null);
    this.slowmo(0.3, 1.4);
    const p = this.player;
    this.particles.burst(p.x, p.cy, { n: 60, colors: ['#ff8a3d', '#ffd08a', '#c2410c'], speed: [30, 160], grav: -40, life: [0.6, 1.6], add: true });
    this.cutscene.gen = null;
    this.dialogue.active = false;
    this.play('death');
  }

  hazardHit(kind) {
    if (this.hazardBusy || this.cutscene.active) return;
    const p = this.player;
    this.hazardBusy = true;
    this.app.audio.sfx('hurt');
    this.redFlash = 0.5;
    this.combo = 0;
    this.cam.shake(0.4);
    if (kind === 'fog' || kind === 'pit') this.particles.burst(p.x, p.y, { n: 20, colors: ['#2a0a36', '#d23cff', '#07060c'], speed: [30, 120], angle: -Math.PI / 2, spread: 1.6, life: [0.3, 0.8], size: 3 });
    else this.particles.burst(p.x, p.y, { n: 14, colors: ['#ff4a4a', '#c3c7d1'], speed: [60, 160], angle: -Math.PI / 2, spread: 2, life: [0.2, 0.4], line: true });
    if (!this.app.debug.god) p.hp -= 1;
    if (p.hp <= 0) { this.hazardBusy = false; p.die(); return; }
    p.setState('hurt');
    p.vx = 0; p.vy = -120;
    this.play('hazard');
  }

  // ---- update -----------------------------------------------------------------

  update(dt) {
    const inp = this.input, app = this.app;
    this.time += dt;

    if (inp.hit('pause') && !this.dialogue.active && !this.cutscene.active && !this.player.dead) {
      inp.consume('pause', 'back');
      app.push(new PauseMenu(app, this));
      return;
    }
    if (app.debug.on) this.debugKeys(inp);

    // Screen-level timers run in real time.
    const f = this.fade;
    if (f.t < f.dur) { f.t = Math.min(f.dur, f.t + dt); f.v = lerp(f.from, f.to, f.t / f.dur); } else f.v = f.to;
    for (const k of ['redFlash', 'hpFlash', 'shardFlash', 'emberDeny', 'rankPulse']) if (this[k] > 0) this[k] = Math.max(0, this[k] - dt);
    this.whiteFlash = Math.max(0, this.whiteFlash - dt * 2.2);
    this.memoryFx = approach(this.memoryFx, this.memoryTarget, dt * 1.2);
    if (this.titleCardData) { this.titleCardData.t += dt; if (this.titleCardData.t > this.titleCardData.dur) this.titleCardData = null; }
    if (this.barkMsg) { this.barkMsg.t += dt; if (this.barkMsg.t > this.barkMsg.dur) this.barkMsg = null; }
    for (const t of this.toasts) t.t += dt;
    this.toasts = this.toasts.filter((t) => t.t < 3);
    if (this.deathText) this.deathText = Math.min(1, this.deathText + dt);

    this.dialogue.update(dt, inp);
    this.cutscene.update(dt);
    this.controls = !this.dialogue.active && !this.cutscene.active;
    this.freezeAI = this.cutscene.active || this.dialogue.active;

    // Presses made during hit-stop are replayed once the world resumes.
    if (this.stop > 0) {
      this.stop -= dt;
      this.cam.tickShake(dt);
      for (const a of inp.pressed) this.heldPresses.add(a);
      return;
    }
    for (const a of this.heldPresses) inp.pressed.add(a), inp.held.add(a);
    this.heldPresses.clear();
    if (this.slowT > 0) { this.slowT -= dt; if (this.slowT <= 0) this.timeScale = 1; }
    const w = dt * this.timeScale;

    this.player.update(w);
    for (const e of this.enemies) e.update(w);
    this.projectiles.update(w);
    this.resolveCombat();
    this.enemies = this.enemies.filter((e) => !e.dead || e.boss);
    this.pickups.update(w);
    for (const a of this.actors) a.update(w);
    this.actors = this.actors.filter((a) => !a.removed);
    this.particles.update(w);
    for (const r of this.rings) r.t += w;
    this.rings = this.rings.filter((r) => r.t < r.dur);
    for (const fl of this.flashes) fl.t -= w;
    this.flashes = this.flashes.filter((fl) => fl.t > 0);

    if (this.comboT > 0) { this.comboT -= w; if (this.comboT <= 0) this.combo = 0; }
    if (this.bossBar) this.bossChip = approach(this.bossChip ?? this.bossBar.hp, this.bossBar.hp, 60 * w);

    this.checkTriggers();
    this.checkInteract(inp);
    this.ambientFog(w);

    this.room = this.level.roomAt(this.player.x);
    this.dark = lerp(this.dark, this.room.dark, 1 - Math.exp(-dt * 2.5));
    this.cam.update(w, this.player, this.room);
    this.save.playtime += dt;
  }

  resolveCombat() {
    const p = this.player;
    const box = p.attackBox();
    if (box) {
      const a = p.atk;
      for (const e of this.enemies) {
        if (e.dead || a.hit.has(e) || !overlap(box, e.hurtbox())) continue;
        a.hit.add(e);
        const dir = a.kind === 'side' || a.kind === 'heavy' ? p.facing : sign(e.x - p.x) || p.facing;
        const res = e.takeHit({ dmg: a.dmg, dir, kb: a.third || a.counter || a.kind === 'heavy' ? 230 : 130, kind: a.kind, counter: a.counter });
        const hx = clamp(e.x, box.x, box.x + box.w), hy = clamp(e.cy, box.y, box.y + box.h);
        if (res === 'hit') this.onPlayerHit(e, a, hx, hy);
        else if (res === 'blocked') this.onBlocked(e, hx, hy);
        if (a.kind === 'down' && res !== 'immune') p.pogo();
      }
      if (this.projectiles.cut(box)) {
        this.app.audio.sfx('clang');
        if (a.kind === 'down') p.pogo();
      }
      if (a.kind === 'down' && !a.pogoed) {
        const s = this.level.spikeIn(box);
        if (s) {
          p.pogo();
          this.app.audio.sfx('clang');
          this.particles.burst(p.x, box.y + box.h - 6, { n: 8, colors: ['#ffffff', '#c3c7d1'], speed: [60, 160], angle: -Math.PI / 2, spread: 2, life: [0.1, 0.25], line: true });
        }
      }
    }
    for (const e of this.enemies) {
      if (!e.atkBox || e.atkDone || (e.dead && !e.boss)) continue;
      if (!overlap(e.atkBox, p.hurtbox())) continue;
      if (p.parrying() && e.parryable !== false) {
        e.atkDone = true;
        this.onParry({ x: (e.atkBox.x + e.atkBox.w / 2 + p.x) / 2, y: p.cy }, e);
        e.onParried?.();
      } else if (p.hurt(1, e.x)) {
        e.atkDone = true;
      }
    }
  }

  checkTriggers() {
    if (this.cutscene.active || this.dialogue.active || this.player.dead) return;
    const px = this.player.x;
    for (const t of this.triggers) {
      if (t.done || px < t.x0 || px > t.x1) continue;
      if (t.cond && !t.cond()) continue;
      t.done = true;
      t.run();
      return;
    }
  }

  checkInteract(inp) {
    this.focus = null;
    if (!this.controls || this.player.dead) return;
    const p = this.player;
    let best = null, bd = 1e9;
    for (const a of this.actors) {
      if (!a.interactable || a.removed) continue;
      const dx = Math.abs(p.x - a.x);
      if (dx < 24 && Math.abs(p.y - a.y) < 30 && dx < bd) { best = a; bd = dx; }
    }
    this.focus = best;
    if (best && inp.hit('interact')) {
      inp.consume('interact');
      best.interact();
    }
  }

  ambientFog() {
    if (Math.random() > 0.35) return;
    const x = this.cam.x + rand(0, W), y = this.cam.y + rand(0, H);
    const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
    if (this.level.get(tx, ty) === FOG && this.level.get(tx, ty - 1) !== FOG) {
      this.particles.spawn({ x, y: ty * TILE + 4, vx: rand(-6, 6), vy: rand(-25, -8), color: Math.random() < 0.5 ? '#d23cff' : '#3a1446', size: 2, life: rand(0.6, 1.4), add: Math.random() < 0.5 });
    }
  }

  debugKeys(inp) {
    const app = this.app, keys = app.input;
    const k = (code) => keys.rawPressed.has(code);
    if (k('KeyH')) app.debug.boxes = !app.debug.boxes;
    if (k('KeyG')) { app.debug.god = !app.debug.god; this.toast(`God mode ${app.debug.god ? 'ON' : 'OFF'}`); }
    if (k('KeyU')) {
      Object.keys(this.save.abilities).forEach((a) => (this.save.abilities[a] = true));
      this.toast('All abilities unlocked');
      this.app.audio.sfx('unlock');
    }
    if (k('KeyM')) { this.save.currency += 100; this.toast('+100 shards'); }
    if (k('KeyF')) this.player.ember = this.player.emberMax;
    if (k('KeyX')) for (const e of this.enemies) if (!e.dead && !e.boss) { e.dead = true; this.onEnemyKilled(e); }
    if (k('KeyN')) {
      const i = this.level.rooms.indexOf(this.room);
      const next = this.level.rooms[i + 1];
      if (next) { this.player.x = this.player.px = next.x0 + 24; this.player.y = this.player.py = next.y0 + 40; this.player.vy = 0; }
    }
    if (k('KeyB')) app.startGame({ debugJump: 'boss' });
    if (k('KeyC')) app.push(new ChapterSelect(app));
    for (let n = 2; n <= 5; n++) if (k('Digit' + n)) this.toast(`Chapter ${['', '', 'II', 'III', 'IV', 'V'][n]} is not yet forged in this build`);
    if (k('Digit1')) app.startGame({ fresh: true });
  }

  // ---- render -------------------------------------------------------------------

  render(ctx, alpha) {
    const a = this.stop > 0 ? 1 : alpha;
    const cam = this.cam.view(a);
    this.view = cam;
    const ip = (e) => [Math.round(lerp(e.px, e.x, a) - cam.x), Math.round(lerp(e.py, e.y, a) - cam.y)];

    this.bg.draw(ctx, cam.x, cam.y, this.time);
    this.drawTiles(ctx, cam);

    for (const act of this.actors) { const [sx, sy] = ip(act); act.draw(ctx, sx, sy); }
    this.particles.draw(ctx, cam.x, cam.y, false);

    for (const e of this.enemies) {
      if (e.dead && !e.boss) continue;
      const [sx, sy] = ip(e);
      if (e.tele) this.drawTelegraph(ctx, sx, sy - e.h / 2, e);
      e.draw(ctx, sx, sy);
    }
    if (this.boss?.state === 'slam_air') this.drawSlamMarker(ctx, cam);
    for (const e of this.enemies) if (e.state === 'aim' && e.aimAt) this.drawAimLine(ctx, cam, e);

    const p = this.player;
    const [psx, psy] = ip(p);
    for (let i = 0; i < p.trail.length; i++) {
      const tr = p.trail[i];
      ctx.globalAlpha = 0.12 + (i / p.trail.length) * 0.25;
      drawKael(ctx, Math.round(tr.x - cam.x), Math.round(tr.y - cam.y), { ...p, facing: tr.f, atk: null, flash: 1 });
    }
    ctx.globalAlpha = 1;
    const blink = p.inv > 0 && p.state !== 'dash' && p.state !== 'burst' && !p.parryHit && Math.floor(this.time * 20) % 2 === 0;
    if (!blink) drawKael(ctx, psx, psy, p);
    drawSlash(ctx, psx, psy, p);
    if (p.state === 'parry' && p.st < 0.1) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(200,220,255,0.35)';
      ctx.fillRect(psx + (p.facing > 0 ? 4 : -9), psy - 26, 5, 22);
      ctx.globalCompositeOperation = 'source-over';
    }

    this.pickups.draw(ctx, cam, a);
    this.projectiles.draw(ctx, cam, a);
    this.particles.draw(ctx, cam.x, cam.y, true);
    this.drawFog(ctx, cam);
    this.drawRings(ctx, cam);

    // Lighting.
    const lights = [...p.lights(cam)];
    for (const act of this.actors) lights.push(...act.lights(cam));
    for (const e of this.enemies) if (!e.dead || e.boss) lights.push(...e.lights(cam));
    lights.push(...this.projectiles.lights(cam), ...this.pickups.lights(cam));
    for (const fl of this.flashes) lights.push({ x: fl.x - cam.x, y: fl.y - cam.y, r: fl.r, i: Math.min(1, fl.t * 4), color: fl.color });
    this.lighting.render(ctx, lights, this.dark);

    this.bg.drawFront(ctx, cam.x, cam.y, 1 / 60);
    this.drawScreenFx(ctx);
  }

  drawTiles(ctx, cam) {
    const c = this.level.canvas;
    const sx = clamp(cam.x, 0, c.width - W), sy = clamp(cam.y, 0, c.height - H);
    ctx.drawImage(c, sx, sy, W, H, sx - cam.x, sy - cam.y, W, H);
  }

  drawFog(ctx, cam) {
    const lv = this.level;
    const tx0 = Math.floor(cam.x / TILE), ty0 = Math.max(0, Math.floor(cam.y / TILE));
    for (let ty = ty0; ty <= ty0 + 18 && ty < lv.h; ty++) {
      for (let tx = tx0; tx <= tx0 + 31; tx++) {
        if (lv.get(tx, ty) !== FOG) continue;
        const px = tx * TILE - cam.x, py = ty * TILE - cam.y;
        if (lv.get(tx, ty - 1) !== FOG) {
          const wy = Math.round(py + 4 + Math.sin(this.time * 1.6 + tx * 0.8) * 1.5);
          const g = ctx.createLinearGradient(0, wy - 14, 0, wy);
          g.addColorStop(0, 'rgba(30,10,40,0)');
          g.addColorStop(1, 'rgba(30,10,40,0.55)');
          ctx.fillStyle = g;
          ctx.fillRect(px, wy - 14, TILE, 14);
          ctx.fillStyle = '#07060c';
          ctx.fillRect(px, wy, TILE, py + TILE - wy);
          ctx.fillStyle = 'rgba(210,60,255,0.55)';
          ctx.fillRect(px + ((tx * 7 + Math.floor(this.time * 5)) % 14), wy, 2, 1);
          ctx.fillStyle = 'rgba(243,166,255,0.25)';
          ctx.fillRect(px, wy, TILE, 1);
        } else {
          ctx.fillStyle = '#07060c';
          ctx.fillRect(px, py, TILE, TILE);
        }
      }
    }
  }

  drawTelegraph(ctx, sx, sy, e) {
    const r = Math.max(e.w, e.h) * 0.9;
    const pulse = 0.35 + 0.25 * Math.sin(this.time * 30);
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    g.addColorStop(0, `rgba(255,40,40,${pulse})`);
    g.addColorStop(1, 'rgba(255,40,40,0)');
    ctx.fillStyle = g;
    ctx.fillRect(sx - r, sy - r, r * 2, r * 2);
    ctx.globalCompositeOperation = 'source-over';
    if (e.boss || e.type === 'shield') {
      ctx.fillStyle = '#ff4a4a';
      ctx.fillRect(sx - 1, sy - e.h / 2 - 16, 2, 6);
      ctx.fillRect(sx - 1, sy - e.h / 2 - 8, 2, 2);
    }
  }

  drawSlamMarker(ctx, cam) {
    const b = this.boss;
    const x = Math.round(b.slamX - cam.x);
    const groundY = Math.round(this.arenaRoom.y1 - 4 * TILE - cam.y);
    const w = 44 + Math.sin(this.time * 30) * 4;
    ctx.fillStyle = 'rgba(255,40,40,0.5)';
    ctx.fillRect(x - w, groundY - 2, w * 2, 2);
    ctx.fillStyle = 'rgba(255,40,40,0.2)';
    ctx.fillRect(x - w, groundY - 10, w * 2, 8);
  }

  drawAimLine(ctx, cam, e) {
    const sx = e.x + e.facing * 8 - cam.x, sy = e.y - 17 - cam.y;
    const tx = e.aimAt.x - cam.x, ty = e.aimAt.y - cam.y;
    const k = Math.min(1, e.st / 0.85);
    ctx.strokeStyle = `rgba(255,50,50,${0.15 + 0.45 * k})`;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + (tx - sx) * k, sy + (ty - sy) * k);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawRings(ctx, cam) {
    ctx.globalCompositeOperation = 'lighter';
    for (const r of this.rings) {
      const k = r.t / r.dur;
      const rad = lerp(r.r0, r.r1, 1 - Math.pow(1 - k, 3));
      ctx.strokeStyle = `rgba(${r.color},${(1 - k) * 0.9})`;
      ctx.lineWidth = 2.5 * (1 - k) + 0.5;
      ctx.beginPath();
      ctx.arc(r.x - cam.x, r.y - cam.y, rad, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  drawScreenFx(ctx) {
    if (this.memoryFx > 0) {
      ctx.globalCompositeOperation = 'color';
      ctx.fillStyle = `rgba(112,72,30,${0.9 * this.memoryFx})`;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
      const g = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, 280);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(20,12,4,${0.75 * this.memoryFx})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = `rgba(255,240,210,${0.05 * this.memoryFx})`;
      for (let i = 0; i < 40; i++) ctx.fillRect(Math.random() * W, Math.random() * H, 1, 1);
    }
    const p = this.player;
    const low = p.hp === 1 && !p.dead ? 0.18 + 0.1 * Math.sin(this.time * 5) : 0;
    const red = Math.max(this.redFlash, low);
    if (red > 0) {
      const g = ctx.createRadialGradient(W / 2, H / 2, 90, W / 2, H / 2, 300);
      g.addColorStop(0, 'rgba(120,0,0,0)');
      g.addColorStop(1, `rgba(170,10,20,${Math.min(0.8, red * 1.4)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    if (this.whiteFlash > 0) {
      ctx.fillStyle = `rgba(${this.whiteColor},${Math.min(0.8, this.whiteFlash)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ---- UI -------------------------------------------------------------------------

  renderUI(u) {
    const cam = this.view || { x: 0, y: 0 };

    // World-space hints: signs and interaction prompts.
    for (const a of this.actors) {
      if (!(a instanceof Sign) || a.show <= 0.01) continue;
      const text = this.formatKeys(a.text);
      const lines = wrap(u, text, 200, font(7, SANS));
      const w = Math.min(210, Math.max(...lines.map((l) => l.length)) * 3.6 + 16);
      const x = clamp(a.x - cam.x, w / 2 + 4, W - w / 2 - 4), y = a.y - cam.y - 30 - lines.length * 9;
      u.globalAlpha = a.show;
      panel(u, x - w / 2, y, w, lines.length * 9 + 8, { fill: 'rgba(20,16,12,0.88)', border: 'rgba(201,166,107,0.7)', accent: '#c9a66b' });
      lines.forEach((l, i) => txt(u, l, x, y + 10 + i * 9, { size: 7, align: 'center', color: '#efe3cc' }));
      u.globalAlpha = 1;
    }
    if (this.focus && this.controls && !this.app.overlays.length) {
      const f = this.focus;
      const x = f.x - cam.x, y = f.y - cam.y - 46 + Math.sin(this.time * 4) * 1.5;
      txt(u, `[${this.input.keyName('interact')}] ${f.prompt}`, x, y, { size: 7, align: 'center', color: '#ffd08a', style: 'bold' });
    }

    if (!this.hideHud && !this.dialogue.active) {
      drawHUD(u, this);
      drawCombo(u, this);
    }
    if (!this.dialogue.active) drawBossBar(u, this);

    if (this.barkMsg && !this.dialogue.active) {
      const b = this.barkMsg, sp = SPEAKERS[b.who];
      const al = Math.min(1, b.t * 4, (b.dur - b.t) * 3);
      txt(u, sp.name, 240, 222, { size: 7, align: 'center', color: sp.color, alpha: al, style: 'bold' });
      txt(u, `“${b.text}”`, 240, 234, { font: font(8.5, SERIF, 'italic'), align: 'center', color: '#efe6d8', alpha: al });
    }

    this.toasts.forEach((t, i) => {
      const al = Math.min(1, t.t * 4, (3 - t.t) * 2);
      const y = 22 + i * 14;
      txt(u, t.text, 240, y, { font: font(8, SERIF), align: 'center', color: '#ffe2b8', alpha: al, glow: 'rgba(255,138,61,0.6)', blur: 6 });
    });

    this.dialogue.render(u);

    if (this.fade.v > 0.001) {
      u.fillStyle = `rgba(0,0,0,${this.fade.v})`;
      u.fillRect(0, 0, W, H);
    }

    if (this.titleCardData) this.drawTitleCard(u, this.titleCardData);
    if (this.deathText) {
      txt(u, 'The ember gutters…', 240, 132, { font: font(14, SERIF, 'italic'), align: 'center', color: '#ffb070', alpha: this.deathText, glow: 'rgba(255,138,61,0.7)', blur: 10 });
      txt(u, '…but the shrine remembers you.', 240, 150, { font: font(8, SERIF, 'italic'), align: 'center', color: '#a89e90', alpha: this.deathText });
    }
    if (this.app.debug.on) this.drawDebug(u, cam);
  }

  formatKeys(s) {
    return s.replace(/\{(\w+)\}/g, (_, a) => `[${this.input.keyName(a)}]`);
  }

  drawTitleCard(u, c) {
    const al = Math.min(1, c.t * 1.5, (c.dur - c.t) * 1.5);
    txt(u, c.top, 240, 120, { size: 8, align: 'center', color: '#c9a66b', alpha: al, spacing: 4, style: 'bold' });
    txt(u, c.main, 240, 146, { font: font(22, SERIF, 'italic'), align: 'center', color: '#f4e6cc', alpha: al, glow: 'rgba(255,138,61,0.7)', blur: 12 });
    u.globalAlpha = al;
    u.fillStyle = '#c9a66b';
    u.fillRect(190, 156, 100, 0.6);
    u.globalAlpha = 1;
  }

  drawDebug(u, cam) {
    const app = this.app, p = this.player;
    if (app.debug.boxes) {
      u.lineWidth = 0.6;
      const box = (b, c) => { if (b) { u.strokeStyle = c; u.strokeRect(b.x - cam.x, b.y - cam.y, b.w, b.h); } };
      box(p.hurtbox(), '#4aff6a');
      box(p.attackBox(), '#ffb040');
      for (const e of this.enemies) { if (!e.dead) box(e.hurtbox(), '#ff4a4a'); box(e.atkBox, '#ff40ff'); }
      for (const pr of this.projectiles.list) if (pr.on) box(this.projectiles.box(pr), '#40c0ff');
      for (const t of this.triggers) if (!t.done) box({ x: t.x0, y: cam.y + 4, w: t.x1 - t.x0, h: H - 8 }, 'rgba(80,220,255,0.5)');
      u.fillStyle = '#4aff6a';
      u.fillRect(p.safe.x - cam.x - 1, p.safe.y - cam.y - 1, 2, 2);
    }
    const lines = [
      `DEBUG  fps ${app.fps.toFixed(0)}  state ${p.state}  pos ${p.x.toFixed(0)},${p.y.toFixed(0)}  room ${this.room.name}`,
      `god ${app.debug.god ? 'ON' : 'off'}  enemies ${this.enemies.length}  combo ${this.combo}  ember ${p.ember.toFixed(0)}`,
      '[H] hitboxes [G] god [U] abilities [M] +100 shards [F] full ember [X] kill all [N] next room [B] boss [C] chapters',
    ];
    lines.forEach((l, i) => txt(u, l, 4, 262 - (lines.length - 1 - i) * 7, { size: 5.5, color: '#9fe4ee', family: 'monospace' }));
  }
}
