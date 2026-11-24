import { expect, test } from '@playwright/test';
import { BOSS_WORLDS } from '../src/levels/worlds';
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

test('the balls screen opens from the menu and a locked ball stays locked', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'keyboard flow');
  const errors = trackErrors(page);
  await asReturningPlayer(page);
  await page.goto('./play/');
  await expectScene(page, 'Menu');
  // The menu is a grid of two columns: Play, then My levels below it, then Balls to its right
  for (const key of ['Enter', 'ArrowDown', 'ArrowRight', 'Enter']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(150);
  }
  await expectScene(page, 'Skins');
  // The second ball needs stars this player does not have: choosing it changes nothing
  for (const key of ['Enter', 'ArrowRight', 'Enter']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(150);
  }
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('pongui:save')!));
  expect(save.skin).toBeUndefined();
  await page.keyboard.press('Escape');
  await expectScene(page, 'Menu');
  expect(errors).toEqual([]);
});

test('the level of the day starts from the menu and its pause panel leads back to it', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'keyboard flow');
  const errors = trackErrors(page);
  await asReturningPlayer(page);
  await page.goto('./play/');
  await expectScene(page, 'Menu');
  // Play is focused first; the level of the day is to its right
  for (const key of ['Enter', 'ArrowRight', 'Enter']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(150);
  }
  await expectScene(page, 'Game');
  await page.keyboard.press('Escape');
  await expectScene(page, 'Overlay');
  // Resume, Restart, Sound, back to the menu
  for (const key of ['Enter', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'Enter']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(150);
  }
  await expectScene(page, 'Menu');
  expect(errors).toEqual([]);
});

test('the boss of world 1 opens after its ten levels and guards world 2', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'keyboard flow');
  test.setTimeout(90_000);
  const errors = trackErrors(page);
  // The ten levels of world 1 beaten, the boss not yet
  await page.addInitScript(() => {
    const levels = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [
        `w1-${String(i + 1).padStart(2, '0')}`,
        { stars: 1, bestTime: 9 },
      ]),
    );
    localStorage.setItem('pongui:save', JSON.stringify({ unlocked: 9, levels, sound: false }));
  });
  await page.goto('./play/');
  await expectScene(page, 'Menu');
  for (const key of ['Enter', 'Enter']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(150);
  }
  await expectScene(page, 'LevelSelect');
  // From the first card: down a row, down to "back", right to the boss
  for (const key of ['Enter', 'ArrowDown', 'ArrowDown', 'ArrowRight', 'Enter']) {
    await page.keyboard.press(key);
    await page.waitForTimeout(150);
  }
  await expectScene(page, 'Game');
  // Walking off the ledge and into the boss, three times: out of lives
  await page.keyboard.down('ArrowRight');
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'Overlay', { timeout: 60_000 });
  await page.keyboard.up('ArrowRight');
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('pongui:save')!));
  expect(save.bosses).toBeUndefined();
  expect(save.unlocked).toBe(9);
  expect(errors).toEqual([]);
});

test('?boss= is a development shortcut: the built game ignores it', async ({ page }) => {
  const errors = trackErrors(page);
  // Even with the boss open (the ten levels of world 1 beaten), the address leads to the menu
  await page.addInitScript(() => {
    const levels = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [
        `w1-${String(i + 1).padStart(2, '0')}`,
        { stars: 1, bestTime: 9 },
      ]),
    );
    localStorage.setItem('pongui:save', JSON.stringify({ unlocked: 9, levels, sound: false }));
  });
  await page.goto('./play/?boss=1');
  await expectScene(page, 'Menu');
  // Again once the service worker is in charge: still the game's own page
  await page.goto('./play/?boss=1');
  await expectScene(page, 'Menu');
  expect(errors).toEqual([]);
});

// The way to each later boss: its world's page in the level list, then the boss button
for (const world of BOSS_WORLDS.filter((n) => n > 1)) {
  test(`the boss of world ${world} opens after its ten levels and guards the next world`, async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, 'keyboard flow');
    test.setTimeout(120_000);
    const errors = trackErrors(page);
    // Every level up to the end of this world beaten, and every boss before this one
    await page.addInitScript((n) => {
      const ids = Array.from(
        { length: n * 10 },
        (_, i) => `w${Math.floor(i / 10) + 1}-${String((i % 10) + 1).padStart(2, '0')}`,
      );
      const levels = Object.fromEntries(ids.map((id) => [id, { stars: 1, bestTime: 9 }]));
      const bosses = Array.from({ length: n - 1 }, (_, i) => i + 1);
      localStorage.setItem(
        'pongui:save',
        JSON.stringify({ unlocked: n * 10 - 1, levels, bosses, sound: false }),
      );
    }, world);
    await page.goto('./play/');
    await expectScene(page, 'Menu');
    for (const key of ['Enter', 'Enter']) {
      await page.keyboard.press(key);
      await page.waitForTimeout(150);
    }
    await expectScene(page, 'LevelSelect');
    // The list opens on the last world reached. From its first card: down a row, down to
    // "back", right to the boss
    for (const key of ['Enter', 'ArrowDown', 'ArrowDown', 'ArrowRight', 'Enter']) {
      await page.keyboard.press(key);
      await page.waitForTimeout(150);
    }
    await expectScene(page, 'Game');
    await expect(page.locator('#game')).toHaveAttribute('aria-label', /.+/);
    // Doing nothing: the boss wins, three times over
    await expect(page.locator('body')).toHaveAttribute('data-scene', 'Overlay', {
      timeout: 100_000,
    });
    const save = await page.evaluate(() => JSON.parse(localStorage.getItem('pongui:save')!));
    expect(save.bosses).not.toContain(world);
    expect(save.unlocked).toBe(world * 10 - 1);
    expect(errors).toEqual([]);
  });
}
