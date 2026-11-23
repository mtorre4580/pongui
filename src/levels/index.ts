import { parseLevel, type LevelData, type ParsedLevel } from '../game/level';
import { WORLD_COUNT } from './worlds';

const modules = import.meta.glob<LevelData>('./*.json', { eager: true, import: 'default' });

/** `w<world>-<nn>`: the world number and the level number inside it. */
export function parseId(id: string): { world: number; n: number } {
  const m = /^w(\d+)-(\d+)$/.exec(id);
  if (!m) throw new Error(`${id}: level ids look like w<world>-<nn>`);
  return { world: Number(m[1]), n: Number(m[2]) };
}

// Numeric order: alphabetically, w10-01 would come before w2-01
const byNumber = (a: ParsedLevel, b: ParsedLevel) => {
  const pa = parseId(a.id);
  const pb = parseId(b.id);
  return pa.world - pb.world || pa.n - pb.n;
};

export const LEVELS: ParsedLevel[] = Object.values(modules).map(parseLevel).sort(byNumber);

export interface WorldInfo {
  /** 1-based world number. */
  n: number;
  /** Index in LEVELS of the world's first level. */
  first: number;
  count: number;
}

export const WORLDS: WorldInfo[] = [];
LEVELS.forEach((level, i) => {
  const { world } = parseId(level.id);
  const last = WORLDS[WORLDS.length - 1];
  if (last?.n === world) last.count++;
  else WORLDS.push({ n: world, first: i, count: 1 });
});
if (WORLDS.length !== WORLD_COUNT)
  throw new Error(`levels for ${WORLDS.length} worlds, but WORLD_COUNT is ${WORLD_COUNT}`);

/** The world a level (index in LEVELS) belongs to. */
export function worldOf(index: number): WorldInfo {
  return WORLDS.find((w) => index >= w.first && index < w.first + w.count) ?? WORLDS[0];
}

/** Short label shown in the HUD and the banner, like "2-3". */
export function levelLabel(index: number): string {
  const w = worldOf(index);
  return `${w.n}-${index - w.first + 1}`;
}

/** `?level=12` (position in the whole game) or `?level=2-3` (world 2, level 3). */
export function levelFromParam(value: string | null): number | null {
  if (!value) return null;
  const m = /^(\d+)-(\d+)$/.exec(value);
  if (m) {
    const world = WORLDS.find((w) => w.n === Number(m[1]));
    const n = Number(m[2]);
    return world && n >= 1 && n <= world.count ? world.first + n - 1 : null;
  }
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, LEVELS.length) - 1 : null;
}
