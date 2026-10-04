// Smooth follow camera with look-ahead, a vertical dead zone, room bounds
// that ease between rooms, arena locking and trauma-based screen shake.

import { W, H } from '../config.js';
import { approach, clamp, lerp } from '../util.js';

export class Camera {
  constructor() {
    this.x = 0; this.y = 0; this.px = 0; this.py = 0;
    this.cb = null;
    this.look = 0;
    this.trauma = 0;
    this.ox = 0; this.oy = 0;
    this.override = null;
    this.lock = null;
    this.shakeOn = true;
    this.focusY = 0;
  }

  clampTo(b) {
    if (b.x1 - b.x0 <= W) this.x = (b.x0 + b.x1) / 2 - W / 2;
    else this.x = clamp(this.x, b.x0, b.x1 - W);
    if (b.y1 - b.y0 <= H) this.y = b.y1 - H;
    else this.y = clamp(this.y, b.y0, b.y1 - H);
  }

  snap(tx, ty, bounds) {
    this.cb = { ...bounds };
    this.x = tx - W / 2;
    this.y = ty - H / 2 - 30;
    this.focusY = ty;
    this.clampTo(this.cb);
    this.px = this.x; this.py = this.y;
  }

  update(dt, target, bounds) {
    this.px = this.x; this.py = this.y;
    const b = this.lock || bounds;
    if (!this.cb) this.cb = { ...b };
    const k = 1 - Math.exp(-dt * 6);
    for (const key of ['x0', 'y0', 'x1', 'y1']) this.cb[key] = lerp(this.cb[key], b[key], k);

    let tx, ty;
    if (this.override) {
      tx = this.override.x - W / 2;
      ty = this.override.y - H / 2;
      this.x = lerp(this.x, tx, 1 - Math.exp(-dt * 3.2));
      this.y = lerp(this.y, ty, 1 - Math.exp(-dt * 3.2));
    } else {
      const moving = Math.abs(target.vx) > 20;
      this.look = approach(this.look, target.facing * (moving ? 38 : 18), 70 * dt);
      // Vertical dead zone: only re-centre when grounded or drifting far.
      const fy = target.y - 26;
      if (target.onGround || Math.abs(fy - this.focusY) > 52) this.focusY = lerp(this.focusY, fy, 1 - Math.exp(-dt * 5));
      tx = target.x + this.look - W / 2;
      ty = this.focusY - H / 2;
      this.x = lerp(this.x, tx, 1 - Math.exp(-dt * 7));
      this.y = lerp(this.y, ty, 1 - Math.exp(-dt * 4.5));
    }
    this.clampTo(this.cb);
    this.tickShake(dt);
  }

  // Shake keeps animating during hit-stop, when the rest of the world is frozen.
  tickShake(dt) {
    this.trauma = Math.max(0, this.trauma - dt * 1.7);
    const s = this.trauma * this.trauma;
    this.ox = (Math.random() * 2 - 1) * 7 * s;
    this.oy = (Math.random() * 2 - 1) * 6 * s;
  }

  shake(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  view(alpha) {
    const sx = this.shakeOn ? this.ox : 0, sy = this.shakeOn ? this.oy : 0;
    return { x: Math.round(lerp(this.px, this.x, alpha) + sx), y: Math.round(lerp(this.py, this.y, alpha) + sy) };
  }
}
