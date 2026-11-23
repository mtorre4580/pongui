/**
 * Validates every level in src/levels: the map parses, every text exists in all languages
 * and the automatic solver can beat it with the real game physics. Levels are solved in
 * parallel worker threads (one per CPU core).
 * Usage: pnpm validate:levels
 */
import { readdirSync, readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { isMainThread, parentPort, Worker } from 'node:worker_threads';
import { parseLevel, type LevelData } from '../src/game/level.ts';
import { solve } from '../src/game/solver.ts';

const LOCALES = ['en', 'es', 'pt-BR'] as const;
const DIR = 'src/levels';

type Row = Record<string, string | number>;
interface Result {
  index: number;
  row?: Row;
  errors: string[];
}

/** Checks one level file: texts, solvability and par time. */
function check(file: string, index: number): Result {
  const errors: string[] = [];
  const data = JSON.parse(readFileSync(join(DIR, file), 'utf8')) as LevelData;
  try {
    const level = parseLevel(data);
    for (const locale of LOCALES) {
      if (!level.name[locale]?.trim()) errors.push(`${file}: missing name in ${locale}`);
      if (level.hint && !level.hint[locale]?.trim())
        errors.push(`${file}: missing hint in ${locale}`);
      if (level.hintTouch && !level.hintTouch[locale]?.trim())
        errors.push(`${file}: missing touch hint in ${locale}`);
    }
    const started = performance.now();
    const result = solve(level);
    const row: Row = {
      level: level.id,
      name: level.name.en,
      solved: result.solved ? 'yes' : 'NO',
      bounces: result.plan.length,
      'bot time (s)': Number(result.time.toFixed(1)),
      'par (s)': level.par,
      'search (ms)': Math.round(performance.now() - started),
    };
    if (!result.solved) {
      errors.push(`${file}: no solution found. Best state: ${JSON.stringify(result.best)}`);
    } else if (result.time > level.par) {
      errors.push(
        `${file}: the par time (${level.par}s) is lower than the bot's (${result.time.toFixed(1)}s)`,
      );
    }
    return { index, row, errors };
  } catch (e) {
    return { index, errors: [...errors, `${file}: ${(e as Error).message}`] };
  }
}

if (isMainThread) {
  // Numeric order (w2 before w10), like the game
  const num = (f: string) => f.match(/\d+/g)!.map(Number);
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith('.json'))
    .sort((a, b) => num(a)[0] - num(b)[0] || num(a)[1] - num(b)[1]);

  const results: Result[] = [];
  let next = 0;
  const workers = Math.max(1, Math.min(availableParallelism(), files.length));
  await Promise.all(
    Array.from(
      { length: workers },
      () =>
        new Promise<void>((resolve, reject) => {
          // Same script and loader (tsx) in each worker
          const worker = new Worker(new URL(import.meta.url), { execArgv: process.execArgv });
          const feed = () => {
            if (next >= files.length) {
              void worker.terminate().then(() => resolve());
              return;
            }
            const index = next++;
            worker.postMessage({ file: files[index], index });
          };
          worker.on('message', (r: Result) => {
            results.push(r);
            feed();
          });
          worker.on('error', reject);
          feed();
        }),
    ),
  );

  results.sort((a, b) => a.index - b.index);
  console.table(results.flatMap((r) => (r.row ? [r.row] : [])));
  const errors = results.flatMap((r) => r.errors);
  if (errors.length) {
    console.error(`\n${errors.length} problem(s):`);
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
  }
  console.log(`\nAll ${files.length} levels are valid and solvable.`);
} else {
  parentPort!.on('message', ({ file, index }: { file: string; index: number }) => {
    parentPort!.postMessage(check(file, index));
  });
}
