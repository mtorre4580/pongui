// World 7, Cinder: a lava dragon that flies low over the arena. On the rhythm of the vents it
// spits fire that rains down on the ball, and whatever rock it lands on is left cracked: it crumbles the
// next time it is touched and never comes back. The ball can pass under it with low bounces;
// its head is reached with a high bounce from a ledge. The floor runs out: the fight has an end.
import type { BossBrain, BossDef, BossFight, Shot } from '../game/boss';
import { COLS, ROWS, TILE, VENT_CYCLE } from '../game/constants';
import { T } from '../game/tiles';
import { arena, type Boss } from './types';

export interface DragonDef extends BossDef {
  /** How far its center flies, and how high its feet are over the floor. */
  minX: number;
  maxX: number;
  fly: number;
  /** Flying speed in each phase (px/s), and how many times faster it leaves after a hit. */
  speeds: readonly number[];
  flee: number;
  /** Fireballs, per phase: every how many turns of the vents it spits, and how many at once. */
  fireEvery: readonly number[];
  fireCount: readonly number[];
  fireWarn: number;
}

export class Dragon implements BossBrain {
  fleeing = false;
  /** Turns of the vents since its last volley. */
  turns = 0;

  constructor(private readonly def: DragonDef) {}

  init(f: BossFight) {
    const { def } = this;
    f.boss.x = def.maxX;
    f.boss.lift = def.fly;
    f.boss.dir = -1;
  }

  /** Once it shakes a hit off it flies away from the ball, fast, to its far turn. */
  wake(f: BossFight) {
    f.boss.dir = f.world.s.x < f.boss.x ? 1 : -1;
    this.fleeing = true;
  }

  think(f: BossFight, dt: number) {
    const { def } = this;
    const { boss } = f;
    if (f.dazed) return;
    boss.x += boss.dir * def.speeds[f.phase] * (this.fleeing ? def.flee : 1) * dt;
    if (boss.x <= def.minX || boss.x >= def.maxX) {
      boss.x = Math.max(def.minX, Math.min(def.maxX, boss.x));
      boss.dir = boss.x <= def.minX ? 1 : -1;
      this.fleeing = false;
      f.emit({ type: 'boss-turn' });
    }
    // It spits as the vents go dark: its fire lands about when they light up again
    if (f.world.s.ticks % VENT_CYCLE !== 0) return;
    if (++this.turns < def.fireEvery[f.phase]) return;
    this.turns = 0;
    this.spit(f);
  }

  /** The top of the first rock under (x, y), or null over a hole. */
  private ground(f: BossFight, x: number, y: number): number | null {
    const col = Math.floor(x / TILE);
    for (let row = Math.max(1, Math.floor(y / TILE)); row < ROWS; row++) {
      const idx = row * COLS + col;
      if (!f.world.isOpen(f.world.s.tiles[idx], idx)) return row * TILE;
    }
    return null;
  }

  /** Fire raining down on the ball's tile, and on the ones next to it. */
  private spit(f: BossFight) {
    const { def } = this;
    const s = f.world.s;
    const col = Math.max(1, Math.min(18, Math.floor(s.x / TILE)));
    const side = f.rand() < 0.5 ? -1 : 1;
    const cols = [col, col + side, col - side].slice(0, def.fireCount[f.phase]);
    for (const c of cols) {
      if (c < 1 || c > 18) continue;
      const tx = c * TILE + TILE / 2;
      const ty = this.ground(f, tx, s.y);
      if (ty === null) continue;
      // Spat up out of sight, it comes straight down on the mark and ends a little inside the
      // rock, so the tile it lands on is known
      f.announce('fire', { x: tx, y: ty - 3, w: 40, h: 10 }, def.fireWarn, () =>
        f.shoot({ kind: 'fire', x: tx, y: TILE + 12, vy: 220, g: 1100, rx: 9, ry: 11 }),
      );
    }
    f.emit({ type: 'boss-fx', name: 'spit', x: f.boss.x, y: f.box[3] });
  }

  /** Rock hit by a fireball is left cracked: a crumbling block. */
  shotEnd(f: BossFight, shot: Shot, why: 'wall' | 'stomp' | 'time') {
    if (why !== 'wall') return;
    const col = Math.floor(shot.x / TILE);
    const row = Math.floor(shot.y / TILE);
    if (row < 2 || row >= ROWS || col < 1 || col > 18) return;
    const idx = row * COLS + col;
    if (f.world.s.tiles[idx] !== T.SOLID) return;
    if (f.setTile(idx, T.CRUMBLE)) f.emit({ type: 'boss-fx', name: 'crack', x: shot.x, y: shot.y });
  }
}

/** A floor over the lava with three vents in it, and a ledge near each wall. */
const CORE = [
  '####################',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#.##............##.#',
  '#..................#',
  '#......P...........#',
  'E#####!###!###!#####',
];

const DEF: DragonDef = {
  width: 80,
  height: 70,
  hp: 4,
  floorY: 11 * TILE,
  stun: 0.6,
  shove: 140,
  seed: 7,
  // Its turns stop short of the ledges: a ball standing on one is clear of it
  minX: 190,
  maxX: 450,
  // High enough for a low bounce to pass under it, too high for a bounce from the floor to
  // get over it: its head is 150 px up, and a ledge is 96
  fly: 80,
  speeds: [55, 65, 75, 85],
  flee: 3,
  fireEvery: [2, 2, 2, 2],
  fireCount: [1, 1, 2, 2],
  fireWarn: 0.9,
  brain: () => new Dragon(DEF),
};

export const CINDER: Boss<DragonDef> = {
  world: 7,
  def: DEF,
  arena: arena(7, CORE),
  // Low and angry: a sawtooth bass climbing by semitones, square stabs, a driving beat
  theme: {
    root: 51.9,
    bass: [0, 0, 1, 1, 3, 3, 4, 4, 0, 0, 1, 1, 6, 4, 3, 1],
    tempos: [104, 116, 130, 146],
    wave: 'sawtooth',
    lead: 'square',
    stab: 13,
    drone: 6,
    beat: [0, 3, 6],
  },
};
