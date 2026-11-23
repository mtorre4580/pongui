import { expect, type Page } from '@playwright/test';

/** Waits until the given Phaser scene is the visible one (see `setupCamera`). */
export async function expectScene(page: Page, scene: string) {
  await expect(page.locator('body')).toHaveAttribute('data-scene', scene, { timeout: 10_000 });
}

/** Collects console errors and uncaught exceptions for the whole test. */
export function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

/**
 * Makes the browser look like a returning player's (a saved game with no progress): the game
 * opens on its menu. A first visit goes straight to the first level.
 */
export async function asReturningPlayer(page: Page) {
  await page.addInitScript(() => {
    if (localStorage.getItem('pongui:save') === null)
      localStorage.setItem('pongui:save', JSON.stringify({ unlocked: 0, levels: {}, sound: true }));
  });
}
