// World 8, Orbit: a saucer in low gravity. It hovers out of phase (nothing touches it, and it
// is drawn faintly), following the ball and
// letting out orbs that chase it slowly. Then it stops, comes down and turns on a tractor beam
// (its orbs go out):
// a ball in the beam is pulled up into it unless it shakes loose. While it is down, a high
// bounce from beside the beam lands on its dome. The walls are bumpers: no corner to hide in.
import type { BossBrain, BossDef, BossFight } from '../game/boss';
import { BALL_R, TILE } from '../game/constants';
import { arena, type Boss } from './types';

export interface SaucerDef extends BossDef {
  /** How far its center flies, how high it hovers and how low it comes (feet over the floor). */
  minX: number;
  maxX: number;
  high: number;
  low: number;
  /** How fast it follows the ball while hovering (px/s). */
  follow: number;
  /** Seconds, per phase, it hovers between two beams. */
  hover: readonly number[];
  /** Orbs, per phase: how many at most, seconds between them, their speed; and their warning. */
  orbs: readonly number[];
  orbEvery: readonly number[];
  orbSpeed: readonly number[];
  orbWarn: number;
  orbLife: number;
  /** The beam, per phase: its warning (it comes down meanwhile) and how long it stays on. */
  beamWarn: readonly number[];
  beam: readonly number[];
  beamWidth: number;
  /** A caught ball: how fast it is pulled up, and the shakes to get loose, per phase. */
  pull: number;
  shakes: readonly number[];
  /** Seconds it stays down, its beam off, after the ball gets loose. */
  stall: number;
}

export type SaucerMode = 'hover' | 'aim' | 'beam' | 'stall' | 'rise';

export class Saucer implements BossBrain {
  mode: SaucerMode = 'hover';
  /** Seconds left in the current mode. */
  t = 0;
  orb = 0;

  constructor(private readonly def: SaucerDef) {}

  init(f: BossFight) {
    const { def } = this;
    f.boss.x = 320;
    f.boss.lift = def.high;
    f.boss.away = true;
    this.t = def.hover[0];
    this.orb = def.orbEvery[0] * 0.6;
  }

  /** The beam's light goes out (it is drawn as a warning that does nothing when it ends). */
  private dark(f: BossFight) {
    for (let i = f.warns.length - 1; i >= 0; i--)
      if (f.warns[i].kind === 'tractor') f.warns.splice(i, 1);
  }

  private climb(f: BossFight) {
    this.mode = 'rise';
    this.dark(f);
    f.boss.pose = '';
  }

  /** Hit while it is down: back up as soon as it wakes. */
  wake(f: BossFight) {
    this.climb(f);
  }

  /** The ball shook loose: the beam fails and the saucer hangs there for a moment. */
  released(f: BossFight) {
    this.mode = 'stall';
    this.t = this.def.stall;
    // Let go under the saucer: the ball drops, it does not hop up into it
    f.world.s.vy = 0;
    this.dark(f);
    f.boss.pose = 'stall';
    f.emit({ type: 'boss-fx', name: 'beam-off', x: f.boss.x, y: f.box[3] });
  }

  think(f: BossFight, dt: number) {
    const { def } = this;
    const { boss } = f;
    const s = f.world.s;
    // Its orbs keep after the ball
    for (const shot of f.shots) {
      if (shot.kind !== 'orb') continue;
      const d = Math.hypot(s.x - shot.x, s.y - shot.y) || 1;
      const v = def.orbSpeed[f.phase];
      shot.vx = ((s.x - shot.x) / d) * v;
      shot.vy = ((s.y - shot.y) / d) * v;
    }
    const g = f.grab;
    if (g) {
      // Pulled straight up into it
      g.y -= def.pull * dt;
      if (g.y - BALL_R <= f.box[3]) f.kill();
      return;
    }
    if (f.dazed) return;
    this.t -= dt;
    if (this.mode === 'hover') {
      const to = Math.max(def.minX, Math.min(def.maxX, s.x));
      const step = def.follow * dt;
      boss.x = Math.abs(to - boss.x) <= step ? to : boss.x + Math.sign(to - boss.x) * step;
      this.orb -= dt;
      if (this.orb <= 0) this.release(f);
      if (this.t > 0) return;
      // It stops here and comes down while the beam's column lights up
      this.mode = 'aim';
      const warn = def.beamWarn[f.phase];
      this.t = warn;
      const top = def.floorY - def.low;
      const area = { x: boss.x, y: (top + def.floorY) / 2, w: def.beamWidth, h: def.floorY - top };
      f.announce('beam', area, warn, () => {
        this.mode = 'beam';
        this.t = def.beam[f.phase];
        boss.lift = def.low;
        boss.away = false;
        boss.pose = 'beam';
        // The beam takes all its power: its orbs go out
        f.clear();
        f.emit({ type: 'boss-fx', name: 'beam-on', x: boss.x, y: top });
        // The beam itself: shown for as long as it is on
        f.announce('tractor', area, def.beam[f.phase], () => undefined);
      });
    } else if (this.mode === 'aim') {
      const k = Math.max(0, this.t) / def.beamWarn[f.phase];
      boss.lift = def.low + (def.high - def.low) * k;
    } else if (this.mode === 'beam') {
      // A ball under it, inside the beam, is caught
      const inside = Math.abs(s.x - boss.x) < def.beamWidth / 2 && s.y - BALL_R > f.box[3];
      if (inside) f.seize(s.x, s.y, def.shakes[f.phase]);
      else if (this.t <= 0) this.climb(f);
    } else if (this.mode === 'stall') {
      if (this.t <= 0) this.climb(f);
    } else {
      boss.lift = Math.min(def.high, boss.lift + 260 * dt);
      if (boss.lift < def.high) return;
      this.mode = 'hover';
      boss.away = true;
      this.t = def.hover[f.phase];
      this.orb = Math.min(this.orb, 1);
    }
  }

