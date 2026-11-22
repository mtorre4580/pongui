import { describe, expect, it } from 'vitest';
import { solve } from '../src/game/solver';
import { LEVELS } from '../src/levels';

describe('niveles', () => {
  it('hay 10 niveles', () => expect(LEVELS).toHaveLength(10));
  for (const lvl of LEVELS) {
    it(`${lvl.id} "${lvl.name}" tiene solución`, () => {
      const r = solve(lvl);
      console.log(`${lvl.id}: solved=${r.solved} nodes=${r.nodes} bounces=${r.plan.length} time=${r.time.toFixed(1)}s (par ${lvl.par}s)`);
      if (!r.solved) console.log('  mejor estado:', JSON.stringify(r.best));
      expect(r.solved).toBe(true);
    });
  }
});
