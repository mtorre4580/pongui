// Sound effects synthesized with Web Audio (no audio files: all original and offline).
import { loadSave, persist } from '../save';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let enabled = loadSave().sound;

export function unlockAudio() {
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.45;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

export function soundEnabled() {
  return enabled;
}

export function setSound(on: boolean) {
  enabled = on;
  persist((s) => {
    s.sound = on;
  });
}

function tone(
  f0: number,
  f1: number,
  dur: number,
  type: OscillatorType = 'sine',
  vol = 0.3,
  delay = 0,
) {
  if (!enabled || !ctx || !master) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(
  dur: number,
  vol: number,
  freq: number,
  q = 1,
  delay = 0,
  type: BiquadFilterType = 'bandpass',
) {
  if (!enabled || !ctx || !master || !noiseBuf) return;
  const t = ctx.currentTime + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
  src.stop(t + dur + 0.02);
}

export const sfx = {
  bounce: (kind: 'low' | 'high' | 'spring' | 'ramp' | 'push') => {
    if (kind === 'low') tone(260, 140, 0.09, 'sine', 0.22);
    else if (kind === 'high') tone(320, 520, 0.14, 'triangle', 0.22);
    else if (kind === 'ramp') tone(300, 700, 0.16, 'triangle', 0.2);
    else if (kind === 'push') {
      // A pneumatic puff and a quick rising whistle
      noise(0.12, 0.3, 1400, 1.2);
      tone(420, 980, 0.12, 'square', 0.07);
    } else {
      tone(200, 900, 0.28, 'square', 0.1);
      tone(400, 1400, 0.22, 'sine', 0.15, 0.02);
    }
  },
  boost: () => tone(500, 800, 0.08, 'triangle', 0.15),
  bonk: () => tone(180, 90, 0.06, 'square', 0.08),
  gem: () => {
    tone(880, 880, 0.09, 'sine', 0.2);
    tone(1320, 1320, 0.14, 'sine', 0.18, 0.07);
  },
  powerup: () => {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, f, 0.1, 'triangle', 0.16, i * 0.05));
  },
  life: () => {
    [659, 784, 988, 1318].forEach((f, i) => tone(f, f * 1.01, 0.12, 'sine', 0.18, i * 0.07));
  },
  crack: () => noise(0.08, 0.25, 1800, 2),
  break: () => {
    noise(0.25, 0.4, 900, 0.8);
    tone(160, 60, 0.2, 'triangle', 0.15);
  },
  unlock: () => {
    tone(1200, 1200, 0.05, 'square', 0.08);
    [660, 880, 1175].forEach((f, i) => tone(f, f, 0.14, 'triangle', 0.15, 0.06 + i * 0.06));
  },
  wind: () => noise(0.4, 0.16, 650, 0.6),
  /** A glassy clink on ice. */
  ice: () => {
    tone(2200, 2000, 0.07, 'sine', 0.08);
    tone(3300, 3100, 0.05, 'sine', 0.05, 0.02);
  },
  /** Thin ice giving way. */
  shatter: () => {
    noise(0.3, 0.35, 4200, 0.8, 0, 'highpass');
    [1800, 2600, 2100].forEach((f, i) => tone(f, f * 0.8, 0.06, 'triangle', 0.07, i * 0.04));
  },
  /** A rising shimmer. */
  portal: () => {
    tone(300, 1200, 0.18, 'sine', 0.16);
    tone(600, 2400, 0.14, 'triangle', 0.06, 0.04);
  },
  /** Into the water a soft splash, out of it a lighter drip. */
  splash: (inside: boolean) => {
    if (inside) noise(0.22, 0.25, 900, 0.7, 0, 'lowpass');
    else tone(900, 1500, 0.06, 'sine', 0.1);
  },
  /** A mechanical clack, higher when the switches turn on. */
  switch: (on: boolean) => {
    noise(0.05, 0.3, 2600, 3);
    tone(on ? 600 : 400, on ? 900 : 300, 0.09, 'square', 0.09, 0.02);
  },
  extinguish: () => noise(0.5, 0.35, 3500, 0.6, 0, 'highpass'),
  exitOpen: () => {
    [523, 659, 784].forEach((f) => tone(f, f, 0.5, 'sine', 0.12));
    tone(1046, 1046, 0.6, 'triangle', 0.1, 0.12);
  },
  die: () => {
    tone(520, 80, 0.45, 'sawtooth', 0.12);
    noise(0.3, 0.2, 600, 1);
  },
  win: () => {
    [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) =>
      tone(f, f, 0.16, 'triangle', 0.17, i * 0.09),
    );
  },
  click: () => tone(700, 500, 0.05, 'sine', 0.15),
  star: (i: number) => tone(880 + i * 220, 880 + i * 220, 0.18, 'triangle', 0.18),
};
