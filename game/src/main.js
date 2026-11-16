// VOIDHARVEST — boot, the fixed-step loop, screens, and the screenshot mode (?shot=...).
// The world owns the rules; this file owns which screen is showing and what the player can
// do on it.

import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, ACTION_PICK_1, ACTION_PICK_2, ACTION_PICK_3, createInput } from './input.js';
import { createAudio } from './audio.js';
import { EVENT_EXPLODE, EVENT_HIT, EVENT_OVER, EVENT_PICKUP, EVENT_SHOOT, EVENT_UPGRADE, EVENT_WAVE_CLEAR, EVENT_WAVE_START, createWorld } from './world.js';
import { SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_UPGRADE, createRenderer } from './render.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const params = new URLSearchParams(window.location.search);
const seed = Number(params.get('seed') || Date.now() % 2147483647);
const shot = params.get('shot');
const random = createRandom(seed);

const world = createWorld(random);
const renderer = createRenderer(canvas);
const input = createInput(canvas);
const audio = shot ? null : createAudio();

function loadBest() {
  try {
    return Number(window.localStorage.getItem(BEST_KEY) || 0) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Private mode or no storage: the score just does not persist.
  }
}

let best = loadBest();
let screen = SCREEN_TITLE;
let lastStatus = '';

function announce(text) {
  if (text === lastStatus) return;
  lastStatus = text;
  status.textContent = text;
}

function startRun() {
  world.reset();
  world.state.newBest = false;
  world.startWave(1);
  screen = SCREEN_PLAY;
  announce('Wave 1. Harvest the stardust.');
}

function gameOver() {
  screen = SCREEN_OVER;
  const isBest = world.state.score > best;
  world.state.newBest = isBest;
  if (isBest) {
    best = world.state.score;
    saveBest(best);
  }
  announce(`Game over. Score ${world.state.score}. Wave ${world.state.wave}.`);
}

function applyUpgradePick(index) {
  const events = world.chooseUpgrade(index);
  if (events & EVENT_WAVE_START) {
    screen = SCREEN_PLAY;
    announce(`Wave ${world.state.wave}.`);
  }
}

/** The three upgrade cards' rectangles, in playfield coordinates (same layout as render). */
function cardAt(x, y) {
  const cardW = 300;
  const cardH = 220;
  const gap = 36;
  const total = cardW * 3 + gap * 2;
  const startX = (1280 - total) / 2;
  const top = 250;
  if (y < top || y > top + cardH) return -1;
  for (let i = 0; i < 3; i += 1) {
    const left = startX + i * (cardW + gap);
    if (x >= left && x <= left + cardW) return i;
  }
  return -1;
}

function handleActions(actions) {
  if (actions & ACTION_MUTE && audio) {
    audio.setMuted(!audio.isMuted());
    announce(audio.isMuted() ? 'Sound off.' : 'Sound on.');
  }
  if (screen === SCREEN_TITLE) {
    if (actions & ACTION_CONFIRM) {
      audio?.unlock();
      startRun();
    }
    return;
  }
  if (screen === SCREEN_PLAY) {
    if (actions & ACTION_PAUSE) screen = SCREEN_PAUSED;
    return;
  }
  if (screen === SCREEN_PAUSED) {
    if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) screen = SCREEN_PLAY;
    return;
  }
  if (screen === SCREEN_UPGRADE) {
    if (actions & ACTION_PICK_1) applyUpgradePick(0);
    else if (actions & ACTION_PICK_2) applyUpgradePick(1);
    else if (actions & ACTION_PICK_3) applyUpgradePick(2);
    else if (actions & ACTION_CONFIRM) {
      const aim = input.aim();
      const pick = cardAt(aim.x, aim.y);
      if (pick >= 0) applyUpgradePick(pick);
    }
    return;
  }
  if (screen === SCREEN_OVER) {
    if (actions & ACTION_CONFIRM) {
      world.reset();
      screen = SCREEN_TITLE;
      announce('Voidharvest. Press Enter to launch.');
    }
  }
}

function playSounds(events) {
  if (!audio) return;
  if (events & EVENT_SHOOT) audio.shoot();
  if (events & EVENT_EXPLODE) audio.explode(false);
  if (events & EVENT_PICKUP) audio.pickup();
  if (events & EVENT_HIT) audio.hit();
  if (events & EVENT_WAVE_START) audio.waveStart();
  if (events & EVENT_UPGRADE) audio.upgrade();
  if (events & EVENT_OVER) audio.gameOver();
}

if (shot) {
  // Screenshot mode: stage one fixed scene, paint it twice, then signal readiness.
  const staged = stageShot(shot, world);
  screen = staged.screen;
  best = staged.best;
  renderer.draw(world.state, screen, best);
  renderer.draw(world.state, screen, best);
  window.__shotReady = true;
} else {
  announce('Voidharvest. Press Enter to launch.');
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) screen = SCREEN_PAUSED;
  });

  let last = performance.now();
  let accumulator = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    const actions = input.takeActions();
    handleActions(actions);
    if (screen === SCREEN_PLAY) {
      accumulator += dt;
      let steps = 0;
      while (accumulator >= STEP && steps < 5) {
        accumulator -= STEP;
        steps += 1;
        const move = input.move();
        const aim = input.aim();
        const events = world.step(STEP, { moveX: move.x, moveY: move.y, aimX: aim.x, aimY: aim.y, firing: input.firing() }, false);
        playSounds(events);
        if (events & EVENT_WAVE_CLEAR) {
          screen = SCREEN_UPGRADE;
          announce(`Wave ${world.state.wave} clear. Choose an upgrade.`);
          break;
        }
        if (events & EVENT_OVER) {
          gameOver();
          break;
        }
      }
      if (steps === 5) accumulator = 0;
      audio?.tick(dt);
    } else if (screen === SCREEN_TITLE) {
      world.step(dt, { moveX: 0, moveY: 0, aimX: 640, aimY: 300, firing: false }, true);
    } else if (screen === SCREEN_UPGRADE || screen === SCREEN_OVER || screen === SCREEN_PAUSED) {
      // The world holds still; the backdrop keeps twinkling from state.time.
      world.state.time += dt;
    }
    const view = renderer.viewport();
    input.setViewport(view.scale, view.offsetX, view.offsetY);
    renderer.draw(world.state, screen, best);
    // The transform the draw just used is the one the mouse needs next frame.
    const fresh = renderer.viewport();
    input.setViewport(fresh.scale, fresh.offsetX, fresh.offsetY);
  }
  requestAnimationFrame(frame);
}
