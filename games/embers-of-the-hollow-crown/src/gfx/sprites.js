// Procedural pixel sprites. Each function draws an actor at screen position
// (sx, sy) = bottom-centre, mirrored by `facing`. Local x is positive "forward".

function P(ctx, ox, oy, f, tint) {
  return (x, y, w, h, c) => {
    ctx.fillStyle = tint || c;
    ctx.fillRect(f > 0 ? ox + x : ox - x - w, oy + y, w, h);
  };
}

const tintOf = (e) => (e.flash > 0 ? '#ffffff' : e.teleTint ? '#ff4a4a' : null);

// ---- Kael -------------------------------------------------------------------

const KC = {
  cape: '#5a1e22', capeHi: '#7a2a2c', armor: '#2f3648', armorHi: '#4a5470', trim: '#ff8a3d',
  skin: '#d9c0a3', hair: '#17151d', boot: '#1c1f2a', boot2: '#14161e', blade: '#ffb46a', core: '#fff4dc', hilt: '#6b5444', eye: '#ffb070',
};

export function drawKael(ctx, sx, sy, p) {
  const f = p.facing;
  const r = P(ctx, sx, sy, f, p.flash > 0 ? '#ffffff' : null);
  const t = p.anim, st = p.state, a = p.atk;

  if (st === 'sleep') {
    r(-11, -4, 20, 4, KC.armor); r(-11, -4, 20, 1, KC.armorHi);
    r(-13, -2, 6, 2, KC.cape); r(9, -6, 6, 5, KC.skin); r(9, -7, 6, 2, KC.hair); r(13, -6, 2, 4, KC.hair);
    r(-5, -1, 12, 1, KC.trim);
    return;
  }

  let bob = 0, l1 = 0, l2 = 0, lean = 0, drop = 0;
  if (st === 'idle') bob = Math.floor(t * 1.7) % 2 ? 0 : -1;
  if (st === 'run') { const ph = Math.floor(t * 11) % 4; l1 = [2, 1, -2, -1][ph]; l2 = -l1; bob = ph % 2 ? -1 : 0; }
  if (st === 'jump') { l1 = 1; l2 = -1; }
  if (st === 'fall') { l1 = -1; l2 = 1; }
  if (st === 'dash') lean = 2;
  if (st === 'hurt') lean = -2;
  if (st === 'dead' || st === 'kneel') drop = 5;
  if (st === 'wall') lean = -1;

  // Cape.
  const flow = Math.min(5, Math.abs(p.vx) / 30);
  const wave = Math.round(Math.sin(t * 9));
  const lift = st === 'fall' ? -2 : st === 'jump' ? 2 : 0;
  r(-6 + lean, -19 + bob + drop, 3, 11, KC.cape);
  r(-8 - Math.round(flow * 0.6) + lean, -16 + bob + lift + drop, 3, 9, KC.cape);
  r(-10 - Math.round(flow) + lean, -13 + bob + lift + wave + drop, 2, 6, KC.capeHi);

  // Legs.
  if (drop) {
    r(-4, -4, 8, 4, KC.boot); r(2, -7 + 3, 3, 3, KC.boot2);
  } else {
    r(-3 + l2, -7, 3, 7, KC.boot2);
    r(1 + l1, -7, 3, 7, KC.boot);
  }

  // Torso and head.
  const ty = -17 + bob + drop;
  r(-4 + lean, ty, 8, 10, KC.armor);
  r(-4 + lean, ty, 2, 10, KC.armorHi);
  r(-4 + lean, ty + 8, 8, 1, KC.trim);
  const hy = -24 + bob + drop + (st === 'dead' ? 2 : 0);
  r(-2 + lean, hy, 6, 7, KC.skin);
  r(-3 + lean, hy - 1, 7, 3, KC.hair);
  r(-3 + lean, hy + 1, 2, 5, KC.hair);
  r(2 + lean, hy + 3, 1, 1, KC.eye);

  if (!p.hasBlade) {
    r(1 + lean, ty + 2, 2, 7, KC.armorHi);
    return;
  }

  // Arm and blade.
  const blade = (x, y, w, h) => { r(x, y, w, h, KC.blade); };
  const core = (x, y, w, h) => { r(x, y, w, h, KC.core); };
  if (a) {
    const active = a.t >= a.a0 && a.t <= a.a1;
    const wind = a.t < a.a0;
    if (a.kind === 'side') {
      if (wind) { r(-1 + lean, ty - 2, 2, 6, KC.armorHi); blade(-3, ty - 12, 2, 11); }
      else if (active) { r(2, ty + 1, 7, 2, KC.armorHi); blade(9, ty + 1, 13, 2); core(9, ty + 1, 12, 1); }
      else { r(2, ty + 2, 5, 2, KC.armorHi); for (let i = 0; i < 9; i++) r(7 + i, ty + 3 + (i >> 1), 1, 1, KC.blade); }
    } else if (a.kind === 'up') {
      r(1, ty - 8, 2, 10, KC.armorHi);
      if (!wind) { blade(1, ty - 21, 2, 13); core(1, ty - 20, 1, 11); } else blade(4, ty - 4, 9, 1);
    } else if (a.kind === 'down') {
      r(1, ty + 4, 2, 8, KC.armorHi);
      if (!wind) { blade(1, ty + 11, 2, 13); core(1, ty + 12, 1, 11); } else blade(4, ty - 2, 9, 1);
    } else if (a.kind === 'heavy') {
      r(2, ty + 1, 7, 2, KC.armorHi); blade(9, ty, 16, 3); core(9, ty + 1, 15, 1);
    }
    return;
  }
  if (st === 'parry') {
    r(2, ty + 2, 4, 2, KC.armorHi);
    blade(5, ty - 12, 2, 18); core(5, ty - 11, 1, 16); r(3, ty + 5, 6, 1, KC.hilt);
    return;
  }
  if (st === 'burst') {
    r(-6 + lean, ty + 1, 3, 2, KC.armorHi); r(4 + lean, ty + 1, 3, 2, KC.armorHi);
    blade(-1, ty - 20, 2, 14); core(-1, ty - 19, 1, 12);
    return;
  }
  if (st === 'dash') {
    r(-2 + lean, ty + 3, 3, 2, KC.armorHi);
    blade(-15, ty + 4, 13, 1);
    return;
  }
  if (p.charge > 0.12) {
    const glow = p.charge >= 0.6 && Math.floor(t * 16) % 2 === 0;
    r(-3 + lean, ty + 2, 3, 3, KC.armorHi);
    r(-14, ty + 3, 12, 2, glow ? '#ffffff' : KC.blade);
    return;
  }
  // Rest pose: blade angled down and forward.
  r(2 + lean, ty + 3, 2, 5, KC.armorHi);
  r(3 + lean, ty + 7, 2, 2, KC.hilt);
  for (let i = 0; i < 10; i++) r(5 + lean + Math.floor(i * 0.8), ty + 9 + Math.floor(i * 0.55), 1, 1, i > 6 ? KC.core : KC.blade);
}

