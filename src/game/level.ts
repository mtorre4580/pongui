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

/** What fills a cell (see `ParsedLevel.field`). */
export const FIELD = { NONE: 0, WATER: 1, ZONE: 2 } as const;
const FIELD_CHARS: Record<string, number> = { '~': FIELD.WATER, z: FIELD.ZONE };

export interface LevelData {
  id: string;
  name: Localized<string>;
  hint?: Localized<string>;
  /** Replaces `hint` when playing with touch gestures (for hints that name keys or buttons). */
  hintTouch?: Localized<string>;
  par: number; // seconds to earn the time star
  /** Only a circle of light around the ball (Shadow Keep). */
  dark?: boolean;
  map: string[];
}

export interface ParsedLevel {
  id: string;
  name: Localized<string>;
  hint: Localized<string> | null;
  hintTouch: Localized<string> | null;
  par: number;
  dark: boolean;
  tiles: Uint8Array;
  /**
   * What fills each cell: `FIELD.WATER` (`~`), `FIELD.ZONE` (low gravity, `z`) or nothing.
   * Anything placed inside one (a gem, the start, a portal, spikes) is in it too.
   */
  field: Uint8Array;
  items: { kind: ItemKind; col: number; row: number }[];
  start: { col: number; row: number };
  exit: { col: number; row: number };
  gems: number;
}

/**
 * Water and low-gravity zones of a map. Anything placed in one (a gem, the start, a portal,
 * spikes…) is in it too: it takes the field of the cell above it or of a side neighbor.
 */
export function fieldsOf(map: string[]): Uint8Array {
  const field = new Uint8Array(ROWS * COLS);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const ch = map[row]?.[col];
      if (ch === undefined || ch === '.' || ch === ' ' || ch === '#') continue;
      const idx = row * COLS + col;
      if (ch in FIELD_CHARS) {
        field[idx] = FIELD_CHARS[ch];
        continue;
      }
      // Cells already read (above, or to the left) use the result, the rest their character
      const fieldAt = (c: number, r: number): number => {
        if (c < 0 || c >= COLS || r < 0) return 0;
        if (r < row || c < col) return field[r * COLS + c];
        return FIELD_CHARS[map[r]?.[c] ?? ''] ?? 0;
      };
      field[idx] = fieldAt(col, row - 1) || fieldAt(col - 1, row) || fieldAt(col + 1, row);
    }
  }
  return field;
}

export function parseLevel(data: LevelData): ParsedLevel {
  const { map } = data;
  if (map.length !== ROWS)
    throw new Error(`${data.id}: the map has ${map.length} rows (expected ${ROWS})`);
  const tiles = new Uint8Array(ROWS * COLS);
  const field = fieldsOf(map);
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
      // Water and low-gravity zones are layers (see fieldsOf), not tiles
      if (ch in FIELD_CHARS) continue;
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
    dark: data.dark ?? false,
    par: data.par,
    tiles,
    field,
    items,
    start: s,
    exit: exit as { col: number; row: number },
    gems: items.filter((i) => i.kind === 'gem').length,
  };
}
