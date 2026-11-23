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
  /** What the marks look like: round pebbles by default. */
  pattern?: 'crystals' | 'rivets' | 'coral' | 'snow';
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
    pattern: 'crystals',
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
  // 4 · Gear Works: riveted bronze plates in a dim, warm factory
  4: {
    bgTop: 0x3d2c25,
    bgBottom: 0x120c0a,
    bubbles: [0xe9a23b, 0xd4a373, 0xff6b35],
    solidTop: 0xf0c27b,
    solid: 0xa8693a,
    solidDark: 0x6b3f22,
    speck: 0x4a2a16,
    pattern: 'rivets',
  },
  // 5 · Coral Lagoon: coral reefs in deep blue water
  5: {
    bgTop: 0x135e8a,
    bgBottom: 0x05182b,
    bubbles: [0x80ffdb, 0x48cae4, 0xffffff],
    solidTop: 0xffb4a2,
    solid: 0xe07a5f,
    solidDark: 0x9c4a3a,
    speck: 0xffe5d9,
    pattern: 'coral',
  },
  // 6 · Frost Peaks: snow-capped blue rock under a cold night sky
  6: {
    bgTop: 0x2f4f86,
    bgBottom: 0x0a1430,
    bubbles: [0xffffff, 0xcaf0f8, 0x90e0ef],
    solidTop: 0xf4fbff,
    solid: 0x5f7fa3,
    solidDark: 0x3d5675,
    speck: 0xdcecff,
    pattern: 'snow',
  },
};

export const themeOf = (world: number): Theme => THEMES[world] ?? THEMES[1];
