// World 1, Grumble: a horned block that walks the valley floor, faster after every hit, and
// hops from the second phase on.
import type { BossBrain, BossDef, BossFight } from '../game/boss';
import { TILE } from '../game/constants';
import { arena, type Boss } from './types';

export interface WalkerDef extends BossDef {
  /** How far its center walks. */
  minX: number;
  maxX: number;
  /** Walking speed in each phase (px/s), from the first to the last. */
  speeds: readonly number[];
  /** Seconds between hops in each phase (0: it does not hop). */
  hopEvery: readonly number[];
  /** Hop take-off speed and the gravity that brings it back (px/s, px/s²). */
  hopSpeed: number;
  hopGravity: number;
}

class Walker implements BossBrain {
  constructor(private readonly def: () => WalkerDef) {}

  init(f: BossFight) {
    f.boss.x = this.def().maxX;
    f.boss.dir = -1;
  }

  wake(f: BossFight, byTime: boolean) {
    // It comes back facing the ball
    if (byTime) f.boss.dir = f.world.s.x < f.boss.x ? -1 : 1;
  }

  think(f: BossFight, dt: number) {
    const def = this.def();
    const { boss } = f;
    // Hops keep going while dazed, so it never hangs in the air
    if (boss.lift > 0 || boss.vy !== 0) {
      boss.vy -= def.hopGravity * dt;
      boss.lift += boss.vy * dt;
      if (boss.lift <= 0) {
        boss.lift = 0;
        boss.vy = 0;
        f.emit({ type: 'boss-land' });
      }
    }
    if (f.dazed) return;
    boss.x += boss.dir * def.speeds[f.phase] * dt;
    if (boss.x <= def.minX || boss.x >= def.maxX) {
      boss.x = Math.max(def.minX, Math.min(def.maxX, boss.x));
      boss.dir = boss.x <= def.minX ? 1 : -1;
      f.emit({ type: 'boss-turn' });
    }
    const every = def.hopEvery[f.phase] ?? 0;
    boss.sinceHop += dt;
    if (every > 0 && boss.lift === 0 && boss.sinceHop >= every) {
      boss.sinceHop = 0;
      boss.vy = def.hopSpeed;
      boss.lift = boss.vy * dt;
      f.emit({ type: 'boss-hop' });
    }
  }
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

const DEF: WalkerDef = {
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
  brain: () => new Walker(() => DEF),
};

export const GRUMBLE: Boss<WalkerDef> = {
  world: 1,
  def: DEF,
  arena: arena(1, VALLEY),
  // A low drone with a clashing note, a heartbeat, a creeping phrygian bass and tritone stabs
  theme: {
    root: 55,
    bass: [0, 0, 1, 0, 0, 7, 1, 0, 0, 0, 1, 3, 0, 8, 7, 1],
    tempos: [92, 112, 136],
    wave: 'sawtooth',
    lead: 'square',
    stab: 6,
    drone: 1,
    beat: [0, 3],
  },
};
