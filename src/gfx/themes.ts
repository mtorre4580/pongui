// Each world has its own colors: background gradient, soft bubbles and solid blocks. Special
// tiles (fire, springs, ramps…) keep the same colors everywhere so they always read the same.

export interface Theme {
  bgTop: number;
  bgBottom: number;
  bubbles: [number, number, number];
  solidTop: number;
  solid: number;
  solidDark: number;
  /** Small marks drawn on solid blocks (pebbles, crystals…). */
  speck: number;
  /** Crystal shards instead of round pebbles. */
  crystals?: boolean;
}

export const THEMES: Record<number, Theme> = {
  // 1 · Bouncy Valley: teal blocks on navy
  1: {
    bgTop: 0x23285a,
    bgBottom: 0x0d1024,
    bubbles: [0x4cc9f0, 0xc77dff, 0xff6b6b],
    solidTop: 0x5ee6d6,
    solid: 0x2a9d8f,
    solidDark: 0x1d6f66,
    speck: 0x1d6f66,
  },
  // 2 · Crystal Caves: lavender stone with crystal shards on deep violet
  2: {
    bgTop: 0x2c1d5e,
    bgBottom: 0x0d0820,
    bubbles: [0xc77dff, 0x4cc9f0, 0xff9ad5],
    solidTop: 0xcdb8ff,
    solid: 0x6f5aa8,
    solidDark: 0x4a3c78,
    speck: 0xe7dcff,
    crystals: true,
  },
  // 3 · Cloud Peaks: grassy rock under a blue sky
  3: {
    bgTop: 0x4a78c2,
    bgBottom: 0x1a2a55,
    bubbles: [0xffffff, 0xbde0fe, 0xa2d2ff],
    solidTop: 0x9be564,
    solid: 0x6b705c,
    solidDark: 0x484b3d,
    speck: 0x3f4236,
  },
};

export const themeOf = (world: number): Theme => THEMES[world] ?? THEMES[1];
