// Automatic solution finder (search between bounces).
// Proves every level can be beaten with the real game physics.
import { STEP, TILE } from './constants';
import type { ParsedLevel } from './level';
import { T } from './tiles';
import {
  cloneState,
  timedCycle,
  World,
  type InputState,
  type WorldEvent,
  type WorldState,
} from './physics';

export interface Decision {
  dir: -1 | 0 | 1;
  dur: number; // seconds the direction is held
  jump: boolean; // jump held until the next bounce
}

export interface SolveResult {
  solved: boolean;
  nodes: number;
  plan: Decision[];
  time: number; // game seconds the solution takes
  /** For diagnosing unsolvable levels: the state that collected the most items. */
  best: { items: string[]; x: number; y: number; tilesChanged: number };
}

const DECISIONS: Decision[] = [];
for (const jump of [false, true]) {
  DECISIONS.push({ dir: 0, dur: 0, jump });
  for (const dir of [-1, 1] as const)
    for (const dur of [0.04, 0.1, 0.2, 99]) DECISIONS.push({ dir, dur, jump });
}

const MAX_FLIGHT_STEPS = 480;

// Timed tiles' phase goes into the key in buckets of this many steps
// (0.25 s): finer buckets multiply the states without finding better plans
const PHASE_STEPS = 30;

