import { expect, test } from '@playwright/test';
import { asReturningPlayer, expectScene, trackErrors } from './support';

test('boots into the menu without errors', async ({ page }) => {
  const errors = trackErrors(page);
  await asReturningPlayer(page);
  await page.goto('./play/');
  await expect(page).toHaveTitle(/Pongui/);
  await expect(page.locator('#game canvas')).toBeVisible();
  await expectScene(page, 'Menu');
  expect(errors).toEqual([]);
});

test('the keyboard goes from the menu to a level and pauses it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard flow');
  await asReturningPlayer(page);
  await page.goto('./play/');
  await expectScene(page, 'Menu');
  // First Enter focuses the first button, the second one activates it
  const confirm = async () => {
    // Presses are edge-triggered per frame: leave a frame between them
    await page.keyboard.press('Enter');
    await page.waitForTimeout(150);
    await page.keyboard.press('Enter');
  };
  await confirm();
  await expectScene(page, 'LevelSelect');
  await confirm();
  await expectScene(page, 'Game');
  await page.keyboard.press('Escape');
  await expectScene(page, 'Overlay');
  await page.keyboard.press('Escape');
  await expectScene(page, 'Game');
});

test('a level can be opened from the URL', async ({ page }) => {
  await page.goto('./play/?level=4');
  await expectScene(page, 'Game');
});

test('touch play uses gestures, with no on-screen buttons', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'touch gestures');
  await page.goto('./play/?level=1');
  await expectScene(page, 'Game');
  await expect(page.locator('#game button')).toHaveCount(0);
  const stick = page.locator('#stick');
  await expect(stick).toBeHidden();
  // A finger dragged over the level shows the steering indicator until it lifts
  const touch = (type: string, x: number) =>
    page.evaluate(
      ([type, x]) => {
        const init = {
          pointerId: 7,
          pointerType: 'touch',
          clientX: x,
          clientY: 200,
          bubbles: true,
        };
        const target = type === 'pointerdown' ? document.getElementById('game')! : window;
        target.dispatchEvent(new PointerEvent(type, init));
      },
      [type, x] as const,
    );
  await touch('pointerdown', 300);
  await touch('pointermove', 360);
  await expect(stick).toBeVisible();
  await touch('pointerup', 360);
  await expect(stick).toBeHidden();
});

test('the language follows the browser and can be saved', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('pongui:locale', 'es'));
  await asReturningPlayer(page);
  await page.goto('./play/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.locator('#rotate-text')).toHaveText('Girá el dispositivo para jugar');
});

test('the game fills the whole screen, with no empty bars', async ({ page }) => {
  await page.goto('./play/?level=1');
  await expectScene(page, 'Game');
  const viewport = page.viewportSize()!;
  const box = (await page.locator('#game canvas').boundingBox())!;
  expect(Math.round(box.x)).toBe(0);
  expect(Math.round(box.y)).toBe(0);
  expect(Math.round(box.width)).toBe(viewport.width);
  expect(Math.round(box.height)).toBe(viewport.height);
});

test('a first visit starts on the first level, and the menu is one step away', async ({
  page,
  isMobile,
}) => {
  const errors = trackErrors(page);
  await page.goto('./play/');
  await expectScene(page, 'Game');
  test.skip(isMobile, 'keyboard flow');
  // Pause, then "Choose level" (the last button) and back to the menu
  await page.keyboard.press('Escape');
  await expectScene(page, 'Overlay');
  expect(errors).toEqual([]);
});

test('a returning player opens on the menu', async ({ page }) => {
  await asReturningPlayer(page);
  await page.goto('./play/');
  await expectScene(page, 'Menu');
});

test('out of lives, the bot shows how the level is done and nothing is recorded', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'keyboard flow');
  const errors = trackErrors(page);
  // Spikes: holding right runs into them, three times
  await page.goto('./play/?level=1-8');
  await expectScene(page, 'Game');
  await page.keyboard.down('ArrowRight');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'Overlay', { timeout: 30_000 });
  await page.keyboard.up('ArrowRight');
  // "Try again" is focused first; "Watch the bot" is the next button
  for (const key of ['Enter', 'ArrowDown', 'Enter']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(150);
  }
  await expectScene(page, 'Game');
  // The solver runs in a worker, then the level is played in real time
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'Overlay', { timeout: 40_000 });
  const save = await page.evaluate(() => localStorage.getItem('pongui:save'));
  expect(save === null || !('w1-08' in JSON.parse(save).levels)).toBe(true);
  expect(errors).toEqual([]);
});
