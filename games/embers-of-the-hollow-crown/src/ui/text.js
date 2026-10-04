// UI drawing helpers. The UI canvas is drawn in the same 480x270 virtual
// coordinates as the world but at full device resolution, so text stays crisp.

export const SERIF = 'Georgia, "Palatino Linotype", "Book Antiqua", serif';
export const SANS = '"Trebuchet MS", "Segoe UI", Verdana, sans-serif';

export const UI = { scale: 1 };

export function font(size, family = SANS, style = '') {
  return `${style} ${size}px ${family}`.trim();
}

export function txt(u, s, x, y, o = {}) {
  u.save();
  u.font = o.font || font(o.size || 8, o.family || SANS, o.style || '');
  u.textAlign = o.align || 'left';
  u.textBaseline = o.baseline || 'alphabetic';
  u.globalAlpha = o.alpha ?? 1;
  if (o.spacing) u.letterSpacing = o.spacing + 'px';
  if (o.shadow !== false) {
    u.fillStyle = o.shadowColor || 'rgba(0,0,0,0.8)';
    u.fillText(s, x + 0.6, y + 0.7);
  }
  if (o.glow) {
    u.shadowColor = o.glow;
    u.shadowBlur = (o.blur ?? 6) * UI.scale;
  }
  u.fillStyle = o.color || '#e8e4da';
  u.fillText(s, x, y);
  u.restore();
}

export function measure(u, s, f) {
  u.save();
  u.font = f;
  const w = u.measureText(s).width;
  u.restore();
  return w;
}

export function wrap(u, s, maxW, f) {
  u.save();
  u.font = f;
  const out = [];
  for (const para of s.split('\n')) {
    let cur = '';
    for (const word of para.split(' ')) {
      const t = cur ? cur + ' ' + word : word;
      if (u.measureText(t).width > maxW && cur) { out.push(cur); cur = word; } else cur = t;
    }
    out.push(cur);
  }
  u.restore();
  return out;
}

export function panel(u, x, y, w, h, o = {}) {
  u.save();
  u.fillStyle = o.fill || 'rgba(9,11,18,0.9)';
  u.fillRect(x, y, w, h);
  u.strokeStyle = o.border || 'rgba(255,138,61,0.55)';
  u.lineWidth = 0.6;
  u.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  if (o.corners !== false) {
    u.fillStyle = o.accent || o.border || '#ff8a3d';
    const c = 4;
    for (const [cx, cy, dx, dy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
      u.fillRect(cx - (dx < 0 ? c : 0), cy - (dy < 0 ? 1 : 0), c, 1);
      u.fillRect(cx - (dx < 0 ? 1 : 0), cy - (dy < 0 ? c : 0), 1, c);
    }
  }
  u.restore();
}

export function keyHint(input, action) {
  return `[${input.keyName(action)}]`;
}
