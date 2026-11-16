// The simulation: waves of void-spawn, a harvester that shoots them, stardust to collect and
// upgrades between waves. Everything the player can do or meet lives here; the renderer only
// paints state, and main only feeds it a drive (move, aim, fire) from input or the autopilot.

import { BULLET, COMBO, ENEMY, ENEMY_BULLET, FIELD, PLAYER, STEP, UPGRADES, WAVE, waveMix } from './config.js';

export const EVENT_HIT = 1;
export const EVENT_OVER = 2;
export const EVENT_WAVE_CLEAR = 4;
export const EVENT_SHOOT = 8;
export const EVENT_EXPLODE = 16;
export const EVENT_PICKUP = 32;
export const EVENT_UPGRADE = 64;
export const EVENT_WAVE_START = 128;

const COST = { drifter: 1, spitter: 2, splitter: 3, bulwark: 4 };
const TAU = Math.PI * 2;

function pickType(random, mix) {
  const roll = random();
  let acc = 0;
  for (const kind of ['drifter', 'spitter', 'splitter', 'bulwark']) {
    acc += mix[kind];
    if (roll < acc) return kind;
  }
  return 'drifter';
}

function spawnPoint(random, player) {
  for (let tries = 0; tries < 12; tries += 1) {
    const edge = Math.floor(random() * 4);
    const x = edge === 0 ? -30 : edge === 1 ? FIELD.width + 30 : 40 + random() * (FIELD.width - 80);
    const y = edge === 2 ? -30 : edge === 3 ? FIELD.height + 30 : 40 + random() * (FIELD.height - 80);
    const dx = x - player.x;
    const dy = y - player.y;
    if (dx * dx + dy * dy > 260 * 260) return { x, y };
  }
  return { x: -30, y: 40 + random() * (FIELD.height - 80) };
}

