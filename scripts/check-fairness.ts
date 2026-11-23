/**
 * Fairness checks for levels. The solver proves a level can be beaten; these checks look for
 * spots that a person cannot do reliably.
 *
 *   pnpm check:fairness tolerance <w3 | w3-07 ...>
 *     Replays the bot's plan and, at every step, perturbs the input (timing and duration noise).
 *     Each variant is "ok" (won, or still winnable from there), "dead" (a mistake that kills is
 *     fine) or "STUCK" (alive but the level can no longer be won). Steps with STUCK variants
 *     demand precision without warning: fix them. Exits with 1 if a step has 4+ of 8 stuck.
 *     Levels run in parallel worker threads.
 *
 *   pnpm check:fairness jump <id> <col> <row> <left|right> [low|high]
 *     The ball rests on top of tile (col, row) and bounces (high by default), holding the
 *     direction after 0, 0.1, 0.2 or 0.3 s of reaction time. Prints where it lands. Use it for
 *     every key jump: the bot often arrives with momentum a person will not have.
 *
 *   pnpm check:fairness hover <id> <col> <row> <left|right>
 *     The ball floats in the updraft cell (col, row) and steers out at 40 moments of the hover.
 *     Prints where it lands.
 *
 *   pnpm check:fairness sweep <id> <left|right>
 *     From the start, holds the direction from different moments (0–0.6 s) for different times,
 *     then lets go. Tallies, after 3 s, which items were taken and whether the ball is alive.
 *     Use it for items on falling paths: they must be on the line people actually take.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { isMainThread, parentPort, Worker } from 'node:worker_threads';
import { BALL_R, STEP, TILE } from '../src/game/constants.ts';
import { parseLevel, type ParsedLevel } from '../src/game/level.ts';
import { cloneState, World, type InputState } from '../src/game/physics.ts';
import { endsStep, solve, type Decision } from '../src/game/solver.ts';

const DIR = 'src/levels';

function load(id: string): ParsedLevel {
  return parseLevel(JSON.parse(readFileSync(join(DIR, `${id}.json`), 'utf8')));
}

/** `w3` → every level of world 3; `w3-07` → that level. */
function ids(args: string[]): string[] {
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5));
  return args.flatMap((a) =>
    /^w\d+$/.test(a) ? files.filter((f) => f.startsWith(`${a}-`)).sort() : [a],
  );
}

const input = (left: boolean, right: boolean, jump = false): InputState => ({
  left,
  right,
  jump,
  jumpPressed: false,
});

/** Lands where? "row R col C", "dead" or "none" (still in the air or hovering). */
function landing(w: World, ev: ReturnType<World['step']>): string | null {
  if (w.s.status === 'dead') return 'dead';
  if (w.s.status === 'won') return 'won';
  const b = ev.find((e) => e.type === 'bounce');
  return b ? `row ${b.y / TILE}` : null;
}

function tally(list: string[]) {
  const out: Record<string, number> = {};
  for (const k of list) out[k] = (out[k] ?? 0) + 1;
  return out;
}

// ---------- tolerance ----------

const VARIANTS: [number, number][] = [
  [0, -0.04],
  [0, 0.04],
  [0.03, 0],
  [0.05, 0.02],
  [0, -0.08],
  [0, 0.08],
  [0.06, -0.03],
  [0.02, 0.06],
];

function fly(w: World, d: Decision, delay: number, dur: number) {
  const inp = input(false, false, d.jump);
  for (let i = 0; i < 480; i++) {
    const t = i * STEP;
    const held = t >= delay && t < delay + dur;
    inp.left = held && d.dir < 0;
    inp.right = held && d.dir > 0;
    const ev = w.step(STEP, inp);
    if (w.s.status !== 'playing' || endsStep(ev)) return;
  }
}

/** Perturbs every step of the bot's plan for one level (see the header). */
function toleranceOf(id: string): { line: string; bad: boolean } {
  const level = load(id);
  const { plan, solved } = solve(level);
  if (!solved) return { line: `${id}: no solution`, bad: true };
  const w = new World(level);
  const cells: string[] = [];
  let worst = 0;
  plan.forEach((d) => {
    const before = cloneState(w.s);
    let stuck = 0;
    let dead = 0;
    for (const [delay, dd] of VARIANTS) {
      const t = new World(level);
      t.s = cloneState(before);
      const dur = d.dur >= 99 ? 99 : Math.max(0, d.dur + dd);
      fly(t, d, d.dir === 0 ? 0 : delay, d.dir === 0 ? 0 : dur);
      if (t.s.status === 'dead') dead++;
      else if (t.s.status !== 'won' && !solve(level, 400000, t.s).solved) stuck++;
    }
    worst = Math.max(worst, stuck);
    cells.push(stuck ? `S${stuck}` : dead ? `d${dead}` : '.');
    fly(w, d, 0, d.dur);
  });
  return {
    line: `${id.padEnd(6)} ${worst >= 4 ? 'FIX ' : worst ? 'look' : 'ok  '} steps: ${cells.join(' ')}`,
    bad: worst >= 4,
  };
}

