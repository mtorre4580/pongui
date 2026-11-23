// Levels made by players in the editor: draft checks, the automatic par time and the compact
// code that carries a whole level inside a link (no server). Pure TS, no Phaser and no DOM.
import { COLS, ROWS } from './constants';
import { CHAR_TO_TILE } from './tiles';
import type { LevelData } from './level';

/** What a player's level is made of (the same map format as the official levels). */
export interface CustomLevelData {
  name: string;
  /** World whose colors the level uses (1–10). */
  theme: number;
  dark: boolean;
  /** Seconds for the time star, or null until the bot has beaten the level. */
  par: number | null;
  /** 12 rows of 20 characters; row 0 is always plain walls. */
  map: string[];
}

export const NAME_MAX = 24;
export const THEME_COUNT = 10;
/**
 * Items (gems, drops, hammers, lives, keys) a level may hold. The solver keeps the taken ones in
 * a 32-bit mask, so it cannot handle more than 31.
 */
export const MAX_ITEMS = 30;

const ITEM_CHARS = 'gdhlk';
const WALL_ROW = '#'.repeat(COLS);

/**
 * Every map character, in a fixed order: the link format stores each cell as its index here.
 * Never reorder or remove characters (old links would change meaning); new ones go at the end.
 */
export const SYMBOLS = '.#PEgdhlkxX^s<>w*Lm-|oAB()123ijc!b%&=~z';

/** A new level: walls around an empty room, the start bottom-left and the exit bottom-right. */
export function emptyMap(): string[] {
  const inner = '#' + '.'.repeat(COLS - 2) + '#';
  const rows = [WALL_ROW];
  for (let r = 1; r < ROWS - 1; r++) rows.push(inner);
  rows.push(WALL_ROW);
  rows[ROWS - 2] = '#.P' + '.'.repeat(COLS - 6) + 'E.#';
  return rows;
}

/** Writes one cell and keeps the map's rules: one start, one exit, row 0 always walls. */
export function paint(map: string[], col: number, row: number, ch: string): string[] {
  if (row <= 0 || row >= ROWS || col < 0 || col >= COLS) return map;
  if (map[row][col] === ch) return map;
  const out = map.slice();
  // The start and the exit are unique: placing one moves it
  if (ch === 'P' || ch === 'E') {
    for (let r = 1; r < ROWS; r++) {
      const c = out[r].indexOf(ch);
      if (c >= 0) out[r] = out[r].slice(0, c) + '.' + out[r].slice(c + 1);
    }
  }
  out[row] = out[row].slice(0, col) + ch + out[row].slice(col + 1);
  return out;
}

export type DraftIssue =
  | { code: 'start' }
  | { code: 'exit' }
  | { code: 'gem' }
  | { code: 'portal'; n: number }
  | { code: 'items'; n: number };

/** What a draft still needs before it can be played (in the order the editor lists them). */
export function draftIssues(map: string[]): DraftIssue[] {
  const all = map.join('');
  const count = (ch: string) => all.split(ch).length - 1;
  const issues: DraftIssue[] = [];
  if (!count('P')) issues.push({ code: 'start' });
  if (!count('E')) issues.push({ code: 'exit' });
  if (!count('g')) issues.push({ code: 'gem' });
  for (const n of [1, 2, 3]) {
    const k = count(String(n));
    if (k !== 0 && k !== 2) issues.push({ code: 'portal', n });
  }
  const items = [...all].filter((ch) => ITEM_CHARS.includes(ch)).length;
  if (items > MAX_ITEMS) issues.push({ code: 'items', n: items });
  return issues;
}

