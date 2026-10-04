// Tilemap built from ASCII rooms laid side by side, with procedural tile art
// pre-rendered once into a single canvas.
//
//   #  stone (solid)        =  wood (solid)         -  one-way platform
//   ^  spikes (hazard)      ~  Hollow fog (hazard)
//   +  background brick     |  background pillar / post
//   any other non-space character is an entity marker (see the level file).

import { TILE } from '../config.js';
import { hash2, makeCanvas, rng, shade } from '../util.js';

export const EMPTY = 0, STONE = 1, WOOD = 2, PLAT = 3, SPIKE = 4, FOG = 5, GATE = 6;
const CHARS = { '#': STONE, '=': WOOD, '-': PLAT, '^': SPIKE, '~': FOG };

export class Level {
  constructor(def) {
    this.def = def;
    const h = def.rooms[0].rows.length;
    this.h = h;
    let w = 0;
    this.rooms = def.rooms.map((r, i) => {
      const rw = Math.max(...r.rows.map((s) => s.length));
      if (r.rows.length !== h) console.warn(`[level] room "${r.name}" has ${r.rows.length} rows, expected ${h}`);
      r.rows.forEach((s, j) => { if (s.length !== rw) console.warn(`[level] room "${r.name}" row ${j} is ${s.length} wide, expected ${rw}`); });
      const room = {
        ...r, index: i, tx0: w, tx1: w + rw,
        x0: w * TILE, x1: (w + rw) * TILE,
        y0: (r.y0 ?? 0) * TILE, y1: ((r.y1 ?? h - 1) + 1) * TILE,
      };
      w += rw;
      return room;
    });
    this.w = w;
    this.pw = w * TILE;
    this.ph = h * TILE;
    this.tiles = new Uint8Array(w * h);
    this.bg = new Uint8Array(w * h);
    this.markers = [];

    this.rooms.forEach((room, ri) => {
      const src = def.rooms[ri];
      const rw = room.tx1 - room.tx0;
      for (let ty = 0; ty < h; ty++) {
        const row = (src.rows[ty] || '').padEnd(rw, ' ');
        for (let i = 0; i < rw; i++) {
          const ch = row[i], tx = room.tx0 + i, k = ty * w + tx;
          if (CHARS[ch] !== undefined) this.tiles[k] = CHARS[ch];
          else if (ch === '+') this.bg[k] = 1;
          else if (ch === '|') this.bg[k] = 2;
          else if (ch !== ' ') {
            this.markers.push({ ch, tx, ty, room: ri });
            if (row[i - 1] === '+' || row[i + 1] === '+') this.bg[k] = 1;
          }
          if (src.interior && this.tiles[k] === EMPTY && !this.bg[k] && ty >= (src.y0 ?? 0)) this.bg[k] = 1;
        }
      }
    });
    this.markers.sort((a, b) => a.tx - b.tx || a.ty - b.ty);
  }

  get(tx, ty) {
    if (ty < 0 || ty >= this.h) return EMPTY;
    if (tx < 0 || tx >= this.w) return STONE;
    return this.tiles[ty * this.w + tx];
  }

  set(tx, ty, v) {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return;
    this.tiles[ty * this.w + tx] = v;
  }

  solid(tx, ty) {
    const t = this.get(tx, ty);
    return t === STONE || t === WOOD || t === GATE;
  }

  plat(tx, ty) { return this.get(tx, ty) === PLAT; }

  roomAt(px) {
    for (const r of this.rooms) if (px >= r.x0 && px < r.x1) return r;
    return px < 0 ? this.rooms[0] : this.rooms[this.rooms.length - 1];
  }

