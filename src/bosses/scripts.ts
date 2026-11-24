// A way to beat each boss that a person could follow, written as a player made of simple
// rules. `tests/boss.test.ts` plays every boss with its script (what keeps a boss winnable) and
// `pnpm play:boss` plays them in the real scene with real key presses. Never part of the game:
// only tests and the development tools import this file.
import type { BossFight } from '../game/boss';
import { BALL_R } from '../game/constants';
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

export const SCRIPTS: Record<number, BossScript> = {
  1: grumble,
};