/** Changes whenever something that affects play changes (not the name or the colors). */
export function mapHash(map: string[], dark: boolean): string {
  let h = 2166136261;
  const s = map.join('') + (dark ? 'D' : '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** Par time from the bot's time, the same rule as the official levels. */
export const autoPar = (botTime: number) => Math.min(255, Math.round(2.5 * botTime + 5));

/** Removes control characters and extra spaces, and cuts the name to its maximum length. */
export function cleanName(name: string): string {
  // Control and format characters (bidi overrides, zero-width marks) and line separators
  const clean = name.replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, '');
  return [...clean.replace(/\s+/g, ' ').trim()].slice(0, NAME_MAX).join('');
}

/** The level in the official format, ready for `parseLevel`. */
export function toLevelData(level: CustomLevelData, hint?: string): LevelData {
  const name = level.name || '?';
  return {
    // The id names textures baked for the level: it changes when the map does
    id: `custom-${mapHash(level.map, level.dark)}`,
    name: { en: name, es: name, 'pt-BR': name },
    hint: hint ? { en: hint, es: hint, 'pt-BR': hint } : undefined,
    par: level.par ?? 999,
    dark: level.dark,
    map: level.map,
  };
}

// ---------- Link codes ----------
//
// Version 1, as bytes, then base64url without padding:
//   [0] version (1)
//   [1] theme - 1 (bits 0–3), dark (bit 4)
//   [2] par in seconds (0: none)
//   [3] name length in UTF-8 bytes, then the name
//   then rows 1–11 (row 0 is always walls), cell by cell: a byte with the symbol's index, or
//   the index + 0x40 followed by a byte with the length of a run of that symbol (2–255)
//   last: a checksum byte (the sum of every byte before it)

const VERSION = 1;
const RUN = 0x40;

function toBase64Url(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function fromBase64Url(code: string): number[] | null {
  if (!/^[A-Za-z0-9_-]+$/.test(code)) return null;
  try {
    const bin = atob(code.replace(/-/g, '+').replace(/_/g, '/'));
    return [...bin].map((c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

const checksum = (bytes: number[]) => bytes.reduce((s, b) => (s + b) & 0xff, 0);

/** Packs a level into a short code for links and QR codes. */
export function encodeLevel(level: CustomLevelData): string {
  const name = [...new TextEncoder().encode(cleanName(level.name))];
  const bytes = [
    VERSION,
    (Math.max(1, Math.min(THEME_COUNT, level.theme)) - 1) | (level.dark ? 0x10 : 0),
    Math.max(0, Math.min(255, level.par ?? 0)),
    name.length,
    ...name,
  ];
  const cells = level.map.slice(1).join('');
  for (let i = 0; i < cells.length;) {
    const sym = SYMBOLS.indexOf(cells[i]);
    if (sym < 0) throw new Error(`unknown map character '${cells[i]}'`);
    let run = 1;
    while (i + run < cells.length && cells[i + run] === cells[i] && run < 255) run++;
    if (run > 1) bytes.push(sym | RUN, run);
    else bytes.push(sym);
    i += run;
  }
  bytes.push(checksum(bytes));
  return toBase64Url(bytes);
}

/**
 * Reads a code (or a whole link that contains one). Returns null for anything that is not a
 * complete, valid level: links come from anyone, so nothing in them is trusted.
 */
export function decodeLevel(input: string): CustomLevelData | null {
  const code = extractCode(input);
  if (!code) return null;
  const bytes = fromBase64Url(code);
  if (!bytes || bytes.length < 6) return null;
  const body = bytes.slice(0, -1);
  if (checksum(body) !== bytes[bytes.length - 1]) return null;
  if (body[0] !== VERSION) return null;
  const theme = (body[1] & 0x0f) + 1;
  if (theme > THEME_COUNT || body[1] & 0xe0) return null;
  const dark = (body[1] & 0x10) !== 0;
  const par = body[2] || null;
  const nameLen = body[3];
  let name: string;
  try {
    name = new TextDecoder('utf-8', { fatal: true }).decode(
      new Uint8Array(body.slice(4, 4 + nameLen)),
    );
  } catch {
    return null;
  }
  let cells = '';
  const cellCount = (ROWS - 1) * COLS;
  for (let i = 4 + nameLen; i < body.length; i++) {
    const b = body[i];
    const sym = SYMBOLS[b & ~RUN];
    if (!sym || b & 0x80) return null;
    let run = 1;
    if (b & RUN) {
      run = body[++i];
      if (run === undefined || run < 2) return null;
    }
    cells += sym.repeat(run);
    if (cells.length > cellCount) return null;
  }
  if (cells.length !== cellCount) return null;
  const map = [WALL_ROW];
  for (let r = 0; r < ROWS - 1; r++) map.push(cells.slice(r * COLS, (r + 1) * COLS));
  if (draftIssues(map).length) return null;
  return { name: cleanName(name), theme, dark, par, map };
}

/** Finds the code in a pasted link (`…?c=CODE`) or takes the text as a bare code. */
export function extractCode(input: string): string | null {
  const text = input.trim();
  const m = /[?&#]c=([A-Za-z0-9_-]+)/.exec(text);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]+$/.test(text) ? text : null;
}

/** Every character a map may use, for tests: tiles, items, start, exit, water and zones. */
export const MAP_CHARS = [
  '.',
  '#',
  'P',
  'E',
  '~',
  'z',
  ...ITEM_CHARS,
  ...Object.keys(CHAR_TO_TILE),
];
