import {
  AIR_ACCEL,
  AIR_DECEL,
  BALL_R,
  CRUMBLE_STEPS,
  BOUNCE_GRACE,
  COLS,
  EXIT_RADIUS,
  GRAVITY,
  H_HIGH,
  ITEM_RADIUS,
  JUMP_BUFFER,
  MAX_FALL,
  MAX_VX,
  PUSH_VX,
  RAMP_VX,
  ROWS,
  TILE,
  UPDRAFT_LIFT,
  UPDRAFT_VMAX,
  WATER_GRAVITY,
  WATER_MAX_FALL,
  ZONE_GRAVITY,
  BUMP_VX,
  BUMP_VY,
  V_HIGH,
  V_LOW,
  V_SPRING,
  VENT_CYCLE,
  PHASE_CYCLE,
} from './constants';
import { FIELD, type ItemKind, type ParsedLevel } from './level';
import { fragileMax, isPortal, isToggle, T } from './tiles';

export interface InputState {
  left: boolean;
  right: boolean;
  jump: boolean; // button held
  jumpPressed: boolean; // edge: pressed during this step
}

export type BounceKind = 'low' | 'high' | 'spring' | 'ramp' | 'push';
export type DeathCause = 'fall' | 'spike' | 'fire' | 'vent';

export type WorldEvent =
  | { type: 'bounce'; kind: BounceKind; x: number; y: number; idx: number }
  | { type: 'boost' }
  | { type: 'bonk'; x: number; y: number }
  | { type: 'crack'; idx: number; hits: number }
  | { type: 'break'; idxs: number[]; tile: number }
  | { type: 'extinguish'; idxs: number[] }
  | { type: 'collect'; item: number; kind: ItemKind }
  | { type: 'exitOpen' }
  | { type: 'wind'; inside: boolean }
  | { type: 'switch'; on: boolean }
  | { type: 'portal'; from: number; to: number }
  | { type: 'water'; inside: boolean }
  | { type: 'zone'; inside: boolean }
  | { type: 'phase'; b: boolean }
  | { type: 'bump'; idx: number }
  | { type: 'crumble'; idx: number }
  | { type: 'vent'; lit: boolean }
  | { type: 'die'; cause: DeathCause }
  | { type: 'win' };

export interface ItemState {
  kind: ItemKind;
  col: number;
  row: number;
  taken: boolean;
}

export interface WorldState {
  tiles: Uint8Array;
  hits: Uint8Array;
  items: ItemState[];
  x: number;
  y: number;
  vx: number;
  vy: number;
  lockVx: number | null; // forced horizontal speed (ramps)
  drops: number;
  hammers: number;
  keys: number;
  gemsTaken: number;
  gemsTotal: number;
  status: 'playing' | 'dead' | 'won';
  time: number;
  bounces: number;
  jumpBuffer: number;
  grace: number;
  surfaceY: number;
  /** The ball's center is inside an updraft. */
  wind: boolean;
  /** Switches flipped an odd number of times: A blocks are solid, B blocks open. */
  switchOn: boolean;
  /** Toggle blocks held open until the ball leaves them (their `hits` is 1). */
  pending: number;
  /** The portal the ball just came out of: it does not work again until the ball leaves it. */
  portalHold: number;
  /** The ball's center is in water. */
  water: boolean;
  /** The ball's center is in a low-gravity zone. */
  zone: boolean;
  /** Fixed steps since the start: timed tiles (vents) follow it. */
  ticks: number;
  /** Crumbling blocks counting down (their `hits` holds the steps left + 1). */
  crumbling: number;
}

interface Cell {
  c: number;
  r: number;
  idx: number; // -1 = outside the map
  t: number;
}

/**
 * Steps after which every timed tile of the level repeats (0 if it has none). The solver keeps
 * the phase in its state key: the same spot at a different phase is a different situation.
 */
export function timedCycle(level: ParsedLevel): number {
  const vents = level.tiles.some((t) => t === T.VENT);
  const phases = level.tiles.some((t) => t === T.PHASE_A || t === T.PHASE_B);
  if (vents && phases) return 1440; // both cycles repeat together every 12 s
  return vents ? VENT_CYCLE : phases ? PHASE_CYCLE : 0;
}

export function cloneState(s: WorldState): WorldState {
  return {
    ...s,
    tiles: s.tiles.slice(),
    hits: s.hits.slice(),
    items: s.items.map((i) => ({ ...i })),
  };
}

