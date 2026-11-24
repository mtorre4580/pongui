// Boss music, synthesized like the sound effects (no audio files). Every boss has a theme: a
// drone of two notes, a beat, a bass line and high stabs. It speeds up as the boss loses hits.
import { audioOut, soundEnabled } from './sfx';

/** What makes one boss's music its own. */
export interface BossTheme {
  /** Root note (Hz). */
  root: number;
  /** The bass line: semitones over the root for each of its sixteen steps. */
  bass: readonly number[];
  /** Beats per minute for each phase of the fight (the last one holds for later phases). */
  tempos: readonly number[];
  /** Timbre of the bass and of the drone. */
  wave: OscillatorType;
  /** Timbre of the high stabs. */
  lead: OscillatorType;
  /** Semitones over the root of the stab, once per bar (it climbs as the fight goes on). */
  stab: number;
  /** Semitones between the two notes of the drone. */
  drone: number;
  /** Steps of the bar with a drum thump. */
  beat: readonly number[];
}

const LOOKAHEAD = 0.25; // seconds scheduled ahead

let voice: {
  ctx: AudioContext;
  gain: GainNode;
  nodes: AudioScheduledSourceNode[];
  timer: number;
  next: number;
  step: number;
  theme: BossTheme;
} | null = null;
/** Phase of the fight, and how busy the music is (0, 1 or 2). */
let phase = 0;
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
  const { ctx, theme } = voice;
  const audible = soundEnabled() && !paused;
  voice.gain.gain.setTargetAtTime(audible ? 0.8 : 0.0001, ctx.currentTime, 0.08);
  const tempo = theme.tempos[Math.min(phase, theme.tempos.length - 1)];
  const sixteenth = 60 / tempo / 4;
  // After a pause (or a hidden tab) start from now instead of rushing through the gap
  if (voice.next < ctx.currentTime) voice.next = ctx.currentTime + 0.05;
  while (voice.next < ctx.currentTime + LOOKAHEAD) {
    const at = voice.next;
    const step = voice.step % 16;
    if (audible) {
      // The beat: thumps on the theme's steps, the first one louder
      const beat = theme.beat.indexOf(step);
      if (beat >= 0) note('sine', 120, 38, at, 0.2, beat === 0 ? 0.5 : 0.32);
      // In the later phases it beats twice per bar
      if (intensity > 0 && theme.beat.includes((step + 8) % 16))
        note('sine', 120, 38, at, 0.18, 0.34);
      const bass = semitone(theme.root * 2, theme.bass[step]);
      if (step % 2 === 0 || intensity === 2)
        note(theme.wave, bass, bass, at, sixteenth * 0.9, 0.09);
      // A stab once per bar, higher each phase
      if (step === 12) {
        const high = semitone(theme.root * 8, theme.stab + intensity);
        note(theme.lead, high, high * 0.97, at, sixteenth * 3, 0.035);
        note(theme.lead, high * 1.06, high, at, sixteenth * 3, 0.03);
      }
    }
    voice.step++;
    voice.next += sixteenth;
  }
}

/** Starts a boss's music, or restarts it. Silent until the game's audio is unlocked. */
export function startBossMusic(theme: BossTheme) {
  stopBossMusic();
  const audio = audioOut();
  if (!audio) return;
  const { ctx, out } = audio;
  const gain = ctx.createGain();
  gain.gain.value = 0.0001;
  gain.connect(out);
  const { root } = theme;
  // The drone: the root and a second note grinding against it
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  // Open enough to be heard on a phone's small speaker, which has no real bass
  filter.frequency.value = 420;
  const level = ctx.createGain();
  level.gain.value = 0.2;
  filter.connect(level).connect(gain);
  const nodes = [root, semitone(root, theme.drone) * 1.003].map((frequency) => {
    const osc = ctx.createOscillator();
    osc.type = theme.wave;
    osc.frequency.value = frequency;
    osc.connect(filter);
    osc.start();
    return osc;
  });
  phase = 0;
  intensity = 0;
  paused = false;
  voice = { ctx, gain, nodes, timer: 0, next: ctx.currentTime + 0.1, step: 0, theme };
  voice.timer = window.setInterval(schedule, 60);
  schedule();
}

/** The phase of the fight, out of `phases`: the music gets faster and busier. */
export function setBossMusicPhase(now: number, phases = 3) {
  phase = Math.max(0, now);
  intensity = Math.max(0, Math.min(2, Math.floor((now * 3) / Math.max(3, phases))));
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
