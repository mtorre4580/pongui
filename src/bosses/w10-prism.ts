// World 10, King Prism: the last boss. He floats in the middle of the arena, too high to reach,
// and each of his five phases is a wave of what the earlier bosses did: fire from above,
// lightning and gusts, the floor opening, darkness, grabbing arms. When a wave is over the
// rainbow bridge appears for a few seconds on both sides of him: from it, a high bounce lands
// on his crown. Then the next wave begins.
import type { BossBrain, BossDef, BossFight } from '../game/boss';
import { BALL_R, COLS, TILE } from '../game/constants';
import { T } from '../game/tiles';
import { arena, type Boss } from './types';

export interface KingDef extends BossDef {
  /** Where he floats, and how high his feet are over the floor. */
  x: number;
  fly: number;
  /** Volleys per wave and seconds between them, per phase. */
  volleys: readonly number[];
  every: readonly number[];
  /** Seconds of warning for what falls from above, and for the floor opening. */
  warn: readonly number[];
  /** Seconds a hole in the floor stays open. */
  hole: number;
  /** Gusts: how long and how hard. */
  gustTime: number;
  gustPush: number;
  /** His arms: the warning, how high over the floor they catch, the pull and the shakes. */
  reachWarn: number;
  reachHeight: number;
  pull: number;
  shakes: number;
  /** Seconds the bridge stays, per phase, and the warning before it goes. */
  bridge: readonly number[];
  bridgeWarn: number;
}

export type KingMode = 'wave' | 'bridge';

/** The cells of the rainbow bridge: a platform on each side of him. */
export const BRIDGE = [4, 5, 6, 7, 12, 13, 14, 15].map((c) => 8 * COLS + c);
const FLOOR = 11 * COLS;

export class King implements BossBrain {
  mode: KingMode = 'wave';
  /** Seconds to the next volley (wave) or left of the bridge. */
  t = 0;
  /** Volleys left in this wave. */
  left = 0;
  private blowing = 0;
  private closing = false;
  /** The ball is in his arms. */
  private caught = false;
  /** Holes in the floor and the seconds each has left. */
  private readonly holes = new Map<number, number>();

  constructor(private readonly def: KingDef) {}

  init(f: BossFight) {
    f.boss.x = this.def.x;
    f.boss.lift = this.def.fly;
    this.wave(f, 1.5);
  }

  /** A new wave: the bridge goes, the floor is whole again, and in his fourth phase it is dark. */
  private wave(f: BossFight, wait: number) {
    this.mode = 'wave';
    this.left = this.def.volleys[f.phase];
    this.t = wait;
    this.closing = false;
    for (const idx of BRIDGE) f.setTile(idx, T.EMPTY);
    f.setDark(f.phase === 3);
  }

  private calm(f: BossFight) {
    this.blowing = 0;
    f.world.s.drift = 0;
  }

  /** Every hole closes (as soon as the ball is not in it). */
  private mend(f: BossFight) {
    for (const idx of this.holes.keys()) if (f.setTile(idx, T.SOLID)) this.holes.delete(idx);
  }

  hit(f: BossFight) {
    this.caught = false;
    this.calm(f);
    this.mend(f);
  }

  wake(f: BossFight) {
    this.wave(f, 1.2);
  }

  /** Let go under him: the ball drops, it does not hop up into him. */
  released(f: BossFight) {
    this.caught = false;
    f.world.s.vy = 0;
  }

  think(f: BossFight, dt: number) {
    const { def } = this;
    if (this.blowing > 0 && (this.blowing -= dt) <= 0) this.calm(f);
    for (const [idx, left] of this.holes) {
      if (left - dt > 0) this.holes.set(idx, left - dt);
      else if (f.setTile(idx, T.SOLID)) this.holes.delete(idx);
    }
    const g = this.caught ? f.grab : null;
    if (g) {
      // Pulled up towards him, in a straight line
      const dx = f.boss.x - g.x;
      const dy = f.box[3] + BALL_R - g.y;
      const d = Math.hypot(dx, dy);
      const step = def.pull * dt;
      if (d <= step) return f.kill();
      g.x += (dx / d) * step;
      g.y += (dy / d) * step;
      return;
    }
    if (f.dazed) return;
    this.t -= dt;
    if (this.mode === 'wave') {
      if (this.t > 0) return;
      if (this.left > 0) {
        this.left--;
        this.t = def.every[f.phase];
        this.volley(f);
        return;
      }
      // The wave is over once everything has landed: the bridge appears
      if (f.warns.length || f.shots.length || this.blowing > 0) return;
      this.mode = 'bridge';
      this.t = def.bridge[f.phase];
      this.mend(f);
      for (const idx of BRIDGE) f.setTile(idx, T.BRIDGE);
      f.emit({ type: 'boss-fx', name: 'bridge', x: def.x, y: 8 * TILE });
    } else if (this.t <= def.bridgeWarn && !this.closing) {
      this.closing = true;
      for (const x of [6, 14])
        f.announce(
          'fade',
          { x: x * TILE, y: 8 * TILE + 16, w: 4 * TILE, h: TILE },
          def.bridgeWarn,
          () => this.mode === 'bridge' && this.wave(f, 1),
        );
    }
  }

