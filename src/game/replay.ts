// Plays a solver plan back, one physics step at a time: the input the bot would give now.
import type { InputState, WorldEvent } from './physics';
import { endsStep, type Decision } from './solver';

/**
 * A plan is one decision per stretch between bounces (and the other events that end a step):
 * hold a direction for some time, with jump held or not. Ask `input()` before each physics step
 * and report the step's events with `advance()`.
 */
export class PlanPlayer {
  private index = 0;
  private steps = 0;

  constructor(
    private readonly plan: readonly Decision[],
    private readonly dt: number,
  ) {}

  /** True once the plan has no decisions left: the level should be over by then. */
  get finished(): boolean {
    return this.index >= this.plan.length;
  }

  input(): InputState {
    const d = this.plan[this.index];
    if (!d) return { left: false, right: false, jump: false, jumpPressed: false };
    const held = this.steps * this.dt < d.dur;
    return { left: held && d.dir < 0, right: held && d.dir > 0, jump: d.jump, jumpPressed: false };
  }

  advance(events: WorldEvent[]) {
    this.steps++;
    if (endsStep(events)) {
      this.index++;
      this.steps = 0;
    }
  }
}
