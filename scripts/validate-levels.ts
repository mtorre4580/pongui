/**
 * Validates every level in src/levels: the map parses, every text exists in all languages
 * and the automatic solver can beat it with the real game physics.
 * Usage: pnpm validate:levels
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLevel, type LevelData } from '../src/game/level.ts';
import { solve } from '../src/game/solver.ts';

const LOCALES = ['en', 'es', 'pt-BR'] as const;
const DIR = 'src/levels';

const files = readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .sort();

const errors: string[] = [];
const rows: Record<string, string | number>[] = [];

for (const file of files) {
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
    rows.push({
      level: level.id,
      name: level.name.en,
      solved: result.solved ? 'yes' : 'NO',
      bounces: result.plan.length,
      'bot time (s)': Number(result.time.toFixed(1)),
      'par (s)': level.par,
      'search (ms)': Math.round(performance.now() - started),
    });
    if (!result.solved) {
      errors.push(`${file}: no solution found. Best state: ${JSON.stringify(result.best)}`);
    } else if (result.time > level.par) {
      errors.push(
        `${file}: the par time (${level.par}s) is lower than the bot's (${result.time.toFixed(1)}s)`,
      );
    }
  } catch (e) {
    errors.push(`${file}: ${(e as Error).message}`);
  }
}

console.table(rows);
if (errors.length) {
  console.error(`\n${errors.length} problem(s):`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`\nAll ${files.length} levels are valid and solvable.`);
