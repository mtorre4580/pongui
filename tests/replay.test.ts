import { describe, expect, it } from 'vitest';
import { STEP } from '../src/game/constants';
import { World } from '../src/game/physics';
import { PlanPlayer } from '../src/game/replay';
import { solve } from '../src/game/solver';
import { LEVELS } from '../src/levels';

/** Plays a level with the bot's plan the way the game does: one input per physics step. */
function watch(index: number) {
  const level = LEVELS[index];
  const { plan, solved } = solve(level);
  const world = new World(level);
  const player = new PlanPlayer(plan, STEP);
  for (let i = 0; i < 120 * 120 && world.s.status === 'playing'; i++) {
    const events = world.step(STEP, player.input());
    player.advance(events);
  }
  return { solved, status: world.s.status, id: level.id };
}

describe('watching the bot', () => {
  // The finale of every world: each one mixes that world's mechanics (solving takes about a
  // second per level, so not all hundred)
  const sample = LEVELS.map((_, i) => i).filter((i) => i % 10 === 9);

  it.each(sample)('replaying the plan of level %i wins it', (index) => {
    expect(watch(index)).toMatchObject({ solved: true, status: 'won' });
  });

  it('gives no input once the plan is over', () => {
    const player = new PlanPlayer([], STEP);
    expect(player.finished).toBe(true);
    expect(player.input()).toEqual({ left: false, right: false, jump: false, jumpPressed: false });
  });
});
