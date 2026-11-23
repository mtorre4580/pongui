// Asks the bot (the level solver, in a Web Worker) whether a level can be beaten.
import { draftIssues, mapHash, type CustomLevelData } from '../game/custom';
import type { BotReply, BotRequest } from './bot.worker';

export interface BotCheck extends BotReply {
  hash: string;
}

let worker: Worker | null = null;
let pending: ((r: BotCheck | null) => void) | null = null;

/** Stops the search in progress (its promise resolves with null). */
export function cancelBot() {
  worker?.terminate();
  worker = null;
  pending?.(null);
  pending = null;
}

/**
 * Searches for a solution. A new check cancels the previous one (the solver cannot be
 * interrupted, so its worker is replaced). Resolves with null when cancelled or when the level
 * cannot even be parsed.
 */
export function checkLevel(level: CustomLevelData): Promise<BotCheck | null> {
  cancelBot();
  if (draftIssues(level.map).length) return Promise.resolve(null);
  const hash = mapHash(level.map, level.dark);
  return new Promise((resolve) => {
    pending = resolve;
    const w = new Worker(new URL('./bot.worker.ts', import.meta.url), { type: 'module' });
    worker = w;
    const done = (r: BotCheck | null) => {
      if (worker !== w) return;
      w.terminate();
      worker = null;
      pending = null;
      resolve(r);
    };
    w.onmessage = (e: MessageEvent<BotReply>) => done({ ...e.data, hash });
    w.onerror = () => done(null);
    const req: BotRequest = {
      level: { name: '', theme: 1, dark: level.dark, par: null, map: level.map },
    };
    w.postMessage(req);
  });
}
