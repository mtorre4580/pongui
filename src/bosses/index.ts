// The bosses: one special fight at the end of a world. Each lives in its own file with its
// brain (pure logic, no Phaser: `tests/boss.test.ts` plays every one), its arena and its music.
import type { Boss } from './types';
import { GRUMBLE } from './w1-grumble';

export type { Boss } from './types';

export const BOSSES = {
  1: GRUMBLE,
} satisfies Record<number, Boss>;

/** The boss of a world, if it has one. */
export const bossOf = (world: number | undefined): Boss | undefined =>
  (BOSSES as Record<number, Boss | undefined>)[world ?? 0];
