import { afterEach, describe, expect, it, vi } from 'vitest';

const IDS = Array.from(
  { length: 30 },
  (_, i) => `w${Math.floor(i / 10) + 1}-${String((i % 10) + 1).padStart(2, '0')}`,
);

/** A fresh copy of the save module over a fake storage (the module caches what it reads). */
async function withSave(initial?: object) {
  const items: Record<string, string> = initial ? { 'pongui:save': JSON.stringify(initial) } : {};
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => items[key] ?? null,
    setItem: (key: string, value: string) => {
      items[key] = value;
    },
  });
  vi.resetModules();
  return import('../src/save');
}

const beaten = (count: number) =>
  Object.fromEntries(IDS.slice(0, count).map((id) => [id, { stars: 1, bestTime: 9 }]));

describe('worlds behind a boss', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('guards the first level of the world after one with a boss', async () => {
    const save = await withSave();
    expect(save.bossGate(10)).toBe(1);
    // No boss in world 2 yet, and no gate anywhere else
    expect(save.bossGate(20)).toBeNull();
    expect(save.bossGate(0)).toBeNull();
    expect(save.bossGate(9)).toBeNull();
    expect(save.bossGate(11)).toBeNull();
  });

  it('keeps world 2 closed after the last level of world 1, until the boss is beaten', async () => {
    const save = await withSave();
    for (let i = 0; i < 10; i++) save.recordWin(IDS[i], i, 3, 5, IDS.length);
    expect(save.isUnlocked(9, IDS)).toBe(true);
    expect(save.isUnlocked(10, IDS)).toBe(false);
    expect(save.bossOpen(1, IDS)).toBe(true);
    save.recordBossWin(1, IDS.length);
    expect(save.bossBeaten(1)).toBe(true);
    expect(save.isUnlocked(10, IDS)).toBe(true);
    // Beating it twice records it once
    save.recordBossWin(1, IDS.length);
    expect(save.loadSave().bosses).toEqual([1]);
  });

  it('opens the boss only when every level of its world is beaten', async () => {
    const save = await withSave({ unlocked: 9, sound: true, levels: beaten(9) });
    expect(save.bossOpen(1, IDS)).toBe(false);
    save.recordWin(IDS[9], 9, 1, 20, IDS.length);
    expect(save.bossOpen(1, IDS)).toBe(true);
  });

  it('leaves open what a player had open before the boss existed', async () => {
    // Finished world 1 and three levels of world 2, with no boss on record
    const save = await withSave({ unlocked: 13, sound: true, levels: beaten(13) });
    expect(save.isUnlocked(10, IDS)).toBe(true);
    expect(save.isUnlocked(13, IDS)).toBe(true);
    expect(save.isUnlocked(14, IDS)).toBe(false);
    // And they keep moving on inside world 2
    save.recordWin(IDS[13], 13, 2, 8, IDS.length);
    expect(save.isUnlocked(14, IDS)).toBe(true);
  });

  it('opens worlds without a boss the old way', async () => {
    const save = await withSave({ unlocked: 19, sound: true, levels: beaten(19), bosses: [1] });
    expect(save.isUnlocked(20, IDS)).toBe(false);
    save.recordWin(IDS[19], 19, 3, 5, IDS.length);
    expect(save.isUnlocked(20, IDS)).toBe(true);
  });
});