export function createWorld(random) {
  const state = {
    time: 0,
    wave: 0,
    score: 0,
    comboKills: 0,
    comboTimer: 0,
    hull: PLAYER.hull,
    maxHull: PLAYER.hull,
    player: { x: FIELD.width / 2, y: FIELD.height / 2, angle: -Math.PI / 2, fireTimer: 0, invuln: 0, shieldReady: false },
    bullets: [],
    ebullets: [],
    enemies: [],
    particles: [],
    pickups: [],
    floats: [],
    shake: 0,
    flash: 0,
    waveState: 'idle',
    spawnQueue: [],
    spawnTimer: 0,
    upgrades: { rapid: 0, twin: 0, pierce: 0, magnet: 0, swift: 0, aegis: 0, hull: 0, overdrive: 0 },
    upgradeChoices: [],
    overdriveTimer: 0,
    stats: { kills: 0, shots: 0, hits: 0 },
  };

  function addParticles(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const a = random() * TAU;
      const v = speed * (0.3 + random() * 0.7);
      state.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4 + random() * 0.5, maxLife: 0.9, color, size: 2 + random() * 4 });
    }
    if (state.particles.length > 320) state.particles.splice(0, state.particles.length - 320);
  }

  function addFloat(x, y, text, color) {
    state.floats.push({ x, y, text, color, life: 0.9 });
    if (state.floats.length > 24) state.floats.shift();
  }

  function comboMult() {
    return Math.min(COMBO.max, 1 + Math.min(state.comboKills, 30) * COMBO.step);
  }

  function dropDust(x, y, count) {
    for (let i = 0; i < count; i += 1) {
      const a = random() * TAU;
      state.pickups.push({
        kind: 'dust',
        x: x + Math.cos(a) * 12,
        y: y + Math.sin(a) * 12,
        vx: Math.cos(a) * 60,
        vy: Math.sin(a) * 60,
        life: 9,
      });
    }
  }

  function killEnemy(index, award) {
    const enemy = state.enemies[index];
    state.enemies.splice(index, 1);
    state.stats.kills += 1;
    addParticles(enemy.x, enemy.y, enemy.color, enemy.kind === 'bulwark' ? 22 : 12, enemy.kind === 'bulwark' ? 260 : 200);
    state.shake = Math.min(10, state.shake + (enemy.kind === 'bulwark' ? 5 : 2.5));
    if (award) {
      const gained = Math.round(enemy.score * comboMult());
      state.score += gained;
      state.comboKills += 1;
      state.comboTimer = COMBO.window;
      addFloat(enemy.x, enemy.y - 14, `+${gained}`, '#ffd94d');
      dropDust(enemy.x, enemy.y, enemy.dust);
    }
    if (enemy.kind === 'splitter') {
      for (let i = 0; i < 3; i += 1) {
        const a = (i / 3) * TAU + random() * 0.6;
        spawnEnemy('mite', enemy.x + Math.cos(a) * 24, enemy.y + Math.sin(a) * 24);
      }
    }
    if (enemy.kind === 'bulwark' && random() < 0.3) {
      state.pickups.push({ kind: 'heart', x: enemy.x, y: enemy.y, vx: 0, vy: 20, life: 10 });
    }
    if (enemy.kind === 'splitter' && random() < 0.12) {
      state.pickups.push({ kind: 'overdrive', x: enemy.x, y: enemy.y, vx: 0, vy: 20, life: 10 });
    }
  }

  function spawnEnemy(kind, x, y) {
    const def = ENEMY[kind];
    const at = x === undefined ? spawnPoint(random, state.player) : { x, y };
    state.enemies.push({
      kind,
      x: at.x,
      y: at.y,
      vx: 0,
      vy: 0,
      hp: def.hp,
      maxHp: def.hp,
      radius: def.radius,
      speed: def.speed * (1 + (state.wave - 1) * 0.04),
      score: def.score,
      dust: def.dust,
      color: def.color,
      shotTimer: 1 + random() * 1.5,
      hitFlash: 0,
      seed: random() * TAU,
    });
  }

  function buildWave(wave) {
    const budget = WAVE.baseBudget + (wave - 1) * WAVE.budgetPerWave;
    const mix = waveMix(wave);
    const queue = [];
    let spent = 0;
    while (spent < budget) {
      const kind = pickType(random, mix);
      if (spent + COST[kind] > budget + 1) break;
      queue.push(kind);
      spent += COST[kind];
    }
    return queue;
  }

  function startWave(wave) {
    state.wave = wave;
    state.spawnQueue = buildWave(wave);
    state.spawnTimer = 0.6;
    state.waveState = 'fighting';
    state.player.shieldReady = state.upgrades.aegis > 0;
    return EVENT_WAVE_START;
  }

  function hurtPlayer() {
    if (state.player.invuln > 0) return 0;
    if (state.player.shieldReady) {
      state.player.shieldReady = false;
      state.player.invuln = 1.2;
      addParticles(state.player.x, state.player.y, '#4de3ff', 16, 240);
      return EVENT_HIT;
    }
    state.hull -= 1;
    state.player.invuln = PLAYER.invulnerable;
    state.comboKills = 0;
    state.comboTimer = 0;
    state.shake = 12;
    state.flash = 0.5;
    addParticles(state.player.x, state.player.y, '#ff5d7a', 20, 280);
    if (state.hull <= 0) return EVENT_HIT | EVENT_OVER;
    return EVENT_HIT;
  }

  function fireBullets(drive) {
    const p = state.player;
    const up = state.upgrades;
    const count = 1 + up.twin;
    const interval = PLAYER.fireInterval / (1 + 0.25 * up.rapid) / (state.overdriveTimer > 0 ? 2 : 1);
    const speed = PLAYER.bulletSpeed * (1 + 0.2 * up.overdrive);
    const damage = 1 + (up.overdrive >= 2 ? 1 : 0);
    p.fireTimer -= STEP;
    if (!drive.firing || p.fireTimer > 0) return 0;
    p.fireTimer = interval;
    state.stats.shots += count;
    for (let i = 0; i < count; i += 1) {
      const spread = (i - (count - 1) / 2) * 0.11;
      const a = p.angle + spread;
      state.bullets.push({
        x: p.x + Math.cos(a) * (PLAYER.radius + 6),
        y: p.y + Math.sin(a) * (PLAYER.radius + 6),
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: BULLET.life,
        damage,
        pierce: up.pierce,
        hit: [],
      });
    }
    return EVENT_SHOOT;
  }

  function stepEnemies(dt) {
    const p = state.player;
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const e = state.enemies[i];
      e.hitFlash = Math.max(0, e.hitFlash - dt);
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;
      if (e.kind === 'spitter') {
        // Keep a firing distance, strafing sideways.
        const want = 320;
        const toward = dist > want + 40 ? 1 : dist < want - 40 ? -0.6 : 0;
        const strafe = Math.sin(state.time * 1.3 + e.seed) * 0.7;
        e.vx += (nx * toward * e.speed + -ny * strafe * e.speed - e.vx) * Math.min(1, dt * 3);
        e.vy += (ny * toward * e.speed + nx * strafe * e.speed - e.vy) * Math.min(1, dt * 3);
        e.shotTimer -= dt;
        if (e.shotTimer <= 0 && dist < 560) {
          e.shotTimer = ENEMY.spitter.shotInterval * (0.85 + random() * 0.3);
          state.ebullets.push({ x: e.x, y: e.y, vx: nx * ENEMY.spitter.shotSpeed, vy: ny * ENEMY.spitter.shotSpeed, life: ENEMY_BULLET.life });
        }
      } else {
        const wobble = e.kind === 'drifter' || e.kind === 'mite' ? Math.sin(state.time * 3 + e.seed) * 0.35 : 0;
        const tx = nx * e.speed + -ny * wobble * e.speed;
        const ty = ny * e.speed + nx * wobble * e.speed;
        e.vx += (tx - e.vx) * Math.min(1, dt * 2.5);
        e.vy += (ty - e.vy) * Math.min(1, dt * 2.5);
      }
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.x = Math.max(-60, Math.min(FIELD.width + 60, e.x));
      e.y = Math.max(-60, Math.min(FIELD.height + 60, e.y));
    }
  }

  function stepBullets(dt) {
    let events = 0;
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const b = state.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0 || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20;
      if (!dead) {
        for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
          const e = state.enemies[j];
          if (b.hit.includes(e)) continue;
          const dx = e.x - b.x;
          const dy = e.y - b.y;
          const rr = e.radius + BULLET.radius;
          if (dx * dx + dy * dy < rr * rr) {
            e.hp -= b.damage;
            e.hitFlash = 0.12;
            state.stats.hits += 1;
            b.hit.push(e);
            addParticles(b.x, b.y, '#aef4ff', 4, 120);
            if (e.hp <= 0) {
              killEnemy(j, true);
              events |= EVENT_EXPLODE;
            }
            if (b.pierce > 0) {
              b.pierce -= 1;
            } else {
              dead = true;
            }
            break;
          }
        }
      }
      if (dead) state.bullets.splice(i, 1);
    }
    return events;
  }

  function stepEnemyBullets(dt) {
    let events = 0;
    const p = state.player;
    for (let i = state.ebullets.length - 1; i >= 0; i -= 1) {
      const b = state.ebullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0 || b.x < -30 || b.x > FIELD.width + 30 || b.y < -30 || b.y > FIELD.height + 30;
      if (!dead) {
        const dx = p.x - b.x;
        const dy = p.y - b.y;
        const rr = PLAYER.radius + ENEMY_BULLET.radius;
        if (dx * dx + dy * dy < rr * rr) {
          dead = true;
          events |= hurtPlayer();
        }
      }
      if (dead) state.ebullets.splice(i, 1);
    }
    return events;
  }

  function stepContacts() {
    let events = 0;
    const p = state.player;
    for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
      const e = state.enemies[i];
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const rr = PLAYER.radius + e.radius - 2;
      if (dx * dx + dy * dy < rr * rr) {
        e.hp -= 3;
        if (e.hp <= 0) {
          killEnemy(i, true);
          events |= EVENT_EXPLODE;
        } else {
          // Shove the enemy off the player so one touch is one hit.
          const dist = Math.hypot(dx, dy) || 1;
          e.x -= (dx / dist) * (rr + 4);
          e.y -= (dy / dist) * (rr + 4);
        }
        events |= hurtPlayer();
        if (state.hull <= 0) break;
      }
    }
    return events;
  }

  function stepPickups(dt) {
    let events = 0;
    const p = state.player;
    const magnetR = PLAYER.pickupRadius * (1 + 0.6 * state.upgrades.magnet);
    for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
      const pk = state.pickups[i];
      pk.life -= dt;
      const dx = p.x - pk.x;
      const dy = p.y - pk.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < magnetR) {
        const pull = 520 * (1 - dist / magnetR) + 120;
        pk.vx += (dx / dist) * pull * dt * 4;
        pk.vy += (dy / dist) * pull * dt * 4;
      }
      pk.vx *= 1 - Math.min(1, dt * 2);
      pk.vy *= 1 - Math.min(1, dt * 2);
      pk.x += pk.vx * dt;
      pk.y += pk.vy * dt;
      let taken = pk.life <= 0;
      if (!taken && dist < PLAYER.radius + 14) {
        taken = true;
        if (pk.kind === 'dust') {
          const gained = Math.round(10 * comboMult());
          state.score += gained;
          state.comboKills += 1;
          state.comboTimer = COMBO.window;
          addFloat(pk.x, pk.y - 10, `+${gained}`, '#ffd94d');
          events |= EVENT_PICKUP;
        } else if (pk.kind === 'heart') {
          state.hull = Math.min(state.maxHull, state.hull + 1);
          addFloat(pk.x, pk.y - 10, '+1 HULL', '#ff5d7a');
          events |= EVENT_PICKUP;
        } else if (pk.kind === 'overdrive') {
          state.overdriveTimer = 6;
          addFloat(pk.x, pk.y - 10, 'OVERDRIVE!', '#4de3ff');
          events |= EVENT_PICKUP;
        }
      }
      if (taken) state.pickups.splice(i, 1);
    }
    return events;
  }

  function stepParticles(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const pt = state.particles[i];
      pt.life -= dt;
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 1 - Math.min(1, dt * 2.5);
      pt.vy *= 1 - Math.min(1, dt * 2.5);
      if (pt.life <= 0) state.particles.splice(i, 1);
    }
    for (let i = state.floats.length - 1; i >= 0; i -= 1) {
      const f = state.floats[i];
      f.life -= dt;
      f.y -= 34 * dt;
      if (f.life <= 0) state.floats.splice(i, 1);
    }
  }

  function stepSpawning(dt) {
    if (state.waveState !== 'fighting') return;
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0 && state.spawnQueue.length > 0) {
      const interval = Math.max(WAVE.spawnIntervalMin, WAVE.spawnInterval - (state.wave - 1) * 0.05);
      state.spawnTimer = interval;
      // Later waves arrive in small groups, so the field stays pressured.
      const batch = 1 + Math.floor((state.wave - 1) / 3);
      for (let n = 0; n < batch && state.spawnQueue.length > 0; n += 1) {
        spawnEnemy(state.spawnQueue.shift());
      }
    }
    if (state.spawnQueue.length === 0 && state.enemies.length === 0) {
      const bonus = WAVE.clearBonus + state.wave * WAVE.waveBonusPerWave;
      state.score += bonus;
      state.waveState = 'clear';
      const available = Object.keys(UPGRADES).filter((k) => state.upgrades[k] < UPGRADES[k].max);
      state.upgradeChoices = [];
      while (state.upgradeChoices.length < 3 && available.length > 0) {
        const pick = available.splice(Math.floor(random() * available.length), 1)[0];
        state.upgradeChoices.push(pick);
      }
      addFloat(FIELD.width / 2, FIELD.height / 2 - 60, `WAVE ${state.wave} CLEAR  +${bonus}`, '#ffd94d');
    }
  }

  function applyUpgrade(key) {
    const up = UPGRADES[key];
    state.upgrades[key] += 1;
    if (key === 'hull') {
      state.maxHull = Math.min(PLAYER.maxHull, state.maxHull + 1);
      state.hull = Math.min(state.maxHull, state.hull + 1);
    }
    return up;
  }

  return {
    state,
    reset() {
      state.time = 0;
      state.wave = 0;
      state.score = 0;
      state.comboKills = 0;
      state.comboTimer = 0;
      state.hull = PLAYER.hull;
      state.maxHull = PLAYER.hull;
      state.player.x = FIELD.width / 2;
      state.player.y = FIELD.height / 2;
      state.player.angle = -Math.PI / 2;
      state.player.fireTimer = 0;
      state.player.invuln = 0;
      state.player.shieldReady = false;
      state.bullets.length = 0;
      state.ebullets.length = 0;
      state.enemies.length = 0;
      state.particles.length = 0;
      state.pickups.length = 0;
      state.floats.length = 0;
      state.shake = 0;
      state.flash = 0;
      state.waveState = 'idle';
      state.spawnQueue.length = 0;
      state.spawnTimer = 0;
      state.upgradeChoices = [];
      state.overdriveTimer = 0;
      for (const key of Object.keys(state.upgrades)) state.upgrades[key] = 0;
      state.stats.kills = 0;
      state.stats.shots = 0;
      state.stats.hits = 0;
    },
    startWave,
    /** Apply the chosen upgrade and open the next wave. */
    chooseUpgrade(index) {
      const key = state.upgradeChoices[index];
      if (!key) return 0;
      applyUpgrade(key);
      state.upgradeChoices = [];
      state.waveState = 'idle';
      return startWave(state.wave + 1) | EVENT_UPGRADE;
    },
    /**
     * Advance the world one fixed step. `drive` is {moveX, moveY, aimX, aimY, firing}.
     * In title mode the ship idles and a few drifters cross the field for atmosphere.
     */
    step(dt, drive, isTitle) {
      state.time += dt;
      state.shake = Math.max(0, state.shake - dt * 26);
      state.flash = Math.max(0, state.flash - dt * 1.6);
      if (state.comboTimer > 0) {
        state.comboTimer -= dt;
        if (state.comboTimer <= 0) state.comboKills = 0;
      }
      state.overdriveTimer = Math.max(0, state.overdriveTimer - dt);
      stepParticles(dt);
      if (isTitle) {
        if (state.enemies.length < 5 && random() < dt * 0.7) {
          spawnEnemy('drifter');
          const e = state.enemies[state.enemies.length - 1];
          e.x = -40;
          e.y = 80 + random() * (FIELD.height - 160);
          e.vx = 50 + random() * 60;
          e.vy = (random() - 0.5) * 40;
        }
        for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
          const e = state.enemies[i];
          e.x += e.vx * dt;
          e.y += e.vy * dt;
          if (e.x > FIELD.width + 60) state.enemies.splice(i, 1);
        }
        return 0;
      }
      const p = state.player;
      const speed = PLAYER.speed * (1 + 0.15 * state.upgrades.swift);
      p.x = Math.max(PLAYER.radius, Math.min(FIELD.width - PLAYER.radius, p.x + drive.moveX * speed * dt));
      p.y = Math.max(PLAYER.radius, Math.min(FIELD.height - PLAYER.radius, p.y + drive.moveY * speed * dt));
      p.angle = Math.atan2(drive.aimY - p.y, drive.aimX - p.x);
      p.invuln = Math.max(0, p.invuln - dt);
      let events = fireBullets(drive);
      stepEnemies(dt);
      events |= stepBullets(dt);
      events |= stepEnemyBullets(dt);
      events |= stepContacts();
      events |= stepPickups(dt);
      if (state.hull > 0) stepSpawning(dt);
      if (state.waveState === 'clear') events |= EVENT_WAVE_CLEAR;
      return events;
    },
  };
}