  // Hazard touched by a rectangle: 'spike', 'fog', 'pit' or null.
  hazardAt(r) {
    if (r.y > this.ph + 8) return 'pit';
    const x0 = Math.floor(r.x / TILE), x1 = Math.floor((r.x + r.w - 0.01) / TILE);
    const y0 = Math.floor(r.y / TILE), y1 = Math.floor((r.y + r.h - 0.01) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const t = this.get(tx, ty);
        if (t === SPIKE && r.y + r.h > ty * TILE + 7) return 'spike';
        if (t === FOG && r.y + r.h > ty * TILE + 6) return 'fog';
      }
    }
    return null;
  }

  spikeIn(r) {
    const x0 = Math.floor(r.x / TILE), x1 = Math.floor((r.x + r.w - 0.01) / TILE);
    const y0 = Math.floor(r.y / TILE), y1 = Math.floor((r.y + r.h - 0.01) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const t = this.get(tx, ty);
        if (t === SPIKE || t === FOG) return { x: tx * TILE + 8, y: ty * TILE + 8 };
      }
    }
    return null;
  }

  // ---- procedural tile art ------------------------------------------------

  prerender(theme) {
    const [c, x] = makeCanvas(this.pw, this.ph);
    this.canvas = c;
    const th = theme;
    for (let ty = 0; ty < this.h; ty++) {
      for (let tx = 0; tx < this.w; tx++) {
        const k = ty * this.w + tx;
        const t = this.tiles[k], b = this.bg[k];
        const px = tx * TILE, py = ty * TILE;
        const r = rng(hash2(tx, ty));
        if (b && t !== STONE && t !== WOOD) this.drawBg(x, px, py, b, th, r, tx, ty);
        if (t === STONE) this.drawStone(x, px, py, th, r, tx, ty);
        else if (t === WOOD) this.drawWood(x, px, py, th, r, tx, ty);
        else if (t === PLAT) this.drawPlat(x, px, py, th, tx, ty);
        else if (t === SPIKE) this.drawSpike(x, px, py);
      }
    }
  }

  isSolidish(tx, ty) {
    const t = this.get(tx, ty);
    return t === STONE || t === WOOD;
  }

  drawStone(x, px, py, th, r, tx, ty) {
    const up = this.isSolidish(tx, ty - 1), dn = this.isSolidish(tx, ty + 1);
    const lf = this.isSolidish(tx - 1, ty), rt = this.isSolidish(tx + 1, ty);
    x.fillStyle = th.mortar;
    x.fillRect(px, py, 16, 16);
    for (let row = 0; row < 2; row++) {
      const by = py + row * 8;
      const off = (ty * 2 + row) % 2 ? 4 : 0;
      for (let bx = px - 8 + off; bx < px + 16; bx += 8) {
        const x0 = Math.max(bx, px), x1 = Math.min(bx + 7, px + 16);
        if (x1 - x0 <= 0) continue;
        const v = rng(hash2(Math.floor((bx + 64) / 8), ty * 2 + row))() * 0.09 - 0.045;
        x.fillStyle = shade(th.stone, v);
        x.fillRect(x0, by, x1 - x0, 7);
        x.fillStyle = shade(th.stone, v + 0.05);
        x.fillRect(x0, by, x1 - x0, 1);
      }
    }
    if (r() < 0.25) {
      x.fillStyle = shade(th.stone, -0.08);
      x.fillRect(px + Math.floor(r() * 12) + 2, py + Math.floor(r() * 12) + 2, 2, 1);
    }
    const depth = up && dn && lf && rt && this.isSolidish(tx, ty - 2);
    if (depth) {
      x.fillStyle = 'rgba(0,0,0,0.32)';
      x.fillRect(px, py, 16, 16);
    }
    if (!up) {
      x.fillStyle = th.top;
      x.fillRect(px, py, 16, 2);
      x.fillStyle = shade(th.top, -0.12);
      x.fillRect(px, py + 2, 16, 1);
      for (let i = 0; i < 3; i++) {
        if (r() < 0.6) {
          x.fillStyle = r() < 0.5 ? th.top : th.tuft;
          x.fillRect(px + Math.floor(r() * 15), py - 1, 1, r() < 0.4 ? 2 : 1);
        }
      }
    }
    x.fillStyle = th.edge;
    if (!lf) x.fillRect(px, py, 1, 16);
    if (!rt) x.fillRect(px + 15, py, 1, 16);
    if (!dn) x.fillRect(px, py + 15, 16, 1);
  }

  drawWood(x, px, py, th, r, tx, ty) {
    const up = this.isSolidish(tx, ty - 1);
    x.fillStyle = th.wood;
    x.fillRect(px, py, 16, 16);
    x.fillStyle = th.woodLo;
    for (let y = 3; y < 16; y += 4) x.fillRect(px, py + y, 16, 1);
    const seam = (tx * 5 + ty * 3) % 16;
    x.fillRect(px + seam, py, 1, 16);
    x.fillStyle = th.woodHi;
    if (r() < 0.7) x.fillRect(px + 2 + Math.floor(r() * 12), py + 1 + 4 * Math.floor(r() * 3), 1, 1);
    if (!up) {
      x.fillStyle = th.woodHi;
      x.fillRect(px, py, 16, 2);
    }
  }

  drawPlat(x, px, py, th, tx, ty) {
    x.fillStyle = th.woodHi;
    x.fillRect(px, py, 16, 2);
    x.fillStyle = th.wood;
    x.fillRect(px, py + 2, 16, 2);
    x.fillStyle = th.woodLo;
    x.fillRect(px, py + 4, 16, 1);
    const lEnd = !this.plat(tx - 1, ty), rEnd = !this.plat(tx + 1, ty);
    x.fillStyle = th.woodLo;
    if (lEnd) { x.fillRect(px + 1, py + 5, 2, 3); x.fillRect(px + 2, py + 8, 1, 2); }
    if (rEnd) { x.fillRect(px + 13, py + 5, 2, 3); x.fillRect(px + 13, py + 8, 1, 2); }
    if (!lEnd && !rEnd && tx % 3 === 0) x.fillRect(px + 7, py + 5, 2, 2);
  }

  drawSpike(x, px, py) {
    x.fillStyle = '#2a2e3a';
    x.fillRect(px, py + 14, 16, 2);
    for (let i = 0; i < 4; i++) {
      const sx = px + i * 4;
      x.fillStyle = '#c3c7d1';
      x.fillRect(sx + 1, py + 7, 1, 7);
      x.fillRect(sx, py + 10, 1, 4);
      x.fillStyle = '#7d8290';
      x.fillRect(sx + 2, py + 7, 1, 7);
      x.fillRect(sx + 3, py + 10, 1, 4);
      x.fillStyle = '#8a2b3a';
      x.fillRect(sx + 1, py + 6, 2, 1);
    }
  }

  drawBg(x, px, py, b, th, r, tx, ty) {
    if (b === 1) {
      x.fillStyle = th.bgMortar;
      x.fillRect(px, py, 16, 16);
      for (let row = 0; row < 2; row++) {
        const by = py + row * 8;
        const off = (ty * 2 + row) % 2 ? 8 : 0;
        for (let bx = px - 16 + off; bx < px + 16; bx += 16) {
          const x0 = Math.max(bx, px), x1 = Math.min(bx + 15, px + 16);
          if (x1 - x0 <= 0) continue;
          const v = rng(hash2(Math.floor((bx + 64) / 16), ty * 2 + row + 999))() * 0.05 - 0.025;
          x.fillStyle = shade(th.bg, v);
          x.fillRect(x0, by, x1 - x0, 7);
        }
      }
      if (r() < 0.06) {
        x.fillStyle = th.bgMortar;
        const cx = px + 3 + Math.floor(r() * 10);
        x.fillRect(cx, py + 2, 1, 5);
        x.fillRect(cx + 1, py + 6, 1, 4);
      }
    } else if (b === 2) {
      x.fillStyle = th.post;
      x.fillRect(px + 5, py, 6, 16);
      x.fillStyle = shade(th.post, 0.06);
      x.fillRect(px + 5, py, 1, 16);
      x.fillStyle = shade(th.post, -0.06);
      x.fillRect(px + 10, py, 1, 16);
    }
  }
}
