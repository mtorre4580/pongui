// Progress saved in the browser (localStorage). The game still works if it is unavailable.
import { BOSS_WORLDS, LEVELS_PER_WORLD } from './levels/worlds';
import { persistNative } from './native';

const KEY = 'pongui:save';
// Key used before the game was renamed to Pongui: migrated on first load
const LEGACY_KEY = 'rebotin.save.v1';

export interface LevelRecord {
  stars: number;
  bestTime: number;
}

export interface SaveData {
  unlocked: number; // index of the last unlocked level
  levels: Record<string, LevelRecord>;
  sound: boolean;
  /** Id of the chosen ball (see skins.ts); the default one when missing. */
  skin?: string;
  /** Worlds whose boss was beaten. */
  bosses?: number[];
  /** Level of the day: last day beaten and streak (see daily.ts). */
  daily?: { last: number; streak: number; best: number };
}

const fresh = (): SaveData => ({ unlocked: 0, levels: {}, sound: true });
let cache: SaveData | null = null;

export function loadSave(): SaveData {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
    cache = raw ? { ...fresh(), ...JSON.parse(raw) } : fresh();
  } catch {
    cache = fresh();
  }
  return cache!;
}

/**
 * True when this browser has no saved game at all: someone opening the game for the first time.
 * Storage that cannot be read counts as a returning player, so they get the menu and not the
 * first level on every visit.
 */
export function isFirstVisit(): boolean {
  try {
    return localStorage.getItem(KEY) === null && localStorage.getItem(LEGACY_KEY) === null;
  } catch {
    return false;
  }
}

export function persist(mutate: (s: SaveData) => void) {
  const s = loadSave();
  mutate(s);
  try {
    const json = JSON.stringify(s);
    localStorage.setItem(KEY, json);
    persistNative(KEY, json);
  } catch {
    /* private mode or blocked storage */
  }
}

/**
 * The world whose boss guards a level: the first level of a world is behind the boss of the
 * world before it, when that world has one. Null for every other level.
 */
export function bossGate(index: number): number | null {
  if (index <= 0 || index % LEVELS_PER_WORLD !== 0) return null;
  const world = index / LEVELS_PER_WORLD;
  return BOSS_WORLDS.includes(world) ? world : null;
}

export const bossBeaten = (world: number, save: SaveData = loadSave()) =>
  save.bosses?.includes(world) ?? false;

/** A world's boss can be fought once every level of that world has been beaten. */
export function bossOpen(world: number, ids: readonly string[]): boolean {
  const s = loadSave();
  const first = (world - 1) * LEVELS_PER_WORLD;
  return ids.slice(first, first + LEVELS_PER_WORLD).every((id) => id in s.levels);
}

/**
 * A level is open when it is the first one, when an older save had it unlocked, or when the one
 * before it was beaten and, for the first level of a world behind a boss, so was that boss.
 * Records decide (not only `unlocked`), so adding a world opens it for players who already
 * finished the previous one; and whoever had a world open before its boss existed keeps it.
 */
export function isUnlocked(index: number, ids: readonly string[]): boolean {
  const s = loadSave();
  if (index === 0 || index <= s.unlocked) return true;
  if (!(ids[index - 1] in s.levels)) return false;
  const gate = bossGate(index);
  return gate === null || bossBeaten(gate, s);
}

export function recordWin(
  levelId: string,
  levelIndex: number,
  stars: number,
  time: number,
  total: number,
) {
  persist((s) => {
    const prev = s.levels[levelId];
    s.levels[levelId] = {
      stars: Math.max(prev?.stars ?? 0, stars),
      bestTime: Math.min(prev?.bestTime ?? Infinity, time),
    };
    // The level after this one opens, unless a boss stands in between
    const gate = bossGate(levelIndex + 1);
    if (gate === null || bossBeaten(gate, s))
      s.unlocked = Math.min(total - 1, Math.max(s.unlocked, levelIndex + 1));
  });
}

/** Records a boss as beaten: the world after it opens. */
export function recordBossWin(world: number, total: number) {
  persist((s) => {
    s.bosses = [...new Set([...(s.bosses ?? []), world])];
    s.unlocked = Math.min(total - 1, Math.max(s.unlocked, world * LEVELS_PER_WORLD));
  });
}
