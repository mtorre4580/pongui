import { afterEach, describe, expect, it, vi } from 'vitest';
import { isFirstVisit } from '../src/save';

const storage = (items: Record<string, string>) => ({
  getItem: (key: string) => items[key] ?? null,
});

describe('first visit', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('is a first visit while nothing was ever saved', () => {
    vi.stubGlobal('localStorage', storage({}));
    expect(isFirstVisit()).toBe(true);
  });

  it('is not once there is a saved game, even with no progress', () => {
    vi.stubGlobal('localStorage', storage({ 'pongui:save': '{"unlocked":0,"levels":{}}' }));
    expect(isFirstVisit()).toBe(false);
  });

  it('treats storage that cannot be read as a returning player', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
    });
    expect(isFirstVisit()).toBe(false);
  });
});
