import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { WORLD_COUNT } from '../src/levels/worlds';
import { trackErrors } from './support';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

test('the landing page loads without errors and links to the game', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('./');
  await expect(page).toHaveTitle(/Pongui/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('never stops bouncing');
  const play = page.getByRole('link', { name: /Play now/ });
  await expect(play).toHaveAttribute('href', './play/');
  await expect(page.locator('#worlds .card')).toHaveCount(WORLD_COUNT);
  // Every world's card names its boss, and the bosses have a section of their own
  await expect(page.locator('#worlds .card-boss')).toHaveCount(WORLD_COUNT);
  await expect(page.locator('#worlds .card').first()).toContainText('Boss: Grumble');
  await expect(page.locator('#bosses img')).toHaveCount(6);
  expect(errors).toEqual([]);
});

test('the play button opens the game', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('link', { name: /Play now/ }).click();
  await expect(page).toHaveURL(/\/play\/$/);
  // Someone new goes straight to the first level
  await expect(page.locator('body')).toHaveAttribute('data-scene', 'Game', { timeout: 10_000 });
});

test('the language selector translates the page and is remembered', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('Language').selectOption('pt-BR');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'A bola nunca para de quicar. Você decide onde ela cai.',
  );
  await expect(page.locator('#worlds .card').first()).toContainText('Vale Saltitante');
  await expect(page.locator('#worlds .card').first()).toContainText('Chefe: Rabugento');
  await expect(page.locator('#bosses h2')).toHaveText('Dez chefes, dez lutas diferentes');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
});

test('videos load only when they scroll into view and can be paused', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', (r) => r.url().endsWith('.mp4') && requested.push(r.url()));
  await page.goto('./');
  await page.waitForTimeout(500);
  // Only the hero clip is on screen at first
  expect(requested.every((u) => u.includes('hero'))).toBe(true);
  const card = page.locator('#worlds .screen').first();
  await card.scrollIntoViewIfNeeded();
  await expect.poll(() => requested.some((u) => u.includes('world-1.'))).toBe(true);
  const toggle = card.getByRole('button', { name: 'Pause video' });
  await toggle.click();
  await expect(card.getByRole('button', { name: 'Play video' })).toBeVisible();
  await expect
    .poll(() => card.locator('video').evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(true);
});

test('videos do not autoplay with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  await expect(page.locator('.hero .clip-toggle')).toHaveAccessibleName('Play video');
  expect(await page.locator('.hero video').evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
});

test('the landing page has no WCAG 2.2 AA violations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('./');
  // Open every answer so their text is checked too
  for (const d of await page.locator('details').all())
    await d.evaluate((el) => el.setAttribute('open', ''));
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
});

test('the privacy page is linked from the footer and has no WCAG 2.2 AA violations', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await page.goto('./');
  // The game's profiles sit next to it
  await expect(page.getByRole('link', { name: 'Instagram' })).toHaveAttribute(
    'href',
    'https://www.instagram.com/playpongui/',
  );
  await expect(page.getByRole('link', { name: 'YouTube' })).toHaveAttribute(
    'href',
    'https://www.youtube.com/@playpongui',
  );
  await expect(page.getByRole('link', { name: 'TikTok' })).toHaveAttribute(
    'href',
    'https://www.tiktok.com/@playpongui',
  );
  await expect(page.getByRole('link', { name: 'itch.io' })).toHaveAttribute(
    'href',
    'https://pongui.itch.io/pongui',
  );
  await page.getByRole('link', { name: 'Privacy' }).click();
  await expect(page).toHaveURL(/\/privacy\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Privacy');
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
  ).toEqual([]);
  expect(errors).toEqual([]);
});