// Blade arc for melee attacks, drawn additively over the world.
export function drawSlash(ctx, sx, sy, p) {
  const a = p.atk;
  if (!a) return;
  const span = a.a1 - a.a0 + 0.07;
  const prog = (a.t - a.a0) / span;
  if (prog < 0 || prog > 1) return;
  const big = a.counter || a.kind === 'heavy' ? 1.45 : a.third ? 1.2 : 1;
  const f = p.facing;
  let cx = sx + f * 2, cy = sy - 13, base, half = 1.15;
  if (a.kind === 'up') { cx = sx; cy = sy - 16; base = -Math.PI / 2; half = 1.25; }
  else if (a.kind === 'down') { cx = sx; cy = sy - 6; base = Math.PI / 2; half = 1.1; }
  else base = f > 0 ? 0 : Math.PI;
  const dir = (a.combo === 2 ? -1 : 1) * (a.kind === 'side' ? f : 1);
  const rad = (a.kind === 'side' ? 20 : 19) * big;
  const th = (k) => base + dir * (-half + 2 * half * k);
  const k1 = Math.min(1, prog * 1.4), k0 = Math.max(0, k1 - 0.6);
  const col = a.counter ? ['255,110,235', '255,235,255'] : a.kind === 'heavy' ? ['255,200,90', '255,255,240'] : ['255,138,61', '255,242,215'];
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const [w, c, al] of [[6 * big, col[0], 0.35], [3, col[0], 0.7], [1.2, col[1], 1]]) {
    ctx.strokeStyle = `rgba(${c},${al * (1 - prog * 0.75)})`;
    ctx.lineWidth = w;
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) {
      const ang = th(k0 + (k1 - k0) * (i / 12));
      const px = cx + Math.cos(ang) * rad, py = cy + Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.restore();
}

