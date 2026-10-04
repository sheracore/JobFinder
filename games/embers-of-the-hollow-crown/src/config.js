// Global constants: internal resolution, palette and gameplay tuning.

export const W = 480;
export const H = 270;
export const TILE = 16;
export const DT = 1 / 60;

export const PAL = {
  ember: '#ff8a3d', emberHi: '#ffd08a', emberCore: '#fff4dc', emberDeep: '#c2410c',
  hollow: '#d23cff', hollowHi: '#f3a6ff', hollowDeep: '#5b1673',
  ink: '#07080d', night: '#121624', steel: '#2f3648', steelHi: '#4a5470',
  bone: '#c9cdd6', mist: '#8a94a8', red: '#ff3b47', gold: '#ffcf5a', teal: '#56c7d6', white: '#f4f1ea',
};

export const PHYS = {
  gravity: 1500,
  maxFall: 430,
  run: 118,
  accelGround: 1700,
  accelAir: 1150,
  jumpVel: 400,
  jumpCut: 0.45,
  coyote: 0.1,
  jumpBuffer: 0.13,
  dashSpeed: 315,
  dashTime: 0.16,
  dashCooldown: 0.42,
  dashJumpSpeed: 215,
  pogoVel: 365,
  wallSlide: 70,
  wallJumpX: 175,
  wallJumpY: 370,
};

export const COMBAT = {
  baseDamage: 10,
  burstCost: 50,
  burstDamage: 34,
  burstRadius: 76,
  emberPerHit: 7,
  emberPerParry: 18,
  parryWindow: 0.15,
  counterWindow: 0.7,
  counterMult: 2.5,
  iframes: 1.0,
};

export const RANKS = [
  { name: 'C', min: 0, mult: 1, color: '#9aa3b5' },
  { name: 'B', min: 5, mult: 1.25, color: '#7fc8ff' },
  { name: 'A', min: 10, mult: 1.5, color: '#ffcf5a' },
  { name: 'S', min: 20, mult: 2, color: '#ff6ad5' },
];

export function rankFor(combo) {
  let r = RANKS[0];
  for (const k of RANKS) if (combo >= k.min) r = k;
  return r;
}
