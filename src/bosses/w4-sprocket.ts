// World 4, Sprocket: a robot behind a shield. It fires bolts along the floor and lobs gears at
// the ball. The switch on the step turns its shield off for a few seconds (it stands still,
// short-circuited) and closes the bridge over the lane: the way to its head. Then the shield
// comes back, the bridge opens and the switch is locked away for a while: the robot's turn.
import type { BossBrain, BossDef, BossFight } from '../game/boss';
import { COLS, ROWS, TILE } from '../game/constants';
import { T } from '../game/tiles';
import { arena, type Boss } from './types';

export interface RobotDef extends BossDef {
  /** How far its center walks, and how fast in each phase (px/s). */
  minX: number;
  maxX: number;
  speeds: readonly number[];
  /** Seconds its shield stays off after the switch, per phase, and after it shakes off a hit. */
  open: readonly number[];
  reopen: number;
  /** Seconds, per phase, the switch is locked away after the shield comes back. */
  lock: readonly number[];
  /** Bolts along the floor, per phase: seconds between volleys, bolts per volley; their warning. */
  boltEvery: readonly number[];
  boltCount: readonly number[];
  boltWarn: number;
  boltSpeed: number;
  /** Gears lobbed at the ball, per phase: seconds between throws, gears per throw; warning. */
  gearEvery: readonly number[];
  gearCount: readonly number[];
  gearWarn: number;
}

/** The switch's cell: on the step, between two blocks. */
export const SWITCH = 10 * COLS + 5;
/** Seconds the shield flickers before it comes back. */
const SHIELD_WARN = 0.7;

export class Robot implements BossBrain {
  /** Seconds left until the switch goes back off and the bridge opens (0: it is off). */
  open = 0;
  bolt = 0;
  gear = 0;
  private closing = false;
  /** Seconds left with the switch locked away (a plain block in its place). */
  lock = 0;

  constructor(private readonly def: RobotDef) {}

  init(f: BossFight) {
    const { def } = this;
    f.boss.x = def.maxX;
    f.boss.dir = -1;
    f.boss.armor = true;
    this.bolt = def.boltEvery[0] * 0.5;
    this.gear = def.gearEvery[0] * 0.6;
    this.seal(f);
  }

  /** The switch goes away for a while: time for the robot to attack before the next try. */
  private seal(f: BossFight) {
    this.lock = this.def.lock[f.phase];
    f.setTile(SWITCH, T.SOLID);
  }

  /**
   * Shaking off a hit, its shield is back at once. The bridge stays a moment more: time to
   * get off it.
   */
  wake(f: BossFight) {
    if (this.open <= 0) return;
    this.open = this.def.reopen;
    this.closing = false;
    this.raise(f);
  }

  think(f: BossFight, dt: number) {
    const { def } = this;
    const { boss } = f;
    const on = f.world.s.switchOn;
    // The switch decides: on, the shield is off (and the bridge closed)
    if (on && this.open <= 0) {
      this.open = def.open[f.phase];
      this.closing = false;
      boss.armor = false;
      boss.pose = 'open';
      // Without its shield it short-circuits: it stops, and what it had fired fizzles out
      f.clear();
      f.emit({ type: 'boss-fx', name: 'shield-off', x: boss.x, y: f.box[1] });
    } else if (!on && this.open > 0) {
      this.open = 0;
      this.closing = false;
      this.raise(f);
    }
    if (f.dazed) return;
    if (this.open > 0) {
      this.open -= dt;
      if (this.open <= SHIELD_WARN && !this.closing) {
        this.closing = true;
        const [left, top, right, bottom] = f.box;
        const area = {
          x: boss.x,
          y: (top + bottom) / 2,
          w: right - left + 16,
          h: bottom - top + 16,
        };
        f.announce('shield', area, Math.max(this.open, 0), () => {
          this.open = 0;
          this.closing = false;
          if (f.world.s.switchOn) f.flipSwitch();
          this.raise(f);
        });
      }
    }
    if (!boss.armor) return;
    if (this.lock > 0) {
      this.lock -= dt;
      if (this.lock <= 0 && f.setTile(SWITCH, T.SWITCH))
        f.emit({ type: 'boss-fx', name: 'switch-back', x: 5 * TILE + 16, y: 10 * TILE });
    }
    boss.x += boss.dir * def.speeds[f.phase] * dt;
    if (boss.x <= def.minX || boss.x >= def.maxX) {
      boss.x = Math.max(def.minX, Math.min(def.maxX, boss.x));
      boss.dir = boss.x <= def.minX ? 1 : -1;
      f.emit({ type: 'boss-turn' });
    }
    this.bolt -= dt;
    if (this.bolt <= 0) this.bolts(f);
    this.gear -= dt;
    if (this.gear <= 0) this.gears(f);
  }