// ---- Enemies ---------------------------------------------------------------

export function drawHusk(ctx, sx, sy, e) {
  const r = P(ctx, sx, sy, e.facing, tintOf(e));
  const ph = Math.abs(e.vx) > 5 ? Math.floor(e.t * 8) % 2 : 0;
  const B = '#3a3346', D = '#241f2c', S = '#5c536b', E = '#e86bff', BONE = '#c9cdd6';
  r(-4, -6, 3, 6, D); r(1 + ph, -6, 3, 6, D);
  r(-6, -16, 10, 10, B); r(-5, -18, 8, 3, B); r(-7, -17, 3, 6, D);
  r(0, -21, 7, 6, S); r(0, -21, 7, 1, D);
  r(4, -19, 1, 1, E); r(6, -19, 1, 1, E);
  if (e.state === 'windup') { r(-3, -28, 3, 12, S); r(-4, -30, 2, 2, BONE); r(-1, -30, 2, 2, BONE); }
  else if (e.state === 'strike') { r(3, -15, 11, 3, S); r(14, -16, 2, 1, BONE); r(14, -13, 2, 1, BONE); }
  else { r(3, -14, 3, 10, S); r(3, -4, 3, 1, BONE); }
  r(-2, -9 + (Math.floor(e.t * 3) % 4), 1, 1, '#d23cff');
}

export function drawWisp(ctx, sx, sy, e) {
  const cy = sy - 7;
  const fl = Math.floor(e.t * 12) % 2;
  const angry = e.state === 'notice' || e.state === 'dive';
  const tint = e.flash > 0 ? '#ffffff' : null;
  const R = (x, y, w, h, c) => { ctx.fillStyle = tint || c; ctx.fillRect(sx + x, cy + y, w, h); };
  R(-5, -4, 10, 9, '#2a0a36'); R(-4, -6, 8, 13, '#2a0a36');
  R(-3, -3, 6, 6, angry && fl ? '#ff4a6a' : '#d23cff');
  R(-1, -1, 3, 3, '#f3a6ff');
  R(-2, -8 - fl, 2, 3, '#d23cff'); R(1, -7 + fl, 1, 2, '#f3a6ff');
  R(-2, 0, 1, 1, '#07040b'); R(1, 0, 1, 1, '#07040b');
}

