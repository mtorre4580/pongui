// World 6, Flurry: a snow giant. From one end of the arena it throws snowballs that leave ice
// where they land, then charges to the other end: only the ledges of thin ice are out of its
// way. If it runs over its own ice it slips, slams into the wall and sits there, open to a
// hit. A ball that stays on a ledge gets it stomped out from under it.
import type { BossBrain, BossDef, BossFight, Shot } from '../game/boss';
import { COLS, TILE } from '../game/constants';
import { T } from '../game/tiles';
import { arena, type Boss } from './types';

export interface GiantDef extends BossDef {
  /** The two ends it stands at. */
  minX: number;
  maxX: number;
  /** Snowballs, per phase: how many before a charge, seconds between them; their warning. */
  throws: readonly number[];
  throwEvery: readonly number[];
  snowWarn: number;
  /** Seconds an ice patch lasts if it is not run over. */
  melt: number;
  /** The charge, per phase: its warning and its speed; and the speed of a slide (px/s). */
  chargeWarn: readonly number[];
  chargeSpeed: readonly number[];
  slideSpeed: number;
  /** Seconds, per phase, it sits against the wall after a slip. */
  sit: readonly number[];
  /** Seconds the ball can stay on a ledge before it is stomped, its warning, and the regrowth. */
  camp: number;
  stompWarn: number;
  regrow: number;
}

export type GiantMode = 'throw' | 'windup' | 'charge' | 'slide' | 'sit' | 'stomp';

/** The two ledges of thin ice: their cells. */
export const LEDGES = [[4, 5, 6].map((c) => 8 * COLS + c), [13, 14, 15].map((c) => 8 * COLS + c)];
const FLOOR = 11;

export class Giant implements BossBrain {
  mode: GiantMode = 'throw';
  /** Seconds left in the current mode (or to the next snowball). */
  t = 0;
  /** Snowballs left before the charge. */
  left = 0;
  /** Seconds the ball has been on a ledge while snowballs fly. */
  camped = 0;
  /** Seconds each missing ledge cell has been gone, and the age of each ice patch. */
  private readonly gone = new Map<number, number>();
  private readonly ice = new Map<number, number>();

  constructor(private readonly def: GiantDef) {}

  init(f: BossFight) {
    f.boss.x = this.def.maxX;
    f.boss.dir = -1;
    f.boss.armor = true;
    this.aim(f, 1.5);
  }

  /** Back on its feet, snowballs first. */
  private aim(f: BossFight, wait = 1) {
    const { def } = this;
    this.mode = 'throw';
    this.left = def.throws[f.phase];
    this.t = wait;
    this.camped = 0;
    f.boss.armor = true;
    f.boss.pose = '';
    // It faces the far end
    f.boss.dir = f.boss.x > 320 ? -1 : 1;
  }

  hit(f: BossFight) {
    this.aim(f);
  }

  /** The ledge the ball stands on (0 or 1), or -1. */
  private ledgeUnder(f: BossFight): number {
    const s = f.world.s;
    if (s.y > 8 * TILE) return -1;
    return LEDGES.findIndex(
      (cells) => s.x > (cells[0] % COLS) * TILE - 6 && s.x < ((cells[2] % COLS) + 1) * TILE + 6,
    );
  }

  think(f: BossFight, dt: number) {
    const { def } = this;
    const { boss } = f;
    const tiles = f.world.s.tiles;
    // Ledge cells grow back and ice melts, whatever it is doing
    for (const idx of LEDGES.flat()) {
      if (tiles[idx] !== T.EMPTY) continue;
      const age = (this.gone.get(idx) ?? 0) + dt;
      this.gone.set(idx, age);
      if (age >= def.regrow && f.setTile(idx, T.THIN_ICE)) this.gone.delete(idx);
    }
    for (const [idx, age] of this.ice) {
      this.ice.set(idx, age + dt);
      if (age + dt < def.melt) continue;
      this.ice.delete(idx);
      f.setTile(idx, T.SOLID);
    }
    if (this.mode === 'charge' || this.mode === 'slide') return this.run(f, dt);
    if (f.dazed) return;
    this.t -= dt;
    if (this.mode === 'throw') {
      // A ball that settles on a ledge has it stomped away
      const ledge = this.ledgeUnder(f);
      this.camped = ledge >= 0 ? this.camped + dt : 0;
      if (this.camped >= def.camp) return this.stomp(f, ledge);
      if (this.t > 0) return;
      if (this.left > 0) {
        this.left--;
        this.t = def.throwEvery[f.phase];
        this.snowball(f);
        return;
      }
      // The charge: the whole floor, from where it stands to the far wall
      this.mode = 'windup';
      this.t = Infinity;
      const far = boss.dir < 0 ? TILE : 19 * TILE;
      const near = boss.x + (boss.dir * def.width) / 2;
      const area = { x: (near + far) / 2, y: def.floorY - 12, w: Math.abs(far - near), h: 24 };
      f.announce('charge', area, def.chargeWarn[f.phase], () => {
        this.mode = 'charge';
        boss.pose = 'run';
        f.emit({ type: 'boss-fx', name: 'charge', x: boss.x, y: def.floorY });
      });
    } else if (this.mode === 'sit' && this.t <= 0) this.aim(f);
  }

