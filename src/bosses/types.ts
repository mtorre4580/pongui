// What a boss is made of: its numbers and brain, its arena and its music.
import type { BossDef } from '../game/boss';
import { COLS } from '../game/constants';
import { parseLevel, type ParsedLevel } from '../game/level';
import { T } from '../game/tiles';
import type { BossTheme } from '../audio/music';

export interface Boss<D extends BossDef = BossDef> {
  world: number;
  def: D;
  arena: ParsedLevel;
  theme: BossTheme;
}

const empty = { en: '', es: '', 'pt-BR': '' };

/**
 * A level map as a boss arena. Every map needs an exit, but a boss fight ends when the boss
 * does: the exit's cell is turned into rock, so it can never be reached or seen.
 */
export function arena(world: number, map: string[], dark = false): ParsedLevel {
  const level = parseLevel({ id: `w${world}-boss`, name: empty, hint: empty, par: 60, map, dark });
  level.tiles[level.exit.row * COLS + level.exit.col] = T.SOLID;
  return level;
}
