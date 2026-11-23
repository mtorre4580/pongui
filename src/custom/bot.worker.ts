// Runs the solver off the main thread, so the editor and menus stay smooth while it searches.
import { toLevelData, type CustomLevelData } from '../game/custom';
import { parseLevel, type ParsedLevel } from '../game/level';
import { solve, type Decision } from '../game/solver';

export interface BotRequest {
  level: CustomLevelData;
}

/** Asks for the solution itself, to play it back ("watch the bot"). */
export interface PlanRequest {
  parsed: ParsedLevel;
}

export interface PlanReply {
  /** The bot's decisions, or null when it found no way to win. */
  plan: Decision[] | null;
}

export interface BotReply {
  solved: boolean;
  time: number;
  gems: number;
  /** Where the bot got furthest (center of the ball), to point at the problem. */
  x: number;
  y: number;
}

// The project compiles with the DOM library, where `self` is a window: type the worker scope
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<BotRequest | PlanRequest>) => void) | null;
  postMessage(message: BotReply | PlanReply): void;
};

scope.onmessage = (e) => {
  if ('parsed' in e.data) {
    const r = solve(e.data.parsed);
    scope.postMessage({ plan: r.solved ? r.plan : null });
    return;
  }
  const level = parseLevel(toLevelData(e.data.level));
  const r = solve(level);
  const reply: BotReply = {
    solved: r.solved,
    time: r.time,
    gems: r.best.items.filter((i) => i.startsWith('gem@')).length,
    x: r.best.x,
    y: r.best.y,
  };
  scope.postMessage(reply);
};
