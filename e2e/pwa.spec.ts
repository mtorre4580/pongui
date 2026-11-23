import { expect, test } from '@playwright/test';
import { expectScene } from './support';

test('the web app manifest is installable', async ({ page, request }) => {
  await page.goto('./play/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  // Resolve like the browser does: relative to the page, not to the site root
  const response = await request.get(new URL(href!, page.url()).href);
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest.name).toBe('Boinky');
  // The installed app opens the game, not the landing page
  expect(new URL(manifest.start_url, response.url()).pathname).toBe('/play/');
  expect(manifest.display).toBe('fullscreen');
  const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
});

test('works offline after the first visit', async ({ page, context, isMobile }) => {
  test.skip(isMobile, 'one browser is enough for the service worker');
  await page.goto('./play/');
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg?.active?.state === 'activated';
  });
  // Precache finished: a reload brings the page under the worker. Activation can land in the
  // middle of a reload, so reload until it does (a real visitor gets it on their next visit).
  await expect
    .poll(
      async () => {
        await page.reload();
        return page.evaluate(() => !!navigator.serviceWorker.controller);
      },
      { timeout: 20_000, intervals: [250, 500, 1000] },
    )
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expectScene(page, 'Menu');
  await expect(page.locator('#game canvas')).toBeVisible();
});
