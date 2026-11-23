// A boss fight: a big enemy on top of the usual world. The ball hurts it by landing on its head
// and dies when it touches it anywhere else. Pure logic, like the rest of src/game.
import { BALL_R, V_HIGH } from './constants';
import type { InputState, World, WorldEvent } from './physics';

export interface BossDef {
  /** Size of its body, in world units. */
  width: number;
  height: number;
  /** Hits it takes. Each hit starts the next phase. */
  hp: number;
  /** How far its center walks, and the floor it stands on. */
  minX: number;
  maxX: number;
  floorY: number;
  /** Walking speed in each phase (px/s), from the first to the last. */
  speeds: readonly number[];
  /** Seconds between hops in each phase (0: it does not hop). */
  hopEvery: readonly number[];
  /** Hop take-off speed and the gravity that brings it back (px/s, px/s²). */
  hopSpeed: number;
  hopGravity: number;
  /** Seconds it stays dazed, and harmless, after a hit (longer if the ball has not landed). */
  stun: number;
}

export interface BossState {
  /** Center of the body. */
  x: number;
  /** Height of its feet above the floor (while hopping). */
  lift: number;
  vy: number;
  dir: -1 | 1;
  hp: number;
  /** Seconds left dazed. */
  stun: number;
  /** After being dazed, it stays harmless until the ball is clear of it. */
  hold: boolean;
  /** Seconds since its last hop (or since the phase began). */
  sinceHop: number;
}

export type BossEvent =
  | { type: 'boss-hit'; hp: number }
  /** The ball bounced off its head while it was dazed: no damage. */
  | { type: 'boss-bonk' }
  | { type: 'boss-down' }
  | { type: 'boss-hop' }
  | { type: 'boss-land' }
  | { type: 'boss-turn' };

export class BossFight {
  readonly boss: BossState;
  /** True once the boss has no hits left: the fight is won. */
  won = false;
  /**
   * A hit only counts once the ball has been back on the ground since the last one: bouncing
   * from head to head would end the fight in seconds.
   */
  private grounded = true;

  constructor(
    readonly world: World,
    readonly def: BossDef,
    hp: number = def.hp,
  ) {
    this.boss = {
      x: def.maxX,
      lift: 0,
      vy: 0,
      dir: -1,
      hp: Math.max(1, Math.min(def.hp, hp)),
      stun: 0,
      hold: false,
      sinceHop: 0,
    };
  }

  /** 0 for the first phase; one more after each hit. */
  get phase(): number {
    return Math.min(this.def.speeds.length - 1, this.def.hp - this.boss.hp);
  }

  /** Dazed after a hit: harmless and unhurt until its time is up and the ball has landed. */
  get dazed(): boolean {
    return this.boss.stun > 0 || !this.grounded;
  }

  /** The boss's box: left, top, right, bottom. */
  get box(): [number, number, number, number] {
    const { def, boss } = this;
    const bottom = def.floorY - boss.lift;
    return [boss.x - def.width / 2, bottom - def.height, boss.x + def.width / 2, bottom];
  }

  /** Steps the world, then the boss. Deaths by the boss come back as world events. */
  step(dt: number, input: InputState): { events: WorldEvent[]; boss: BossEvent[] } {
    const s = this.world.s;
    const fromY = s.y;
    const events = this.world.step(dt, input);
    const boss: BossEvent[] = [];
    if (this.won || s.status !== 'playing') return { events, boss };
    if (events.some((e) => e.type === 'bounce')) this.grounded = true;
    this.move(dt, boss);
    this.touch(fromY, events, boss);
    return { events, boss };
  }

  private move(dt: number, out: BossEvent[]) {
    const { def, boss } = this;
    const wasDazed = this.dazed;
    boss.stun = Math.max(0, boss.stun - dt);
    if (wasDazed && !this.dazed) {
      boss.hold = true;
      // It comes back facing the ball
      boss.dir = this.world.s.x < boss.x ? -1 : 1;
    }
    // Hops keep going while dazed, so it never hangs in the air
    if (boss.lift > 0 || boss.vy !== 0) {
      boss.vy -= def.hopGravity * dt;
      boss.lift += boss.vy * dt;
      if (boss.lift <= 0) {
        boss.lift = 0;
        boss.vy = 0;
        out.push({ type: 'boss-land' });
      }
    }
    if (this.dazed) return;
    boss.x += boss.dir * def.speeds[this.phase] * dt;
    if (boss.x <= def.minX || boss.x >= def.maxX) {
      boss.x = Math.max(def.minX, Math.min(def.maxX, boss.x));
      boss.dir = boss.x <= def.minX ? 1 : -1;
      out.push({ type: 'boss-turn' });
    }
    const every = def.hopEvery[this.phase] ?? 0;
    boss.sinceHop += dt;
    if (every > 0 && boss.lift === 0 && boss.sinceHop >= every) {
      boss.sinceHop = 0;
      boss.vy = def.hopSpeed;
      boss.lift = boss.vy * dt;
      out.push({ type: 'boss-hop' });
    }
  }

  private touch(fromY: number, events: WorldEvent[], out: BossEvent[]) {
    const s = this.world.s;
    const { boss } = this;
    const [left, top, right, bottom] = this.box;
    const overlap =
      s.x + BALL_R > left && s.x - BALL_R < right && s.y + BALL_R > top && s.y - BALL_R < bottom;
    if (!overlap) {
      boss.hold = false;
      return;
    }
    // Coming down on its head: the ball was above it a step ago. A few pixels of slack, since
    // the boss can rise into the ball while hopping
    const above = fromY + BALL_R <= top + 8;
    if (above && s.vy > 0) {
      // Its head is always something to bounce off
      s.y = top - BALL_R;
      s.vy = -V_HIGH;
      if (this.dazed) {
        out.push({ type: 'boss-bonk' });
        return;
      }
      boss.hp--;
      if (boss.hp <= 0) {
        this.won = true;
        out.push({ type: 'boss-down' });
        return;
      }
      boss.stun = this.def.stun;
      boss.sinceHop = 0;
      this.grounded = false;
      out.push({ type: 'boss-hit', hp: boss.hp });
      return;
    }
    if (this.dazed || boss.hold) return;
    s.status = 'dead';
    events.push({ type: 'die', cause: 'boss' });
  }
}