export function drawShield(ctx, sx, sy, e) {
  const r = P(ctx, sx, sy, e.facing, tintOf(e));
  const ph = Math.abs(e.vx) > 5 ? Math.floor(e.t * 6) % 2 : 0;
  const A = '#3d4656', AH = '#566178', D = '#232836', S = '#5a6578', M = '#8a2aa0', STEEL = '#9aa1ae';
  r(-4, -7, 3, 7, D); r(1 + ph, -7, 3, 7, D);
  r(-5, -19, 10, 12, A); r(-5, -19, 2, 12, AH);
  r(-3, -25, 7, 6, A); r(-3, -26, 7, 1, AH); r(1, -23, 3, 1, '#e86bff');
  if (e.state === 'windup') { r(-16, -15, 20, 1, '#6b5444'); r(4, -16, 3, 3, STEEL); }
  else if (e.state === 'thrust') { r(-2, -15, 30, 1, '#6b5444'); r(28, -16, 4, 3, STEEL); }
  else { r(-7, -31, 1, 25, '#6b5444'); r(-8, -34, 3, 3, STEEL); }
  if (e.state === 'broken') {
    r(2, -11, 6, 11, S); r(2, -11, 6, 1, D);
    const s = Math.floor(e.t * 6) % 3;
    r(-3 + s * 2, -30, 1, 1, '#ffcf5a'); r(3 - s, -29, 1, 1, '#ffcf5a');
  } else {
    r(4, -23, 6, 19, S); r(4, -23, 6, 1, D); r(9, -23, 1, 19, D); r(4, -5, 6, 1, D);
    r(6, -16, 3, 4, M); r(7, -17, 1, 6, M);
  }
}

export function drawArcher(ctx, sx, sy, e) {
  const r = P(ctx, sx, sy, e.facing, tintOf(e));
  const ph = Math.abs(e.vx) > 5 ? Math.floor(e.t * 8) % 2 : 0;
  const C = '#383246', H = '#2a2f3a', D = '#1d1a24', WOOD = '#7a5c44', STR = '#c9cdd6';
  r(-3, -7, 2, 7, D); r(1 + ph, -7, 2, 7, D);
  r(-4, -17, 8, 11, C); r(-5, -12, 2, 7, C);
  r(-3, -24, 7, 7, H); r(-4, -22, 2, 6, H); r(0, -21, 3, 3, '#120f18'); r(2, -20, 1, 1, '#ff5a5a');
  if (e.state === 'aim' || e.state === 'shoot') {
    r(6, -25, 1, 2, WOOD); r(7, -23, 1, 12, WOOD); r(6, -11, 1, 2, WOOD);
    const pull = e.state === 'aim' ? Math.min(4, Math.floor(e.st * 6)) : 0;
    r(6 - pull, -18, 1, 2, STR); r(6, -23, 1, 5, STR); r(6, -16, 1, 5, STR);
    if (e.state === 'aim') r(2 - pull, -18, 9, 1, STR);
    r(3, -17, 4, 2, C);
  } else {
    r(-6, -24, 1, 14, WOOD); r(-5, -24, 1, 14, STR);
    r(3, -15, 2, 6, C);
  }
}

export function drawCrate(ctx, sx, sy, e) {
  const tint = e.flash > 0 ? '#ffffff' : null;
  const R = (x, y, w, h, c) => { ctx.fillStyle = tint || c; ctx.fillRect(sx + x, sy + y, w, h); };
  R(-7, -14, 14, 14, '#5a4334'); R(-7, -14, 14, 1, '#7a5c44');
  R(-7, -10, 14, 1, '#3e2e24'); R(-7, -5, 14, 1, '#3e2e24');
  R(-7, -14, 1, 14, '#3e2e24'); R(6, -14, 1, 14, '#3e2e24');
  for (let i = 0; i < 12; i++) R(-6 + i, -13 + i, 1, 1, '#3e2e24');
  R(-7, -14, 2, 2, '#8a8f9c'); R(5, -14, 2, 2, '#8a8f9c'); R(-7, -2, 2, 2, '#8a8f9c'); R(5, -2, 2, 2, '#8a8f9c');
}

// ---- Warden Grull ------------------------------------------------------------

