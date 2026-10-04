// Progress and settings persistence in localStorage. Every access is guarded:
// storage can be unavailable (private windows, blocked site data).

const SAVE_KEY = 'embers-hollow-crown.save.v1';
const SETTINGS_KEY = 'embers-hollow-crown.settings.v1';

function store() {
  try { return window.localStorage; } catch { return null; }
}

export function newSave() {
  return {
    version: 1,
    chapter: 1,
    checkpoint: null,
    currency: 0,
    upgrades: { hp: 0, dmg: 0, ember: 0 },
    abilities: { doubleJump: false, wallJump: false, airDash: false, heavy: false },
    flags: {},
    memories: [],
    lore: [],
    deaths: 0,
    playtime: 0,
  };
}

export function loadSave() {
  try {
    const raw = store()?.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const base = newSave();
    return {
      ...base, ...data,
      upgrades: { ...base.upgrades, ...data.upgrades },
      abilities: { ...base.abilities, ...data.abilities },
      flags: { ...data.flags },
    };
  } catch {
    return null;
  }
}

export function writeSave(save) {
  try {
    store()?.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function defaultSettings() {
  return { volume: { master: 0.8, music: 0.6, sfx: 0.8 }, shake: true, binds: null };
}

export function loadSettings() {
  try {
    const raw = store()?.getItem(SETTINGS_KEY);
    if (!raw) return defaultSettings();
    const s = JSON.parse(raw);
    const d = defaultSettings();
    return { ...d, ...s, volume: { ...d.volume, ...s.volume } };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(s) {
  try { store()?.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}
