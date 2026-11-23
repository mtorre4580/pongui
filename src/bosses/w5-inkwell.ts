// World 5, Inkwell: an octopus in the middle of a flooded arena. Its arms guard its head while
// it sends ink bubbles up from the sand; then it reaches for the ball, catches it and drags it
// to its mouth. Shaking left and right gets the ball loose, and while it gathers its arms back
// its head is open. Portals on the walls lead to its other side.
import type { BossBrain, BossDef, BossFight } from '../game/boss';
import { TILE } from '../game/constants';
import { arena, type Boss } from './types';

export interface OctopusDef extends BossDef {
  /** Where it sits. */
  x: number;
  /** Seconds, per phase, it guards its head between two reaches. */
  rest: readonly number[];
  /** The reach, per phase: its warning, the shakes to get loose, and how fast it drags. */
  reachWarn: readonly number[];
  shakes: readonly number[];
  drag: readonly number[];
  /** Seconds it holds a caught ball still before it starts to pull. */
  squeeze: number;
  /** How high over the floor its arms catch. */
  reachHeight: number;
  /** Seconds, per phase, its head stays open after a reach. */
  open: readonly number[];
  /** Ink, per phase: seconds between volleys and bubbles per volley; warning and rise speed. */
  inkEvery: readonly number[];
  inkCount: readonly number[];
  inkWarn: number;
  inkSpeed: number;
}

export type OctopusMode = 'guard' | 'reach' | 'drag' | 'open';

export class Octopus implements BossBrain {
  mode: OctopusMode = 'guard';
  /** Seconds left in the current mode. */
  t = 0;
  ink = 0;

  constructor(private readonly def: OctopusDef) {}

  init(f: BossFight) {
    f.boss.x = this.def.x;
    this.guard(f);
    this.ink = this.def.inkEvery[0] * 0.5;
  }

  private guard(f: BossFight) {
    this.mode = 'guard';
    this.t = this.def.rest[f.phase];
    f.boss.armor = true;
    f.boss.pose = '';
  }

  /** Its arms come back: its head is open for a while. */
  private gather(f: BossFight) {
    this.mode = 'open';
    this.t = this.def.open[f.phase];
    f.boss.armor = false;
    f.boss.pose = 'open';
    f.emit({ type: 'boss-fx', name: 'arms-back', x: f.boss.x, y: f.box[1] });
  }

  hit(f: BossFight) {
    this.guard(f);
  }

  released(f: BossFight) {
    this.gather(f);
  }

  /** The mouth, on the side the ball is held on: where a caught ball ends up. */
  private mouth(f: BossFight, side: number) {
    return { x: f.boss.x + side * (this.def.width / 2 + 14), y: this.def.floorY - 36 };
  }

  think(f: BossFight, dt: number) {
    const { def } = this;
    const s = f.world.s;
    const g = f.grab;
    if (this.mode === 'drag') {
      if (!g) return;
      this.t -= dt;
      if (this.t > 0) return;
      // Pulled in a straight line to its mouth: there, the ball is lost
      const to = this.mouth(f, Math.sign(g.x - f.boss.x) || 1);
      const dx = to.x - g.x;
      const dy = to.y - g.y;
      const d = Math.hypot(dx, dy);
      const step = def.drag[f.phase] * dt;
      if (d <= step) return f.kill();
      g.x += (dx / d) * step;
      g.y += (dy / d) * step;
      return;
    }
    if (f.dazed) return;
    this.t -= dt;
    if (this.mode === 'guard') {
      this.ink -= dt;
      if (this.ink <= 0) this.bubbles(f);
      if (this.t > 0) return;
      // It reaches to the side the ball is on, along the bottom of the arena
      const side = s.x < f.boss.x ? -1 : 1;
      const edge = f.boss.x + (side * def.width) / 2;
      const wall = side < 0 ? TILE : 19 * TILE;
      const area = {
        x: (edge + wall) / 2,
        y: def.floorY - def.reachHeight / 2,
        w: Math.abs(wall - edge),
        h: def.reachHeight,
      };
      this.mode = 'reach';
      this.t = Infinity;
      f.announce('reach', area, def.reachWarn[f.phase], () => {
        const caught =
          Math.sign(s.x - f.boss.x) === side && s.y > def.floorY - def.reachHeight && !f.grab;
        if (!caught) return this.gather(f);
        this.mode = 'drag';
        this.t = def.squeeze;
        f.seize(s.x, s.y, def.shakes[f.phase]);
      });
    } else if (this.mode === 'open' && this.t <= 0) this.guard(f);
  }

