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
 * every warning and shot of these kinds is kept `near` px away. Under one, it steps out to the
 * nearest clear spot; with one in the way, it waits where it is.
 */
export function around(f: BossFight, kinds: readonly string[], goal: number, near = 24): number {
  const x = f.world.s.x;
  const xs = [...f.warns, ...f.shots].filter((w) => kinds.includes(w.kind)).map((w) => w.x);
  const clear = (at: number) => xs.every((d) => Math.abs(d - at) >= near);
  if (!clear(x)) {
    for (let d = 4; d < 200; d += 4) {
      // The side of the goal first
      const first = goal >= x ? x + d : x - d;
      const second = goal >= x ? x - d : x + d;
      for (const at of [first, second])
        if (at > 44 && at < 596 && clear(at)) return at + (at > x ? 6 : -6);
    }
    return goal;
  }
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

/**
 * Squall: ride the left updraft to the cloud beside it, keep out of the columns that light
 * up, and walk off the cloud's edge onto the bird when it flies by underneath.
 */
const squall: BossScript = () => (f) => {
  const s = f.world.s;
  const { boss } = f;
  const [, top] = f.box;
  const cloud = 3 * 32; // the top of the cloud; its cells go from x = 64 to x = 160
  const onCloud = s.y + BALL_R <= cloud + 1 && s.x > 58 && s.x < 170;
  // In the air below the cloud's top but over the bird: keep over its head
  if (!onCloud && !f.dazed && canStomp(f)) return { jump: false, ...steer(s.x, boss.x) };
  if (onCloud) {
    // The bird about to be right past the edge of the cloud: walk off onto it
    const soon = boss.x + boss.dir * 30;
    const near = !f.dazed && soon > 178 && soon < 236 && top > cloud;
    const goal = near ? Math.max(boss.x, 196) : 128;
    return { jump: false, ...steer(s.x, around(f, ['bolt'], goal, 22)) };
  }
  // Up the left updraft, then right onto the cloud from over its top
  if (s.wind || (s.x < 64 && s.y < cloud))
    return { jump: false, left: false, right: s.y < cloud - 14 };
  // Back on the floor: to the updraft, stopping for lightning in the way. After a hit the
  // bounce off the bird's head is enough to steer straight back onto the cloud
  const goal = s.y < cloud ? 128 : around(f, ['bolt'], 48, 22);
  return { jump: false, ...steer(s.x, goal) };
};

/**
 * Sprocket: bounce on the switch, jump from the end of the step onto the bridge that closes,
 * cross it and drop on the robot while its shield is off; then back to the step before the
 * bridge opens. Gears are stepped away from; the bolts never reach the step.
 */
const sprocket: BossScript = () => (f) => {
  const s = f.world.s;
  const { boss } = f;
  const open = !boss.armor && !f.dazed;
  const bridge = 8 * 32;
  const bottom = s.y + BALL_R;
  if (open && canStomp(f)) return { jump: false, ...steer(s.x, boss.x) };
  // Shield on (or the robot dazed): back along the bridge to the step, and onto the switch
  // once the bridge has opened again
  if (!open) {
    const goal = s.x >= 224 ? 120 : around(f, ['gear'], f.world.s.switchOn ? 110 : 176, 26);
    return { jump: s.x > 224 && bottom > bridge + 1, ...steer(s.x, goal) };
  }
  // Shield off. On the bridge: to its far end, and off it with a high bounce
  if (bottom <= bridge + 1 && s.x > 214) return { jump: s.x > 360, right: true, left: false };
  // On the step: a high bounce from its end, then right once the ball is over the bridge
  if (s.x < 224) return { jump: true, ...steer(s.x, bottom < bridge - 2 ? 260 : 208) };
  // In the lane: back to the step
  return { jump: true, ...steer(s.x, 150) };
};

export const SCRIPTS: Record<number, BossScript> = {
  1: grumble,
  2: serpstone,
  3: squall,
  4: sprocket,
};
