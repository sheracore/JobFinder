// In-game HUD: health pips, Ember meter, shard counter, combo / style rank and
// the boss health bar.

import { COMBAT, rankFor } from '../config.js';
import { font, SANS, SERIF, txt, UI } from './text.js';

function pip(u, x, y, full, glow, t) {
  u.save();
  u.beginPath();
  u.moveTo(x, y - 6); u.lineTo(x + 4.5, y); u.lineTo(x, y + 6); u.lineTo(x - 4.5, y); u.closePath();
  if (full) {
    const g = u.createLinearGradient(x, y - 6, x, y + 6);
    g.addColorStop(0, '#ffe0a8');
    g.addColorStop(0.5, '#ff8a3d');
    g.addColorStop(1, '#a8330a');
    u.fillStyle = g;
    if (glow) { u.shadowColor = '#ff8a3d'; u.shadowBlur = 8 * UI.scale; }
    u.fill();
    u.shadowBlur = 0;
    u.fillStyle = 'rgba(255,255,240,0.8)';
    u.fillRect(x - 1, y - 3.5 + Math.sin(t * 2) * 0.3, 1, 2);
  } else {
    u.fillStyle = 'rgba(10,10,16,0.75)';
    u.fill();
    u.strokeStyle = 'rgba(160,150,140,0.55)';
    u.lineWidth = 0.6;
    u.stroke();
  }
  u.restore();
}

export function drawHUD(u, g) {
  const p = g.player, t = g.time;
  const lowHp = p.hp === 1 && Math.floor(t * 3) % 2 === 0;
  for (let i = 0; i < p.maxHp; i++) pip(u, 16 + i * 11, 15, i < p.hp, g.hpFlash > 0 || lowHp, t + i);

  // Ember meter with the Burst threshold marked.
  const x = 10, y = 26, w = 84, h = 5;
  const k = p.ember / p.emberMax;
  const ready = p.ember >= COMBAT.burstCost;
  u.fillStyle = 'rgba(0,0,0,0.6)';
  u.fillRect(x - 1, y - 1, w + 2, h + 2);
  const gr = u.createLinearGradient(x, 0, x + w, 0);
  gr.addColorStop(0, '#a8330a');
  gr.addColorStop(1, ready ? '#ffd08a' : '#ff8a3d');
  u.fillStyle = gr;
  u.save();
  if (ready) { u.shadowColor = '#ff8a3d'; u.shadowBlur = (4 + Math.sin(t * 6) * 2) * UI.scale; }
  u.fillRect(x, y, w * k, h);
  u.restore();
  if (g.emberDeny > 0) {
    u.fillStyle = `rgba(255,60,60,${g.emberDeny * 1.6})`;
    u.fillRect(x - 1, y - 1, w + 2, h + 2);
  }
  const notch = x + w * (COMBAT.burstCost / p.emberMax);
  u.fillStyle = 'rgba(255,240,220,0.85)';
  u.fillRect(notch, y - 1, 0.7, h + 2);
  u.strokeStyle = 'rgba(255,170,110,0.4)';
  u.lineWidth = 0.5;
  u.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
  txt(u, 'EMBER', x + w + 4, y + 4.6, { size: 5, color: ready ? '#ffd08a' : '#a89a8a', style: 'bold' });

  // Shard counter.
  const sx = 13, sy = 41;
  u.fillStyle = g.shardFlash > 0 ? '#fff4dc' : '#ff8a3d';
  u.beginPath();
  u.moveTo(sx, sy - 4); u.lineTo(sx + 3, sy); u.lineTo(sx, sy + 4); u.lineTo(sx - 3, sy); u.closePath();
  u.fill();
  txt(u, String(g.save.currency), sx + 7, sy + 3, { size: 8, color: '#f0e6d6', style: 'bold' });
}

export function drawCombo(u, g) {
  if (g.combo < 2 || g.comboT <= 0) return;
  const r = rankFor(g.combo);
  const a = Math.min(1, g.comboT * 2);
  const pulse = 1 + g.rankPulse * 1.6;
  u.save();
  u.translate(452, 34);
  u.scale(pulse, pulse);
  txt(u, r.name, 0, 0, { font: font(24, SERIF, 'bold italic'), align: 'center', color: r.color, alpha: a, glow: r.color, blur: 10 });
  u.restore();
  txt(u, `${g.combo} HITS`, 452, 46, { size: 6.5, align: 'center', color: '#e8e0d0', alpha: a, style: 'bold' });
  txt(u, `×${r.mult} ember`, 452, 54, { size: 5.5, align: 'center', color: '#b8ab98', alpha: a });
  u.fillStyle = `rgba(255,255,255,${0.25 * a})`;
  u.fillRect(432, 58, 40 * Math.min(1, g.comboT / 2.6), 1);
}

export function drawBossBar(u, g) {
  const b = g.bossBar;
  if (!b) return;
  const x = 100, w = 280, y = 252, h = 5;
  g.bossChip = g.bossChip ?? b.hp;
  txt(u, b.name, 240, y - 5, { font: font(8, SERIF, 'bold'), align: 'center', color: b.phase === 2 ? '#f3a6ff' : '#e8dcc8', spacing: 1.5 });
  u.fillStyle = 'rgba(0,0,0,0.7)';
  u.fillRect(x - 1, y - 1, w + 2, h + 2);
  u.fillStyle = 'rgba(255,255,255,0.6)';
  u.fillRect(x, y, w * Math.max(0, g.bossChip / b.maxHp), h);
  const gr = u.createLinearGradient(x, 0, x + w, 0);
  if (b.phase === 2) { gr.addColorStop(0, '#5b1673'); gr.addColorStop(1, '#d23cff'); }
  else { gr.addColorStop(0, '#7a1f2b'); gr.addColorStop(1, '#ff4a4a'); }
  u.fillStyle = gr;
  u.fillRect(x, y, w * Math.max(0, b.hp / b.maxHp), h);
  // Phase marker at 50%.
  u.fillStyle = '#ffd08a';
  u.fillRect(x + w * 0.5 - 0.5, y - 2, 1, h + 4);
  u.strokeStyle = 'rgba(232,220,200,0.5)';
  u.lineWidth = 0.5;
  u.strokeRect(x - 0.5, y - 0.5, w + 1, h + 1);
  txt(u, b.title, 240, y + 14, { size: 5.5, align: 'center', color: '#9d958a', style: 'italic', family: SANS });
}