export class World {
  readonly level: ParsedLevel;
  s: WorldState;
  private readonly partner = new Map<number, number>();
  readonly hasVents: boolean;
  readonly hasPhases: boolean;

  constructor(level: ParsedLevel, skipItems: Iterable<number> = []) {
    this.level = level;
    const skip = new Set(skipItems);
    this.s = {
      tiles: level.tiles.slice(),
      hits: new Uint8Array(level.tiles.length),
      items: level.items.map((it, i) => ({ ...it, taken: skip.has(i) })),
      x: level.start.col * TILE + TILE / 2,
      y: level.start.row * TILE + TILE / 2,
      vx: 0,
      vy: 0,
      lockVx: null,
      drops: 0,
      hammers: 0,
      keys: 0,
      gemsTaken: 0,
      gemsTotal: level.gems,
      status: 'playing',
      time: 0,
      bounces: 0,
      jumpBuffer: 0,
      grace: 0,
      surfaceY: 0,
      wind: false,
      switchOn: false,
      pending: 0,
      portalHold: -1,
      water: false,
      zone: false,
      ticks: 0,
      crumbling: 0,
    };
    this.hasVents = level.tiles.some((t) => t === T.VENT);
    this.hasPhases = level.tiles.some((t) => t === T.PHASE_A || t === T.PHASE_B);
    // Each portal's partner (the other tile with the same digit)
    level.tiles.forEach((t, idx) => {
      if (!isPortal(t)) return;
      const other = level.tiles.findIndex((u, j) => u === t && j !== idx);
      if (other >= 0) this.partner.set(idx, other);
    });
  }

  get exitOpen(): boolean {
    return this.s.gemsTaken >= this.s.gemsTotal;
  }

  tileAt(c: number, r: number): number {
    if (c < 0 || c >= COLS || r < 0) return T.SOLID;
    if (r >= ROWS) return T.EMPTY;
    return this.s.tiles[r * COLS + c];
  }

  /** Advances timed tiles: crumbling blocks count down and vents light up or go out. */
  private tick(ev: WorldEvent[]) {
    const s = this.s;
    s.ticks++;
    if (this.hasVents && s.ticks % (VENT_CYCLE / 2) === 0)
      ev.push({ type: 'vent', lit: this.ventLit });
    if (this.hasPhases && s.ticks % (PHASE_CYCLE / 2) === 0) {
      // The blocks that turn solid around the ball wait until it leaves them
      this.holdOpen();
      ev.push({ type: 'phase', b: this.phaseB });
    }
    if (s.crumbling === 0) return;
    const gone: number[] = [];
    for (let idx = 0; idx < s.tiles.length; idx++) {
      if (s.tiles[idx] !== T.CRUMBLE || s.hits[idx] === 0) continue;
      if (--s.hits[idx] > 1) continue;
      s.tiles[idx] = T.EMPTY;
      s.hits[idx] = 0;
      s.crumbling--;
      gone.push(idx);
    }
    if (gone.length) ev.push({ type: 'break', idxs: gone, tile: T.CRUMBLE });
  }

  /** Vents are lit (deadly) during the second half of their cycle. */
  get ventLit(): boolean {
    return this.s.ticks % VENT_CYCLE >= VENT_CYCLE / 2;
  }

  /** Whether the ball passes through tile `t` at `idx` right now (air, wind, open blocks). */
  isOpen(t: number, idx: number): boolean {
    if (t === T.EMPTY || t === T.UPDRAFT || isPortal(t)) return true;
    if (isToggle(t)) return idx < 0 || this.s.hits[idx] > 0 || !this.toggleSolid(t);
    return false;
  }

  /** Whether a toggle block is solid by the current state (ignoring the ball inside it). */
  private toggleSolid(t: number): boolean {
    if (t === T.BLOCK_A) return this.s.switchOn;
    if (t === T.BLOCK_B) return !this.s.switchOn;
    if (t === T.PHASE_A) return !this.phaseB;
    if (t === T.PHASE_B) return this.phaseB;
    return true;
  }

  /** `&` blocks are solid (and `%` ones open) during the second half of the phase cycle. */
  get phaseB(): boolean {
    return this.s.ticks % PHASE_CYCLE >= PHASE_CYCLE / 2;
  }

