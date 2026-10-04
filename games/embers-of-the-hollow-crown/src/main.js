// Boot: canvas scaling, the fixed-timestep loop and scene management.

import { DT, H, W } from './config.js';
import { ChapterEndScene } from './scenes/chapterEnd.js';
import { CreditsScene } from './scenes/credits.js';
import { DreamScene } from './scenes/dream.js';
import { GameScene } from './scenes/game.js';
import { TitleScene } from './scenes/title.js';
import { AudioEngine } from './systems/audio.js';
import { Input } from './systems/input.js';
import { loadSave, loadSettings, newSave, writeSave } from './systems/save.js';
import { ChapterSelect } from './ui/overlays.js';
import { UI } from './ui/text.js';

class App {
  constructor() {
    this.world = document.getElementById('world');
    this.wctx = this.world.getContext('2d');
    this.wctx.imageSmoothingEnabled = false;
    this.ui = document.getElementById('ui');
    this.uctx = this.ui.getContext('2d');
    this.wrap = document.getElementById('wrap');

    this.settings = loadSettings();
    this.input = new Input(this.settings.binds);
    this.audio = new AudioEngine();
    this.audio.setVolumes(this.settings.volume);
    this.input.onGesture = () => this.audio.init();
    this.save = loadSave();
    this.debug = { on: false, boxes: false, god: false };
    this.overlays = [];
    this.scene = null;
    this.fps = 60;
    this.fpsAcc = 0;
    this.fpsFrames = 0;

    this.resize();
    addEventListener('resize', () => this.resize());
    this.setScene(new TitleScene(this));
    this.last = performance.now();
    this.acc = 0;
    requestAnimationFrame((t) => this.frame(t));
  }

  resize() {
    const s = Math.min(innerWidth / W, innerHeight / H);
    const cw = Math.floor(W * s), ch = Math.floor(H * s);
    for (const c of [this.world, this.ui]) { c.style.width = cw + 'px'; c.style.height = ch + 'px'; }
    this.wrap.style.width = cw + 'px';
    this.wrap.style.height = ch + 'px';
    const dpr = window.devicePixelRatio || 1;
    this.ui.width = Math.round(cw * dpr);
    this.ui.height = Math.round(ch * dpr);
    this.uiScale = this.ui.width / W;
    UI.scale = this.uiScale;
  }

  // ---- scene management -----------------------------------------------------

  setScene(s) {
    this.scene?.exit?.();
    this.overlays.length = 0;
    this.scene = s;
    s.enter?.();
  }

  push(o) { this.overlays.push(o); }
  pop() { this.overlays.pop(); }

  toTitle() { this.save = loadSave(); this.setScene(new TitleScene(this)); }

  startGame(opts = {}) {
    if (opts.fresh || opts.debugJump || !this.save) {
      this.save = newSave();
      if (!opts.debugJump) writeSave(this.save);
    }
    this.setScene(new GameScene(this, opts));
  }

  continueGame() {
    this.save = loadSave();
    if (!this.save) return this.startGame({ fresh: true });
    if (this.save.flags.ch1_complete) return this.startChapterEnd();
    this.startGame({});
  }

  replayChapter() {
    const old = this.save || newSave();
    const s = newSave();
    s.upgrades = old.upgrades;
    s.abilities = old.abilities;
    s.currency = old.currency;
    s.memories = old.memories;
    s.lore = old.lore;
    s.deaths = old.deaths;
    s.playtime = old.playtime;
    this.save = s;
    writeSave(s);
    this.setScene(new GameScene(this, {}));
  }

  startDream(id, next) {
    if (!this.save) this.save = newSave();
    this.setScene(new DreamScene(this, id, next || (() => this.toTitle())));
  }

  startChapterEnd() {
    if (!this.save) this.save = newSave();
    this.setScene(new ChapterEndScene(this));
  }

  startCredits() { this.setScene(new CreditsScene(this)); }

  // ---- loop -------------------------------------------------------------------

  frame(now) {
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.25) dt = 0.25;
    this.acc += dt;
    let steps = 0;
    while (this.acc >= DT && steps < 6) {
      this.step();
      this.acc -= DT;
      steps++;
    }
    if (steps >= 6) this.acc = 0;
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) { this.fps = this.fpsFrames / this.fpsAcc; this.fpsAcc = 0; this.fpsFrames = 0; }
    this.render(this.acc / DT);
    requestAnimationFrame((t) => this.frame(t));
  }

  step() {
    this.input.poll();
    if (this.input.hit('debug')) {
      this.debug.on = !this.debug.on;
      if (this.debug.on && this.scene instanceof TitleScene && !this.overlays.length) this.push(new ChapterSelect(this));
    }
    const top = this.overlays[this.overlays.length - 1];
    if (top) top.update(DT);
    else this.scene.update(DT);
  }

  render(alpha) {
    const paused = this.overlays.length > 0;
    this.scene.render(this.wctx, paused ? 1 : alpha);
    const u = this.uctx;
    u.setTransform(1, 0, 0, 1, 0, 0);
    u.clearRect(0, 0, this.ui.width, this.ui.height);
    u.setTransform(this.uiScale, 0, 0, this.uiScale, 0, 0);
    this.scene.renderUI(u);
    for (const o of this.overlays) o.render(u);
  }
}

window.embers = new App();
