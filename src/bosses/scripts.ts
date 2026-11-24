// A way to beat each boss that a person could follow, written as a player made of simple
// rules. `tests/boss.test.ts` plays every boss with its script (what keeps a boss winnable) and
// `pnpm play:boss` plays them in the real scene with real key presses. Never part of the game:
// only tests and the development tools import this file.
import type { BossFight } from '../game/boss';
import { BALL_R, GRAVITY, MAX_VX } from '../game/constants';
import type { Serpent } from './w2-serpstone';
import type { InputState } from '../game/physics';

/** What the script wants held right now (`jumpPressed` is left to whoever presses the keys). */
export type Keys = Pick<InputState, 'left' | 'right' | 'jump'>;
/** A new player for one fight: called every step, it says which keys to hold. */
export type BossScript = () => (f: BossFight) => Keys;

/** Steers towards `x` (within `slack` px). */
export const steer = (from: number, x: number, slack = 3) => ({
  left: from > x + slack,
  right: from < x - slack,
});

/** Seconds until the ball's bottom is down at `y` (0 if it is already there or below). */
export function fallTime(f: BossFight, y: number): number {
  const s = f.world.s;
  const d = y - (s.y + BALL_R);
  if (d <= 0) return 0;
  return (-s.vy + Math.sqrt(s.vy * s.vy + 2 * GRAVITY * d)) / GRAVITY;
}

/**
 * Whether the ball, steering from now on, comes down on the boss's head: it is above it and
 * has the time in the air to get over it.
 */
export function canStomp(f: BossFight, slack = 0.8): boolean {
  const s = f.world.s;
  const [left, top, right] = f.box;
  if (s.y + BALL_R > top - 2) return false;
  const gap = Math.max(left - 4 - s.x, s.x - right - 4, 0);
  return gap <= MAX_VX * fallTime(f, top) * slack;
}

/**
 * Where to head for on the way to `goal` without walking under what is coming down: x of
 * every warning and shot of these kinds is kept `near` px away. With something in the way it
 * waits where it is, or steps out from under it.
 */
export function around(f: BossFight, kinds: readonly string[], goal: number, near = 24): number {
  const x = f.world.s.x;
  const xs = [...f.warns, ...f.shots].filter((w) => kinds.includes(w.kind)).map((w) => w.x);
  const over = xs.find((d) => Math.abs(d - x) < near);
  if (over !== undefined) return over + (x >= over ? near + 6 : -near - 6);
  const lo = Math.min(x, goal) - near;
  const hi = Math.max(x, goal) + near;
  return xs.some((d) => d > lo && d < hi) ? x : goal;
}

/**
 * Grumble: wait on the left ledge, drop on its head when it comes close, and bounce back up
 * to the ledge while it is dazed.
 */
const grumble: BossScript = () => (f) => {
  const s = f.world.s;
  const [left, top] = f.box;
  const onLedge = s.x < 3 * 32 && s.y < 8 * 32;
  const above = s.y + BALL_R < top - 4;
  // Go for it only from above, when it is awake, on the ground and within reach of the ledge
  const reach = left < 5 * 32 && f.boss.lift === 0;
  const attack = !f.dazed && above && (onLedge ? reach : s.x >= 3 * 32);
  return { jump: !onLedge, ...steer(s.x, attack ? f.boss.x : 56) };
};

/**
 * Serpstone: wait on a stone, step aside from the stalactites, and when it is up bounce high
 * from the edge of the stone next to it and come down on its head.
 */
const serpstone: BossScript = () => (f) => {
  const s = f.world.s;
  const { boss } = f;
  const up = (f.brain as Serpent).mode === 'up' && !f.dazed;
  // The stone on the ball's side of the serpent, and the edge of it that faces the serpent
  const stones = [224, 416];
  const stone = boss.x < 200 ? 224 : boss.x > 440 ? 416 : s.x < boss.x ? 224 : 416;
  if (up && canStomp(f)) return { jump: false, ...steer(s.x, boss.x) };
  const goal = up
    ? stone + Math.sign(boss.x - stone) * 22
    : stones.reduce((a, b) => (Math.abs(a - s.x) <= Math.abs(b - s.x) ? a : b));
  // Only the stones give a high bounce, and only when going for the head
  return { jump: up, ...steer(s.x, around(f, ['stalactite'], goal)) };
};

export const SCRIPTS: Record<number, BossScript> = {
  1: grumble,
  2: serpstone,
};
