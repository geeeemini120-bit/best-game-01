// VOIDHARVEST — every tuning number and colour in one place. The playfield is a fixed
// 1280x720 logical area; the renderer scales it to the window, so no rule below depends on
// the screen size.

export const FIELD = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 16,
  speed: 340,
  hull: 3,
  maxHull: 5,
  fireInterval: 0.16,
  bulletSpeed: 760,
  bulletRadius: 5,
  bulletDamage: 1,
  invulnerable: 1.6,
  pickupRadius: 90,
};

export const BULLET = { radius: 5, life: 1.1 };

export const ENEMY = {
  drifter: { radius: 18, hp: 2, speed: 120, score: 50, dust: 3, color: '#ff4da6', name: 'Drifter' },
  spitter: { radius: 20, hp: 3, speed: 85, score: 90, dust: 4, color: '#ffb347', name: 'Spitter', shotInterval: 2.2, shotSpeed: 260 },
  splitter: { radius: 30, hp: 6, speed: 60, score: 140, dust: 5, color: '#37e6c8', name: 'Splitter' },
  mite: { radius: 10, hp: 1, speed: 210, score: 25, dust: 1, color: '#7ef0d4', name: 'Mite' },
  bulwark: { radius: 38, hp: 14, speed: 42, score: 220, dust: 8, color: '#ff6b4a', name: 'Bulwark' },
};

export const ENEMY_BULLET = { radius: 7, life: 5 };

/** A wave is a budget of spawn points; each enemy type costs points, and the budget grows. */
export const WAVE = {
  baseBudget: 6,
  budgetPerWave: 4,
  spawnInterval: 0.55,
  spawnIntervalMin: 0.25,
  clearBonus: 150,
  waveBonusPerWave: 50,
};

/** Enemy mix unlocked by wave: [drifter, spitter, splitter, bulwark] weights. */
export function waveMix(wave) {
  if (wave <= 1) return { drifter: 1, spitter: 0, splitter: 0, bulwark: 0 };
  if (wave === 2) return { drifter: 0.7, spitter: 0.3, splitter: 0, bulwark: 0 };
  if (wave === 3) return { drifter: 0.55, spitter: 0.25, splitter: 0.2, bulwark: 0 };
  if (wave === 4) return { drifter: 0.45, spitter: 0.25, splitter: 0.2, bulwark: 0.1 };
  return { drifter: 0.4, spitter: 0.25, splitter: 0.2, bulwark: 0.15 };
}

export const UPGRADES = {
  rapid: { name: 'Rapid Cycler', desc: '+25% fire rate', max: 4 },
  twin: { name: 'Twin Barrels', desc: '+1 projectile per shot', max: 3 },
  pierce: { name: 'Piercing Rounds', desc: 'Shots pierce +1 enemy', max: 3 },
  magnet: { name: 'Tractor Web', desc: '+60% pickup radius', max: 3 },
  swift: { name: 'Swift Thrusters', desc: '+15% move speed', max: 3 },
  aegis: { name: 'Aegis Plating', desc: 'Block one hit each wave', max: 2 },
  hull: { name: 'Reinforced Hull', desc: '+1 max hull, repair 1', max: 2 },
  overdrive: { name: 'Overdrive Core', desc: '+20% bullet speed and damage', max: 3 },
};

export const COMBO = { window: 4, step: 0.1, max: 3 };

export const PALETTE = {
  backdrop: '#070a18',
  nebulaA: '#1b2a5e',
  nebulaB: '#3d1b5e',
  nebulaC: '#0e3a4a',
  player: '#4de3ff',
  playerCore: '#e8fbff',
  bullet: '#aef4ff',
  enemyBullet: '#ffb347',
  dust: '#ffd94d',
  heart: '#ff5d7a',
  panel: 'rgba(13, 18, 38, 0.82)',
  panelEdge: '#2a3a6e',
  text: '#eef1f5',
  muted: '#93a0c4',
  gold: '#ffd94d',
  danger: '#ff5d7a',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'voidharvest.best';
