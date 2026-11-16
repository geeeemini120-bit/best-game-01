// Everything the player sees: the nebula backdrop, the ships, the HUD and the four screens.
// The playfield is always 1280x720 logical; this module scales it to the canvas, letterboxed,
// and tells input the transform so the mouse aims where the ship points.

import { FIELD, FONT, PALETTE, PLAYER, UPGRADES } from './config.js';
import { createRandom } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_UPGRADE = 'upgrade';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const GLOW_COLORS = ['#4de3ff', '#ff4da6', '#ffb347', '#37e6c8', '#ff6b4a', '#ffd94d', '#ff5d7a', '#ffffff'];

function makeGlow(color) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, color);
  grad.addColorStop(0.35, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha = 0.55;
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return c;
}

function makeStars(random) {
  const stars = [];
  for (let layer = 0; layer < 3; layer += 1) {
    const count = [70, 50, 30][layer];
    for (let i = 0; i < count; i += 1) {
      stars.push({
        x: random() * FIELD.width,
        y: random() * FIELD.height,
        layer,
        size: [1, 1.6, 2.4][layer],
        twinkle: random() * Math.PI * 2,
      });
    }
  }
  return stars;
}

function drawHeart(ctx, x, y, size, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y + size * 0.9);
  ctx.bezierCurveTo(x - size * 1.3, y, x - size * 0.6, y - size, x, y - size * 0.3);
  ctx.bezierCurveTo(x + size * 0.6, y - size, x + size * 1.3, y, x, y + size * 0.9);
  ctx.fill();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const glows = {};
  for (const color of GLOW_COLORS) glows[color] = makeGlow(color);
  const stars = makeStars(createRandom(1337));
  const nebulas = [
    { x: 240, y: 150, r: 420, color: PALETTE.nebulaA },
    { x: 1080, y: 560, r: 460, color: PALETTE.nebulaB },
    { x: 900, y: 110, r: 340, color: PALETTE.nebulaC },
  ];
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  function glow(color, x, y, size) {
    const img = glows[color];
    if (!img) return;
    ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
  }

  function drawBackground(state) {
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    for (const n of nebulas) {
      const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r);
      grad.addColorStop(0, n.color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = grad;
      ctx.fillRect(n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
    }
    ctx.globalAlpha = 1;
    for (const s of stars) {
      const drift = (state.time * (2 + s.layer * 4)) % FIELD.width;
      const x = (s.x - drift + FIELD.width) % FIELD.width;
      const alpha = 0.35 + 0.35 * Math.sin(state.time * 1.5 + s.twinkle);
      ctx.globalAlpha = Math.max(0.1, alpha);
      ctx.fillStyle = '#cfe6ff';
      ctx.fillRect(x, s.y, s.size, s.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawPickups(state) {
    for (const pk of state.pickups) {
      const blink = pk.life < 3 ? (Math.sin(state.time * 12) > 0 ? 1 : 0.35) : 1;
      ctx.globalAlpha = blink;
      if (pk.kind === 'dust') {
        glow('#ffd94d', pk.x, pk.y, 26);
        ctx.save();
        ctx.translate(pk.x, pk.y);
        ctx.rotate(state.time * 2 + pk.x);
        ctx.fillStyle = PALETTE.dust;
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(4.5, 0);
        ctx.lineTo(0, 6);
        ctx.lineTo(-4.5, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else if (pk.kind === 'heart') {
        glow('#ff5d7a', pk.x, pk.y, 44);
        drawHeart(ctx, pk.x, pk.y, 9, PALETTE.heart);
      } else {
        glow('#4de3ff', pk.x, pk.y, 52);
        ctx.save();
        ctx.translate(pk.x, pk.y);
        ctx.rotate(Math.sin(state.time * 3) * 0.3);
        ctx.fillStyle = PALETTE.player;
        ctx.beginPath();
        ctx.moveTo(0, -11);
        ctx.lineTo(5, -2);
        ctx.lineTo(11, 0);
        ctx.lineTo(5, 2);
        ctx.lineTo(0, 11);
        ctx.lineTo(-5, 2);
        ctx.lineTo(-11, 0);
        ctx.lineTo(-5, -2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawEnemy(e, state) {
    glow(e.color, e.x, e.y, e.radius * 4.2);
    ctx.save();
    ctx.translate(e.x, e.y);
    const flash = e.hitFlash > 0;
    ctx.fillStyle = flash ? '#ffffff' : e.color;
    ctx.strokeStyle = flash ? '#ffffff' : e.color;
    if (e.kind === 'drifter') {
      ctx.rotate(state.time * 1.6 + e.seed);
      ctx.beginPath();
      ctx.moveTo(0, -e.radius);
      ctx.lineTo(e.radius * 0.8, 0);
      ctx.lineTo(0, e.radius);
      ctx.lineTo(-e.radius * 0.8, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#1a0b16';
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 0.32, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.kind === 'spitter') {
      ctx.rotate(Math.sin(state.time + e.seed) * 0.2);
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2;
        const px = Math.cos(a) * e.radius;
        const py = Math.sin(a) * e.radius;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#241505';
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 0.38, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.kind === 'splitter') {
      ctx.beginPath();
      ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.65)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 0.62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.beginPath();
      ctx.arc(0, 0, e.radius * 0.22, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.kind === 'mite') {
      ctx.rotate(Math.atan2(e.vy, e.vx));
      ctx.beginPath();
      ctx.moveTo(e.radius, 0);
      ctx.lineTo(-e.radius * 0.8, e.radius * 0.7);
      ctx.lineTo(-e.radius * 0.4, 0);
      ctx.lineTo(-e.radius * 0.8, -e.radius * 0.7);
      ctx.closePath();
      ctx.fill();
    } else {
      // bulwark
      ctx.rotate(Math.sin(state.time * 0.6 + e.seed) * 0.08);
      ctx.lineWidth = 3;
      ctx.strokeRect(-e.radius * 0.8, -e.radius * 0.8, e.radius * 1.6, e.radius * 1.6);
      ctx.fillRect(-e.radius * 0.55, -e.radius * 0.55, e.radius * 1.1, e.radius * 1.1);
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.fillRect(-e.radius * 0.2, -e.radius * 0.2, e.radius * 0.4, e.radius * 0.4);
    }
    ctx.restore();
    if (e.maxHp > 2) {
      const w = e.radius * 1.7;
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(e.x - w / 2, e.y - e.radius - 12, w, 4);
      ctx.fillStyle = e.color;
      ctx.fillRect(e.x - w / 2, e.y - e.radius - 12, w * (e.hp / e.maxHp), 4);
    }
  }

  function drawPlayer(state) {
    const p = state.player;
    if (p.invuln > 0 && Math.floor(state.time * 12) % 2 === 0) return;
    if (state.overdriveTimer > 0) glow('#4de3ff', p.x, p.y, 130 + Math.sin(state.time * 8) * 14);
    glow(PALETTE.player, p.x, p.y, 96);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.fillStyle = PALETTE.player;
    ctx.beginPath();
    ctx.moveTo(PLAYER.radius + 8, 0);
    ctx.lineTo(-PLAYER.radius * 0.7, PLAYER.radius * 0.85);
    ctx.lineTo(-PLAYER.radius * 0.35, 0);
    ctx.lineTo(-PLAYER.radius * 0.7, -PLAYER.radius * 0.85);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = PALETTE.playerCore;
    ctx.beginPath();
    ctx.arc(2, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (p.shieldReady) {
      ctx.strokeStyle = 'rgba(77,227,255,0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, PLAYER.radius + 10 + Math.sin(state.time * 4) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawHud(state, best) {
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 30px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(`SCORE ${state.score.toLocaleString('en-US')}`, 22, 42);
    if (state.comboKills >= 3) {
      const mult = Math.min(3, 1 + Math.min(state.comboKills, 30) * 0.1);
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `700 20px ${FONT}`;
      ctx.fillText(`COMBO x${mult.toFixed(1)}  (${state.comboKills})`, 22, 70);
    }
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 22px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(`WAVE ${Math.max(1, state.wave)}`, FIELD.width / 2, 42);
    ctx.textAlign = 'right';
    ctx.font = `600 18px ${FONT}`;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText(`BEST ${Math.max(best, state.score).toLocaleString('en-US')}`, FIELD.width - 22, 34);
    for (let i = 0; i < state.maxHull; i += 1) {
      drawHeart(ctx, FIELD.width - 30 - i * 30, 58, 9, i < state.hull ? PALETTE.heart : 'rgba(255,93,122,0.22)');
    }
    if (state.overdriveTimer > 0) {
      const w = 160;
      ctx.fillStyle = 'rgba(77,227,255,0.25)';
      ctx.fillRect(FIELD.width / 2 - w / 2, 56, w, 6);
      ctx.fillStyle = PALETTE.player;
      ctx.fillRect(FIELD.width / 2 - w / 2, 56, w * (state.overdriveTimer / 6), 6);
      ctx.fillStyle = PALETTE.player;
      ctx.font = `700 14px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('OVERDRIVE', FIELD.width / 2, 78);
    }
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(238,241,245,0.55)';
    ctx.font = `500 14px ${FONT}`;
    ctx.fillText('WASD move  ·  mouse aim  ·  hold click to fire  ·  P pause  ·  M mute', 22, FIELD.height - 16);
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = PALETTE.panel;
    ctx.strokeStyle = PALETTE.panelEdge;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 14);
    ctx.fill();
    ctx.stroke();
  }

  function drawTitle(state, best) {
    ctx.fillStyle = 'rgba(7,10,24,0.55)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    const pulse = 1 + Math.sin(state.time * 2.2) * 0.03;
    ctx.save();
    ctx.translate(FIELD.width / 2, 218);
    ctx.scale(pulse, pulse);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.player;
    ctx.font = `800 92px ${FONT}`;
    ctx.shadowColor = '#4de3ff';
    ctx.shadowBlur = 34;
    ctx.fillText('VOIDHARVEST', 0, 0);
    ctx.restore();
    ctx.shadowBlur = 0;
    ctx.fillStyle = PALETTE.text;
    ctx.font = `500 24px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('The nebula is dying. Harvest the stardust. Survive the swarm.', FIELD.width / 2, 268);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `500 19px ${FONT}`;
    ctx.fillText('WASD / arrows — fly      Mouse — aim      Hold click / Space — fire', FIELD.width / 2, 330);
    ctx.fillText('Clear each wave, then pick 1 of 3 upgrades. Grab gold dust to raise your combo.', FIELD.width / 2, 360);
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `700 20px ${FONT}`;
    ctx.fillText(`BEST SCORE  ${best.toLocaleString('en-US')}`, FIELD.width / 2, 412);
    const blink = Math.sin(state.time * 4) > -0.2;
    if (blink) {
      ctx.fillStyle = PALETTE.text;
      ctx.font = `700 26px ${FONT}`;
      ctx.fillText('CLICK OR PRESS ENTER TO LAUNCH', FIELD.width / 2, 480);
    }
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `500 15px ${FONT}`;
    ctx.fillText('Drifter chases · Spitter shoots · Splitter bursts into mites · Bulwark soaks damage', FIELD.width / 2, 560);
  }

  function drawUpgrade(state) {
    ctx.fillStyle = 'rgba(7,10,24,0.62)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = `800 44px ${FONT}`;
    ctx.fillText(`WAVE ${state.wave} CLEAR`, FIELD.width / 2, 150);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `500 22px ${FONT}`;
    ctx.fillText('Choose one upgrade — press 1, 2 or 3, or click a card.', FIELD.width / 2, 192);
    const cardW = 300;
    const cardH = 220;
    const gap = 36;
    const total = cardW * 3 + gap * 2;
    const startX = (FIELD.width - total) / 2;
    const y = 250;
    state.upgradeChoices.forEach((key, i) => {
      const up = UPGRADES[key];
      const level = state.upgrades[key];
      const x = startX + i * (cardW + gap);
      panel(x, y, cardW, cardH);
      ctx.fillStyle = PALETTE.player;
      ctx.font = `800 30px ${FONT}`;
      ctx.fillText(`[${i + 1}]`, x + cardW / 2, y + 52);
      ctx.fillStyle = PALETTE.text;
      ctx.font = `700 24px ${FONT}`;
      ctx.fillText(up.name, x + cardW / 2, y + 96);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `500 18px ${FONT}`;
      ctx.fillText(up.desc, x + cardW / 2, y + 132);
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `700 16px ${FONT}`;
      const pips = '●'.repeat(level) + '○'.repeat(up.max - level);
      ctx.fillText(`Lv ${level} → ${level + 1}   ${pips}`, x + cardW / 2, y + 176);
    });
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(7,10,24,0.66)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.text;
    ctx.font = `800 52px ${FONT}`;
    ctx.fillText('PAUSED', FIELD.width / 2, FIELD.height / 2 - 10);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `500 20px ${FONT}`;
    ctx.fillText('Press P or Esc to keep harvesting', FIELD.width / 2, FIELD.height / 2 + 34);
  }

  function drawOver(state, best) {
    ctx.fillStyle = 'rgba(7,10,24,0.68)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.danger;
    ctx.font = `800 64px ${FONT}`;
    ctx.fillText('SIGNAL LOST', FIELD.width / 2, 210);
    const isBest = state.newBest === true;
    ctx.fillStyle = PALETTE.text;
    ctx.font = `700 30px ${FONT}`;
    ctx.fillText(`SCORE  ${state.score.toLocaleString('en-US')}`, FIELD.width / 2, 288);
    if (isBest) {
      ctx.fillStyle = PALETTE.gold;
      ctx.font = `800 24px ${FONT}`;
      ctx.fillText('★ NEW BEST SCORE ★', FIELD.width / 2, 330);
    } else {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `500 20px ${FONT}`;
      ctx.fillText(`Best  ${best.toLocaleString('en-US')}`, FIELD.width / 2, 330);
    }
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `500 20px ${FONT}`;
    const acc = state.stats.shots > 0 ? Math.round((state.stats.hits / state.stats.shots) * 100) : 0;
    ctx.fillText(`Wave ${state.wave}  ·  ${state.stats.kills} void-spawn destroyed  ·  ${acc}% accuracy`, FIELD.width / 2, 384);
    const blink = Math.sin(state.time * 4) > -0.2;
    if (blink) {
      ctx.fillStyle = PALETTE.text;
      ctx.font = `700 24px ${FONT}`;
      ctx.fillText('PRESS ENTER TO HARVEST AGAIN', FIELD.width / 2, 452);
    }
  }

  return {
    /** The current field-to-screen transform, for input aiming. */
    viewport() {
      return { scale, offsetX, offsetY };
    },
    draw(state, screen, best) {
      const w = canvas.width;
      const h = canvas.height;
      scale = Math.min(w / FIELD.width, h / FIELD.height);
      offsetX = (w - FIELD.width * scale) / 2;
      offsetY = (h - FIELD.height * scale) / 2;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#04060f';
      ctx.fillRect(0, 0, w, h);
      const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
      const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
      ctx.setTransform(scale, 0, 0, scale, offsetX + shakeX * scale, offsetY + shakeY * scale);
      drawBackground(state);
      drawPickups(state);
      for (const e of state.enemies) drawEnemy(e, state);
      for (const b of state.bullets) {
        glow('#aef4ff', b.x, b.y, 30);
        ctx.lineCap = 'round';
        ctx.strokeStyle = PALETTE.bullet;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(b.x - b.vx * 0.028, b.y - b.vy * 0.028);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      for (const b of state.ebullets) {
        glow('#ffb347', b.x, b.y, 34);
        ctx.fillStyle = PALETTE.enemyBullet;
        ctx.beginPath();
        ctx.arc(b.x, b.y, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      if (screen !== SCREEN_TITLE) drawPlayer(state);
      for (const pt of state.particles) {
        ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'left';
      ctx.font = `700 16px ${FONT}`;
      // Score popups sit behind the upgrade cards, so they are not drawn on that screen.
      if (screen !== SCREEN_UPGRADE) {
        for (const f of state.floats) {
          ctx.globalAlpha = Math.max(0, f.life / 0.9);
          ctx.fillStyle = f.color;
          ctx.fillText(f.text, f.x, f.y);
        }
      }
      ctx.globalAlpha = 1;
      if (screen === SCREEN_TITLE) {
        drawTitle(state, best);
      } else {
        drawHud(state, best);
        if (screen === SCREEN_UPGRADE) drawUpgrade(state);
        else if (screen === SCREEN_PAUSED) drawPaused();
        else if (screen === SCREEN_OVER) drawOver(state, best);
      }
      if (state.flash > 0) {
        ctx.fillStyle = `rgba(255, 40, 70, ${state.flash * 0.28})`;
        ctx.fillRect(0, 0, FIELD.width, FIELD.height);
      }
    },
  };
}