  /** Ink bubbles from the sand: one under the ball, the rest around it. They rise slowly. */
  private bubbles(f: BossFight) {
    const { def } = this;
    this.ink = def.inkEvery[f.phase];
    const s = f.world.s;
    const xs: number[] = [];
    for (let i = 0; i < def.inkCount[f.phase]; i++) {
      // One tile and a half apart on either side of the ball, kept off the octopus itself
      const k = Math.ceil(i / 2) * (i % 2 ? 1 : -1);
      const x = Math.max(48, Math.min(592, s.x + k * 80 + (i ? (f.rand() - 0.5) * 24 : 0)));
      if (Math.abs(x - def.x) < def.width / 2 + 20) continue;
      xs.push(x);
    }
    for (const x of xs)
      f.announce('ink', { x, y: def.floorY - 3, w: 36, h: 10 }, def.inkWarn, () =>
        f.shoot({
          kind: 'ink',
          x,
          y: def.floorY - 12,
          vy: -def.inkSpeed,
          rx: 11,
          ry: 11,
          life: 2.2,
        }),
      );
  }
}

/** All water, with a portal high on each wall. The octopus sits in the middle of the sand. */
const LAGOON = [
  '####################',
  '#~~~~~~~~~~~~~~~~~~#',
  '#~~~~~~~~~~~~~~~~~~#',
  '#~~~~~~~~~~~~~~~~~~#',
  '#~~~~~~~~~~~~~~~~~~#',
  '#1~~~~~~~~~~~~~~~~1#',
  '#~~~~~~~~~~~~~~~~~~#',
  '#~~~~~~~~~~~~~~~~~~#',
  '#~~~~~~~~~~~~~~~~~~#',
  '#~~~~~~~~~~~~~~~~~~#',
  '#~~P~~~~~~~~~~~~~~~#',
  'E###################',
];

const DEF: OctopusDef = {
  width: 76,
  // Under water a low bounce climbs about 100 px: it has to be taller than that
  height: 112,
  hp: 4,
  floorY: 11 * TILE,
  stun: 0.7,
  shove: 140,
  seed: 5,
  x: 320,
  rest: [3.2, 2.9, 2.6, 2.3],
  reachWarn: [1.2, 1.1, 1.0, 0.9],
  shakes: [4, 5, 5, 6],
  // Slow enough to get loose at four or five changes of direction a second
  drag: [30, 34, 38, 42],
  squeeze: 0.5,
  reachHeight: 150,
  open: [4.6, 4.3, 4.0, 3.7],
  // A bubble lasts about as long as the wait for the next volley: never more than one volley
  // in the water at a time
  inkEvery: [3.0, 2.8, 2.6, 2.4],
  inkCount: [1, 2, 2, 3],
  inkWarn: 0.8,
  inkSpeed: 80,
  brain: () => new Octopus(DEF),
};

export const INKWELL: Boss<OctopusDef> = {
  world: 5,
  def: DEF,
  arena: arena(5, LAGOON),
  // Deep and swaying: a sine bass rocking between two notes, a triangle lead, a slow pulse
  theme: {
    root: 61.7,
    bass: [0, 0, 7, 0, 8, 8, 7, 0, 0, 0, 7, 0, 3, 3, 2, 0],
    tempos: [78, 88, 100, 114],
    wave: 'sine',
    lead: 'triangle',
    stab: 8,
    drone: 3,
    beat: [0, 6, 8],
  },
};
