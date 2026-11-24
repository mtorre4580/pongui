// The bosses: one special fight at the end of a world. Each has its arena (a level map, with
// the exit sealed away: beating the boss is what ends it) and its numbers.
import { COLS, TILE } from '../game/constants';
import type { BossDef } from '../game/boss';
import { parseLevel, type LevelData, type ParsedLevel } from '../game/level';
import { T } from '../game/tiles';

export interface Boss {
  world: number;
  def: BossDef;
  arena: ParsedLevel;
  /** Root note of its music (Hz). */
  note: number;
}

const empty = { en: '', es: '', 'pt-BR': '' };

/**
 * A level map as a boss arena. Every map needs an exit, but a boss fight ends when the boss
 * does: the exit's cell is turned into rock, so it can never be reached or seen.
 */
function arena(data: LevelData): ParsedLevel {
  const level = parseLevel(data);
  level.tiles[level.exit.row * COLS + level.exit.col] = T.SOLID;
  return level;
}

/** A ledge on each side to drop from; the boss walks the floor between them. */
const VALLEY = [
  '####################',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#P.................#',
  '###..............###',
  '#..................#',
  '#..................#',
  'E###################',
];

const W1: BossDef = {
  width: 56,
  // Taller than a low bounce climbs: only a high bounce or a drop from a ledge gets over it
  height: 60,
  hp: 3,
  minX: 3 * TILE + 28,
  maxX: 17 * TILE - 28,
  floorY: 11 * TILE,
  // Each hit makes it clearly faster: in the last phase it outruns the ball (160 px/s), so the
  // floor is no place to wait
  speeds: [95, 140, 185],
  // It starts hopping after the first hit, and more often after the second. A hop reaches
  // above the ledges, so their edges are not safe either
  hopEvery: [0, 2.4, 1.5],
  hopSpeed: 330,
  hopGravity: 1000,
  stun: 0.5,
};

export const BOSSES: Readonly<Record<number, Boss>> = {
  1: {
    world: 1,
    def: W1,
    arena: arena({ id: 'w1-boss', name: empty, hint: empty, par: 60, map: VALLEY }),
    note: 55,
  },
};