  /** An orb from under the saucer, if there is room for one more. */
  private release(f: BossFight) {
    const { def } = this;
    this.orb = def.orbEvery[f.phase];
    const flying = f.shots.filter((shot) => shot.kind === 'orb').length;
    const coming = f.warns.filter((w) => w.kind === 'orb').length;
    if (flying + coming >= def.orbs[f.phase]) return;
    const spot = () => ({ x: f.boss.x, y: f.box[3] + 12 });
    f.announce('orb', { ...spot(), w: 30, h: 30 }, def.orbWarn, () =>
      f.shoot({ kind: 'orb', ...spot(), rx: 9, ry: 9, life: def.orbLife, wall: 'bounce' }),
    );
  }
}

/** One big low-gravity zone, with bumpers down both walls. */
const STATION = [
  '####################',
  '#zzzzzzzzzzzzzzzzzz#',
  '#zzzzzzzzzzzzzzzzzz#',
  '#zzzzzzzzzzzzzzzzzz#',
  '#zzzzzzzzzzzzzzzzzz#',
  '#zzzzzzzzzzzzzzzzzz#',
  '#zzzzzzzzzzzzzzzzzz#',
  '#bzzzzzzzzzzzzzzzzb#',
  '#bzzzzzzzzzzzzzzzzb#',
  '#bzzzzzzzzzzzzzzzzb#',
  '#bzzzzzzzPzzzzzzzzb#',
  'E###################',
];

const DEF: SaucerDef = {
  width: 72,
  height: 54,
  hp: 5,
  floorY: 11 * TILE,
  stun: 0.6,
  shove: 140,
  seed: 8,
  minX: 120,
  maxX: 520,
  // In low gravity a high bounce reaches almost to the ceiling (256 px): there is no height
  // out of its reach, so while it hovers (and until its beam is on) nothing touches it. Down,
  // its dome is 184 px up: over a low bounce (113), under a high one
  high: 236,
  low: 130,
  follow: 70,
  hover: [4.0, 3.6, 3.2, 2.9, 2.6],
  orbs: [1, 1, 2, 2, 3],
  orbEvery: [2.6, 2.4, 2.2, 2.0, 1.8],
  orbSpeed: [42, 46, 50, 54, 58],
  orbWarn: 0.7,
  orbLife: 5.5,
  beamWarn: [1.1, 1.0, 0.9, 0.85, 0.8],
  beam: [3.6, 3.4, 3.2, 3.0, 2.8],
  beamWidth: 56,
  pull: 40,
  shakes: [4, 4, 5, 5, 6],
  stall: 2.2,
  brain: () => new Saucer(DEF),
};

export const ORBIT: Boss<SaucerDef> = {
  world: 8,
  def: DEF,
  arena: arena(8, STATION),
  // Weightless and cold: a sine bass in wide leaps, a square lead far above it, a sparse beat
  theme: {
    root: 65.4,
    bass: [0, 12, 0, 7, 0, 12, 0, 6, 0, 12, 0, 7, 3, 15, 2, 14],
    tempos: [96, 106, 118, 130, 144],
    wave: 'sine',
    lead: 'square',
    stab: 18,
    drone: 12,
    beat: [0, 7],
  },
};
