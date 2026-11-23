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

/** The audio context and the node everything plays into, once sound has been unlocked. */
export function audioOut(): { ctx: AudioContext; out: AudioNode } | null {
  return ctx && master ? { ctx, out: master } : null;
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
  /** Rainbow bridges appearing: a rising sparkle. */
  bridge: () => {
    [784, 988, 1175, 1568].forEach((f, i) => tone(f, f, 0.18, 'sine', 0.08, 0.15 + i * 0.06));
  },
  /** Phase blocks swapping: a soft chime. */
  phase: () => {
    tone(660, 660, 0.08, 'sine', 0.06);
    tone(990, 990, 0.1, 'sine', 0.05, 0.05);
  },
  /** A springy pinball "boing". */
  bump: () => {
    tone(700, 260, 0.16, 'square', 0.08);
    tone(1400, 520, 0.12, 'sine', 0.12);
  },
  /** Floating into low gravity: a soft rising hum. */
  zone: () => tone(220, 440, 0.35, 'sine', 0.08),
  /** Rock giving way. */
  crumble: () => {
    noise(0.35, 0.3, 300, 0.8, 0, 'lowpass');
    tone(110, 60, 0.3, 'triangle', 0.1);
  },
  /** A vent lighting up: a low roar. */
  vent: () => noise(0.5, 0.12, 500, 0.5, 0, 'lowpass'),
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
  /** A stomp on a boss: a heavy thud and a falling growl. */
  bossHit: () => {
    noise(0.22, 0.5, 300, 0.7);
    tone(220, 55, 0.35, 'sawtooth', 0.2);
  },
  /** The boss going down: a long rumble and a rising chord. */
  bossDown: () => {
    noise(0.7, 0.5, 220, 0.6);
    tone(180, 40, 0.7, 'sawtooth', 0.22);
    [392, 523, 659, 784].forEach((f, n) => tone(f, f, 0.3, 'triangle', 0.16, 0.5 + n * 0.09));
  },
  /** A boss landing after a hop. */
  bossLand: () => noise(0.12, 0.35, 160, 0.8),
  /** A boss's own effect, by name (a warning, a shot, a grab…); unknown names are silent. */
  bossFx: (name: string) => BOSS_FX[name]?.(),
};