  /** Running, or sliding out of control once it has stepped on ice. */
  private run(f: BossFight, dt: number) {
    const { def } = this;
    const { boss } = f;
    const sliding = this.mode === 'slide';
    boss.x += boss.dir * (sliding ? def.slideSpeed : def.chargeSpeed[f.phase]) * dt;
    const idx = FLOOR * COLS + Math.floor(boss.x / TILE);
    if (f.world.s.tiles[idx] === T.ICE) {
      // Its ice is ground away under it
      this.ice.delete(idx);
      f.setTile(idx, T.SOLID);
      if (!sliding) {
        this.mode = 'slide';
        boss.pose = 'slip';
        f.emit({ type: 'boss-fx', name: 'slip', x: boss.x, y: def.floorY });
      }
    }
    if (boss.x > def.minX && boss.x < def.maxX) return;
    boss.x = Math.max(def.minX, Math.min(def.maxX, boss.x));
    if (!sliding) return this.aim(f);
    // Into the wall: it sits there, its head open
    this.mode = 'sit';
    this.t = def.sit[f.phase];
    boss.armor = false;
    boss.pose = 'sit';
    f.emit({ type: 'boss-land' });
  }

  /** A snowball in a high arc onto where the ball is. */
  private snowball(f: BossFight) {
    const { def } = this;
    const s = f.world.s;
    const tx = Math.max(100, Math.min(540, s.x));
    const ledge = this.ledgeUnder(f);
    const ty = ledge >= 0 ? 8 * TILE : def.floorY;
    f.announce('snow', { x: tx, y: ty - 3, w: 44, h: 10 }, def.snowWarn, () => {
      const t = 1;
      const g = 1400;
      const x0 = f.boss.x + f.boss.dir * 18;
      const y0 = f.box[1] - 10;
      f.shoot({
        kind: 'snow',
        x: x0,
        y: y0,
        vx: (tx - x0) / t,
        // It ends a little inside the ground, so the tile it lands on is known
        vy: (ty + 6 - y0 - 0.5 * g * t * t) / t,
        g,
        rx: 9,
        ry: 9,
      });
    });
  }

  /** A snowball on the floor leaves a patch of ice. */
  shotEnd(f: BossFight, shot: Shot, why: 'wall' | 'stomp' | 'time') {
    if (why !== 'wall' || shot.y < FLOOR * TILE) return;
    const idx = FLOOR * COLS + Math.floor(shot.x / TILE);
    if (f.world.s.tiles[idx] !== T.SOLID) return;
    f.setTile(idx, T.ICE);
    this.ice.set(idx, 0);
  }

  /** A stomp that shatters the ledge the ball is on. Then the snowballs go on. */
  private stomp(f: BossFight, ledge: number) {
    const { def } = this;
    this.mode = 'stomp';
    this.t = Infinity;
    this.camped = 0;
    const cells = LEDGES[ledge];
    const x = ((cells[0] % COLS) + 1.5) * TILE;
    f.announce('stomp', { x, y: 8 * TILE + 16, w: 3 * TILE, h: TILE }, def.stompWarn, () => {
      for (const idx of cells) f.setTile(idx, T.EMPTY);
      f.emit({ type: 'boss-fx', name: 'stomp', x, y: 8 * TILE });
      f.emit({ type: 'boss-land' });
      this.mode = 'throw';
      this.t = def.throwEvery[f.phase];
    });
  }
}

/** A floor of packed snow and two ledges of thin ice, clear of the giant's head. */
const SLOPE = [
  '####################',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#...jjj......jjj...#',
  '#..................#',
  '#........P.........#',
  'E###################',
];

const DEF: GiantDef = {
  width: 56,
  // It passes under the ledges, and a high bounce from the floor gets over it
  height: 62,
  hp: 4,
  floorY: 11 * TILE,
  stun: 0.6,
  seed: 6,
  minX: 60,
  maxX: 580,
  throws: [2, 2, 3, 3],
  throwEvery: [1.7, 1.5, 1.4, 1.3],
  snowWarn: 0.8,
  melt: 14,
  chargeWarn: [1.3, 1.2, 1.1, 1.0],
  chargeSpeed: [250, 280, 310, 340],
  slideSpeed: 400,
  sit: [4.0, 3.6, 3.2, 2.9],
  camp: 2.5,
  stompWarn: 0.8,
  regrow: 6,
  brain: () => new Giant(DEF),
};

export const FLURRY: Boss<GiantDef> = {
  world: 6,
  def: DEF,
  arena: arena(6, SLOPE),
  // Heavy steps in the cold: a slow sawtooth bass in fourths, a thin sine lead, a stomping beat
  theme: {
    root: 46.2,
    bass: [0, 0, 5, 5, 0, 0, 10, 5, 0, 0, 5, 5, 3, 3, 2, 2],
    tempos: [88, 98, 110, 124],
    wave: 'sawtooth',
    lead: 'sine',
    stab: 5,
    drone: 5,
    beat: [0, 2, 8],
  },
};
