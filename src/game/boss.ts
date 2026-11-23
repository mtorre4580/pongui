// A boss fight: a big enemy on top of the usual world. `BossFight` is the frame every boss
// shares (hits, daze, phases, shots, warnings, arena changes, grabs, darkness) and each boss
// brings a brain with its behavior. The ball hurts a boss by landing on its head and dies when
// it touches it anywhere else. Pure logic, like the rest of src/game.
import { BALL_R, COLS, GAME_W, ROWS, TILE, V_HIGH, V_LOW } from './constants';
import type { InputState, World, WorldEvent } from './physics';
import { isPortal, isToggle, T } from './tiles';

/** No attack is announced for less than this (seconds). */
export const MIN_WARN = 0.6;

export interface BossDef {
  /** Size of its body, in world units. */
  width: number;
  height: number;
  /** Hits it takes. Each hit starts the next phase. */
  hp: number;
  /** The floor its feet stand on when its `lift` is 0. */
  floorY: number;
  /** Seconds it stays dazed, and harmless, after a hit (longer if the ball has not landed). */
  stun: number;
  /** Seed of its random numbers: the fight is the same every time. */
  seed?: number;
  /** Its behavior: a new brain for every fight. */
  brain: () => BossBrain;
}

export interface BossState {
  /** Center of the body. */
  x: number;
  /** Height of its feet above the floor (while hopping or flying). */
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
  /** Not there at all: nothing touches it. */
  away: boolean;
  /** Shielded: landing on its head is a bounce, not a hit (its sides still kill). */
  armor: boolean;
  /** Deadly from above too: there is no landing on it. */
  spiked: boolean;
  /** How it is drawn: 0 unseen, 1 solid. */
  alpha: number;
  /** Which of its looks is shown (the view has a texture for each). */
  pose: string;
}

/** Something a boss throws: a box that kills on touch. */
export interface Shot {
  id: number;
  kind: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Gravity on it (px/s²). */
  g: number;
  /** Half width and half height. */
  rx: number;
  ry: number;
  /** Seconds left. */
  life: number;
  /** What a solid tile does to it. */
  wall: 'pass' | 'stop' | 'bounce';
  /** Landing on it from above is a bounce that destroys it. */
  stomp: boolean;
}

export type ShotSpec = Pick<Shot, 'kind' | 'x' | 'y'> & Partial<Omit<Shot, 'id' | 'kind'>>;

/** An attack being announced: the view draws it; when its time is up the attack happens. */
export interface Warn {
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Seconds left, and the seconds it was announced for. */
  left: number;
  total: number;
  then: () => void;
}

/** The ball held by the boss: it goes where `x`, `y` go until the player shakes it loose. */
export interface Grab {
  x: number;
  y: number;
  /** Changes of direction (left, right, left…) needed to get loose, and the ones made. */
  need: number;
  wiggles: number;
  last: number;
}

export type BossEvent =
  | { type: 'boss-hit'; hp: number }
  /** The ball bounced off its head while it was dazed or shielded: no damage. */
  | { type: 'boss-bonk' }
  | { type: 'boss-down' }
  | { type: 'boss-hop' }
  | { type: 'boss-land' }
  | { type: 'boss-turn' }
  | { type: 'boss-warn'; kind: string; x: number; y: number }
  | { type: 'boss-shot'; kind: string; x: number; y: number }
  | { type: 'boss-shot-end'; kind: string; x: number; y: number; why: 'wall' | 'stomp' | 'time' }
  /** Tiles of the arena changed: the scene redraws them. */
  | { type: 'boss-tiles'; idxs: number[] }
  | { type: 'boss-grab' }
  | { type: 'boss-release' }
  | { type: 'boss-dark'; on: boolean }
  /** Anything else worth a sound or a burst (each boss has its own names). */
  | { type: 'boss-fx'; name: string; x: number; y: number };

