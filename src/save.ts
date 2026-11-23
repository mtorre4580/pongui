// Progress saved in the browser (localStorage). The game still works if it is unavailable.
import { persistNative } from './native';

const KEY = 'boinky:save';
// Key used before the game was renamed to Boinky: migrated on first load
const LEGACY_KEY = 'rebotin.save.v1';

export interface LevelRecord {
  stars: number;
  bestTime: number;
}

export interface SaveData {
  unlocked: number; // index of the last unlocked level
  levels: Record<string, LevelRecord>;
  sound: boolean;
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
    s.unlocked = Math.min(total - 1, Math.max(s.unlocked, levelIndex + 1));
  });
}
