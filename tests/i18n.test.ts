import { describe, expect, it } from 'vitest';
import { en } from '../src/i18n/messages/en';
import { es } from '../src/i18n/messages/es';
import { ptBR } from '../src/i18n/messages/pt-BR';

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('i18n messages', () => {
  for (const [name, messages] of [
    ['es', es],
    ['pt-BR', ptBR],
  ] as const) {
    it(`${name} has exactly the English keys`, () => {
      expect(Object.keys(messages).sort()).toEqual(Object.keys(en).sort());
    });

    it(`${name} keeps the same placeholders as English`, () => {
      for (const key of Object.keys(en) as (keyof typeof en)[]) {
        expect(placeholders(messages[key]), key).toEqual(placeholders(en[key]));
      }
    });
  }
});
