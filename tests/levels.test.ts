import { describe, expect, it } from 'vitest';
import { LOCALES } from '../src/i18n';
import { parseLevel } from '../src/game/level';
import { levelFromParam, LEVELS, levelLabel, parseId, WORLDS } from '../src/levels';
import { BOSS_WORLDS, WORLD_COUNT } from '../src/levels/worlds';
import { isUnlocked, persist, recordWin } from '../src/save';

// Solvability is checked by `pnpm validate:levels` (slower: it runs the solver on every level).
describe('levels', () => {
  it('loads every level in order with unique ids', () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(10);
    const ids = LEVELS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    const order = ids.map((id) => parseId(id).world * 100 + parseId(id).n);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('has ten levels per world, numbered 1 to 10', () => {
    expect(WORLDS.length).toBe(WORLD_COUNT);
    WORLDS.forEach((w, i) => {
      expect(w.n).toBe(i + 1);
      expect(w.count).toBe(10);
      const ns = LEVELS.slice(w.first, w.first + w.count).map((l) => parseId(l.id).n);
      expect(ns).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    });
  });

  it('labels levels and reads ?level= links by position or world', () => {
    expect(levelLabel(0)).toBe('1-1');
    expect(levelLabel(12)).toBe('2-3');
    expect(levelFromParam('12')).toBe(11);
    expect(levelFromParam('2-3')).toBe(12);
    expect(levelFromParam('2-11')).toBeNull();
    expect(levelFromParam('nope')).toBeNull();
    expect(levelFromParam(null)).toBeNull();
  });

  for (const lvl of LEVELS) {
    it(`${lvl.id} has its name and hint in every language`, () => {
      for (const locale of LOCALES) {
        expect(lvl.name[locale]?.trim()).toBeTruthy();
        if (lvl.hint) expect(lvl.hint[locale]?.trim()).toBeTruthy();
        if (lvl.hintTouch) expect(lvl.hintTouch[locale]?.trim()).toBeTruthy();
      }
    });

    it(`${lvl.id} has gems or an open exit and a positive par time`, () => {
      expect(lvl.par).toBeGreaterThan(0);
      expect(lvl.gems).toBeGreaterThanOrEqual(0);
    });
  }
});

describe('level top row', () => {
  const base: string[] = Array.from({ length: 12 }, (_, r) =>
    r === 0 || r === 11
      ? '####################'
      : r === 10
        ? '#P................E#'
        : '#..................#',
  );
  const name = { en: 't', es: 't', 'pt-BR': 't' };

  it('accepts hazards on the floor row', () => {
    const map = [...base];
    map[11] = '###*****^^^^^#######';
    expect(() => parseLevel({ id: 't', name, par: 1, map })).not.toThrow();
  });

  it('rejects a gap in the top row (the HUD covers it)', () => {
    const map = [...base];
    map[0] = '#########.##########';
    expect(() => parseLevel({ id: 't', name, par: 1, map })).toThrow(/row 0/);
  });
});

describe('unlocking', () => {
  const ids = LEVELS.map((l) => l.id);
  // The first world that does not end with a boss: its records alone open the next one. Once
  // every world has a boss there is none left (worlds behind a boss: unlock.test.ts)
  const free = WORLDS.map((w) => w.n).find((n) => n < WORLD_COUNT && !BOSS_WORLDS.includes(n));
  const last = (free ?? 1) * 10 - 1;

  it.skipIf(free === undefined)(
    'opens the next world for a save that finished the previous one',
    () => {
      // A save from when a world was the last one: `unlocked` stopped at its last level
      persist((s) => {
        s.unlocked = last;
        s.levels = { [ids[last]]: { stars: 3, bestTime: 20 } };
      });
      expect(isUnlocked(last, ids)).toBe(true);
      expect(isUnlocked(last + 1, ids)).toBe(true);
      expect(isUnlocked(last + 2, ids)).toBe(false);
    },
  );

  it('opens each level after beating the one before', () => {
    persist((s) => {
      s.unlocked = Math.max(s.unlocked, last + 1);
    });
    recordWin(ids[last + 1], last + 1, 2, 30, ids.length);
    expect(isUnlocked(last + 2, ids)).toBe(true);
    expect(isUnlocked(last + 3, ids)).toBe(false);
  });
});
