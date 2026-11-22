import { COLS, ROWS } from './constants';
import { CHAR_TO_TILE, T } from './tiles';

export type ItemKind = 'gem' | 'drop' | 'hammer' | 'life';

const CHAR_TO_ITEM: Record<string, ItemKind> = { g: 'gem', d: 'drop', h: 'hammer', l: 'life' };

export interface LevelData {
  id: string;
  name: string;
  hint?: string;
  par: number; // segundos para ganar la estrella de tiempo
  map: string[];
}

export interface ParsedLevel {
  id: string;
  name: string;
  hint: string;
  par: number;
  tiles: Uint8Array;
  items: { kind: ItemKind; col: number; row: number }[];
  start: { col: number; row: number };
  exit: { col: number; row: number };
  gems: number;
}

export function parseLevel(data: LevelData): ParsedLevel {
  const { map } = data;
  if (map.length !== ROWS) throw new Error(`${data.id}: el mapa tiene ${map.length} filas (deben ser ${ROWS})`);
  const tiles = new Uint8Array(ROWS * COLS);
  const items: ParsedLevel['items'] = [];
  let start: ParsedLevel['start'] | null = null;
  let exit: ParsedLevel['exit'] | null = null;

  map.forEach((line, row) => {
    if (line.length !== COLS) throw new Error(`${data.id}: la fila ${row} tiene ${line.length} columnas (deben ser ${COLS})`);
    for (let col = 0; col < COLS; col++) {
      const ch = line[col];
      const idx = row * COLS + col;
      if (ch === '.' || ch === ' ') continue;
      if (ch === 'P') {
        if (start) throw new Error(`${data.id}: hay más de un inicio (P)`);
        start = { col, row };
      } else if (ch === 'E') {
        if (exit) throw new Error(`${data.id}: hay más de una salida (E)`);
        exit = { col, row };
      } else if (ch in CHAR_TO_TILE) {
        tiles[idx] = CHAR_TO_TILE[ch];
      } else if (ch in CHAR_TO_ITEM) {
        items.push({ kind: CHAR_TO_ITEM[ch], col, row });
      } else {
        throw new Error(`${data.id}: carácter desconocido '${ch}' en fila ${row}, columna ${col}`);
      }
    }
  });

  if (!start) throw new Error(`${data.id}: falta el inicio (P)`);
  if (!exit) throw new Error(`${data.id}: falta la salida (E)`);
  const s = start as { col: number; row: number };
  if (tiles[s.row * COLS + s.col] !== T.EMPTY) throw new Error(`${data.id}: el inicio está dentro de un bloque`);

  return {
    id: data.id,
    name: data.name,
    hint: data.hint ?? '',
    par: data.par,
    tiles,
    items,
    start: s,
    exit: exit as { col: number; row: number },
    gems: items.filter((i) => i.kind === 'gem').length,
  };
}
