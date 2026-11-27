// Tiny WebAudio synth for sound effects — no audio files needed.
let ctx = null;
let master = null;
export const audio = { muted: false };

function ac() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.3;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(f, d, type = 'square', v = 0.2, f2 = null, delay = 0) {
  const c = ac();
  if (!c || audio.muted) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(v, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + d);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + d + 0.02);
}

function noise(d, v = 0.3, freq = 1200, delay = 0, type = 'bandpass') {
  const c = ac();
  if (!c || audio.muted) return;
  const t = c.currentTime + delay;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * d), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = c.createGain();
  g.gain.value = v;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

export function sfx(name) {
  try {
    switch (name) {
      case 'select':
        tone(880, 0.05, 'square', 0.06);
        tone(1320, 0.07, 'square', 0.05, null, 0.04);
        break;
      case 'cancel':
        tone(520, 0.08, 'square', 0.06, 300);
        break;
      case 'step':
        noise(0.05, 0.12, 600);
        break;
      case 'swing':
        noise(0.12, 0.25, 2600);
        break;
      case 'hit':
        noise(0.12, 0.45, 900);
        tone(160, 0.12, 'triangle', 0.25, 70);
        break;
      case 'crit':
        noise(0.2, 0.6, 1400);
        tone(220, 0.2, 'sawtooth', 0.2, 60);
        tone(1760, 0.15, 'square', 0.05, null, 0.03);
        break;
      case 'miss':
        noise(0.15, 0.15, 3200, 0, 'highpass');
        break;
      case 'bow':
        tone(300, 0.1, 'triangle', 0.15, 900);
        noise(0.1, 0.1, 4000);
        break;
      case 'fire':
        noise(0.5, 0.35, 500, 0, 'lowpass');
        tone(110, 0.4, 'sawtooth', 0.08, 60);
        break;
      case 'ice':
        [1568, 2093, 2637].forEach((f, i) => tone(f, 0.25, 'sine', 0.08, null, i * 0.05));
        noise(0.25, 0.15, 5000, 0, 'highpass');
        break;
      case 'thunder':
        noise(0.6, 0.7, 300, 0, 'lowpass');
        noise(0.1, 0.5, 3000);
        break;
      case 'heal':
        [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, 'sine', 0.08, null, i * 0.07));
        break;
      case 'buff':
        [392, 523, 659].forEach((f, i) => tone(f, 0.2, 'triangle', 0.08, null, i * 0.06));
        break;
      case 'turn':
        tone(660, 0.08, 'triangle', 0.08);
        tone(990, 0.12, 'triangle', 0.07, null, 0.07);
        break;
      case 'death':
        tone(300, 0.6, 'sawtooth', 0.12, 50);
        break;
      case 'coin':
        tone(1200, 0.08, 'square', 0.06);
        tone(1800, 0.2, 'square', 0.05, null, 0.06);
        break;
      case 'victory':
        [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone(f, 0.3, 'square', 0.07, null, i * 0.14));
        break;
      case 'defeat':
        [392, 349, 311, 262].forEach((f, i) => tone(f, 0.5, 'triangle', 0.1, null, i * 0.3));
        break;
    }
  } catch {
    /* audio is optional */
  }
}
