import type { Localized } from '../i18n';
import { COLS, ROWS } from './constants';
import { CHAR_TO_TILE, T } from './tiles';

export type ItemKind = 'gem' | 'drop' | 'hammer' | 'life' | 'key';

const CHAR_TO_ITEM: Record<string, ItemKind> = {
  g: 'gem',
  d: 'drop',
  h: 'hammer',
  l: 'life',
  k: 'key',
};

export interface LevelData {
  id: string;
  name: Localized<string>;
  hint?: Localized<string>;
  /** Replaces `hint` when playing with touch gestures (for hints that name keys or buttons). */
  hintTouch?: Localized<string>;
  par: number; // seconds to earn the time star
  map: string[];
}

export interface ParsedLevel {
  id: string;
  name: Localized<string>;
  hint: Localized<string> | null;
  hintTouch: Localized<string> | null;
  par: number;
  tiles: Uint8Array;
  items: { kind: ItemKind; col: number; row: number }[];
  start: { col: number; row: number };
  exit: { col: number; row: number };
  gems: number;
}

export function parseLevel(data: LevelData): ParsedLevel {
  const { map } = data;
  if (map.length !== ROWS)
    throw new Error(`${data.id}: the map has ${map.length} rows (expected ${ROWS})`);
  const tiles = new Uint8Array(ROWS * COLS);
  const items: ParsedLevel['items'] = [];
  let start: ParsedLevel['start'] | null = null;
  let exit: ParsedLevel['exit'] | null = null;

  map.forEach((line, row) => {
    if (line.length !== COLS)
      throw new Error(`${data.id}: row ${row} has ${line.length} columns (expected ${COLS})`);
    for (let col = 0; col < COLS; col++) {
      const ch = line[col];
      const idx = row * COLS + col;
      if (ch === '.' || ch === ' ') continue;
      if (ch === 'P') {
        if (start) throw new Error(`${data.id}: more than one start (P)`);
        start = { col, row };
      } else if (ch === 'E') {
        if (exit) throw new Error(`${data.id}: more than one exit (E)`);
        exit = { col, row };
      } else if (ch in CHAR_TO_TILE) {
        tiles[idx] = CHAR_TO_TILE[ch];
      } else if (ch in CHAR_TO_ITEM) {
        items.push({ kind: CHAR_TO_ITEM[ch], col, row });
      } else {
        throw new Error(`${data.id}: unknown character '${ch}' at row ${row}, column ${col}`);
      }
    }
  });

  // Each portal digit appears exactly twice: entering one leads to the other
  for (const t of [T.PORTAL_1, T.PORTAL_2, T.PORTAL_3]) {
    const n = tiles.reduce((k, v) => k + (v === t ? 1 : 0), 0);
    if (n !== 0 && n !== 2)
      throw new Error(`${data.id}: portal ${t - T.PORTAL_1 + 1} appears ${n} times (expected 2)`);
  }
  if (!start) throw new Error(`${data.id}: missing start (P)`);
  if (!exit) throw new Error(`${data.id}: missing exit (E)`);
  const s = start as { col: number; row: number };
  if (tiles[s.row * COLS + s.col] !== T.EMPTY)
    throw new Error(`${data.id}: the start is inside a block`);

  // The top row must be plain walls: the HUD is drawn over it (see scenes/Game.ts)
  for (let c = 0; c < COLS; c++) {
    if (tiles[c] !== T.SOLID) throw new Error(`${data.id}: row 0 must be solid walls (#)`);
  }

  return {
    id: data.id,
    name: data.name,
    hint: data.hint ?? null,
    hintTouch: data.hintTouch ?? null,
    par: data.par,
    tiles,
    items,
    start: s,
    exit: exit as { col: number; row: number },
    gems: items.filter((i) => i.kind === 'gem').length,
  };
}