/** The sounds of the bosses' attacks: `warn-<kind>`, `shot-<kind>`, `end-<kind>` and others. */
const BOSS_FX: Record<string, (() => void) | undefined> = {
  grab: () => {
    tone(300, 120, 0.25, 'sawtooth', 0.14);
    noise(0.15, 0.2, 500, 2);
  },
  release: () => tone(240, 720, 0.14, 'triangle', 0.16),
  // Serpstone: the ground shaking, the serpent bursting out, rock cracking loose and landing
  'warn-burrow': () => noise(0.6, 0.3, 90, 0.8, 0, 'lowpass'),
  'serpent-rise': () => {
    noise(0.25, 0.4, 500, 0.7);
    tone(90, 240, 0.25, 'sawtooth', 0.14);
  },
  'warn-stalactite': () =>
    [1500, 1100].forEach((f, i) => tone(f, f * 0.9, 0.05, 'square', 0.06, i * 0.09)),
  'end-stalactite': () => noise(0.14, 0.3, 2400, 1.2),
  // Squall: the air crackling, thunder, and the wind picking up and blowing
  'warn-bolt': () => tone(900, 2200, 0.3, 'sawtooth', 0.05),
  'shot-bolt': () => {
    noise(0.35, 0.5, 1800, 0.5, 0, 'highpass');
    tone(160, 40, 0.4, 'sawtooth', 0.2);
  },
  'warn-gust-left': () => noise(0.5, 0.18, 700, 0.6),
  'warn-gust-right': () => noise(0.5, 0.18, 700, 0.6),
  gust: () => noise(1.4, 0.3, 1100, 0.5),
  // Sprocket: the shield going down and coming back, a screw fired, a gear thrown and landing
  'shield-off': () => {
    tone(880, 110, 0.4, 'square', 0.1);
    noise(0.2, 0.2, 3000, 2);
  },
  'shield-on': () => tone(220, 880, 0.25, 'square', 0.09),
  'warn-shield': () => [0, 0.2, 0.4].forEach((d) => tone(1320, 1320, 0.06, 'square', 0.06, d)),
  'warn-screw': () => tone(300, 500, 0.3, 'sawtooth', 0.07),
  'shot-screw': () => {
    noise(0.08, 0.3, 2000, 2);
    tone(700, 300, 0.1, 'square', 0.08);
  },
  'end-screw': () => noise(0.06, 0.25, 3200, 3),
  'warn-gear': () => tone(500, 380, 0.2, 'triangle', 0.08),
  'gear-up': () => tone(260, 900, 0.22, 'sawtooth', 0.08),
  'switch-back': () => [660, 880].forEach((f, i) => tone(f, f, 0.08, 'square', 0.08, i * 0.08)),
  'end-gear': () => {
    noise(0.1, 0.3, 900, 2);
    tone(180, 90, 0.12, 'square', 0.1);
  },
  // Inkwell: its arms reaching and coming back, ink bubbling up and popping
  'warn-reach': () => tone(140, 320, 0.5, 'sine', 0.14),
  'arms-back': () => tone(420, 160, 0.3, 'sine', 0.12),
  'warn-ink': () => tone(240, 300, 0.12, 'sine', 0.08),
  'shot-ink': () => {
    tone(180, 360, 0.16, 'sine', 0.1);
    noise(0.1, 0.12, 500, 1, 0, 'lowpass');
  },
  'end-ink': () => tone(700, 1100, 0.05, 'sine', 0.07),
  // Flurry: a snowball thrown and landing, the charge, the slip on its own ice, the stomp
  'warn-snow': () => tone(520, 420, 0.12, 'triangle', 0.07),
  'shot-snow': () => noise(0.18, 0.2, 1500, 0.8, 0, 'highpass'),
  'end-snow': () => noise(0.12, 0.3, 700, 0.8, 0, 'lowpass'),
  'warn-charge': () => [0, 0.3, 0.6].forEach((d) => noise(0.12, 0.35, 140, 0.8, d)),
  charge: () => {
    noise(0.5, 0.3, 300, 0.6);
    tone(110, 70, 0.5, 'sawtooth', 0.14);
  },
  slip: () => tone(900, 200, 0.5, 'triangle', 0.14),
  'warn-stomp': () => tone(200, 120, 0.4, 'sawtooth', 0.1),
  stomp: () => {
    noise(0.3, 0.4, 4200, 0.8, 0, 'highpass');
    noise(0.2, 0.4, 120, 0.8);
  },
  // Cinder: fire spat up, whistling down and landing, and rock cracking under it
  spit: () => {
    noise(0.3, 0.35, 900, 0.7);
    tone(200, 500, 0.3, 'sawtooth', 0.1);
  },
  'shot-fire': () => tone(1400, 500, 0.45, 'sine', 0.06),
  'end-fire': () => noise(0.2, 0.35, 500, 0.8, 0, 'lowpass'),
  crack: () => [0, 0.05, 0.11].forEach((d) => noise(0.04, 0.3, 2600, 3, d)),
  // Orbit: an orb let out, the beam charging, humming on and failing
  'warn-orb': () => tone(1200, 900, 0.1, 'sine', 0.06),
  'shot-orb': () => tone(500, 800, 0.2, 'triangle', 0.08),
  'warn-beam': () => tone(200, 900, 0.9, 'sine', 0.08),
  'beam-on': () => {
    tone(900, 880, 0.5, 'sawtooth', 0.07);
    tone(450, 440, 0.5, 'sine', 0.1);
  },
  'beam-off': () => tone(700, 90, 0.5, 'sawtooth', 0.1),
};