/** Checks the levels in parallel worker threads and prints them in order. */
async function tolerance(list: string[]): Promise<boolean> {
  const results: { line: string; bad: boolean }[] = [];
  let next = 0;
  let printed = 0;
  const workers = Math.max(1, Math.min(availableParallelism(), list.length));
  await Promise.all(
    Array.from(
      { length: workers },
      () =>
        new Promise<void>((resolve, reject) => {
          // Same script and loader (tsx) in each worker
          const worker = new Worker(new URL(import.meta.url), { execArgv: process.execArgv });
          const feed = () => {
            if (next >= list.length) {
              void worker.terminate().then(() => resolve());
              return;
            }
            const index = next++;
            worker.once('message', (r: { line: string; bad: boolean }) => {
              results[index] = r;
              // Print as soon as every level before this one is done
              while (results[printed]) console.log(results[printed++].line);
              feed();
            });
            worker.postMessage(list[index]);
          };
          worker.on('error', reject);
          feed();
        }),
    ),
  );
  console.log('\n. = every variant still winnable · dN = N of 8 died · SN = N of 8 STUCK');
  return !results.some((r) => r.bad);
}

// ---------- jump / hover / sweep ----------

function jump(id: string, col: number, row: number, dir: number, high: boolean) {
  const level = load(id);
  const out: string[] = [];
  for (const delay of [0, 0.1, 0.2, 0.3]) {
    const w = new World(level);
    w.s.x = col * TILE + TILE / 2;
    w.s.y = row * TILE - BALL_R;
    w.s.vy = 1; // about to land on the tile
    let res = 'none';
    for (let i = 0; i < 600; i++) {
      const t = i * STEP;
      const ev = w.step(STEP, input(t >= delay && dir < 0, t >= delay && dir > 0, high && i < 3));
      const l = i > 3 ? landing(w, ev) : w.s.status === 'dead' ? 'dead' : null;
      if (l) {
        res = l;
        break;
      }
    }
    out.push(`delay ${delay}s → ${res}`);
  }
  console.log(`${id} from the top of (${col}, ${row}), ${high ? 'high' : 'low'} bounce:`);
  for (const line of out) console.log(`  ${line}`);
}

function hover(id: string, col: number, row: number, dir: number) {
  const level = load(id);
  const results: string[] = [];
  for (let k = 0; k < 40; k++) {
    const w = new World(level);
    w.s.x = col * TILE + TILE / 2;
    w.s.y = row * TILE + TILE / 2;
    const wait = 1.5 + k * 0.0125; // a sweep over half a second of hovering
    let res = 'none';
    for (let i = 0; i < 1200; i++) {
      const t = i * STEP;
      const go = t > wait;
      const ev = w.step(STEP, input(go && dir < 0, go && dir > 0));
      const l = landing(w, ev);
      if (l && (go || l === 'dead')) {
        res = l;
        break;
      }
    }
    results.push(res);
  }
  console.log(`${id} steering out of (${col}, ${row}) at 40 moments:`, tally(results));
}

function sweep(id: string, dir: number) {
  const level = load(id);
  const results: string[] = [];
  for (let t0 = 0; t0 < 0.6; t0 += 0.05) {
    for (const hold of [0.1, 0.2, 0.35, 0.5, 0.8, 1.2, 99]) {
      const w = new World(level);
      for (let i = 0; i < 360 && w.s.status === 'playing'; i++) {
        const t = i * STEP;
        const held = t >= t0 && t < t0 + hold;
        w.step(STEP, input(held && dir < 0, held && dir > 0));
      }
      const items = w.s.items
        .filter((it) => it.taken)
        .map((it) => `${it.kind}@${it.col},${it.row}`)
        .join(' ');
      results.push(`${w.s.status === 'dead' ? 'dead' : 'alive'}${items ? ` + ${items}` : ''}`);
    }
  }
  console.log(`${id} from the start holding ${dir < 0 ? 'left' : 'right'} (84 ways):`);
  for (const [k, n] of Object.entries(tally(results)).sort((a, b) => b[1] - a[1]))
    console.log(`  ${String(n).padStart(3)} × ${k}`);
}

// ---------- main ----------

if (!isMainThread) {
  // A tolerance worker: one level id in, its line out
  parentPort!.on('message', (id: string) => parentPort!.postMessage(toleranceOf(id)));
} else {
  const [cmd, ...args] = process.argv.slice(2);
  const dirOf = (s: string) => (s === 'left' ? -1 : 1);
  if (cmd === 'tolerance' && args.length) {
    if (!(await tolerance(ids(args)))) process.exit(1);
  } else if (cmd === 'jump' && args.length >= 4) {
    jump(args[0], Number(args[1]), Number(args[2]), dirOf(args[3]), args[4] !== 'low');
  } else if (cmd === 'hover' && args.length >= 4) {
    hover(args[0], Number(args[1]), Number(args[2]), dirOf(args[3]));
  } else if (cmd === 'sweep' && args.length >= 2) {
    sweep(args[0], dirOf(args[1]));
  } else {
    console.log(
      'Usage: pnpm check:fairness tolerance <w3 | w3-07 ...>\n' +
        '       pnpm check:fairness jump <id> <col> <row> <left|right> [low|high]\n' +
        '       pnpm check:fairness hover <id> <col> <row> <left|right>\n' +
        '       pnpm check:fairness sweep <id> <left|right>',
    );
    process.exit(cmd ? 1 : 0);
  }
}
