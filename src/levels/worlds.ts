// How many worlds have levels. Kept apart from the level files so the landing page can list the
// worlds without bundling every map (tests check it matches src/levels).
export const WORLD_COUNT = 10;
/** Worlds in the plan: once they all exist, the landing page stops promising more. */
export const PLANNED_WORLDS = 10;
/** Every world has this many levels. */
export const LEVELS_PER_WORLD = 10;
/**
 * Worlds that end with a boss: the next world opens when it is beaten, not when the last level
 * is. Worlds not listed here open the next one the old way.
 */
export const BOSS_WORLDS: readonly number[] = [1, 2];