function hashTiles(s: WorldState): number {
  let h = 2166136261;
  for (let i = 0; i < s.tiles.length; i++) {
    // A crumbling block only counts as touched or not: its exact countdown multiplies the states
    const hits = s.tiles[i] === T.CRUMBLE ? (s.hits[i] > 0 ? 1 : 0) : s.hits[i];
    h ^= s.tiles[i] * 7 + hits;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function key(s: WorldState, cycle: number): string {
  let mask = 0;
  for (let i = 0; i < s.items.length; i++) if (s.items[i].taken) mask |= 1 << i;
  return `${Math.round(s.x / 2)}|${Math.round(s.y / 2)}|${Math.round(s.vx / 10)}|${Math.round(s.vy / 20)}|${s.lockVx ?? 'n'}|${s.drops}|${s.hammers}|${s.keys}|${mask}|${hashTiles(s)}|${s.switchOn ? 1 : 0}|${s.portalHold}|${cycle ? Math.floor((s.ticks % cycle) / PHASE_STEPS) : ''}`;
}

/**
 * A plan step lasts until the next bounce, until the ball enters or leaves an updraft or water
 * (so the plan can steer out at an updraft's top or change course as it sinks), until it comes
 * out of a portal, or until it breaks through thin ice (so it can let go of jump before the
 * next landing). Replays must split steps the same way.
 */
export const endsStep = (ev: WorldEvent[]) =>
  ev.some(
    (e) =>
      e.type === 'bounce' ||
      e.type === 'wind' ||
      e.type === 'water' ||
      e.type === 'portal' ||
      (e.type === 'break' && e.tile === T.THIN_ICE),
  );

type Outcome = 'bounce' | 'win' | 'dead' | 'timeout';

function fly(w: World, d: Decision): Outcome {
  const inp: InputState = { left: false, right: false, jump: d.jump, jumpPressed: false };
  for (let i = 0; i < MAX_FLIGHT_STEPS; i++) {
    const held = i * STEP < d.dur;
    inp.left = held && d.dir < 0;
    inp.right = held && d.dir > 0;
    const ev = w.step(STEP, inp);
    if (w.s.status === 'won') return 'win';
    if (w.s.status === 'dead') return 'dead';
    if (endsStep(ev)) return 'bounce';
  }
  return 'timeout';
}

/** Searches for a solution from the level's start, or from `start` (to test recoveries). */
export function solve(level: ParsedLevel, maxNodes = 400000, start?: WorldState): SolveResult {
  const world = new World(level);
  if (start) world.s = cloneState(start);
  const seen = new Set<string>();
  const cycle = timedCycle(level);
  type Node = { s: WorldState; parent: Node | null; d: Decision | null };
  // Best-first search: states with more collected items are expanded first, and among those
  // the ones nearest to something still to collect (or to the exit once nothing is left)
  const taken = (s: WorldState) => s.items.reduce((n, i) => n + (i.taken ? 1 : 0), 0);
  const targets = (s: WorldState) => {
    const out = s.items
      .filter((i) => !i.taken && i.kind !== 'life')
      .map((i) => [i.col * TILE + TILE / 2, i.row * TILE + TILE / 2]);
    if (!out.length) out.push([level.exit.col * TILE + TILE / 2, level.exit.row * TILE + TILE / 2]);
    return out;
  };
  const score = (s: WorldState) => {
    let d = Infinity;
    for (const [x, y] of targets(s)) d = Math.min(d, Math.hypot(x - s.x, y - s.y));
    return taken(s) * 100000 - d;
  };
  // Without timed tiles, plain breadth-first order inside each item count finds the fastest
  // plans. With them, the phase multiplies the states, so the nearest target goes first.
  const guided = cycle > 0;
  // Untimed levels: one FIFO queue per item count (breadth-first inside each, the fastest
  // plans). Timed levels: a binary heap on the guided score.
  const buckets: Node[][] = [];
  const heads: number[] = [];
  const heap: { n: Node; score: number; order: number }[] = [];
  let order = 0;
  const above = (a: number, b: number) =>
    heap[a].score > heap[b].score ||
    (heap[a].score === heap[b].score && heap[a].order < heap[b].order);
  const push = (n: Node) => {
    if (!guided) {
      const b = taken(n.s);
      (buckets[b] ??= []).push(n);
      heads[b] ??= 0;
      return;
    }
    heap.push({ n, score: score(n.s), order: order++ });
    for (let i = heap.length - 1; i > 0;) {
      const p = (i - 1) >> 1;
      if (!above(i, p)) break;
      [heap[i], heap[p]] = [heap[p], heap[i]];
      i = p;
    }
  };
  const pop = (): Node | null => {
    if (!guided) {
      for (let b = buckets.length - 1; b >= 0; b--) {
        const q = buckets[b];
        if (q && heads[b] < q.length) return q[heads[b]++];
      }
      return null;
    }
    if (!heap.length) return null;
    const top = heap[0].n;
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && above(l, m)) m = l;
        if (r < heap.length && above(r, m)) m = r;
        if (m === i) break;
        [heap[i], heap[m]] = [heap[m], heap[i]];
        i = m;
      }
    }
    return top;
  };
  const planOf = (n: Node | null, last: Decision): Decision[] => {
    const out = [last];
    for (let p = n; p && p.d; p = p.parent) out.push(p.d);
    return out.reverse();
  };
  const summary = (s: WorldState) => ({
    items: s.items.filter((i) => i.taken).map((i) => `${i.kind}@${i.col},${i.row}`),
    x: Math.round(s.x),
    y: Math.round(s.y),
    tilesChanged: s.tiles.reduce((n, t, i) => n + (t !== level.tiles[i] ? 1 : 0), 0),
  });

  push({ s: cloneState(world.s), parent: null, d: null });
  seen.add(key(world.s, cycle));
  let nodes = 0;
  let best = world.s;
  for (let node = pop(); node && nodes < maxNodes; node = pop()) {
    for (const d of DECISIONS) {
      if (node.s.lockVx !== null && d.dir !== 0) continue; // direction does not matter on a ramp
      world.s = cloneState(node.s);
      const out = fly(world, d);
      nodes++;
      if (out === 'win')
        return {
          solved: true,
          nodes,
          plan: planOf(node, d),
          time: world.s.time,
          best: summary(world.s),
        };
      if (out !== 'bounce') continue;
      const k = key(world.s, cycle);
      if (seen.has(k)) continue;
      seen.add(k);
      if (taken(world.s) > taken(best)) best = world.s;
      push({ s: world.s, parent: node, d });
    }
  }
  return { solved: false, nodes, plan: [], time: 0, best: summary(best) };
}
