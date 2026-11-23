import { describe, expect, it } from 'vitest';
import { afterDailyWin, dailyIndex, dailyStatus, dayNumber } from '../src/daily';

describe('level of the day', () => {
  it('numbers days by the calendar date, whatever the hour', () => {
    const morning = dayNumber(new Date(2026, 10, 23, 0, 5));
    const night = dayNumber(new Date(2026, 10, 23, 23, 55));
    expect(night).toBe(morning);
    expect(dayNumber(new Date(2026, 10, 24, 0, 5))).toBe(morning + 1);
    // Across a month and a year
    expect(dayNumber(new Date(2027, 0, 1))).toBe(dayNumber(new Date(2026, 11, 31)) + 1);
  });

  it('gives the same level to everyone on the same day', () => {
    expect(dailyIndex(20_000, 100)).toBe(dailyIndex(20_000, 100));
  });

  it('plays every level but the first two before repeating one', () => {
    const start = 98 * 208; // the first day of a cycle of 98 levels
    const picked = Array.from({ length: 98 }, (_, i) => dailyIndex(start + i, 100));
    expect(new Set(picked).size).toBe(98);
    expect(Math.min(...picked)).toBe(2);
    expect(Math.max(...picked)).toBe(99);
  });

  it('orders each cycle differently', () => {
    const first = Array.from({ length: 98 }, (_, i) => dailyIndex(98 * 300 + i, 100));
    const second = Array.from({ length: 98 }, (_, i) => dailyIndex(98 * 301 + i, 100));
    expect(second).not.toEqual(first);
  });

  it('stays inside a game with very few levels', () => {
    for (let day = 0; day < 10; day++) {
      expect(dailyIndex(day, 1)).toBe(0);
      expect(dailyIndex(day, 3)).toBe(2);
    }
  });

  it('counts consecutive days and starts over after a missed one', () => {
    let record = afterDailyWin(undefined, 100);
    expect(record).toEqual({ last: 100, streak: 1, best: 1 });
    // Again the same day: nothing changes
    expect(afterDailyWin(record, 100)).toBe(record);
    record = afterDailyWin(record, 101);
    record = afterDailyWin(record, 102);
    expect(record).toEqual({ last: 102, streak: 3, best: 3 });
    // Day 103 missed
    record = afterDailyWin(record, 104);
    expect(record).toEqual({ last: 104, streak: 1, best: 3 });
  });

  it('keeps a streak alive until the end of the next day', () => {
    const record = { last: 102, streak: 3, best: 5 };
    expect(dailyStatus(record, 102)).toEqual({ done: true, streak: 3, best: 5 });
    expect(dailyStatus(record, 103)).toEqual({ done: false, streak: 3, best: 5 });
    expect(dailyStatus(record, 104)).toEqual({ done: false, streak: 0, best: 5 });
    expect(dailyStatus(undefined, 104)).toEqual({ done: false, streak: 0, best: 0 });
  });
});