  /** Every map cell the ball's box covers (only the ones it collides with, if `solid`). */
  private box(solid = false): Cell[] {
    const { x, y } = this.s;
    const c0 = Math.floor((x - BALL_R) / TILE);
    const c1 = Math.ceil((x + BALL_R) / TILE) - 1;
    const r0 = Math.floor((y - BALL_R) / TILE);
    const r1 = Math.ceil((y + BALL_R) / TILE) - 1;
    const out: Cell[] = [];
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const t = this.tileAt(c, r);
        // The physics' hottest loop: skip air before building a cell
        if (solid && t === T.EMPTY) continue;
        const idx = c >= 0 && c < COLS && r >= 0 && r < ROWS ? r * COLS + c : -1;
        if (solid && this.isOpen(t, idx)) continue;
        out.push({ c, r, idx, t });
      }
    }
    return out;
  }

  private overlaps(): Cell[] {
    return this.box(true);
  }

  /** A toggle block that turns solid around the ball stays open until the ball leaves it. */
  private holdOpen() {
    const s = this.s;
    for (const c of this.box()) {
      if (c.idx < 0 || !isToggle(c.t) || s.hits[c.idx] > 0 || !this.toggleSolid(c.t)) continue;
      s.hits[c.idx] = 1;
      s.pending++;
    }
  }

  /** Closes the held-open blocks the ball has left (or that are open by state anyway). */
  private settle() {
    const s = this.s;
    if (s.pending === 0) return;
    const inBox = new Set(this.box().map((c) => c.idx));
    for (let idx = 0; idx < s.tiles.length; idx++) {
      if (s.hits[idx] === 0 || !isToggle(s.tiles[idx])) continue;
      if (inBox.has(idx) && this.toggleSolid(s.tiles[idx])) continue;
      s.hits[idx] = 0;
      s.pending--;
    }
  }

  /**
   * Entering a portal (with the ball's center) moves the ball to the center of its partner,
   * keeping its speed. The partner stays inactive until the ball's center leaves it.
   */
  private portals(ev: WorldEvent[]) {
    const s = this.s;
    const c = Math.floor(s.x / TILE);
    const r = Math.floor(s.y / TILE);
    const idx = c >= 0 && c < COLS && r >= 0 && r < ROWS ? r * COLS + c : -1;
    if (idx === s.portalHold) return;
    s.portalHold = -1;
    const to = idx >= 0 && isPortal(s.tiles[idx]) ? this.partner.get(idx) : undefined;
    if (to === undefined) return;
    s.x = (to % COLS) * TILE + TILE / 2;
    s.y = Math.floor(to / COLS) * TILE + TILE / 2;
    s.portalHold = to;
    ev.push({ type: 'portal', from: idx, to });
  }

  private flipSwitches(ev: WorldEvent[]) {
    this.s.switchOn = !this.s.switchOn;
    this.holdOpen();
    ev.push({ type: 'switch', on: this.s.switchOn });
  }

  /** The cell under (or over) the ball's center, else the nearest one. */
  private primary(cells: Cell[]): Cell {
    const x = this.s.x;
    const pc = Math.floor(x / TILE);
    return (
      cells.find((c) => c.c === pc) ??
      cells.reduce((a, b) =>
        Math.abs(a.c * TILE + TILE / 2 - x) <= Math.abs(b.c * TILE + TILE / 2 - x) ? a : b,
      )
    );
  }

  private die(cause: DeathCause, ev: WorldEvent[]) {
    this.s.status = 'dead';
    ev.push({ type: 'die', cause });
  }

  /** Removes every tile of the given kind connected to the given cells (walls, locks). */
  private flood(seeds: Cell[], tile: number): number[] {
    const s = this.s;
    const stack = seeds.filter((c) => c.idx >= 0).map((c) => c.idx);
    const out: number[] = [];
    while (stack.length) {
      const idx = stack.pop()!;
      if (s.tiles[idx] !== tile) continue;
      s.tiles[idx] = T.EMPTY;
      out.push(idx);
      const c = idx % COLS;
      const r = (idx / COLS) | 0;
      if (c > 0) stack.push(idx - 1);
      if (c < COLS - 1) stack.push(idx + 1);
      if (r > 0) stack.push(idx - COLS);
      if (r < ROWS - 1) stack.push(idx + COLS);
    }
    return out;
  }

  /**
   * Applies hazards and power-ups for touched cells. Returns the cells that still block, or
   * null if the ball died. When landing or hitting a ceiling, hazards only count if they are
   * under/over the ball's center (or if they are the only thing it touches).
   */
  private resolveContacts(cells: Cell[], usePrimary: boolean, ev: WorldEvent[]): Cell[] | null {
    const s = this.s;
    let hazard = cells;
    if (usePrimary) {
      const pc = Math.floor(s.x / TILE);
      const prim = cells.filter((c) => c.c === pc);
      if (prim.length) hazard = prim;
    }
    // Crumbling blocks start their countdown on any touch
    for (const c of cells) {
      if (c.t !== T.CRUMBLE || c.idx < 0 || s.hits[c.idx] > 0) continue;
      s.hits[c.idx] = CRUMBLE_STEPS + 1;
      s.crumbling++;
      ev.push({ type: 'crumble', idx: c.idx });
    }
    if (this.ventLit && hazard.some((c) => c.t === T.VENT)) {
      this.die('vent', ev);
      return null;
    }
    if (hazard.some((c) => c.t === T.SPIKE)) {
      this.die('spike', ev);
      return null;
    }
    const fires = hazard.filter((c) => c.t === T.FIRE);
    if (fires.length) {
      if (s.drops <= 0) {
        this.die('fire', ev);
        return null;
      }
      s.drops--;
      for (const f of fires) {
        s.tiles[f.idx] = T.ASH;
        f.t = T.ASH;
      }
      ev.push({ type: 'extinguish', idxs: fires.map((f) => f.idx) });
    }
    const walls = cells.filter((c) => c.t === T.WALL);
    if (walls.length && s.hammers > 0) {
      s.hammers--;
      const idxs = this.flood(walls, T.WALL);
      ev.push({ type: 'break', idxs, tile: T.WALL });
    }
    const locks = cells.filter((c) => c.t === T.LOCK);
    if (locks.length && s.keys > 0) {
      s.keys--;
      const idxs = this.flood(locks, T.LOCK);
      ev.push({ type: 'break', idxs, tile: T.LOCK });
    }
    return cells.filter((c) => this.tileAt(c.c, c.r) !== T.EMPTY);
  }

  private bounce(cells: Cell[], top: number, input: InputState, ev: WorldEvent[]) {
    const s = this.s;
    let prim = this.primary(cells);

    for (const c of cells) {
      const max = fragileMax(c.t);
      if (!max || c.idx < 0) continue;
      s.hits[c.idx]++;
      if (s.hits[c.idx] >= max) {
        s.tiles[c.idx] = T.EMPTY;
        ev.push({ type: 'break', idxs: [c.idx], tile: c.t });
      } else {
        ev.push({ type: 'crack', idx: c.idx, hits: s.hits[c.idx] });
      }
    }

    // Moss is soft: it always gives a low bounce, and it cannot be upgraded afterwards
    const soft = prim.t === T.MOSS;
    const wantHigh = !soft && (input.jump || s.jumpBuffer > 0);
    const isRamp = (c: Cell) => c.t === T.RAMP_L || c.t === T.RAMP_R;
    const isPusher = (c: Cell) => c.t === T.PUSH_L || c.t === T.PUSH_R;
    const nearest = (pred: (c: Cell) => boolean) =>
      pred(prim)
        ? prim
        : cells
            .filter(pred)
            .sort(
              (a, b) =>
                Math.abs(a.c * TILE + TILE / 2 - s.x) - Math.abs(b.c * TILE + TILE / 2 - s.x),
            )[0];
    // Ramps "catch" the ball as soon as it touches them (even with its edge), so they cannot
    // be skipped by accident, and always launch it the same way from the ramp's center:
    // a high, predictable jump without pressing anything. Pushers catch the same way but give
    // a low, fast throw.
    const ramp = prim.t === T.SPRING ? undefined : nearest(isRamp);
    const pusher = prim.t === T.SPRING || ramp ? undefined : nearest(isPusher);
    if (prim.t === T.SWITCH) this.flipSwitches(ev);
    let kind: BounceKind;
    if (prim.t === T.SPRING) {
      kind = 'spring';
      s.vy = -V_SPRING;
      s.lockVx = null;
    } else {
      s.vy = wantHigh ? -V_HIGH : -V_LOW;
      if (ramp) {
        kind = 'ramp';
        prim = ramp;
        s.x = ramp.c * TILE + TILE / 2;
        s.vy = -V_HIGH;
        s.lockVx = ramp.t === T.RAMP_L ? -RAMP_VX : RAMP_VX;
        s.vx = s.lockVx;
      } else if (pusher) {
        kind = 'push';
        prim = pusher;
        s.x = pusher.c * TILE + TILE / 2;
        s.vy = -V_LOW;
        s.lockVx = pusher.t === T.PUSH_L ? -PUSH_VX : PUSH_VX;
        s.vx = s.lockVx;
      } else {
        kind = wantHigh ? 'high' : 'low';
        // Ice keeps the speed the ball landed with, and steering waits for the next bounce. A
        // ball that lands still can steer (a wall hit stops a slide, see the X axis)
        s.lockVx = prim.t === T.ICE && s.vx !== 0 ? s.vx : null;
      }
    }
    s.jumpBuffer = 0;
    s.grace = kind === 'low' && !soft ? BOUNCE_GRACE : 0;
    s.surfaceY = top;
    s.bounces++;
    ev.push({ type: 'bounce', kind, x: s.x, y: top, idx: prim.idx });
  }

  step(dt: number, input: InputState): WorldEvent[] {
    const s = this.s;
    const ev: WorldEvent[] = [];
    if (s.status !== 'playing') return ev;
    s.time += dt;
    this.tick(ev);

    // Jump: buffered before landing, or "upgraded" to a high bounce right after it
    if (input.jumpPressed) {
      if (s.grace > 0 && s.vy < 0) {
        const h0 = s.surfaceY - (s.y + BALL_R);
        const rem = H_HIGH - h0;
        // In water or low gravity the same push goes further: keep the high bounce's speed for
        // the height left
        const g = s.water ? WATER_GRAVITY : s.zone ? ZONE_GRAVITY : 0;
        const v2 = g ? V_HIGH * V_HIGH - 2 * GRAVITY * g * h0 : 2 * GRAVITY * rem;
        if (rem > 0 && v2 > 0) {
          s.vy = -Math.sqrt(v2);
          ev.push({ type: 'boost' });
        }
        s.grace = 0;
      } else {
        s.jumpBuffer = JUMP_BUFFER;
      }
    }
    s.jumpBuffer = Math.max(0, s.jumpBuffer - dt);
    s.grace = Math.max(0, s.grace - dt);

    // Horizontal control (air control only, which is always)
    if (s.lockVx !== null) {
      s.vx = s.lockVx;
    } else {
      const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      if (dir !== 0) {
        const turning = Math.sign(s.vx) === -dir;
        s.vx += dir * (AIR_ACCEL + (turning ? AIR_DECEL : 0)) * dt;
        s.vx = Math.max(-MAX_VX, Math.min(MAX_VX, s.vx));
      } else if (s.vx !== 0) {
        const d = AIR_DECEL * dt;
        s.vx = Math.abs(s.vx) <= d ? 0 : s.vx - Math.sign(s.vx) * d;
      }
    }
    const r = Math.floor(s.y / TILE);
    const here = r >= 0 ? this.tileAt(Math.floor(s.x / TILE), r) : T.EMPTY;
    const wind = here === T.UPDRAFT;
    if (wind !== s.wind) {
      s.wind = wind;
      ev.push({ type: 'wind', inside: wind });
    }
    const cc = Math.floor(s.x / TILE);
    const field = r >= 0 && r < ROWS && cc >= 0 && cc < COLS ? this.level.field[r * COLS + cc] : 0;
    const water = field === FIELD.WATER;
    if (water !== s.water) {
      s.water = water;
      ev.push({ type: 'water', inside: water });
    }
    const zone = field === FIELD.ZONE;
    if (zone !== s.zone) {
      s.zone = zone;
      ev.push({ type: 'zone', inside: zone });
    }
    if (wind) s.vy = Math.max(s.vy - UPDRAFT_LIFT * dt, -UPDRAFT_VMAX);
    else if (water) s.vy = Math.min(s.vy + GRAVITY * WATER_GRAVITY * dt, WATER_MAX_FALL);
    else if (zone) s.vy = Math.min(s.vy + GRAVITY * ZONE_GRAVITY * dt, MAX_FALL);
    else s.vy = Math.min(s.vy + GRAVITY * dt, MAX_FALL);

    // X axis
    // Clouds never block sideways or from below
    if (s.vx !== 0) {
      s.x += s.vx * dt;
      const cells = this.overlaps().filter((c) => c.t !== T.CLOUD);
      if (cells.length) {
        const blocking = this.resolveContacts(cells, false, ev);
        if (!blocking) return ev;
        if (blocking.length) {
          const dir = Math.sign(s.vx);
          if (dir > 0) s.x = Math.min(...blocking.map((c) => c.c)) * TILE - BALL_R;
          else s.x = (Math.max(...blocking.map((c) => c.c)) + 1) * TILE + BALL_R;
          const bumper = blocking.find((c) => c.t === T.BUMPER);
          if (bumper) {
            // A bumper throws the ball back the way it came, always at the same speed, with a
            // small hop; steering waits for the next bounce
            s.lockVx = -dir * BUMP_VX;
            s.vx = s.lockVx;
            s.vy = Math.min(s.vy, -BUMP_VY);
            s.grace = 0;
            ev.push({ type: 'bump', idx: bumper.idx });
          } else {
            s.vx = 0;
            s.lockVx = null;
          }
        }
      }
    }

    // Y axis
    const prevBottom = s.y + BALL_R;
    s.y += s.vy * dt;
    // A cloud only catches the ball if it was above the cloud's top before this step
    const cells = this.overlaps().filter(
      (c) => c.t !== T.CLOUD || (s.vy > 0 && prevBottom <= c.r * TILE + 0.01),
    );
    if (cells.length) {
      if (s.vy > 0) {
        const row = Math.min(...cells.map((c) => c.r));
        let contacts = cells.filter((c) => c.r === row);
        // If the ball touches a ramp while landing, the ramp catches it even over a hazard
        if (contacts.some((c) => c.t === T.RAMP_L || c.t === T.RAMP_R)) {
          contacts = contacts.filter((c) => c.t !== T.SPIKE && c.t !== T.FIRE);
        }
        let blocking = this.resolveContacts(contacts, true, ev);
        if (!blocking) return ev;
        // A high bounce breaks thin ice: the ball falls through unless something else holds it
        const thin = blocking.filter((c) => c.t === T.THIN_ICE && c.idx >= 0);
        if (thin.length && (input.jump || s.jumpBuffer > 0)) {
          for (const c of thin) s.tiles[c.idx] = T.EMPTY;
          ev.push({ type: 'break', idxs: thin.map((c) => c.idx), tile: T.THIN_ICE });
          blocking = blocking.filter((c) => c.t !== T.THIN_ICE);
        }
        if (blocking.length) {
          s.y = row * TILE - BALL_R;
          this.bounce(blocking, row * TILE, input, ev);
        }
      } else if (s.vy < 0) {
        const row = Math.max(...cells.map((c) => c.r));
        const contacts = cells.filter((c) => c.r === row);
        const blocking = this.resolveContacts(contacts, true, ev);
        if (!blocking) return ev;
        if (blocking.length) {
          s.y = (row + 1) * TILE + BALL_R;
          s.vy = 0;
          s.grace = 0;
          ev.push({ type: 'bonk', x: s.x, y: s.y - BALL_R });
          if (this.primary(blocking).t === T.SWITCH) this.flipSwitches(ev);
        }
      }
    }

    if (s.y - BALL_R > ROWS * TILE) {
      this.die('fall', ev);
      return ev;
    }
    this.settle();
    if (this.partner.size) this.portals(ev);

    // Items
    for (let i = 0; i < s.items.length; i++) {
      const it = s.items[i];
      if (it.taken) continue;
      const dx = it.col * TILE + TILE / 2 - s.x;
      const dy = it.row * TILE + TILE / 2 - s.y;
      if (dx * dx + dy * dy > ITEM_RADIUS * ITEM_RADIUS) continue;
      it.taken = true;
      if (it.kind === 'gem') s.gemsTaken++;
      else if (it.kind === 'drop') s.drops++;
      else if (it.kind === 'hammer') s.hammers++;
      else if (it.kind === 'key') s.keys++;
      ev.push({ type: 'collect', item: i, kind: it.kind });
      if (it.kind === 'gem' && s.gemsTaken === s.gemsTotal) ev.push({ type: 'exitOpen' });
    }

    // Exit
    if (this.exitOpen) {
      const ex = this.level.exit.col * TILE + TILE / 2;
      const ey = this.level.exit.row * TILE + TILE / 2;
      const dx = ex - s.x;
      const dy = ey - s.y;
      if (dx * dx + dy * dy <= EXIT_RADIUS * EXIT_RADIUS) {
        s.status = 'won';
        ev.push({ type: 'win' });
      }
    }
    return ev;
  }
}
