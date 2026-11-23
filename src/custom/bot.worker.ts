// Runs the solver off the main thread, so the editor and menus stay smooth while it searches.
import { toLevelData, type CustomLevelData } from '../game/custom';
import { parseLevel } from '../game/level';
import { solve } from '../game/solver';

export interface BotRequest {
  level: CustomLevelData;
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
  onmessage: ((e: MessageEvent<BotRequest>) => void) | null;
  postMessage(message: BotReply): void;
};

scope.onmessage = (e) => {
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
