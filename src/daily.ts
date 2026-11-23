// The level of the day: one of the game's levels, the same for everyone on the same date, and a
// streak of consecutive days. No server: the date picks the level and the save keeps the streak.
import { loadSave, persist, type SaveData } from './save';

const DAY_MS = 86_400_000;

/**
 * The player's calendar date as a day count (days since 1970 of that date). Local time, so the
 * level changes at the player's midnight and a streak follows their own days.
 */
export const dayNumber = (date: Date = new Date()) =>
  Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);

/** Small seeded generator (mulberry32): the same shuffle on every device. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The first levels only teach the controls: never the level of the day. */
const SKIPPED = 2;

/**
 * Index of the level of a day. The levels are shuffled once per cycle (a cycle is as many days
 * as there are levels to pick from), so none repeats until all were played, and every cycle has
 * its own order.
 */
export function dailyIndex(day: number, total: number): number {
  const pool = Math.max(1, total - SKIPPED);
  const cycle = Math.floor(day / pool);
  const order = Array.from({ length: pool }, (_, i) => i);
  const next = random(0x706f6e67 + cycle);
  for (let i = pool - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return Math.min(total - 1, SKIPPED + order[((day % pool) + pool) % pool]);
}

export interface DailyRecord {
  /** Day number of the last level of the day that was beaten. */
  last: number;
  /** Consecutive days up to `last`. */
  streak: number;
  /** Longest streak ever. */
  best: number;
}

/** Where the player stands today: whether today's level is done and the streak still alive. */
export function dailyStatus(record: DailyRecord | undefined, day: number) {
  const done = record?.last === day;
  // A streak survives until the end of the day after the last win
  const alive = !!record && day - record.last <= 1;
  return { done, streak: alive ? record.streak : 0, best: record?.best ?? 0 };
}

/** The record after beating the level of `day`. Beating it again the same day changes nothing. */
export function afterDailyWin(record: DailyRecord | undefined, day: number): DailyRecord {
  if (record?.last === day) return record;
  const streak = record && day - record.last === 1 ? record.streak + 1 : 1;
  return { last: day, streak, best: Math.max(record?.best ?? 0, streak) };
}

export const todayStatus = (save: SaveData = loadSave()) => dailyStatus(save.daily, dayNumber());

/** Records today's win and returns the streak. */
export function recordDailyWin(): number {
  let streak = 1;
  persist((s) => {
    s.daily = afterDailyWin(s.daily, dayNumber());
    streak = s.daily.streak;
  });
  return streak;
}
