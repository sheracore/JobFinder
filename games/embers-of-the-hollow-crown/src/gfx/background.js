// Layered parallax backdrops, generated procedurally from a seed, plus
// screen-space ambient weather (ash, embers, leaves, void motes...).

import { W, H } from '../config.js';
import { makeCanvas, rand, rng } from '../util.js';

const THEMES = {
  ashen: {
    sky: [[0, '#0d1020'], [0.55, '#231f2c'], [0.82, '#4a2f2c'], [1, '#6a3a28']],
    sun: { x: 330, y: 120, r: 26, color: 'rgba(255,170,110,0.18)', core: 'rgba(255,200,150,0.35)' },
    layers: [
      { kind: 'islands', f: 0.06, y: 40, color: '#1e2334', lights: '#ffb070', seed: 3 },
      { kind: 'islands', f: 0.14, y: 70, color: '#171b29', lights: '#ff9a50', seed: 9 },
      { kind: 'ruins', f: 0.3, y: 120, color: '#11141e', seed: 21 },
    ],
    horizonFog: '#0a0910',
    ambient: { kind: 'ash', n: 70 },
  },
  title: {
    sky: [[0, '#070912'], [0.5, '#141629'], [0.8, '#2d1f33'], [1, '#4a2430']],
    sun: { x: 240, y: 92, r: 40, color: 'rgba(210,60,255,0.12)', core: 'rgba(255,190,240,0.2)' },
    layers: [
      { kind: 'islands', f: 0.08, y: 50, color: '#1a1d30', lights: '#ffb070', seed: 5 },
      { kind: 'islands', f: 0.2, y: 90, color: '#121524', lights: '#ff9a50', seed: 13 },
    ],
    horizonFog: '#07060c',
    ambient: { kind: 'embers', n: 60 },
    stars: true,
  },
};

function buildLayer(L) {
  const lw = 960;
  const [c, x] = makeCanvas(lw, H);
  const r = rng(L.seed * 7919);
  x.fillStyle = L.color;
  if (L.kind === 'islands') {
    for (let i = 0; i < 6; i++) {
      const cx = 60 + i * 160 + r() * 60, w = 50 + r() * 90, top = L.y + r() * 60;
      for (let px = -w / 2; px < w / 2; px++) {
        const k = 1 - Math.abs(px) / (w / 2);
        const bump = Math.floor(r() * 2);
        x.fillRect(Math.round(cx + px), Math.round(top - bump), 1, Math.round(6 + k * k * (26 + r() * 6)));
      }
      // Towers and spires on the island.
      const towers = 1 + Math.floor(r() * 3);
      for (let k = 0; k < towers; k++) {
        const tx = Math.round(cx + (r() - 0.5) * w * 0.6), th = 10 + r() * 28, tw = 4 + Math.floor(r() * 5);
        x.fillRect(tx, Math.round(top - th), tw, Math.round(th));
        x.fillRect(tx + Math.floor(tw / 2) - 1, Math.round(top - th - 5), 2, 5);
        if (L.lights && r() < 0.8) {
          x.fillStyle = L.lights;
          x.fillRect(tx + 1, Math.round(top - th * 0.6), 1, 1);
          if (r() < 0.5) x.fillRect(tx + tw - 2, Math.round(top - th * 0.35), 1, 1);
          x.fillStyle = L.color;
        }
      }
      // Rocks drifting under the island.
      for (let k = 0; k < 3; k++) x.fillRect(Math.round(cx + (r() - 0.5) * w), Math.round(top + 34 + r() * 18), 2 + Math.floor(r() * 3), 2);
    }
  } else if (L.kind === 'ruins') {
    let px = 0;
    while (px < lw) {
      const bw = 18 + Math.floor(r() * 40), bh = 40 + Math.floor(r() * 90);
      const top = H - bh;
      x.fillRect(px, top, bw, bh);
      for (let k = 0; k < bw; k += 3) x.fillRect(px + k, top - Math.floor(r() * 6), 3, 6);
      if (r() < 0.4) {
        // A crane silhouette.
        const cx = px + bw / 2;
        x.fillRect(cx, top - 40, 2, 40);
        x.fillRect(cx - 24, top - 40, 48, 2);
        x.fillRect(cx + 20, top - 38, 1, 16 + Math.floor(r() * 10));
      }
      if (r() < 0.5) {
        x.fillStyle = 'rgba(255,150,80,0.55)';
        x.fillRect(px + 4 + Math.floor(r() * (bw - 8)), top + 10 + Math.floor(r() * 20), 2, 2);
        x.fillStyle = L.color;
      }
      px += bw + Math.floor(r() * 26);
    }
  }
  return { c, w: lw, f: L.f };
}

