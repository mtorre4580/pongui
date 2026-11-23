// World 2, Serpstone: a rock serpent that comes up through the moss, where a burrow shakes
// first, and brings stalactites down on the ball. Moss only gives low bounces: its head is
// reached from the two stones.
import type { BossBrain, BossDef, BossFight } from '../game/boss';
import { TILE } from '../game/constants';
import { arena, type Boss } from './types';

export interface SerpentDef extends BossDef {
  /** Where it can come up (x of its center). The first one is where it starts. */
  spots: readonly number[];
  /** Seconds, per phase: the burrow's warning, its time up, and its time under the ground. */
  warn: readonly number[];
  up: readonly number[];
  rest: readonly number[];
  /** Seconds it takes to come up or go down. */
  rise: number;
  /** Stalactites, per phase: seconds between falls, their warning, and how many at once. */
  stalEvery: readonly number[];
  stalWarn: readonly number[];
  stalCount: readonly number[];
}

export type SerpentMode = 'under' | 'burrow' | 'rising' | 'up' | 'sinking';

export class Serpent implements BossBrain {
  mode: SerpentMode = 'under';
  /** Seconds left in the current mode. */
  t = 0;
  spot = 0;
  /** Seconds to the next stalactites. */
  stal = 0;
  private first = true;

  constructor(private readonly def: SerpentDef) {}

  init(f: BossFight) {
    this.hide(f);
    this.t = 1;
    this.stal = this.def.stalEvery[0];
  }

  private hide(f: BossFight) {
    this.mode = 'under';
    this.t = this.def.rest[f.phase];
    f.boss.away = true;
    f.boss.spiked = false;
    f.boss.lift = -this.def.height;
  }

  /** Back under the ground once its daze is over, wherever that left it. */
  wake(f: BossFight) {
    if (this.mode === 'under' || this.mode === 'burrow') return;
    this.mode = 'sinking';
    this.t = this.def.rise;
    f.boss.spiked = true;
  }

  think(f: BossFight, dt: number) {
    const { def } = this;
    const { boss } = f;
    if (f.dazed) return;
    this.stal -= dt;
    if (this.stal <= 0) this.stalactites(f);
    this.t -= dt;
    if (this.mode === 'rising' || this.mode === 'sinking') {
      const k = Math.max(0, this.t) / def.rise;
      boss.lift = -def.height * (this.mode === 'rising' ? k : 1 - k);
    }
    if (this.t > 0) return;
    if (this.mode === 'under') {
      // Never twice in a row from the same burrow; the first one is always the same
      let next = this.first ? 0 : Math.floor(f.rand() * (def.spots.length - 1));
      if (!this.first && next >= this.spot) next++;
      this.first = false;
      this.spot = next;
      this.mode = 'burrow';
      this.t = Infinity;
      boss.x = def.spots[next];
      f.announce(
        'burrow',
        { x: boss.x, y: def.floorY - 4, w: def.width + 12, h: 10 },
        def.warn[f.phase],
        () => {
          this.mode = 'rising';
          this.t = def.rise;
          boss.away = false;
          // Bursting out or diving back, it is no place to land
          boss.spiked = true;
          boss.dir = f.world.s.x < boss.x ? -1 : 1;
          f.emit({ type: 'boss-fx', name: 'serpent-rise', x: boss.x, y: def.floorY });
        },
      );
    } else if (this.mode === 'rising') {
      this.mode = 'up';
      this.t = def.up[f.phase];
      boss.lift = 0;
      boss.spiked = false;
    } else if (this.mode === 'up') {
      this.mode = 'sinking';
      this.t = def.rise;
      boss.spiked = true;
    } else if (this.mode === 'sinking') this.hide(f);
  }

  /** A hit drops the burrow it might have announced: start over from under the ground. */
  hit(f: BossFight) {
    if (this.mode === 'burrow') this.hide(f);
  }

  /** Stalactites over the ball's column (and the next ones over, in the last phase). */
  private stalactites(f: BossFight) {
    const { def } = this;
    this.stal = def.stalEvery[f.phase];
    const s = f.world.s;
    const col = Math.floor(s.x / TILE);
    // The second one falls on the side the ball is moving to
    const side = s.vx < 0 ? -1 : s.vx > 0 ? 1 : f.rand() < 0.5 ? -1 : 1;
    for (let i = 0; i < def.stalCount[f.phase]; i++) {
      const c = Math.max(1, Math.min(18, col + i * side));
      const x = c * TILE + TILE / 2;
      f.announce(
        'stalactite',
        { x, y: (TILE + def.floorY) / 2, w: 24, h: def.floorY - TILE },
        def.stalWarn[f.phase],
        () =>
          f.shoot({ kind: 'stalactite', x, y: TILE + 14, rx: 7, ry: 14, g: 1000, wall: 'stop' }),
      );
    }
  }
}

/** Moss everywhere, and two stones to bounce high from. */
const CAVE = [
  '####################',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#.....P............#',
  '#.....##....##.....#',
  'E#mmmm##mmmm##mmmmm#',
];

const DEF: SerpentDef = {
  width: 48,
  // Taller than a low bounce: the moss never gets the ball over it
  height: 64,
  hp: 3,
  floorY: 11 * TILE,
  stun: 0.6,
  shove: 140,
  seed: 2,
  // Between the stones first, then by either wall
  spots: [320, 112, 528],
  warn: [1.2, 1.0, 0.8],
  up: [3.2, 2.6, 2.2],
  rest: [1.2, 1.0, 0.8],
  rise: 0.3,
  stalEvery: [4.5, 3.4, 2.6],
  stalWarn: [1.0, 0.9, 0.8],
  stalCount: [1, 1, 2],
  brain: () => new Serpent(DEF),
};

export const SERPSTONE: Boss<SerpentDef> = {
  world: 2,
  def: DEF,
  arena: arena(2, CAVE),
  // Hollow and slow: a square bass over a tritone drone, with a limping beat
  theme: {
    root: 49,
    bass: [0, 3, 0, 6, 0, 3, 7, 6, 0, 3, 0, 10, 8, 6, 3, 1],
    tempos: [84, 100, 120],
    wave: 'square',
    lead: 'triangle',
    stab: 10,
    drone: 6,
    beat: [0, 6, 10],
  },
};
