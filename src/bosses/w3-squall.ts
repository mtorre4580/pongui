// World 3, Squall: a storm bird that flies under the clouds. It calls lightning down on
// columns that light up first and, from its second phase, blows gusts that push the ball. It is
// too high for any bounce from the ground: ride an updraft to a cloud and drop on it.
import type { BossBrain, BossDef, BossFight } from '../game/boss';
import { TILE } from '../game/constants';
import { arena, type Boss } from './types';

export interface BirdDef extends BossDef {
  /** How far its center flies, and how high its feet are over the floor. */
  minX: number;
  maxX: number;
  fly: number;
  /** Flying speed in each phase (px/s). */
  speeds: readonly number[];
  /** How many times faster it flies away after a hit. */
  flee: number;
  /** Lightning, per phase: seconds between strikes, their warning, and columns struck. */
  boltEvery: readonly number[];
  boltWarn: readonly number[];
  boltCount: readonly number[];
  /** Gusts, per phase: seconds between them (0: none), their warning, how long and how hard. */
  gustEvery: readonly number[];
  gustWarn: number;
  gustTime: number;
  gustPush: number;
}

export class Bird implements BossBrain {
  /** Seconds to the next strike and to the next gust, and seconds left of the gust blowing. */
  bolt = 0;
  gust = 0;
  blowing = 0;
  fleeing = false;

  constructor(private readonly def: BirdDef) {}

  init(f: BossFight) {
    const { def } = this;
    f.boss.x = def.maxX;
    f.boss.lift = def.fly;
    f.boss.dir = -1;
    this.bolt = def.boltEvery[0];
    this.gust = def.gustEvery[1];
  }

  private calm(f: BossFight) {
    this.blowing = 0;
    f.world.s.drift = 0;
  }

  hit(f: BossFight) {
    this.calm(f);
    // The first gust of a phase comes soon after it shakes the hit off
    this.gust = 1.2;
  }

  /** Once it shakes off a hit it flies away from the ball, fast, to its far turn. */
  wake(f: BossFight) {
    f.boss.dir = f.world.s.x < f.boss.x ? 1 : -1;
    this.fleeing = true;
  }

  think(f: BossFight, dt: number) {
    const { def } = this;
    const { boss } = f;
    if (this.blowing > 0) {
      this.blowing -= dt;
      if (this.blowing <= 0) this.calm(f);
    }
    if (f.dazed) return;
    boss.x += boss.dir * def.speeds[f.phase] * (this.fleeing ? def.flee : 1) * dt;
    if (boss.x <= def.minX || boss.x >= def.maxX) {
      this.fleeing = false;
      boss.x = Math.max(def.minX, Math.min(def.maxX, boss.x));
      boss.dir = boss.x <= def.minX ? 1 : -1;
      f.emit({ type: 'boss-turn' });
    }
    this.bolt -= dt;
    if (this.bolt <= 0) this.strike(f);
    if (def.gustEvery[f.phase] > 0) {
      this.gust -= dt;
      if (this.gust <= 0) this.blow(f);
    }
  }

  /** Lightning on the ball's column, then on the ones next to it (one side, then both). */
  private strike(f: BossFight) {
    const { def } = this;
    this.bolt = def.boltEvery[f.phase];
    const col = Math.max(1, Math.min(18, Math.floor(f.world.s.x / TILE)));
    const side = f.rand() < 0.5 ? -1 : 1;
    const cols = [col, col + side, col - side].slice(0, def.boltCount[f.phase]);
    const mid = (TILE + def.floorY) / 2;
    const h = def.floorY - TILE;
    for (const c of cols) {
      if (c < 1 || c > 18) continue;
      const x = c * TILE + TILE / 2;
      f.announce('bolt', { x, y: mid, w: 28, h }, def.boltWarn[f.phase], () =>
        f.shoot({ kind: 'bolt', x, y: mid, rx: 12, ry: h / 2, life: 0.22, wall: 'pass' }),
      );
    }
  }

  /** A gust across the whole arena, towards one wall. */
  private blow(f: BossFight) {
    const { def } = this;
    this.gust = def.gustEvery[f.phase];
    const dir = f.rand() < 0.5 ? -1 : 1;
    const area = { x: 320, y: (TILE + def.floorY) / 2, w: 18 * TILE, h: def.floorY - TILE };
    f.announce(dir < 0 ? 'gust-left' : 'gust-right', area, def.gustWarn, () => {
      this.blowing = def.gustTime;
      f.world.s.drift = dir * def.gustPush;
      f.emit({ type: 'boss-fx', name: 'gust', x: 320, y: area.y });
      // Nothing happens when this one ends: it only shows the wind while it blows
      f.announce(dir < 0 ? 'blow-left' : 'blow-right', area, def.gustTime, () => undefined);
    });
  }
}

/** An updraft by each wall, with a cloud next to its top; the bird flies under the clouds. */
const PEAK = [
  '####################',
  '#..................#',
  '#|................|#',
  '#|---..........---|#',
  '#|................|#',
  '#|................|#',
  '#|................|#',
  '#|................|#',
  '#|................|#',
  '#|................|#',
  '#|.......P........|#',
  'E###################',
];

const DEF: BirdDef = {
  width: 60,
  height: 56,
  hp: 3,
  floorY: 11 * TILE,
  stun: 0.6,
  shove: 140,
  seed: 3,
  // Its turns bring it under the inner edge of each cloud; the updrafts stay clear of it
  minX: 152,
  maxX: 488,
  // Its feet are over the top of the highest bounce from the floor
  fly: 150,
  speeds: [70, 100, 130],
  flee: 2.2,
  boltEvery: [3.2, 2.6, 2.0],
  boltWarn: [1.0, 0.85, 0.75],
  boltCount: [1, 2, 3],
  gustEvery: [0, 4, 3.2],
  gustWarn: 0.8,
  gustTime: 1.6,
  gustPush: 90,
  brain: () => new Bird(DEF),
};

export const SQUALL: Boss<BirdDef> = {
  world: 3,
  def: DEF,
  arena: arena(3, PEAK),
  // Open and windy: fifths in a triangle bass, a sine lead, a beat that skips
  theme: {
    root: 73.4,
    bass: [0, 7, 12, 7, 0, 7, 14, 7, 0, 5, 12, 5, 0, 7, 10, 7],
    tempos: [100, 118, 138],
    wave: 'triangle',
    lead: 'sine',
    stab: 14,
    drone: 7,
    beat: [0, 10],
  },
};