  /** The shield is back. */
  private raise(f: BossFight) {
    if (f.boss.armor) return;
    f.boss.armor = true;
    f.boss.pose = '';
    this.seal(f);
    f.emit({ type: 'boss-fx', name: 'shield-on', x: f.boss.x, y: f.box[1] });
  }

  /** A volley along the floor, to the left, from where it stands when the warning ends. */
  private bolts(f: BossFight) {
    const { def } = this;
    this.bolt = def.boltEvery[f.phase];
    const y = def.floorY - 9;
    for (let i = 0; i < def.boltCount[f.phase]; i++) {
      const lane = { x: (7 * TILE + f.box[0]) / 2, y, w: f.box[0] - 7 * TILE, h: 16 };
      f.announce('screw', lane, def.boltWarn + i * 0.45, () =>
        f.shoot({ kind: 'screw', x: f.box[0] - 6, y, vx: -def.boltSpeed, rx: 9, ry: 7 }),
      );
    }
  }

  /** Gears onto where the ball is now (and beside it, in the last phase). */
  private gears(f: BossFight) {
    const { def } = this;
    this.gear = def.gearEvery[f.phase];
    const s = f.world.s;
    const side = f.rand() < 0.5 ? -1 : 1;
    for (let i = 0; i < def.gearCount[f.phase]; i++) {
      const tx = Math.max(48, Math.min(592, s.x + i * side * 52));
      // The first solid tile under the target: where the gear lands
      const col = Math.floor(tx / TILE);
      let row = Math.max(1, Math.floor(s.y / TILE));
      while (row < ROWS - 1 && f.world.isOpen(f.world.s.tiles[row * COLS + col], row * COLS + col))
        row++;
      const ty = row * TILE;
      // Shot up out of sight when the warning shows, it comes straight down on the mark
      f.announce('gear', { x: tx, y: ty - 3, w: 44, h: 10 }, def.gearWarn, () =>
        f.shoot({ kind: 'gear', x: tx, y: TILE + 12, vy: 120, g: 900, rx: 10, ry: 10 }),
      );
    }
    f.emit({ type: 'boss-fx', name: 'gear-up', x: f.boss.x, y: f.box[1] });
  }
}

/**
 * A step on the left with the switch on it; the lane on the right, where the robot walks, with
 * pushers at its start that throw the ball towards it; and the bridge of A blocks over the lane.
 */
const WORKS = [
  '####################',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#......AAAAAA......#',
  '#.P................#',
  '#####o#............#',
  'E#######))##########',
];

const DEF: RobotDef = {
  width: 52,
  height: 60,
  hp: 4,
  floorY: 11 * TILE,
  stun: 0.6,
  shove: 140,
  seed: 4,
  // Never further from the end of the bridge than a bounce off its head carries the ball back
  minX: 444,
  maxX: 500,
  speeds: [30, 40, 50, 60],
  open: [6, 5.5, 5, 4.5],
  reopen: 2.4,
  lock: [2.5, 3, 3.5, 4],
  boltEvery: [3.4, 3.0, 2.8, 2.5],
  boltCount: [1, 1, 2, 2],
  boltWarn: 0.8,
  boltSpeed: 190,
  gearEvery: [4.6, 4.0, 3.5, 3.0],
  gearCount: [1, 1, 1, 2],
  gearWarn: 0.8,
  brain: () => new Robot(DEF),
};

export const SPROCKET: Boss<RobotDef> = {
  world: 4,
  def: DEF,
  arena: arena(4, WORKS),
  // A machine at work: a square bass hammering two notes, a sawtooth lead, four on the floor
  theme: {
    root: 58.3,
    bass: [0, 0, 12, 0, 3, 3, 12, 3, 0, 0, 12, 0, 5, 5, 10, 7],
    tempos: [108, 120, 132, 146],
    wave: 'square',
    lead: 'sawtooth',
    stab: 3,
    drone: 5,
    beat: [0, 4],
  },
};
