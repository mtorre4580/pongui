import { afterEach, describe, expect, it, vi } from 'vitest';
import { BOSS_WORLDS, WORLD_COUNT } from '../src/levels/worlds';

const IDS = Array.from(
  { length: 100 },
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
    // A gate only where a world with a boss ends, and nowhere else
    for (let world = 1; world < WORLD_COUNT; world++)
      expect(save.bossGate(world * 10)).toBe(BOSS_WORLDS.includes(world) ? world : null);
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
    const world = Array.from({ length: WORLD_COUNT - 1 }, (_, i) => i + 1).find(
      (n) => !BOSS_WORLDS.includes(n),
    );
    // Every world before the last one has a boss by now: nothing opens the old way
    if (world === undefined) return;
    const last = world * 10 - 1;
    const save = await withSave({
      unlocked: last,
      sound: true,
      levels: beaten(last),
      bosses: [...BOSS_WORLDS],
    });
    expect(save.isUnlocked(last + 1, IDS)).toBe(false);
    save.recordWin(IDS[last], last, 3, 5, IDS.length);
    expect(save.isUnlocked(last + 1, IDS)).toBe(true);
  });

  it('records the last boss without opening anything past the last level', async () => {
    const last = Math.max(...BOSS_WORLDS);
    if (last < WORLD_COUNT) return;
    const save = await withSave({
      unlocked: IDS.length - 1,
      sound: true,
      levels: beaten(IDS.length),
      bosses: BOSS_WORLDS.filter((n) => n < last),
    });
    expect(save.bossOpen(last, IDS)).toBe(true);
    save.recordBossWin(last, IDS.length);
    expect(save.bossBeaten(last)).toBe(true);
    expect(save.loadSave().unlocked).toBe(IDS.length - 1);
    // Every world has one by now
    expect([...BOSS_WORLDS]).toEqual(Array.from({ length: WORLD_COUNT }, (_, i) => i + 1));
  });

  // The same rules for every boss after the first
  for (const world of BOSS_WORLDS.filter((n) => n > 1 && n < WORLD_COUNT)) {
    const first = world * 10; // the first level of the world behind this boss
    const earlier = BOSS_WORLDS.filter((n) => n < world);

    it(`keeps world ${world + 1} closed until the boss of world ${world} is beaten`, async () => {
      const save = await withSave({
        unlocked: first - 1,
        sound: true,
        levels: beaten(first - 1),
        bosses: earlier,
      });
      expect(save.bossOpen(world, IDS)).toBe(false);
      save.recordWin(IDS[first - 1], first - 1, 2, 9, IDS.length);
      expect(save.bossOpen(world, IDS)).toBe(true);
      expect(save.isUnlocked(first, IDS)).toBe(false);
      save.recordBossWin(world, IDS.length);
      expect(save.bossBeaten(world)).toBe(true);
      expect(save.isUnlocked(first, IDS)).toBe(true);
      expect(save.isUnlocked(first + 1, IDS)).toBe(false);
    });

    it(`leaves world ${world + 1} open to who had it before boss ${world} existed`, async () => {
      // Three levels into the next world, with no boss on record
      const save = await withSave({ unlocked: first + 3, sound: true, levels: beaten(first + 3) });
      expect(save.bossBeaten(world)).toBe(false);
      expect(save.isUnlocked(first, IDS)).toBe(true);
      expect(save.isUnlocked(first + 3, IDS)).toBe(true);
      expect(save.isUnlocked(first + 4, IDS)).toBe(false);
      save.recordWin(IDS[first + 3], first + 3, 1, 12, IDS.length);
      expect(save.isUnlocked(first + 4, IDS)).toBe(true);
      // The boss is still there to be fought
      expect(save.bossOpen(world, IDS)).toBe(true);
    });
  }
});
