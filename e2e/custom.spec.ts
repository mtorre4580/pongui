import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { emptyMap, encodeLevel, paint } from '../src/game/custom';
import { asReturningPlayer, expectScene, trackErrors } from './support';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

// A small level: one gem on the way from the start to the exit
const SHARED = {
  name: 'Shared test',
  theme: 3,
  dark: false,
  par: 12,
  map: paint(emptyMap(), 8, 9, 'g'),
};

/** Player-made levels saved in the browser. */
const stored = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem('pongui:custom');
    return (raw ? JSON.parse(raw) : { levels: [] }) as {
      levels: { origin: string; name: string; map: string[]; bot: { solved: boolean } | null }[];
    };
  });

/** Presses are edge-triggered per frame: leave a frame between them. */
async function press(page: Page, ...keys: string[]) {
  for (const key of keys) {
    await page.keyboard.press(key);
    await page.waitForTimeout(120);
  }
}

test('a shared link opens the level on any device, checked by the bot', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto(`./play/?c=${encodeLevel(SHARED)}`);
  await expectScene(page, 'MyLevels');
  // The code leaves the address so a reload does not add it again
  await expect(page).toHaveURL(/\/play\/$/);
  await expect
    .poll(async () => (await stored(page)).levels[0]?.bot?.solved, { timeout: 15_000 })
    .toBe(true);
  const { levels } = await stored(page);
  expect(levels).toHaveLength(1);
  expect(levels[0]).toMatchObject({ origin: 'received', name: 'Shared test', map: SHARED.map });
  expect(errors).toEqual([]);
});

test('a broken link does not add anything', async ({ page }) => {
  await page.goto(`./play/?c=${encodeLevel(SHARED).slice(0, -6)}`);
  await expectScene(page, 'MyLevels');
  expect((await stored(page)).levels).toEqual([]);
});

test('the editor makes a level the bot can beat and tests it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the editor is for computers');
  const errors = trackErrors(page);
  await asReturningPlayer(page);
  await page.goto('./play/');
  await expectScene(page, 'Menu');
  // Menu: Play, My levels
  await press(page, 'Enter', 'ArrowDown', 'Enter');
  await expectScene(page, 'MyLevels');
  // My levels: "New level" is the first button
  await press(page, 'Enter', 'Enter');
  await expectScene(page, 'Editor');
  // The gem is the fourth tool; paint it two rows above the floor
  await press(page, 'KeyE', 'KeyE', 'KeyE');
  for (let i = 0; i < 7; i++) await press(page, 'ArrowRight');
  for (let i = 0; i < 8; i++) await press(page, 'ArrowDown');
  await press(page, 'Space');
  await expect
    .poll(async () => (await stored(page)).levels[0]?.bot?.solved, { timeout: 15_000 })
    .toBe(true);
  expect((await stored(page)).levels[0].map[9][8]).toBe('g');
  await press(page, 'KeyT');
  await expectScene(page, 'Game');
  await page.keyboard.press('Escape');
  await expectScene(page, 'Overlay');
  expect(errors).toEqual([]);
});

test('the link dialog has no WCAG 2.2 AA violations', async ({ page, isMobile }) => {
  test.skip(isMobile, 'keyboard flow');
  await asReturningPlayer(page);
  await page.goto('./play/');
  await expectScene(page, 'Menu');
  await press(page, 'Enter', 'ArrowDown', 'Enter');
  await expectScene(page, 'MyLevels');
  // "New level", then "Open a link"
  await press(page, 'Enter', 'ArrowDown', 'Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox').fill('not a level');
  await dialog.getByRole('button', { name: 'Open' }).click();
  await expect(dialog.getByRole('alert')).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
  await dialog.getByRole('textbox').fill(`https://example.com/play/?c=${encodeLevel(SHARED)}`);
  await dialog.getByRole('button', { name: 'Open' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await stored(page)).levels[0]?.origin).toBe('received');
  await expectScene(page, 'MyLevels');
});
