// Asks the bot (the level solver, in a Web Worker) whether a level can be beaten.
import { draftIssues, mapHash, type CustomLevelData } from '../game/custom';
import type { ParsedLevel } from '../game/level';
import type { Decision } from '../game/solver';
import type { BotReply, BotRequest, PlanReply, PlanRequest } from './bot.worker';

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

/**
 * Asks the bot how it beats a level, to play its solution back. Each call has a worker of its
 * own (apart from the editor's checks); `cancel()` stops the search. Resolves with null when
 * there is no solution or the worker fails.
 */
export function planFor(level: ParsedLevel): { plan: Promise<Decision[] | null>; cancel(): void } {
  const w = new Worker(new URL('./bot.worker.ts', import.meta.url), { type: 'module' });
  let settle: (plan: Decision[] | null) => void = () => undefined;
  const plan = new Promise<Decision[] | null>((resolve) => {
    settle = (value) => {
      w.terminate();
      resolve(value);
    };
    w.onmessage = (e: MessageEvent<PlanReply>) => settle(e.data.plan);
    w.onerror = () => settle(null);
  });
  const req: PlanRequest = { parsed: level };
  w.postMessage(req);
  return { plan, cancel: () => settle(null) };
}
