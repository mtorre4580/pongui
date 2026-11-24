// Boss music, synthesized like the sound effects (no audio files): a low drone with a clashing
// note, a heartbeat, a creeping bass line and high stabs. It speeds up as the boss loses hits.
import { audioOut, soundEnabled } from './sfx';

const LOOKAHEAD = 0.25; // seconds scheduled ahead
const TEMPOS = [92, 112, 136]; // beats per minute for each phase of the fight

// Semitones over the root: a phrygian crawl (the flat second is what makes it uneasy)
const BASS = [0, 0, 1, 0, 0, 7, 1, 0, 0, 0, 1, 3, 0, 8, 7, 1];

let voice: {
  ctx: AudioContext;
  gain: GainNode;
  nodes: AudioScheduledSourceNode[];
  timer: number;
  next: number;
  step: number;
  root: number;
} | null = null;
let intensity = 0;
let paused = false;

const semitone = (root: number, n: number) => root * 2 ** (n / 12);

/** One short note into the music's own gain. */
function note(
  type: OscillatorType,
  from: number,
  to: number,
  at: number,
  length: number,
  volume: number,
) {
  if (!voice) return;
  const { ctx, gain } = voice;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), at + length);
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(volume, at + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(env).connect(gain);
  osc.start(at);
  osc.stop(at + length + 0.03);
}

/** Schedules the sixteenth notes that fall inside the lookahead window. */
function schedule() {
  if (!voice) return;
  const { ctx, root } = voice;
  const audible = soundEnabled() && !paused;
  voice.gain.gain.setTargetAtTime(audible ? 0.8 : 0.0001, ctx.currentTime, 0.08);
  const sixteenth = 60 / TEMPOS[intensity] / 4;
  // After a pause (or a hidden tab) start from now instead of rushing through the gap
  if (voice.next < ctx.currentTime) voice.next = ctx.currentTime + 0.05;
  while (voice.next < ctx.currentTime + LOOKAHEAD) {
    const at = voice.next;
    const step = voice.step % 16;
    if (audible) {
      // Heartbeat: two thumps, then silence
      if (step === 0 || step === 3) note('sine', 120, 38, at, 0.2, step === 0 ? 0.5 : 0.32);
      // In the later phases it beats twice per bar
      if (intensity > 0 && (step === 8 || step === 11)) note('sine', 120, 38, at, 0.18, 0.34);
      const bass = semitone(root * 2, BASS[step]);
      if (step % 2 === 0 || intensity === 2)
        note('sawtooth', bass, bass, at, sixteenth * 0.9, 0.09);
      // A tritone stab once per bar, higher each phase
      if (step === 12) {
        const high = semitone(root * 8, 6 + intensity);
        note('square', high, high * 0.97, at, sixteenth * 3, 0.035);
        note('square', high * 1.06, high, at, sixteenth * 3, 0.03);
      }
    }
    voice.step++;
    voice.next += sixteenth;
  }
}

/** Starts the music over `root` (Hz), or restarts it. Silent until the game's audio is unlocked. */
export function startBossMusic(root: number) {
  stopBossMusic();
  const audio = audioOut();
  if (!audio) return;
  const { ctx, out } = audio;
  const gain = ctx.createGain();
  gain.gain.value = 0.0001;
  gain.connect(out);
  // The drone: the root and the note a semitone above it, grinding against each other
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  // Open enough to be heard on a phone's small speaker, which has no real bass
  filter.frequency.value = 420;
  const level = ctx.createGain();
  level.gain.value = 0.2;
  filter.connect(level).connect(gain);
  const nodes = [root, semitone(root, 1) * 1.003].map((frequency) => {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = frequency;
    osc.connect(filter);
    osc.start();
    return osc;
  });
  intensity = 0;
  paused = false;
  voice = { ctx, gain, nodes, timer: 0, next: ctx.currentTime + 0.1, step: 0, root };
  voice.timer = window.setInterval(schedule, 60);
  schedule();
}

/** 0, 1 or 2: the phase of the fight. The music gets faster and busier. */
export function setBossMusicPhase(phase: number) {
  intensity = Math.max(0, Math.min(TEMPOS.length - 1, phase));
}

/** Hushes the music while the game is paused. */
export function pauseBossMusic(on: boolean) {
  paused = on;
  schedule();
}

export function stopBossMusic() {
  if (!voice) return;
  const { ctx, gain, nodes, timer } = voice;
  window.clearInterval(timer);
  voice = null;
  gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.1);
  nodes.forEach((n) => n.stop(ctx.currentTime + 0.6));
  window.setTimeout(() => gain.disconnect(), 800);
}

export const bossMusicPlaying = () => voice !== null;
