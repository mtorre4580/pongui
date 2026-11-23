import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { en, type LandingKey } from '../src/landing/messages/en';
import { es } from '../src/landing/messages/es';
import { ptBR } from '../src/landing/messages/pt-BR';

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
});
