import { describe, expect, it } from 'vitest';
import { initAnalytics, track, trackLevelStart } from '../src/analytics';

describe('analytics', () => {
  // Tests run without a website id, like development: the tracker must never be requested.
  // There is no `document` here, so touching the page would throw.
  it('loads nothing and stays silent without a website id', () => {
    expect(() => {
      initAnalytics();
      track('install');
      trackLevelStart('w1-01');
    }).not.toThrow();
  });
});
