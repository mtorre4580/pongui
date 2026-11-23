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
  LOCK: 11, // lock block: a key opens the whole connected group
  MOSS: 12, // soft moss: always a low bounce, even with jump held
  CLOUD: 13, // one-way platform: solid only when landing on it from above
  UPDRAFT: 14, // rising air: pushes the ball up while its center is inside
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
  L: T.LOCK,
  m: T.MOSS,
  '-': T.CLOUD,
  '|': T.UPDRAFT,
};

export function fragileMax(t: number): number {
  if (t === T.FRAGILE) return 1;
  if (t === T.FRAGILE3) return 3;
  return 0;
}

export function isStatic(t: number): boolean {
  return t === T.SOLID || t === T.ASH;
}
