import { expect, test } from '@playwright/test';
import { expectScene, trackErrors } from './support';

test('boots into the menu without errors', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./play/');
  await expect(page).toHaveTitle(/Boinky/);
  await expect(page.locator('#game canvas')).toBeVisible();
  await expectScene(page, 'Menu');
  expect(errors).toEqual([]);
});

test('the keyboard goes from the menu to a level and pauses it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard flow');
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

test('touch controls appear in a level on phones only', async ({ page, isMobile }) => {
  await page.goto('./play/?level=1');
  await expectScene(page, 'Game');
  const pad = page.locator('#touch');
  if (isMobile) {
    await expect(pad).toBeVisible();
    await expect(page.getByRole('button', { name: 'High bounce' })).toBeVisible();
  } else {
    await expect(pad).toBeHidden();
  }
});

test('the language follows the browser and can be saved', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('boinky:locale', 'es'));
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
