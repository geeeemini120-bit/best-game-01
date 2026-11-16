// Synthesised sound: every effect is an oscillator or a burst of filtered noise, made fresh
// per call, and a quiet bass pulse loops underneath the game. Nothing is loaded from a file,
// so the game stays silent only until the first gesture creates the AudioContext; in shot
// mode the game never touches audio at all.

const NOTE = { C2: 65.41, E2: 82.41, G2: 98.0, A2: 110.0, C3: 130.81, D3: 146.83, G3: 196.0 };

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let muted = false;
  let musicTimer = 0;
  let musicStep = 0;
  const bassLine = [NOTE.C2, NOTE.C2, NOTE.G2, NOTE.A2, NOTE.C2, NOTE.E2, NOTE.G2, NOTE.G3];

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      return true;
    } catch {
      return false;
    }
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, filterFreq) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t0);
  }

  return {
    /** Call from a user gesture: creates the context so sound can start. */
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    setMuted(next) {
      muted = next;
      if (master) master.gain.value = muted ? 0 : 0.5;
    },
    isMuted() {
      return muted;
    },
    shoot() {
      tone(720 + Math.random() * 120, 0.07, 'square', 0.08, 240);
    },
    explode(big) {
      noise(big ? 0.5 : 0.28, big ? 0.5 : 0.3, big ? 900 : 1400);
      tone(big ? 120 : 170, big ? 0.4 : 0.22, 'sawtooth', 0.22, 40);
    },
    pickup() {
      tone(880, 0.09, 'sine', 0.14, 1320);
    },
    hit() {
      noise(0.2, 0.4, 700);
      tone(220, 0.25, 'sawtooth', 0.25, 55);
    },
    upgrade() {
      tone(NOTE.C3, 0.12, 'triangle', 0.2);
      setTimeout(() => tone(NOTE.E2 * 2, 0.12, 'triangle', 0.2), 90);
      setTimeout(() => tone(NOTE.G3, 0.2, 'triangle', 0.2), 180);
    },
    waveStart() {
      tone(NOTE.C2, 0.3, 'triangle', 0.25, NOTE.C3);
      tone(NOTE.G2, 0.3, 'triangle', 0.15, NOTE.G3);
    },
    gameOver() {
      tone(NOTE.G2, 0.5, 'sawtooth', 0.2, NOTE.C2);
      setTimeout(() => tone(NOTE.C2, 0.9, 'sawtooth', 0.2, 40), 350);
    },
    /** Advance the bass loop; call once per frame with the frame's seconds. */
    tick(dt) {
      if (!ctx || muted) return;
      musicTimer += dt;
      if (musicTimer >= 0.42) {
        musicTimer -= 0.42;
        const freq = bassLine[musicStep % bassLine.length];
        musicStep += 1;
        const t0 = ctx.currentTime;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.5, t0);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4);
        osc.connect(gain);
        gain.connect(musicGain);
        osc.start(t0);
        osc.stop(t0 + 0.42);
      }
    },
  };
}