export class Parallax {
  constructor(theme) {
    this.th = THEMES[theme] || THEMES.ashen;
    const [sc, sx] = makeCanvas(1, H);
    const g = sx.createLinearGradient(0, 0, 0, H);
    for (const [k, col] of this.th.sky) g.addColorStop(k, col);
    sx.fillStyle = g;
    sx.fillRect(0, 0, 1, H);
    this.sky = sc;
    this.layers = this.th.layers.map(buildLayer);
    if (this.th.stars) {
      const r = rng(77);
      this.stars = Array.from({ length: 90 }, () => ({ x: r() * W, y: r() * H * 0.6, b: r() }));
    }
    this.ambient = Array.from({ length: this.th.ambient.n }, () => this.spawnMote(true));
    this.lastCam = null;
  }

  spawnMote(anywhere) {
    const kind = this.th.ambient.kind;
    const ember = kind === 'embers' ? Math.random() < 0.7 : Math.random() < 0.15;
    return {
      x: rand(0, W), y: anywhere ? rand(0, H) : ember ? H + 4 : -4,
      vx: rand(-8, 4) - 6, vy: ember ? rand(-22, -8) : rand(10, 22),
      ember, s: Math.random() < 0.2 ? 2 : 1, ph: rand(0, 6),
    };
  }

  draw(ctx, cx, cy, t) {
    ctx.drawImage(this.sky, 0, 0, W, H);
    if (this.stars) {
      for (const s of this.stars) {
        ctx.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(t * 0.8 + s.b * 10));
        ctx.fillStyle = '#cfd6ff';
        ctx.fillRect(Math.round(s.x), Math.round(s.y), 1, 1);
      }
      ctx.globalAlpha = 1;
    }
    const sun = this.th.sun;
    if (sun) {
      const sx = sun.x - cx * 0.02, sy = sun.y - cy * 0.05;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, sun.r * 3);
      g.addColorStop(0, sun.core);
      g.addColorStop(0.3, sun.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(sx - sun.r * 3, sy - sun.r * 3, sun.r * 6, sun.r * 6);
    }
    for (const L of this.layers) {
      const ox = -((((cx * L.f) % L.w) + L.w) % L.w);
      const oy = Math.round(-cy * L.f * 0.6);
      ctx.drawImage(L.c, Math.round(ox), oy);
      if (ox + L.w < W) ctx.drawImage(L.c, Math.round(ox + L.w), oy);
    }
    // Distant sea of fog with a shimmering edge.
    const fy = Math.round(H - 34 - cy * 0.35);
    ctx.fillStyle = this.th.horizonFog;
    ctx.fillRect(0, fy, W, H - fy);
    ctx.fillStyle = 'rgba(210,60,255,0.18)';
    for (let x = 0; x < W; x += 3) {
      const y = fy + Math.round(Math.sin(x * 0.05 + t * 0.7) * 1.5);
      ctx.fillRect(x, y, 2, 1);
    }
  }

  // Weather drawn in front of the world.
  drawFront(ctx, cx, cy, dt) {
    if (this.lastCam) {
      const dx = cx - this.lastCam.x, dy = cy - this.lastCam.y;
      for (const m of this.ambient) { m.x -= dx * 0.9; m.y -= dy * 0.9; }
    }
    this.lastCam = { x: cx, y: cy };
    for (const m of this.ambient) {
      m.ph += dt;
      m.x += (m.vx + Math.sin(m.ph * 1.3) * 6) * dt;
      m.y += m.vy * dt;
      if (m.x < -8) m.x += W + 16;
      if (m.x > W + 8) m.x -= W + 16;
      if (m.y > H + 8 || m.y < -8) Object.assign(m, this.spawnMote(false));
      if (m.ember) {
        ctx.globalAlpha = 0.5 + 0.5 * Math.sin(m.ph * 6);
        ctx.fillStyle = '#ffb070';
      } else {
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = '#9a9aa6';
      }
      ctx.fillRect(Math.round(m.x), Math.round(m.y), m.s, m.s);
    }
    ctx.globalAlpha = 1;
  }
}