export function drawGrull(ctx, sx, sy, e) {
  const f = e.facing;
  const r = P(ctx, sx, sy, f, tintOf(e));
  const p2 = e.phase === 2;
  const I = '#4a5262', IH = '#6b7487', ID = '#2c313c', BODY = '#3b4458', EYE = p2 ? '#f3a6ff' : '#ffcf5a';
  const st = e.state;
  const crouch = st === 'slam_w' || st === 'stunned' || st === 'dying' ? 4 : 0;
  const walk = Math.abs(e.vx) > 10 ? Math.floor(e.t * 6) % 2 : 0;

  if (st === 'dead') {
    r(-18, -8, 36, 8, BODY); r(-18, -8, 36, 1, IH); r(14, -14, 12, 9, I); r(16, -11, 6, 2, '#0b0d14');
    return;
  }
  // Legs.
  r(-11, -13, 9, 13, ID); r(3 + walk, -13, 9, 13, ID);
  r(-12, -3, 10, 3, '#1c1f28'); r(3 + walk, -3, 10, 3, '#1c1f28');
  // Torso.
  const ty = -36 + crouch;
  r(-14, ty, 28, 24, BODY); r(-14, ty, 4, 24, '#4a5470'); r(-10, ty + 6, 20, 2, ID);
  r(-12, ty + 20, 24, 3, '#2a1f18'); r(-1, ty + 21, 3, 3, '#c9a35a');
  if (!e.keyTaken) { r(-2, ty + 24, 1, 4, '#ffcf5a'); r(-3, ty + 27, 3, 2, '#ffcf5a'); }
  // Pauldrons.
  r(-18, ty - 3, 11, 8, I); r(-18, ty - 3, 11, 1, IH); r(8, ty - 3, 11, 8, I); r(8, ty - 3, 11, 1, IH);
  // Head.
  if (p2) {
    r(-6, ty - 13, 13, 13, '#5e5a6e'); r(-6, ty - 13, 13, 2, '#3a3446');
    r(-3, ty - 8, 3, 2, '#0b0d14'); r(3, ty - 8, 3, 2, '#0b0d14');
    r(-2, ty - 8, 1, 1, EYE); r(4, ty - 8, 1, 1, EYE);
    r(-2, ty - 6, 1, 4, '#d23cff'); r(4, ty - 6, 1, 3, '#d23cff');
    r(-1, ty - 3, 5, 1, '#1a1020');
  } else {
    r(-7, ty - 14, 15, 14, I); r(-7, ty - 14, 3, 14, IH); r(1, ty - 16, 2, 6, '#5d6678');
    r(-4, ty - 8, 11, 2, '#0b0d14'); r(-2, ty - 8, 2, 1, EYE); r(4, ty - 8, 2, 1, EYE);
  }
  // Lantern arm (back).
  const lg = e.lanternGlow || 0;
  r(-20, ty + 4, 4, 10, BODY);
  r(-22, ty + 14, 7, 9, '#c9a35a'); r(-21, ty + 15, 5, 7, lg > 0.7 ? '#ffffff' : p2 ? '#e86bff' : '#ffb46a');
  if (st === 'lantern_w' || st === 'lantern') { r(-20, ty - 14, 4, 18, BODY); r(-22, ty - 22, 7, 9, '#c9a35a'); r(-21, ty - 21, 5, 7, '#ffffff'); }
  // Flail arm (front) and the chain ball.
  const ball = e.ballLocal || { x: 22, y: -6 };
  r(14, ty + 4, 5, 10, BODY);
  const hx = 16, hy = ty + 14;
  const steps = 6;
  for (let i = 1; i < steps; i++) {
    const cx = Math.round(hx + (ball.x - hx) * (i / steps)), cy = Math.round(hy + (ball.y - hy) * (i / steps));
    r(cx, cy, 2, 2, '#8a8f9c');
  }
  r(ball.x - 5, ball.y - 5, 10, 10, '#5a6578'); r(ball.x - 5, ball.y - 5, 10, 2, '#7d8698');
  r(ball.x - 7, ball.y - 1, 2, 2, '#9aa1ae'); r(ball.x + 5, ball.y - 1, 2, 2, '#9aa1ae'); r(ball.x - 1, ball.y - 7, 2, 2, '#9aa1ae'); r(ball.x - 1, ball.y + 5, 2, 2, '#9aa1ae');
  if (st === 'stunned' || st === 'stagger') {
    const s = Math.floor(e.t * 6) % 3;
    r(-6 + s * 4, ty - 22, 2, 2, '#ffcf5a'); r(6 - s * 3, ty - 20, 1, 1, '#ffcf5a'); r(s * 2, ty - 24, 1, 1, '#fff4dc');
  }
}

