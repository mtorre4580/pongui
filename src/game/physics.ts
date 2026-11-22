import {
  AIR_ACCEL,
  AIR_DECEL,
  BALL_R,
  BOUNCE_GRACE,
  COLS,
  EXIT_RADIUS,
  GRAVITY,
  H_HIGH,
  ITEM_RADIUS,
  JUMP_BUFFER,
  MAX_FALL,
  MAX_VX,
  RAMP_VX,
  ROWS,
  TILE,
  V_HIGH,
  V_LOW,
  V_SPRING,
} from './constants';
import type { ItemKind, ParsedLevel } from './level';
import { fragileMax, T } from './tiles';

export interface InputState {
  left: boolean;
  right: boolean;
  jump: boolean; // button held
  jumpPressed: boolean; // edge: pressed during this step
}

export type BounceKind = 'low' | 'high' | 'spring' | 'ramp';
export type DeathCause = 'fall' | 'spike' | 'fire';

export type WorldEvent =
  | { type: 'bounce'; kind: BounceKind; x: number; y: number; idx: number }
  | { type: 'boost' }
  | { type: 'bonk'; x: number; y: number }
  | { type: 'crack'; idx: number; hits: number }
  | { type: 'break'; idxs: number[]; tile: number }
  | { type: 'extinguish'; idxs: number[] }
  | { type: 'collect'; item: number; kind: ItemKind }
  | { type: 'exitOpen' }
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
  gemsTaken: number;
  gemsTotal: number;
  status: 'playing' | 'dead' | 'won';
  time: number;
  bounces: number;
  jumpBuffer: number;
  grace: number;
  surfaceY: number;
}

interface Cell {
  c: number;
  r: number;
  idx: number; // -1 = outside the map
  t: number;
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
      gemsTaken: 0,
      gemsTotal: level.gems,
      status: 'playing',
      time: 0,
      bounces: 0,
      jumpBuffer: 0,
      grace: 0,
      surfaceY: 0,
    };
  }

  get exitOpen(): boolean {
    return this.s.gemsTaken >= this.s.gemsTotal;
  }

  tileAt(c: number, r: number): number {
    if (c < 0 || c >= COLS || r < 0) return T.SOLID;
    if (r >= ROWS) return T.EMPTY;
    return this.s.tiles[r * COLS + c];
  }

  private overlaps(): Cell[] {
    const { x, y } = this.s;
    const c0 = Math.floor((x - BALL_R) / TILE);
    const c1 = Math.ceil((x + BALL_R) / TILE) - 1;
    const r0 = Math.floor((y - BALL_R) / TILE);
    const r1 = Math.ceil((y + BALL_R) / TILE) - 1;
    const out: Cell[] = [];
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const t = this.tileAt(c, r);
        if (t === T.EMPTY) continue;
        const inside = c >= 0 && c < COLS && r >= 0 && r < ROWS;
        out.push({ c, r, idx: inside ? r * COLS + c : -1, t });
      }
    }
    return out;
  }

  private die(cause: DeathCause, ev: WorldEvent[]) {
    this.s.status = 'dead';
    ev.push({ type: 'die', cause });
  }

  /** Breaks every wall tile connected to the given cells. */
  private floodWalls(seeds: Cell[]): number[] {
    const s = this.s;
    const stack = seeds.filter((c) => c.idx >= 0).map((c) => c.idx);
    const out: number[] = [];
    while (stack.length) {
      const idx = stack.pop()!;
      if (s.tiles[idx] !== T.WALL) continue;
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
      const idxs = this.floodWalls(walls);
      ev.push({ type: 'break', idxs, tile: T.WALL });
    }
    return cells.filter((c) => this.tileAt(c.c, c.r) !== T.EMPTY);
  }

  private bounce(cells: Cell[], top: number, input: InputState, ev: WorldEvent[]) {
    const s = this.s;
    const pc = Math.floor(s.x / TILE);
    let prim = cells.find((c) => c.c === pc);
    if (!prim) {
      prim = cells.reduce((a, b) =>
        Math.abs(a.c * TILE + TILE / 2 - s.x) <= Math.abs(b.c * TILE + TILE / 2 - s.x) ? a : b,
      );
    }

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

    const wantHigh = input.jump || s.jumpBuffer > 0;
    const isRamp = (c: Cell) => c.t === T.RAMP_L || c.t === T.RAMP_R;
    // Ramps "catch" the ball as soon as it touches them (even with its edge), so they cannot
    // be skipped by accident, and always launch it the same way from the ramp's center:
    // a high, predictable jump without pressing anything.
    const ramp =
      prim.t === T.SPRING
        ? undefined
        : isRamp(prim)
          ? prim
          : cells
              .filter(isRamp)
              .sort(
                (a, b) =>
                  Math.abs(a.c * TILE + TILE / 2 - s.x) - Math.abs(b.c * TILE + TILE / 2 - s.x),
              )[0];
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
      } else {
        kind = wantHigh ? 'high' : 'low';
        s.lockVx = null;
      }
    }
    s.jumpBuffer = 0;
    s.grace = kind === 'low' ? BOUNCE_GRACE : 0;
    s.surfaceY = top;
    s.bounces++;
    ev.push({ type: 'bounce', kind, x: s.x, y: top, idx: prim.idx });
  }

  step(dt: number, input: InputState): WorldEvent[] {
    const s = this.s;
    const ev: WorldEvent[] = [];
    if (s.status !== 'playing') return ev;
    s.time += dt;

    // Jump: buffered before landing, or "upgraded" to a high bounce right after it
    if (input.jumpPressed) {
      if (s.grace > 0 && s.vy < 0) {
        const h0 = s.surfaceY - (s.y + BALL_R);
        const rem = H_HIGH - h0;
        if (rem > 0) {
          s.vy = -Math.sqrt(2 * GRAVITY * rem);
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
    s.vy = Math.min(s.vy + GRAVITY * dt, MAX_FALL);

    // X axis
    if (s.vx !== 0) {
      s.x += s.vx * dt;
      const cells = this.overlaps();
      if (cells.length) {
        const blocking = this.resolveContacts(cells, false, ev);
        if (!blocking) return ev;
        if (blocking.length) {
          if (s.vx > 0) s.x = Math.min(...blocking.map((c) => c.c)) * TILE - BALL_R;
          else s.x = (Math.max(...blocking.map((c) => c.c)) + 1) * TILE + BALL_R;
          s.vx = 0;
          s.lockVx = null;
        }
      }
    }

    // Y axis
    s.y += s.vy * dt;
    const cells = this.overlaps();
    if (cells.length) {
      if (s.vy > 0) {
        const row = Math.min(...cells.map((c) => c.r));
        let contacts = cells.filter((c) => c.r === row);
        // If the ball touches a ramp while landing, the ramp catches it even over a hazard
        if (contacts.some((c) => c.t === T.RAMP_L || c.t === T.RAMP_R)) {
          contacts = contacts.filter((c) => c.t !== T.SPIKE && c.t !== T.FIRE);
        }
        const blocking = this.resolveContacts(contacts, true, ev);
        if (!blocking) return ev;
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
        }
      }
    }

    if (s.y - BALL_R > ROWS * TILE) {
      this.die('fall', ev);
      return ev;
    }

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
