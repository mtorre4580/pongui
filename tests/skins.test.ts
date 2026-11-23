import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/levels';
import type { SaveData } from '../src/save';
import { currentSkin, DEFAULT_SKIN, isSkinOpen, shade, SKINS, totalStars } from '../src/skins';

const save = (stars: number[], skin?: string): SaveData => ({
  unlocked: 0,
  sound: true,
  skin,
  levels: Object.fromEntries(stars.map((s, i) => [`level-${i}`, { stars: s, bestTime: 1 }])),
});

describe('balls to choose from', () => {
  it('start with a free one and get more expensive, up to every star in the game', () => {
    expect(SKINS[0].stars).toBe(0);
    const prices = SKINS.map((s) => s.stars);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
    expect(new Set(prices).size).toBe(prices.length);
    expect(prices[prices.length - 1]).toBe(LEVELS.length * 3);
    expect(new Set(SKINS.map((s) => s.id)).size).toBe(SKINS.length);
  });

  it('counts the stars of every level', () => {
    expect(totalStars(save([]))).toBe(0);
    expect(totalStars(save([3, 2, 1]))).toBe(6);
  });

  it('opens a ball once the player has its stars', () => {
    const sky = SKINS[1];
    expect(isSkinOpen(sky, sky.stars - 1)).toBe(false);
    expect(isSkinOpen(sky, sky.stars)).toBe(true);
  });

  it('uses the chosen ball only while it is open', () => {
    const sky = SKINS[1];
    expect(currentSkin(save([]))).toBe(DEFAULT_SKIN);
    expect(currentSkin(save([3, 3, 3], sky.id))).toBe(sky);
    // Chosen but not affordable (an edited or older save): back to the default one
    expect(currentSkin(save([3], sky.id))).toBe(DEFAULT_SKIN);
    expect(currentSkin(save([3, 3, 3], 'no-such-ball'))).toBe(DEFAULT_SKIN);
  });

  it('lightens and darkens a color', () => {
    expect(shade(0x808080, 0)).toBe(0x808080);
    expect(shade(0x000000, 1)).toBe(0xffffff);
    expect(shade(0xffffff, -1)).toBe(0x000000);
    expect(shade(0x804020, -0.5)).toBe(0x402010);
  });
});