  /** One volley of the wave of this phase. */
  private volley(f: BossFight) {
    const first = this.left === this.def.volleys[f.phase] - 1;
    switch (f.phase) {
      case 0:
        return this.fall(f, 'fire', 2);
      case 1:
        this.gust(f);
        return this.fall(f, 'bolt', 2);
      case 2:
        this.open(f);
        return this.fall(f, 'fire', 1);
      case 3:
        return this.fall(f, first ? 'bolt' : 'fire', 2);
      default:
        if (first) return this.reach(f);
        if (this.left % 2) this.gust(f);
        else this.open(f);
        return this.fall(f, this.left % 2 ? 'bolt' : 'fire', 2);
    }
  }

  /** Fire or lightning from above on the ball's column and the ones next to it. */
  private fall(f: BossFight, kind: 'fire' | 'bolt', count: number) {
    const { def } = this;
    const col = Math.max(1, Math.min(18, Math.floor(f.world.s.x / TILE)));
    const side = f.rand() < 0.5 ? -1 : 1;
    const mid = (TILE + def.floorY) / 2;
    const h = def.floorY - TILE;
    for (const c of [col, col + side, col - side].slice(0, count)) {
      if (c < 1 || c > 18) continue;
      const x = c * TILE + TILE / 2;
      if (kind === 'bolt')
        f.announce('bolt', { x, y: mid, w: 28, h }, def.warn[f.phase], () =>
          f.shoot({ kind, x, y: mid, rx: 12, ry: h / 2, life: 0.22, wall: 'pass' }),
        );
      else
        f.announce('fire', { x, y: def.floorY - 3, w: 40, h: 10 }, def.warn[f.phase], () =>
          f.shoot({ kind, x, y: TILE + 12, vy: 220, g: 1100, rx: 9, ry: 11 }),
        );
    }
  }

  /** A gust across the arena, towards one wall. */
  private gust(f: BossFight) {
    const { def } = this;
    const dir = f.rand() < 0.5 ? -1 : 1;
    const area = { x: 320, y: (TILE + def.floorY) / 2, w: 18 * TILE, h: def.floorY - TILE };
    f.announce(dir < 0 ? 'gust-left' : 'gust-right', area, 0.8, () => {
      this.blowing = def.gustTime;
      f.world.s.drift = dir * def.gustPush;
      f.emit({ type: 'boss-fx', name: 'gust', x: 320, y: area.y });
      f.announce(dir < 0 ? 'blow-left' : 'blow-right', area, def.gustTime, () => undefined);
    });
  }

  /** The floor opens under the ball and in two more places, and closes again after a while. */
  private open(f: BossFight) {
    const { def } = this;
    const col = Math.max(1, Math.min(18, Math.floor(f.world.s.x / TILE)));
    const cols = new Set([col]);
    for (let i = 0; i < 6 && cols.size < 3; i++) cols.add(1 + Math.floor(f.rand() * 18));
    for (const c of cols) {
      const idx = FLOOR + c;
      const x = c * TILE + TILE / 2;
      f.announce('hole', { x, y: def.floorY + 8, w: TILE, h: 16 }, def.warn[f.phase], () => {
        if (!f.setTile(idx, T.EMPTY)) return;
        this.holes.set(idx, def.hole);
        f.emit({ type: 'boss-fx', name: 'crack', x, y: def.floorY });
      });
    }
  }

  /** His arms sweep the bottom of the whole arena: a ball down there is caught. */
  private reach(f: BossFight) {
    const { def } = this;
    const area = { x: 320, y: def.floorY - def.reachHeight / 2, w: 18 * TILE, h: def.reachHeight };
    f.announce('reach', area, def.reachWarn, () => {
      const s = f.world.s;
      if (f.grab || s.y <= def.floorY - def.reachHeight) return;
      this.caught = true;
      f.seize(s.x, s.y, def.shakes);
    });
  }
}

/** A bare summit: the bridge is not there until he calls it. */
const SUMMIT = [
  '####################',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..................#',
  '#..P...............#',
  'E###################',
];

const DEF: KingDef = {
  width: 64,
  height: 70,
  hp: 5,
  floorY: 11 * TILE,
  stun: 0.6,
  shove: 140,
  seed: 10,
  x: 320,
  // Low bounces pass under him; his crown is 170 px up, over a high bounce from the floor
  // (115) and under one from the bridge (96 + 115)
  fly: 100,
  volleys: [3, 3, 3, 3, 4],
  every: [2.4, 2.6, 2.6, 2.4, 2.6],
  warn: [1.0, 0.95, 0.9, 0.9, 0.85],
  hole: 3.5,
  gustTime: 1.6,
  gustPush: 90,
  reachWarn: 1.1,
  reachHeight: 150,
  pull: 40,
  shakes: 6,
  bridge: [6.5, 6, 5.5, 5.5, 5],
  bridgeWarn: 0.8,
  brain: () => new King(DEF),
};

export const PRISM: Boss<KingDef> = {
  world: 10,
  def: DEF,
  arena: arena(10, SUMMIT),
  // A march for a king: a square bass climbing in thirds, a sawtooth fanfare, a full beat
  theme: {
    root: 49,
    bass: [0, 0, 4, 4, 7, 7, 4, 4, 0, 0, 5, 5, 9, 9, 7, 5],
    tempos: [112, 120, 128, 136, 148],
    wave: 'square',
    lead: 'sawtooth',
    stab: 12,
    drone: 7,
    beat: [0, 2, 4, 6],
  },
};