/** What makes a boss that boss. Everything is optional but `think`. */
export interface BossBrain {
  /** Places the boss where the fight starts. */
  init?(f: BossFight): void;
  /** One step of behavior, after the world's step (also while dazed). */
  think(f: BossFight, dt: number): void;
  /** Its daze just ended: `byTime` when its time ran out after the ball had already landed. */
  wake?(f: BossFight, byTime: boolean): void;
  /** A hit landed and it is still standing. Shots and warnings are already cleared. */
  hit?(f: BossFight): void;
  /** One of its shots ended. */
  shotEnd?(f: BossFight, shot: Shot, why: 'wall' | 'stomp' | 'time'): void;
  /** The ball got loose from its grab. */
  released?(f: BossFight): void;
}

/** A small seeded generator (mulberry32): game logic never uses Math.random. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class BossFight {
  readonly boss: BossState;
  readonly brain: BossBrain;
  /** True once the boss has no hits left: the fight is won. */
  won = false;
  readonly shots: Shot[] = [];
  readonly warns: Warn[] = [];
  grab: Grab | null = null;
  /** The light is out: only a circle around the ball is seen. */
  dark = false;
  /** Random numbers in [0, 1), the same sequence in every fight. */
  readonly rand: () => number;
  /**
   * A hit only counts once the ball has been back on the ground since the last one: bouncing
   * from head to head would end the fight in seconds.
   */
  private grounded = true;
  private nextShot = 1;
  private out: BossEvent[] = [];
  private events: WorldEvent[] = [];
  private changed: number[] = [];

  constructor(
    readonly world: World,
    readonly def: BossDef,
    hp: number = def.hp,
  ) {
    this.boss = {
      x: GAME_W / 2,
      lift: 0,
      vy: 0,
      dir: -1,
      hp: Math.max(1, Math.min(def.hp, hp)),
      stun: 0,
      hold: false,
      sinceHop: 0,
      away: false,
      armor: false,
      spiked: false,
      alpha: 1,
      pose: '',
    };
    this.rand = seeded(def.seed ?? 1);
    this.brain = def.brain();
    this.brain.init?.(this);
  }

  /** 0 for the first phase; one more after each hit. */
  get phase(): number {
    return Math.min(this.def.hp - 1, this.def.hp - this.boss.hp);
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

  // ---------- What a brain can do ----------

  /** Reports something to the scene. */
  emit(e: BossEvent) {
    this.out.push(e);
  }

  /**
   * Announces an attack over a rectangle (centered on `x`, `y`) and runs `then` when the
   * warning is over. Never shorter than `MIN_WARN`, whatever the brain asks for.
   */
  announce(
    kind: string,
    area: { x: number; y: number; w: number; h: number },
    seconds: number,
    then: () => void,
  ) {
    const total = Math.max(MIN_WARN, seconds);
    this.warns.push({ kind, ...area, left: total, total, then });
    this.emit({ type: 'boss-warn', kind, x: area.x, y: area.y });
  }

  /** Throws something. */
  shoot(spec: ShotSpec): Shot {
    const shot: Shot = {
      vx: 0,
      vy: 0,
      g: 0,
      rx: 8,
      ry: 8,
      life: 8,
      wall: 'stop',
      stomp: false,
      ...spec,
      id: this.nextShot++,
    };
    this.shots.push(shot);
    this.emit({ type: 'boss-shot', kind: shot.kind, x: shot.x, y: shot.y });
    return shot;
  }

  /**
   * Changes a tile of the arena. A block is never put on top of the ball: toggle blocks wait
   * for it to leave (like in levels) and anything else is refused (false).
   */
  setTile(idx: number, tile: number): boolean {
    const s = this.world.s;
    const old = s.tiles[idx];
    if (old === tile) return true;
    const open = tile === T.EMPTY || tile === T.UPDRAFT || isPortal(tile);
    const c = idx % COLS;
    const r = Math.floor(idx / COLS);
    const inside =
      s.x + BALL_R > c * TILE &&
      s.x - BALL_R < (c + 1) * TILE &&
      s.y + BALL_R > r * TILE &&
      s.y - BALL_R < (r + 1) * TILE;
    if (!open && inside && !isToggle(tile)) return false;
    if (old === T.CRUMBLE && s.hits[idx] > 0) s.crumbling--;
    if (isToggle(old) && s.hits[idx] > 0) s.pending--;
    s.tiles[idx] = tile;
    s.hits[idx] = 0;
    if (inside && isToggle(tile)) {
      s.hits[idx] = 1;
      s.pending++;
    }
    this.changed.push(idx);
    return true;
  }

  /** Takes hold of the ball. It gets loose after `need` changes of direction. */
  seize(x: number, y: number, need: number) {
    if (this.grab) return;
    this.grab = { x, y, need, wiggles: 0, last: 0 };
    this.emit({ type: 'boss-grab' });
  }

  /** Turns the light off or on. */
  setDark(on: boolean) {
    if (this.dark === on) return;
    this.dark = on;
    this.emit({ type: 'boss-dark', on });
  }

  /** The ball dies by the boss's doing. */
  kill() {
    const s = this.world.s;
    if (s.status !== 'playing') return;
    s.status = 'dead';
    this.grab = null;
    this.events.push({ type: 'die', cause: 'boss' });
  }

  /** Drops every pending attack: warnings and, unless told otherwise, shots in the air. */
  clear(shots = true) {
    this.warns.length = 0;
    if (shots) this.shots.length = 0;
  }

  // ---------- The frame ----------

  /** Steps the world, then the boss. Deaths by the boss come back as world events. */
  step(dt: number, input: InputState): { events: WorldEvent[]; boss: BossEvent[] } {
    const s = this.world.s;
    const fromY = s.y;
    const events = this.world.step(dt, input);
    // Anything reported between two steps goes out with this one
    const boss = this.out;
    this.events = events;
    if (this.won || s.status !== 'playing') {
      this.out = [];
      return { events, boss };
    }
    const wasDazed = this.dazed;
    if (events.some((e) => e.type === 'bounce')) this.grounded = true;
    // Its daze ends when its time is up or, if that came first, when the ball lands. Only in
    // the first case does it wait for the ball to be clear of it
    const byTime = this.dazed;
    this.boss.stun = Math.max(0, this.boss.stun - dt);
    if (wasDazed && !this.dazed) {
      if (byTime) this.boss.hold = true;
      this.brain.wake?.(this, byTime);
    }
    this.brain.think(this, dt);
    this.stepWarns(dt);
    this.stepShots(dt, fromY, input);
    this.stepGrab(input);
    if (s.status === 'playing') this.touch(fromY);
    if (this.changed.length) {
      boss.push({ type: 'boss-tiles', idxs: this.changed });
      this.changed = [];
    }
    this.out = [];
    return { events, boss };
  }

  private stepWarns(dt: number) {
    if (!this.warns.length) return;
    const due: Warn[] = [];
    for (let i = this.warns.length - 1; i >= 0; i--) {
      const w = this.warns[i];
      w.left -= dt;
      if (w.left > 0) continue;
      this.warns.splice(i, 1);
      due.unshift(w);
    }
    for (const w of due) w.then();
  }

  private solidAt(x: number, y: number): boolean {
    const c = Math.floor(x / TILE);
    const r = Math.floor(y / TILE);
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return false;
    const idx = r * COLS + c;
    return !this.world.isOpen(this.world.s.tiles[idx], idx);
  }

  private endShot(i: number, why: 'wall' | 'stomp' | 'time') {
    const [shot] = this.shots.splice(i, 1);
    this.emit({ type: 'boss-shot-end', kind: shot.kind, x: shot.x, y: shot.y, why });
    this.brain.shotEnd?.(this, shot, why);
  }

  private stepShots(dt: number, fromY: number, input: InputState) {
    const s = this.world.s;
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const shot = this.shots[i];
      shot.life -= dt;
      shot.vy += shot.g * dt;
      const px = shot.x;
      const py = shot.y;
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      if (shot.life <= 0) {
        this.endShot(i, 'time');
        continue;
      }
      // Far outside the arena: gone without a word
      if (shot.x < -64 || shot.x > GAME_W + 64 || shot.y > ROWS * TILE + 64 || shot.y < -400) {
        this.shots.splice(i, 1);
        continue;
      }
      if (shot.wall !== 'pass' && this.solidAt(shot.x, shot.y)) {
        if (shot.wall === 'stop') {
          this.endShot(i, 'wall');
          continue;
        }
        // Bounce: turn back on the axis that ran into the tile
        if (!this.solidAt(px, shot.y)) {
          shot.y = py;
          shot.vy = -shot.vy;
        } else {
          shot.x = px;
          shot.vx = -shot.vx;
          if (this.solidAt(shot.x, shot.y)) {
            shot.y = py;
            shot.vy = -shot.vy;
          }
        }
      }
      // A ball in the boss's grip is out of reach of its shots; the ball's box is a little
      // forgiving
      if (this.grab || s.status !== 'playing') continue;
      const m = BALL_R - 2;
      const hit =
        s.x + m > shot.x - shot.rx &&
        s.x - m < shot.x + shot.rx &&
        s.y + m > shot.y - shot.ry &&
        s.y - m < shot.y + shot.ry;
      if (!hit) continue;
      if (shot.stomp && s.vy > 0 && fromY + BALL_R <= shot.y - shot.ry + 8) {
        s.y = shot.y - shot.ry - BALL_R;
        s.vy = input.jump ? -V_HIGH : -V_LOW;
        this.endShot(i, 'stomp');
        continue;
      }
      this.kill();
    }
  }

  private stepGrab(input: InputState) {
    const g = this.grab;
    const s = this.world.s;
    if (!g || s.status !== 'playing') return;
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir !== 0 && dir !== g.last) {
      if (g.last !== 0) g.wiggles++;
      g.last = dir;
    }
    if (g.wiggles >= g.need) {
      this.grab = null;
      // Let go with a small hop; the boss stays harmless until the ball is clear of it
      s.vy = -V_LOW;
      this.boss.hold = true;
      this.emit({ type: 'boss-release' });
      this.brain.released?.(this);
      return;
    }
    s.x = g.x;
    s.y = g.y;
    s.vx = 0;
    s.vy = 0;
    s.lockVx = null;
  }

  private touch(fromY: number) {
    const s = this.world.s;
    const { boss } = this;
    if (boss.away) {
      boss.hold = false;
      return;
    }
    const [left, top, right, bottom] = this.box;
    const overlap =
      s.x + BALL_R > left && s.x - BALL_R < right && s.y + BALL_R > top && s.y - BALL_R < bottom;
    if (!overlap) {
      boss.hold = false;
      return;
    }
    if (this.grab) return;
    // Coming down on its head: the ball was above it a step ago. A few pixels of slack, since
    // the boss can rise into the ball while hopping
    const above = fromY + BALL_R <= top + 8;
    if (above && s.vy > 0 && !boss.spiked) {
      // Its head is always something to bounce off
      s.y = top - BALL_R;
      s.vy = -V_HIGH;
      if (this.dazed || boss.armor) {
        this.emit({ type: 'boss-bonk' });
        return;
      }
      boss.hp--;
      if (boss.hp <= 0) {
        this.won = true;
        this.clear();
        this.emit({ type: 'boss-down' });
        return;
      }
      boss.stun = this.def.stun;
      boss.sinceHop = 0;
      this.grounded = false;
      this.clear();
      this.emit({ type: 'boss-hit', hp: boss.hp });
      this.brain.hit?.(this);
      return;
    }
    if (this.dazed || boss.hold) return;
    this.kill();
  }
}
