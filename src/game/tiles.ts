export const T = {
  EMPTY: 0,
  SOLID: 1,
  FRAGILE: 2, // breaks after 1 bounce
  FRAGILE3: 3, // breaks after 3 bounces
  FIRE: 4, // deadly, unless you carry a water drop (which puts it out)
  SPRING: 5, // super high bounce
  RAMP_L: 6, // launches you to the left
  RAMP_R: 7, // launches you to the right
  WALL: 8, // brick wall: the hammer breaks it
  SPIKE: 9, // spikes: deadly
  ASH: 10, // extinguished fire (solid)
} as const;

export type TileCode = (typeof T)[keyof typeof T];

export const CHAR_TO_TILE: Record<string, TileCode> = {
  '#': T.SOLID,
  x: T.FRAGILE,
  X: T.FRAGILE3,
  '^': T.FIRE,
  s: T.SPRING,
  '<': T.RAMP_L,
  '>': T.RAMP_R,
  w: T.WALL,
  '*': T.SPIKE,
};

export function fragileMax(t: number): number {
  if (t === T.FRAGILE) return 1;
  if (t === T.FRAGILE3) return 3;
  return 0;
}

export function isStatic(t: number): boolean {
  return t === T.SOLID || t === T.ASH;
}
