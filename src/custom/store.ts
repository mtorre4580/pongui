// Player-made levels kept in the browser (localStorage `boinky:custom`), apart from progress.
// "mine" are levels made in the editor on this device; "received" came from a shared link.
import {
  autoPar,
  cleanName,
  emptyMap,
  encodeLevel,
  mapHash,
  type CustomLevelData,
} from '../game/custom';
import { persistNative } from '../native';

export const CUSTOM_KEY = 'boinky:custom';
const MAX_MINE = 60;
const MAX_RECEIVED = 60;

export interface BotResult {
  /** `mapHash` of the map the bot played: any edit makes the result stale. */
  hash: string;
  solved: boolean;
  /** Seconds the bot's solution takes (0 when not solved). */
  time: number;
  /** Gems the bot reached, for the "stuck" message. */
  gems: number;
  /** Where the bot got furthest (center of the ball), when it did not win. */
  at?: { x: number; y: number };
}

export interface CustomLevel extends CustomLevelData {
  id: string;
  origin: 'mine' | 'received';
  bot: BotResult | null;
  /** `mapHash` of the map its creator beat by playing it. */
  cleared: string | null;
  /** Best time on this level, and the map it was set on. */
  best: { hash: string; time: number } | null;
  updated: number;
}

interface Store {
  levels: CustomLevel[];
}

let cache: Store | null = null;

function load(): Store {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    const parsed = raw ? (JSON.parse(raw) as Store) : null;
    cache = { levels: Array.isArray(parsed?.levels) ? parsed.levels : [] };
  } catch {
    cache = { levels: [] };
  }
  return cache;
}

function save() {
  try {
    const json = JSON.stringify(load());
    localStorage.setItem(CUSTOM_KEY, json);
    persistNative(CUSTOM_KEY, json);
  } catch {
    /* private mode or full storage: the levels live until the page closes */
  }
}

const newId = () =>
  crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

/** Newest first. */
export function listLevels(): CustomLevel[] {
  return [...load().levels].sort((a, b) => b.updated - a.updated);
}

export function getLevel(id: string): CustomLevel | undefined {
  return load().levels.find((l) => l.id === id);
}

export function createLevel(name: string): CustomLevel {
  const level: CustomLevel = {
    id: newId(),
    origin: 'mine',
    name: cleanName(name),
    theme: 1,
    dark: false,
    par: null,
    map: emptyMap(),
    bot: null,
    cleared: null,
    best: null,
    updated: Date.now(),
  };
  const s = load();
  s.levels.push(level);
  trim('mine', MAX_MINE);
  save();
  return level;
}

/** Changes a level and saves it. */
export function updateLevel(id: string, mutate: (l: CustomLevel) => void) {
  const level = getLevel(id);
  if (!level) return;
  mutate(level);
  level.updated = Date.now();
  save();
}

export function deleteLevel(id: string) {
  const s = load();
  s.levels = s.levels.filter((l) => l.id !== id);
  save();
}

/** Keeps a level opened from a link. The same level opened twice is kept once. */
export function addReceived(data: CustomLevelData): CustomLevel {
  const code = encodeLevel(data);
  const s = load();
  const same = s.levels.find((l) => encodeLevel(l) === code);
  if (same) {
    same.updated = Date.now();
    save();
    return same;
  }
  const level: CustomLevel = {
    ...data,
    id: newId(),
    origin: 'received',
    bot: null,
    cleared: null,
    best: null,
    updated: Date.now(),
  };
  s.levels.push(level);
  trim('received', MAX_RECEIVED);
  save();
  return level;
}

/** Drops the oldest levels of one kind beyond the limit. */
function trim(origin: CustomLevel['origin'], max: number) {
  const s = load();
  const of = s.levels.filter((l) => l.origin === origin).sort((a, b) => b.updated - a.updated);
  const drop = new Set(of.slice(max).map((l) => l.id));
  if (drop.size) s.levels = s.levels.filter((l) => !drop.has(l.id));
}

export const hashOf = (l: CustomLevelData) => mapHash(l.map, l.dark);

/** The bot's result for the current map, if it is not stale. */
export function botResult(l: CustomLevel): BotResult | null {
  return l.bot && l.bot.hash === hashOf(l) ? l.bot : null;
}

export function setBotResult(id: string, result: BotResult) {
  updateLevel(id, (l) => {
    if (result.hash !== hashOf(l)) return;
    l.bot = result;
    // A creator's level gets its par from the bot; a received one keeps the par in its link
    if (l.origin === 'mine' || l.par === null) l.par = result.solved ? autoPar(result.time) : null;
  });
}

/** Ready to share: the bot beat this exact map and so did its creator. */
export function isVerified(l: CustomLevel): boolean {
  const h = hashOf(l);
  return l.origin === 'mine' && !!botResult(l)?.solved && l.cleared === h;
}

/** Records a win; a creator beating their own level verifies that map. */
export function recordCustomWin(id: string, time: number) {
  updateLevel(id, (l) => {
    const h = hashOf(l);
    if (l.origin === 'mine') l.cleared = h;
    if (!l.best || l.best.hash !== h || time < l.best.time) l.best = { hash: h, time };
  });
}

/** Best time on the current map. */
export function bestTime(l: CustomLevel): number | null {
  return l.best && l.best.hash === hashOf(l) ? l.best.time : null;
}

/** Forgets the cached copy (tests). */
export function resetCustomCache() {
  cache = null;
}
