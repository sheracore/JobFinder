// Modal overlays pushed on top of a scene: pause, settings, key remapping,
// Oskar's shop, confirmation and the debug chapter select.

import { CHAPTERS } from '../data/chapters.js';
import { ACTION_LABELS, REMAPPABLE } from '../systems/input.js';
import { saveSettings, writeSave } from '../systems/save.js';
import { Menu } from './menu.js';
import { font, panel, SERIF, txt } from './text.js';

function dim(u, a = 0.6) {
  u.fillStyle = `rgba(4,5,9,${a})`;
  u.fillRect(0, 0, 480, 270);
}

function bars(v) {
  const n = Math.round(v * 10);
  return '▮'.repeat(n) + '▯'.repeat(10 - n);
}

export class PauseMenu {
  constructor(app, game) {
    this.app = app;
    this.game = game;
    this.menu = new Menu([
      { label: 'Resume', action: () => app.pop() },
      { label: 'Settings', action: () => app.push(new SettingsMenu(app)) },
      { label: 'Quit to Title', action: () => app.push(new ConfirmBox(app, 'Return to the title screen?', 'Progress is kept at your last shrine.', () => app.toTitle())) },
    ]);
  }
  update(dt) {
    const inp = this.app.input;
    if (inp.hit('back') || inp.hit('pause')) { inp.consume('back', 'pause'); this.app.pop(); return; }
    this.menu.update(inp, this.app.audio, dt);
  }
  render(u) {
    dim(u);
    txt(u, 'PAUSED', 240, 82, { font: font(18, SERIF, 'bold'), align: 'center', color: '#e8dcc8', glow: 'rgba(255,138,61,0.5)', blur: 10, spacing: 4 });
    const g = this.game;
    txt(u, `Chapter I — ${g.def.title}   ·   Memories ${g.chapterMemories()}/${g.def.memories.length}   ·   Shards ${g.save.currency}`, 240, 98, { size: 6.5, align: 'center', color: '#a89e90' });
    this.menu.render(u, 240, 128);
  }
}

export class SettingsMenu {
  constructor(app) {
    this.app = app;
    const s = app.settings;
    const vol = (k) => ({
      label: { master: 'Master volume', music: 'Music', sfx: 'Sound effects' }[k],
      value: () => bars(s.volume[k]),
      left: () => this.setVol(k, -0.1),
      right: () => this.setVol(k, 0.1),
    });
    this.menu = new Menu([
      vol('master'), vol('music'), vol('sfx'),
      { label: 'Screen shake', value: () => (s.shake ? 'On' : 'Off'), action: () => this.toggleShake(), left: () => this.toggleShake(), right: () => this.toggleShake() },
      { label: 'Controls…', action: () => app.push(new RemapMenu(app)) },
      { label: 'Back', action: () => app.pop() },
    ]);
  }
  setVol(k, d) {
    const s = this.app.settings;
    s.volume[k] = Math.round(Math.min(1, Math.max(0, s.volume[k] + d)) * 10) / 10;
    this.app.audio.setVolumes(s.volume);
    saveSettings(s);
  }
  toggleShake() {
    const s = this.app.settings;
    s.shake = !s.shake;
    if (this.app.scene.cam) this.app.scene.cam.shakeOn = s.shake;
    saveSettings(s);
  }
  update(dt) {
    const inp = this.app.input;
    if (inp.hit('back')) { inp.consume('back', 'pause'); this.app.pop(); return; }
    this.menu.update(inp, this.app.audio, dt);
  }
  render(u) {
    dim(u, 0.75);
    panel(u, 120, 52, 240, 160);
    txt(u, 'SETTINGS', 240, 72, { font: font(12, SERIF, 'bold'), align: 'center', color: '#e8dcc8', spacing: 3 });
    this.menu.render(u, 240, 96, { w: 210, size: 8.5, rowH: 16 });
    txt(u, '←/→ to adjust', 240, 205, { size: 6, align: 'center', color: '#8a8278' });
  }
}

export class RemapMenu {
  constructor(app) {
    this.app = app;
    this.waiting = null;
    const items = REMAPPABLE.map((a) => ({
      label: ACTION_LABELS[a],
      value: () => (this.waiting === a ? 'press a key…' : app.input.keyName(a)),
      action: () => this.capture(a),
    }));
    items.push({ label: 'Reset to defaults', action: () => { app.input.resetBinds(); this.persist(); } });
    items.push({ label: 'Back', action: () => app.pop() });
    this.menu = new Menu(items);
  }
  capture(a) {
    this.waiting = a;
    this.app.input.capture = (code) => {
      this.waiting = null;
      if (code === 'Escape') return;
      this.app.input.rebind(a, code);
      this.persist();
      this.app.audio.sfx('select');
    };
  }
  persist() {
    this.app.settings.binds = this.app.input.binds;
    saveSettings(this.app.settings);
  }
  update(dt) {
    if (this.waiting) return;
    const inp = this.app.input;
    if (inp.hit('back')) { inp.consume('back', 'pause'); this.app.pop(); return; }
    this.menu.update(inp, this.app.audio, dt);
  }
  render(u) {
    dim(u, 0.8);
    panel(u, 110, 22, 260, 228);
    txt(u, 'CONTROLS', 240, 40, { font: font(12, SERIF, 'bold'), align: 'center', color: '#e8dcc8', spacing: 3 });
    this.menu.render(u, 240, 60, { w: 230, size: 8, rowH: 14 });
    txt(u, 'Arrow keys always move and navigate menus. Gamepads use the standard layout.', 240, 244, { size: 5.5, align: 'center', color: '#8a8278' });
  }
}