// ---- NPCs ------------------------------------------------------------------

export function drawLyra(ctx, sx, sy, n) {
  const r = P(ctx, sx, sy, n.facing, null);
  const ph = Math.abs(n.vx) > 5 ? Math.floor(n.t * 9) % 2 : 0;
  const bob = Math.floor(n.t * 1.5) % 2 ? 0 : -1;
  r(-3, -7, 3, 7, '#2b1d16'); r(1 + ph, -7, 3, 7, '#2b1d16'); r(-3, -10, 7, 3, '#3b4a52');
  r(-4, -19 + bob, 9, 10, '#2f6f7a'); r(-5, -13 + bob, 2, 7, '#2f6f7a'); r(-4, -10 + bob, 9, 1, '#c9a35a');
  r(-2, -25 + bob, 6, 6, '#a86f4c'); r(-3, -26 + bob, 7, 2, '#2b1b14'); r(-3, -24 + bob, 2, 6, '#2b1b14');
  r(-3, -27 + bob, 7, 2, '#3fa7b8'); r(-5, -26 + bob, 2, 2, '#3fa7b8'); r(0, -26 + bob, 4, 1, '#c9a35a');
  r(2, -22 + bob, 1, 1, '#2b1b14');
  if (n.aiming) { r(3, -18 + bob, 8, 2, '#2f6f7a'); r(11, -19 + bob, 4, 2, '#555b66'); }
  else { r(4, -18 + bob, 2, 6, '#2f6f7a'); r(3, -11 + bob, 3, 2, '#555b66'); }
}

export function drawOskar(ctx, sx, sy, n) {
  const r = P(ctx, sx, sy, n.facing, null);
  const bob = Math.floor(n.t * 1.2) % 2 ? 0 : -1;
  r(-5, -20, 10, 20, '#5c4632'); r(-6, -3, 12, 3, '#4a3828'); r(-5, -11, 10, 1, '#c9a66b');
  r(-4, -27 + bob, 8, 8, '#5c4632'); r(-4, -27 + bob, 8, 1, '#73593f');
  r(-1, -24 + bob, 4, 5, '#c9a487'); r(-1, -20 + bob, 4, 4, '#a7adb5'); r(2, -23 + bob, 1, 1, '#3a2c22');
  r(6, -30, 1, 30, '#6b5444'); r(4, -33, 5, 5, '#c9a35a'); r(5, -32, 3, 3, '#ffd08a');
}

// ---- Props -----------------------------------------------------------------

export function drawShrine(ctx, sx, sy, s, t) {
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(sx + x, sy + y, w, h); };
  R(-11, -6, 22, 6, '#3b4458'); R(-11, -6, 22, 1, '#69728a');
  R(-7, -16, 14, 10, '#4a5262'); R(-7, -16, 2, 10, '#69728a');
  R(-10, -20, 20, 4, '#5a6578'); R(-10, -20, 20, 1, '#8a93a8');
  R(-3, -12, 6, 4, s.lit ? '#ff8a3d' : '#2a3142');
  if (s.lit) {
    const fl = Math.floor(t * 10) % 3;
    R(-6, -24, 12, 4, '#c2410c'); R(-5, -27 - fl, 10, 4, '#ff8a3d'); R(-3, -31 - fl, 6, 5, '#ffd08a'); R(-1, -33 - (fl % 2), 2, 3, '#fff4dc');
  } else {
    R(-5, -22, 10, 2, '#232836');
  }
}

