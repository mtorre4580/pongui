export const T = {
  EMPTY: 0,
  SOLID: 1,
  FRAGILE: 2, // se rompe después de 1 rebote
  FRAGILE3: 3, // se rompe después de 3 rebotes
  FIRE: 4, // mata, salvo que tengas una gota de agua (que lo apaga)
  SPRING: 5, // rebote súper alto
  RAMP_L: 6, // te lanza hacia la izquierda
  RAMP_R: 7, // te lanza hacia la derecha
  WALL: 8, // muro de ladrillos: se rompe con el martillo
  SPIKE: 9, // pinchos: mata
  ASH: 10, // fuego apagado (sólido)
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
