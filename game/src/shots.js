// The screenshot scenes behind ?shot=start|play|upgrade|end. Each one plays the real rules
// forward from a fresh world for a fixed number of steps, steered by a simple autopilot (flee
// what is close, chase the nearest stardust, aim at the nearest enemy with a little lead), so
// the frame is what a short game really looks like and the same seed always gives the same
// frame. The end scene's pilot never fires and never dodges, so it is caught out once the
// drifters close in, as a careless player is.

import { FIELD, STEP } from './config.js';
import { EVENT_OVER, EVENT_WAVE_CLEAR } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE } from './render.js';

const START_SECONDS = 5;
const UPGRADE_LIMIT_SECONDS = 120;
const END_LIMIT_SECONDS = 300;
const BULLET_SPEED = 760;

/**
 * The autopilot's drive for one step: move away from close danger, toward dust, aim ahead.
 * `mode` is 'passive' (never fires, never dodges), 'stage' (holds fire until the nearest
 * enemy is close, so the play shot shows the swarm converging) or 'full' (fires at will).
 */
function autopilot(state, mode) {
  const p = state.player;
  const passive = mode === 'passive';
  let nearest = null;
  let nearestDist = Infinity;
  for (const e of state.enemies) {
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = e;
    }
  }
  let moveX = 0;
  let moveY = 0;
  if (!passive && nearest && nearestDist < 170) {
    moveX += (p.x - nearest.x) / nearestDist;
    moveY += (p.y - nearest.y) / nearestDist;
  }
  if (!passive) {
    let dust = null;
    let dustDist = Infinity;
    for (const pk of state.pickups) {
      if (pk.kind !== 'dust') continue;
      const d = Math.hypot(pk.x - p.x, pk.y - p.y);
      if (d < dustDist) {
        dustDist = d;
        dust = pk;
      }
    }
    if (dust && dustDist < 260 && (!nearest || nearestDist > 120)) {
      moveX += (dust.x - p.x) / dustDist;
      moveY += (dust.y - p.y) / dustDist;
    }
  }
  // Keep off the walls.
  if (p.x < 90) moveX += 0.8;
  if (p.x > FIELD.width - 90) moveX -= 0.8;
  if (p.y < 90) moveY += 0.8;
  if (p.y > FIELD.height - 90) moveY -= 0.8;
  const len = Math.hypot(moveX, moveY);
  if (len > 1) {
    moveX /= len;
    moveY /= len;
  }
  let aimX = p.x;
  let aimY = p.y - 100;
  if (nearest) {
    const flight = nearestDist / BULLET_SPEED;
    aimX = nearest.x + nearest.vx * flight;
    aimY = nearest.y + nearest.vy * flight;
  }
  const firing = passive ? false : mode === 'stage' ? nearest !== null && nearestDist < 420 : true;
  return { moveX, moveY, aimX, aimY, firing };
}

function settle(state) {
  state.shake = 0;
  state.flash = 0;
  // Park the clock where the blinking prompts are lit, so the title and game-over
  // screens always show their "press Enter" line in the still.
  state.time = (5 * Math.PI) / 8;
}

/** A frame worth showing: mid-wave, several enemies up, two of them close, shots in the air. */
function busyFrame(state, t) {
  if (t < 8 || state.wave < 2 || state.enemies.length < 5 || state.bullets.length < 2) return false;
  let close = 0;
  for (const e of state.enemies) {
    if (Math.hypot(e.x - state.player.x, e.y - state.player.y) < 320) close += 1;
  }
  return close >= 2;
}

/**
 * Set `world` to the named scene (start, play, upgrade or end; any other name is start) and
 * return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'upgrade' && name !== 'end') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) {
      world.step(STEP, { moveX: 0, moveY: 0, aimX: 640, aimY: 300, firing: false }, true);
    }
    settle(world.state);
    return { screen: SCREEN_TITLE, best: 0 };
  }
  world.startWave(1);
  if (name === 'end') {
    for (let i = 0; i < END_LIMIT_SECONDS / STEP; i += 1) {
      const events = world.step(STEP, autopilot(world.state, 'passive'), false);
      if (events & EVENT_OVER) break;
    }
    settle(world.state);
    world.state.newBest = world.state.score > 0;
    return { screen: SCREEN_OVER, best: world.state.score };
  }
  const limit = name === 'upgrade' ? UPGRADE_LIMIT_SECONDS : 45;
  const mode = name === 'play' ? 'stage' : 'full';
  for (let attempt = 0; attempt < 4; attempt += 1) {
    world.reset();
    world.startWave(1);
    let died = false;
    let finished = false;
    for (let i = 0; i < limit / STEP; i += 1) {
      const events = world.step(STEP, autopilot(world.state, mode), false);
      if (events & EVENT_OVER) {
        died = true;
        break;
      }
      if (events & EVENT_WAVE_CLEAR) {
        if (name === 'upgrade') {
          settle(world.state);
          return { screen: SCREEN_UPGRADE, best: world.state.score };
        }
        world.chooseUpgrade(0);
      }
      if (name === 'play' && busyFrame(world.state, i * STEP)) {
        finished = true;
        break;
      }
    }
    // The play shot is usable once the frame is busy or the 45 s window runs out;
    // the upgrade shot falls through only when the pilot dies, and then it retries.
    if (name === 'play' && !died) finished = true;
    if (name === 'upgrade' && !died) finished = true;
    if (finished) break;
  }
  settle(world.state);
  return { screen: SCREEN_PLAY, best: world.state.score };
}
