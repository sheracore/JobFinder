// AABB-vs-tilemap movement. Bodies are anchored at bottom-centre:
// x is the horizontal centre, y is the feet.

import { TILE } from '../config.js';

export function moveBody(e, level, dt) {
  const wasGround = e.onGround;
  e.onGround = false;
  e.landed = false;
  e.hitWallX = 0;
  e.hitCeil = false;

  const dx = e.vx * dt;
  if (dx) {
    e.x += dx;
    const ty0 = Math.floor((e.y - e.h + 1) / TILE), ty1 = Math.floor((e.y - 1) / TILE);
    if (dx > 0) {
      const tx = Math.floor((e.x + e.w / 2) / TILE);
      for (let ty = ty0; ty <= ty1; ty++) {
        if (level.solid(tx, ty)) { e.x = tx * TILE - e.w / 2 - 0.001; e.vx = 0; e.hitWallX = 1; break; }
      }
    } else {
      const tx = Math.floor((e.x - e.w / 2) / TILE);
      for (let ty = ty0; ty <= ty1; ty++) {
        if (level.solid(tx, ty)) { e.x = (tx + 1) * TILE + e.w / 2 + 0.001; e.vx = 0; e.hitWallX = -1; break; }
      }
    }
  }

  const prevBottom = e.y;
  const dy = e.vy * dt;
  e.y += dy;
  const tx0 = Math.floor((e.x - e.w / 2 + 0.5) / TILE), tx1 = Math.floor((e.x + e.w / 2 - 0.5) / TILE);
  if (dy >= 0) {
    const ty = Math.floor(e.y / TILE);
    for (let tx = tx0; tx <= tx1; tx++) {
      const plat = !e.dropThrough && level.plat(tx, ty) && prevBottom <= ty * TILE + 0.01;
      if (level.solid(tx, ty) || plat) {
        e.y = ty * TILE;
        if (!wasGround) { e.landed = true; e.landVy = e.vy; }
        e.vy = 0;
        e.onGround = true;
        break;
      }
    }
  } else {
    const ty = Math.floor((e.y - e.h) / TILE);
    for (let tx = tx0; tx <= tx1; tx++) {
      if (level.solid(tx, ty)) { e.y = (ty + 1) * TILE + e.h; e.vy = 0; e.hitCeil = true; break; }
    }
  }
}

export function touchingWall(e, level, dir) {
  const tx = Math.floor((e.x + dir * (e.w / 2 + 1)) / TILE);
  const ty0 = Math.floor((e.y - e.h + 2) / TILE), ty1 = Math.floor((e.y - 2) / TILE);
  for (let ty = ty0; ty <= ty1; ty++) if (level.solid(tx, ty)) return true;
  return false;
}

export function groundAt(level, x, y) {
  const tx = Math.floor(x / TILE), ty = Math.floor((y + 2) / TILE);
  return level.solid(tx, ty) || level.plat(tx, ty);
}
