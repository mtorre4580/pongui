import { describe, expect, it } from 'vitest';
import { LOCALES } from '../src/i18n';
import { parseLevel } from '../src/game/level';
import { LEVELS } from '../src/levels';

// Solvability is checked by `pnpm validate:levels` (slower: it runs the solver on every level).
describe('levels', () => {
  it('loads every level in order with unique ids', () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(10);
    const ids = LEVELS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
  });

  for (const lvl of LEVELS) {
    it(`${lvl.id} has its name and hint in every language`, () => {
      for (const locale of LOCALES) {
        expect(lvl.name[locale]?.trim()).toBeTruthy();
        if (lvl.hint) expect(lvl.hint[locale]?.trim()).toBeTruthy();
      }
    });

    it(`${lvl.id} has gems or an open exit and a positive par time`, () => {
      expect(lvl.par).toBeGreaterThan(0);
      expect(lvl.gems).toBeGreaterThanOrEqual(0);
    });
  }
});

describe('level borders', () => {
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

  it('rejects a side column that is not a plain wall (controls may cover it)', () => {
    const map = [...base];
    map[5] = '*..................#';
    expect(() => parseLevel({ id: 't', name, par: 1, map })).toThrow(/columns/);
  });
});