export class ConfirmBox {
  constructor(app, question, detail, onYes) {
    this.app = app;
    this.q = question;
    this.detail = detail;
    this.menu = new Menu([
      { label: 'No', action: () => app.pop() },
      { label: 'Yes', action: () => { app.pop(); onYes(); } },
    ]);
  }
  update(dt) {
    const inp = this.app.input;
    if (inp.hit('back')) { inp.consume('back', 'pause'); this.app.pop(); return; }
    this.menu.update(inp, this.app.audio, dt);
  }
  render(u) {
    dim(u, 0.5);
    panel(u, 130, 92, 220, 92);
    txt(u, this.q, 240, 112, { font: font(9, SERIF), align: 'center', color: '#e8dcc8' });
    if (this.detail) txt(u, this.detail, 240, 124, { size: 6.5, align: 'center', color: '#a89e90' });
    this.menu.render(u, 240, 148, { w: 120 });
  }
}

const SHOP = [
  { key: 'hp', name: 'Vital Ember', desc: '+1 maximum health', costs: [40, 90] },
  { key: 'dmg', name: 'Tempered Edge', desc: '+20% blade damage', costs: [50, 110] },
  { key: 'ember', name: 'Deep Kindling', desc: '+25 Ember capacity', costs: [30, 70] },
];

export class ShopMenu {
  constructor(app, game) {
    this.app = app;
    this.game = game;
    this.msg = 'The fallen still hold their light. Let us put it to use.';
    const items = SHOP.map((s) => ({
      label: s.name,
      value: () => {
        const lvl = game.save.upgrades[s.key];
        return lvl >= s.costs.length ? 'mastered' : `${s.costs[lvl]} shards`;
      },
      hint: s.desc,
      action: () => this.buy(s),
    }));
    items.push({ label: 'Leave', action: () => app.pop() });
    this.menu = new Menu(items);
  }
  buy(s) {
    const g = this.game, lvl = g.save.upgrades[s.key];
    if (lvl >= s.costs.length) { this.msg = 'There is nothing more I can teach that blade.'; this.app.audio.sfx('deny'); return; }
    const cost = s.costs[lvl];
    if (g.save.currency < cost) { this.msg = 'Not enough shards, child. The fallen are generous — go and ask them.'; this.app.audio.sfx('deny'); return; }
    g.save.currency -= cost;
    g.save.upgrades[s.key]++;
    g.player.refreshStats(false);
    if (s.key === 'hp') g.player.hp = g.player.maxHp;
    writeSave(g.save);
    this.app.audio.sfx('unlock');
    this.msg = { hp: 'Your heart burns a little brighter.', dmg: 'The edge remembers the forge.', ember: 'More room for the fire. Use it well.' }[s.key];
  }
  update(dt) {
    const inp = this.app.input;
    if (inp.hit('back')) { inp.consume('back', 'pause'); this.app.pop(); return; }
    this.menu.update(inp, this.app.audio, dt);
  }
  render(u) {
    dim(u, 0.55);
    panel(u, 110, 50, 260, 170, { border: '#d9b77e', accent: '#d9b77e' });
    txt(u, 'Brother Oskar\'s Shrine', 240, 68, { font: font(11, SERIF, 'bold'), align: 'center', color: '#e8d2a6' });
    txt(u, `Ember Shards: ${this.game.save.currency}`, 240, 80, { size: 7, align: 'center', color: '#ffb070' });
    this.menu.render(u, 240, 104, { w: 230, size: 8.5, rowH: 17 });
    txt(u, `“${this.msg}”`, 240, 206, { font: font(7, SERIF, 'italic'), align: 'center', color: '#c9b892' });
  }
}

// Debug chapter select (toggle debug mode with the backtick key).
export class ChapterSelect {
  constructor(app) {
    this.app = app;
    const items = [
      { label: 'Chapter I — The Ashen Docks (start)', action: () => app.startGame({ fresh: true }) },
      { label: 'Chapter I — The Docks (Lyra)', action: () => app.startGame({ debugJump: 'docks' }) },
      { label: 'Chapter I — Boss: Warden Grull', action: () => app.startGame({ debugJump: 'boss' }) },
      { label: 'Dream I — Nyx-Aurel', action: () => app.startDream('dream_ch1') },
      { label: 'Chapter I — End card', action: () => app.startChapterEnd() },
      ...CHAPTERS.slice(1).map((c) => ({ label: `Chapter ${c.roman} — ${c.title}`, enabled: () => c.built, action: () => {} })),
      { label: 'Credits', action: () => app.startCredits() },
      { label: 'Close', action: () => app.pop() },
    ];
    this.menu = new Menu(items);
  }
  update(dt) {
    const inp = this.app.input;
    if (inp.hit('back')) { inp.consume('back', 'pause'); this.app.pop(); return; }
    this.menu.update(inp, this.app.audio, dt);
  }
  render(u) {
    dim(u, 0.8);
    panel(u, 90, 22, 300, 226, { border: '#56c7d6', accent: '#56c7d6' });
    txt(u, 'DEBUG · CHAPTER SELECT', 240, 40, { font: font(10, SERIF, 'bold'), align: 'center', color: '#9fe4ee', spacing: 2 });
    this.menu.render(u, 240, 60, { w: 280, size: 7.5, rowH: 14, align: 'left' });
    txt(u, 'Greyed-out chapters are not yet forged in this build.', 240, 240, { size: 5.5, align: 'center', color: '#7d8a90' });
  }
}
