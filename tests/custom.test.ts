import { readdirSync, readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  autoPar,
  cleanName,
  decodeLevel,
  draftIssues,
  emptyMap,
  encodeLevel,
  extractCode,
  MAP_CHARS,
  mapHash,
  MAX_ITEMS,
  NAME_MAX,
  paint,
  SYMBOLS,
  toLevelData,
  type CustomLevelData,
} from '../src/game/custom';
import { parseLevel, type LevelData } from '../src/game/level';
import { solve } from '../src/game/solver';
import {
  addReceived,
  bestTime,
  botResult,
  createLevel,
  CUSTOM_KEY,
  deleteLevel,
  getLevel,
  hashOf,
  isVerified,
  listLevels,
  recordCustomWin,
  resetCustomCache,
  setBotResult,
  updateLevel,
} from '../src/custom/store';

const OFFICIAL = readdirSync('src/levels')
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(`src/levels/${f}`, 'utf8')) as LevelData);

const fromOfficial = (l: LevelData, theme = 1): CustomLevelData => ({
  name: l.name.en,
  theme,
  dark: l.dark ?? false,
  par: l.par,
  map: l.map,
});

describe('custom levels', () => {
  it('has a link symbol for every map character, each once', () => {
    expect(new Set(SYMBOLS).size).toBe(SYMBOLS.length);
    for (const ch of MAP_CHARS) expect(SYMBOLS).toContain(ch);
    // One byte keeps the symbol in its low 6 bits
    expect(SYMBOLS.length).toBeLessThanOrEqual(0x40);
  });

  it('round-trips every official level through a short link code', () => {
    let longest = 0;
    OFFICIAL.forEach((l, i) => {
      const level = fromOfficial(l, (i % 10) + 1);
      const code = encodeLevel(level);
      longest = Math.max(longest, code.length);
      expect(decodeLevel(code)).toEqual(level);
    });
    // Short enough for a comfortable QR code and a chat message
    expect(longest).toBeLessThan(400);
  });

  it('reads codes from whole links and rejects anything else', () => {
    const code = encodeLevel(fromOfficial(OFFICIAL[0]));
    expect(extractCode(`https://example.com/play/?c=${code}`)).toBe(code);
    expect(extractCode(`  ${code}\n`)).toBe(code);
    expect(decodeLevel(`Try my level! https://example.com/play/?c=${code}`)).not.toBeNull();
    for (const bad of ['', 'hello world', '%%%', code.slice(0, -3), code + 'AA', 'x' + code])
      expect(decodeLevel(bad)).toBeNull();
    // Any single changed character breaks the checksum or the structure
    let accepted = 0;
    for (let i = 0; i < code.length; i++) {
      const c = code[i] === 'A' ? 'B' : 'A';
      if (decodeLevel(code.slice(0, i) + c + code.slice(i + 1))) accepted++;
    }
    expect(accepted).toBeLessThanOrEqual(2);
  });

  it('rejects levels that cannot be played', () => {
    const noExit = paint(emptyMap(), 3, 3, 'g').map((r) => r.replace('E', '.'));
    expect(
      decodeLevel(encodeLevel({ name: 'x', theme: 1, dark: false, par: null, map: noExit })),
    ).toBeNull();
  });

  it('keeps one start and one exit, and row 0 as walls', () => {
    let map = emptyMap();
    map = paint(map, 5, 5, 'P');
    expect(map.join('').split('P').length - 1).toBe(1);
    expect(map[5][5]).toBe('P');
    map = paint(map, 6, 0, 'g');
    expect(map[0]).toBe('#'.repeat(20));
    expect(paint(map, 5, 5, 'P')).toBe(map);
  });

  it('lists what a draft still needs', () => {
    expect(draftIssues(emptyMap())).toEqual([{ code: 'gem' }]);
    let map = paint(emptyMap(), 4, 4, 'g');
    expect(draftIssues(map)).toEqual([]);
    map = paint(map, 6, 6, '2');
    expect(draftIssues(map)).toEqual([{ code: 'portal', n: 2 }]);
    map = paint(map, 8, 6, '2');
    expect(draftIssues(map)).toEqual([]);
    for (let i = 0; i < MAX_ITEMS; i++) map = paint(map, 1 + (i % 18), 2 + Math.floor(i / 18), 'g');
    expect(draftIssues(map)).toEqual([{ code: 'items', n: MAX_ITEMS + 1 }]);
  });

  it('cleans names', () => {
    expect(cleanName('  My' + String.fromCharCode(0) + '   level\n ')).toBe('My level');
    expect([...cleanName('ñ'.repeat(40))].length).toBe(NAME_MAX);
    expect(cleanName('🌈 Arcoíris')).toBe('🌈 Arcoíris');
  });

  it('hashes only what changes play', () => {
    const map = emptyMap();
    expect(mapHash(map, false)).toBe(mapHash([...map], false));
    expect(mapHash(map, true)).not.toBe(mapHash(map, false));
    expect(mapHash(paint(map, 3, 3, 'g'), false)).not.toBe(mapHash(map, false));
  });

  it('plays a level made in the editor with the real rules', () => {
    const map = paint(emptyMap(), 8, 9, 'g');
    const level = parseLevel(toLevelData({ name: 'Mine', theme: 3, dark: false, par: null, map }));
    expect(level.gems).toBe(1);
    const r = solve(level);
    expect(r.solved).toBe(true);
    expect(autoPar(r.time)).toBeGreaterThan(r.time);
  });
});

describe('custom level storage', () => {
  // Storage may be unavailable here: the store then keeps levels in memory, as in private mode
  beforeEach(() => {
    try {
      localStorage.removeItem(CUSTOM_KEY);
    } catch {
      /* no storage in this environment */
    }
    resetCustomCache();
  });

  it('verifies a level only when the bot and its creator beat that exact map', () => {
    const level = createLevel('Mine');
    updateLevel(level.id, (l) => (l.map = paint(l.map, 8, 9, 'g')));
    const hash = hashOf(getLevel(level.id)!);
    expect(isVerified(getLevel(level.id)!)).toBe(false);
    setBotResult(level.id, { hash, solved: true, time: 4, gems: 1 });
    expect(getLevel(level.id)!.par).toBe(autoPar(4));
    expect(isVerified(getLevel(level.id)!)).toBe(false);
    recordCustomWin(level.id, 6);
    expect(isVerified(getLevel(level.id)!)).toBe(true);
    expect(bestTime(getLevel(level.id)!)).toBe(6);
    // Any edit makes both checks stale
    updateLevel(level.id, (l) => (l.map = paint(l.map, 9, 9, 'g')));
    expect(isVerified(getLevel(level.id)!)).toBe(false);
    expect(botResult(getLevel(level.id)!)).toBeNull();
    expect(bestTime(getLevel(level.id)!)).toBeNull();
  });

  it('ignores a bot result for an older map', () => {
    const level = createLevel('Mine');
    setBotResult(level.id, { hash: 'stale', solved: true, time: 1, gems: 0 });
    expect(getLevel(level.id)!.bot).toBeNull();
  });

  it('keeps a level opened twice from a link once, apart from the creator', () => {
    const data = fromOfficial(OFFICIAL[0]);
    const a = addReceived(data);
    const b = addReceived({ ...data });
    expect(b.id).toBe(a.id);
    expect(a.origin).toBe('received');
    // Received levels are never "verified": that is for their creator
    recordCustomWin(a.id, 3);
    expect(isVerified(getLevel(a.id)!)).toBe(false);
    expect(getLevel(a.id)!.cleared).toBeNull();
    deleteLevel(a.id);
    expect(listLevels()).toEqual([]);
  });
});
