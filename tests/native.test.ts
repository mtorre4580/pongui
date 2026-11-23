import { describe, expect, it } from 'vitest';
import { haptic, hideSplash, initNative, IS_NATIVE, persistNative } from '../src/native';

// The web build and the tests are not native: every helper must be a harmless no-op there
describe('native helpers outside the app', () => {
  it('is not native', () => expect(IS_NATIVE).toBe(false));

  it('does nothing and never throws', async () => {
    await expect(initNative()).resolves.toBeUndefined();
    expect(() => persistNative('boinky:save', '{}')).not.toThrow();
    expect(() => hideSplash()).not.toThrow();
    expect(() => haptic('success')).not.toThrow();
  });
});
