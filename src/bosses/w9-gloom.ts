// World 9, Gloom: a specter that keeps the rhythm of the phase blocks. Most of the time it is
// not there: only its eyes glow where it will appear, even after it puts the light out. It
// turns solid exactly when the `%` blocks open, and then sweeps along the floor towards the
// ball. Over each of its spots there is a `%` platform: stand on it while the eyes glow under
// it and, when the platform opens, the ball drops on its head.
import type { BossBrain, BossDef, BossFight } from '../game/boss';
import { PHASE_CYCLE, TILE } from '../game/constants';
import { arena, type Boss } from './types';

export interface SpecterDef extends BossDef {
  /** Where it can appear (x of its center): under the middle of each platform. */
  spots: readonly number[];
  /**
   * Halves of the phase cycle (1.2 s each), per phase, its eyes glow before it turns solid:
   * 3 leaves a whole turn of the platforms to get ready, 2 only the time to climb.
   */
  lead: readonly number[];
  /** How fast it sweeps towards the ball while solid, per phase (px/s). */
  sweep: readonly number[];
  /** The phase from which it keeps the light out. */
  darkFrom: number;
}

export type SpecterMode = 'hidden' | 'eyes' | 'solid';
const HALF = PHASE_CYCLE / 2;

export class Specter implements BossBrain {
  mode: SpecterMode = 'hidden';
  spot = -1;
  /** Steps left solid. */
  left = 0;

  constructor(private readonly def: SpecterDef) {}

  init(f: BossFight) {
    this.hide(f);
  }

  private hide(f: BossFight) {
    this.mode = 'hidden';
    f.boss.away = true;
    f.boss.alpha = 0;
    f.boss.pose = '';
  }

  /** Hit: it fades as soon as it wakes, and from its second phase the light stays out. */
  wake(f: BossFight) {
    this.hide(f);
    f.setDark(f.phase >= this.def.darkFrom);
  }

  think(f: BossFight, dt: number) {
    const { def } = this;
    const { boss } = f;
    const s = f.world.s;
    if (this.mode === 'solid') {
      if (f.dazed) return;
      // Along the floor towards the ball, until the `%` blocks close again
      const dir = Math.sign(s.x - boss.x);
      if (dir !== 0) boss.dir = dir < 0 ? -1 : 1;
      boss.x = Math.max(60, Math.min(580, boss.x + dir * def.sweep[f.phase] * dt));
      if (--this.left <= 0) this.hide(f);
      return;
    }
    if (this.mode !== 'hidden' || f.dazed) return;
    // Its eyes open on a swap of the blocks, so that it turns solid as the `%` ones open
    const lead = def.lead[f.phase];
    if ((s.ticks + lead * HALF) % PHASE_CYCLE !== HALF) return;
    // The spot nearest to the ball; later, sometimes the next nearest
    const near = def.spots
      .map((x, i) => ({ i, d: Math.abs(x - s.x) }))
      .sort((a, b) => a.d - b.d)
      .filter(({ i }) => i !== this.spot);
    this.spot = near[f.phase >= 2 && f.rand() < 0.4 ? 1 : 0].i;
    this.mode = 'eyes';
    boss.x = def.spots[this.spot];
    boss.alpha = 1;
    boss.pose = 'eyes';
    const area = { x: boss.x, y: def.floorY - def.height / 2, w: def.width, h: def.height };
    f.announce('eyes', area, (lead * HALF) / 120, () => {
      this.mode = 'solid';
      this.left = HALF;
      boss.away = false;
      boss.pose = '';
      f.emit({ type: 'boss-fx', name: 'appear', x: boss.x, y: f.box[1] });
    });
  }
}

/** A `%` platform over each spot: solid while the specter is not. */
const KEEP = [
  '####################',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..%%..%%..%%..%%..#',
  '#..................#',
  '#........P.........#',
  'E###################',
];

const DEF: SpecterDef = {
  width: 52,
  // It reaches the underside of the platforms
  height: 64,
  hp: 5,
  floorY: 11 * TILE,
  stun: 0.6,
  shove: 140,
  seed: 9,
  spots: [128, 256, 384, 512],
  lead: [3, 3, 3, 2, 2],
  sweep: [50, 70, 90, 110, 130],
  darkFrom: 1,
  brain: () => new Specter(DEF),
};

export const GLOOM: Boss<SpecterDef> = {
  world: 9,
  def: DEF,
  arena: arena(9, KEEP),
  // A slow waltz for a ghost: a triangle bass stepping down, a sine lead, a bell-like beat on
  // the swaps of the blocks
  theme: {
    root: 55,
    bass: [0, 7, 3, 7, 0, 7, 3, 7, -2, 5, 2, 5, -4, 3, 0, 3],
    tempos: [100, 100, 108, 116, 124],
    wave: 'triangle',
    lead: 'sine',
    stab: 15,
    drone: 3,
    beat: [0, 8],
  },
};