export function drawTablet(ctx, sx, sy, t, read) {
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(sx + x, sy + y, w, h); };
  R(-8, -22, 16, 22, '#3a4152'); R(-8, -22, 16, 1, '#5a6578'); R(-8, -22, 1, 22, '#4f586c'); R(-9, -2, 18, 2, '#2a3142');
  const glow = read ? '#5f7bb0' : Math.floor(t * 2) % 2 ? '#9fc0ff' : '#7fa4f0';
  for (let i = 0; i < 5; i++) R(-5, -18 + i * 3, 4 + ((i * 7) % 6), 1, glow);
}

export function drawMemory(ctx, sx, sy, t) {
  const y = sy - 10 + Math.round(Math.sin(t * 2.4) * 2);
  const R = (x, yy, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(sx + x, y + yy, w, h); };
  R(-1, -7, 2, 2, '#fff4dc'); R(-2, -5, 4, 4, '#ffe2a8'); R(-3, -1, 6, 3, '#ffd08a'); R(-2, 2, 4, 3, '#e6a85a'); R(-1, 5, 2, 2, '#c2410c');
  R(-1, -4, 1, 6, '#ffffff');
}

export function drawDoor(ctx, sx, sy) {
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(sx + x, sy + y, w, h); };
  for (let i = 0; i < 4; i++) { R(-7 + i * 4, -64, 2, 64, '#5a6578'); R(-7 + i * 4, -64, 1, 64, '#7d8698'); }
  R(-8, -60, 16, 3, '#3b4458'); R(-8, -34, 16, 3, '#3b4458'); R(-8, -8, 16, 3, '#3b4458');
  R(4, -36, 3, 4, '#8a6a3a');
}

export function drawGate(ctx, sx, sy, g) {
  const lift = Math.round(g.lift * 60);
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(sx + x, sy + y - lift, w, h); };
  for (let i = 0; i < 4; i++) { R(-7 + i * 4, -64, 2, 62, '#4a5262'); R(-7 + i * 4, -2, 2, 2, '#9aa1ae'); }
  R(-8, -50, 16, 2, '#2c313c'); R(-8, -26, 16, 2, '#2c313c');
  if (g.magic) R(-8, -64, 16, 64, `rgba(210,60,255,${0.15 + 0.1 * Math.sin(g.t * 5)})`);
}

export function drawTorch(ctx, sx, sy, t) {
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(sx + x, sy + y, w, h); };
  R(-2, 2, 4, 4, '#3b4458'); R(-1, 6, 2, 3, '#2a3142');
  const fl = Math.floor(t * 12) % 3;
  R(-2, -2, 4, 4, '#c2410c'); R(-2, -5 - (fl === 1 ? 1 : 0), 3, 4, '#ff8a3d'); R(-1, -7 - fl % 2, 2, 3, '#ffd08a');
}

export function drawSign(ctx, sx, sy) {
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(sx + x, sy + y, w, h); };
  R(-1, -12, 2, 12, '#4a3a30'); R(-6, -16, 12, 7, '#6b5444'); R(-6, -16, 12, 1, '#8a6e58'); R(-4, -13, 8, 1, '#3a2c22');
}

export function drawSkiff(ctx, sx, sy, t) {
  const bob = Math.round(Math.sin(t * 1.6) * 2);
  const R = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(sx + x, sy + y + bob, w, h); };
  R(-34, -54, 68, 22, '#2f6f7a'); R(-30, -58, 60, 4, '#2f6f7a'); R(-34, -54, 68, 2, '#56c7d6'); R(-26, -60, 52, 2, '#3fa7b8');
  for (let i = -24; i <= 24; i += 12) R(i, -32, 1, 14, '#8a8f9c');
  R(-30, -18, 60, 10, '#5a4334'); R(-34, -14, 68, 6, '#4a3528'); R(-30, -18, 60, 2, '#7a5c44');
  R(-26, -10, 52, 2, '#3e2e24'); R(30, -16, 8, 3, '#ffcf5a'); R(-38, -14, 4, 2, '#c9a35a');
}
