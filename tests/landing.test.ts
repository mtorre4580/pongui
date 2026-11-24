import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { en, type LandingKey } from '../src/landing/messages/en';
import { es } from '../src/landing/messages/es';
import { ptBR } from '../src/landing/messages/pt-BR';
import { en as game } from '../src/i18n/messages/en';
import { BOSS_WORLDS, WORLD_COUNT } from '../src/levels/worlds';

const html = readFileSync('index.html', 'utf8');
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('landing page texts', () => {
  for (const [name, messages] of [
    ['es', es],
    ['pt-BR', ptBR],
  ] as const) {
    it(`${name} has exactly the English keys and placeholders`, () => {
      expect(Object.keys(messages).sort()).toEqual(Object.keys(en).sort());
      for (const key of Object.keys(en) as LandingKey[]) {
        expect(placeholders(messages[key]), key).toEqual(placeholders(en[key]));
      }
    });
  }

  it('every data-i18n key in index.html exists and matches the English text', () => {
    // Prettier may break closing tags across lines (`</a\n>`), hence the `\s*` before `>`
    const tags = [...html.matchAll(/<(\w+)[^>]*\sdata-i18n="([^"]+)"[^>]*>([\s\S]*?)<\/\1\s*>/g)];
    expect(tags.length).toBeGreaterThan(40);
    for (const [, , key, text] of tags) {
      expect(en, key).toHaveProperty([key]);
      // The HTML holds the English text so crawlers and no-JS visitors read real content
      expect(squash(text), key).toBe(en[key as LandingKey]);
    }
  });

  it('every data-i18n-attr key in index.html exists', () => {
    for (const [, pairs] of html.matchAll(/data-i18n-attr="([^"]+)"/g)) {
      for (const pair of pairs.split(',')) expect(en).toHaveProperty([pair.split(':')[1].trim()]);
    }
  });

  it('index.html names the boss of every world like the game names it', () => {
    const bosses = [...html.matchAll(/data-boss="(\d+)"\s*>([^<]+)</g)];
    for (const [, n, name] of bosses)
      expect(squash(name), `boss ${n}`).toBe(game[`boss.${n}` as keyof typeof game]);
    // One on each world's card, plus the ones pictured in the bosses section
    const onCards = new Set(bosses.map(([, n]) => Number(n)));
    expect([...onCards].sort((a, b) => a - b)).toEqual([...BOSS_WORLDS]);
    for (const [, src] of html.matchAll(/src="\/landing\/(boss-\d+\.jpg)"/g))
      expect(existsSync(`public/landing/${src}`), src).toBe(true);
  });

  it('index.html has one card per world, named like the game names it', () => {
    const worlds = [...html.matchAll(/data-world="(\d+)"\s*>([^<]+)</g)];
    expect(worlds.map(([, n]) => Number(n))).toEqual(
      Array.from({ length: WORLD_COUNT }, (_, i) => i + 1),
    );
    for (const [, n, name] of worlds) {
      expect(squash(name)).toBe(game[`world.${n}` as keyof typeof game]);
      expect(html).toContain(`href="./play/?level=${n}-1"`);
    }
  });
});
