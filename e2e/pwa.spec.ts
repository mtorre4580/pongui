import { expect, test } from '@playwright/test';
import { expectScene } from './support';

test('the web app manifest is installable', async ({ page, request }) => {
  await page.goto('./');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const manifest = await (await request.get(href!)).json();
  expect(manifest.name).toBe('Boinky');
  expect(manifest.display).toBe('fullscreen');
  const sizes = manifest.icons.map((i: { sizes: string }) => i.sizes);
  expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']));
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
});

test('works offline after the first visit', async ({ page, context, isMobile }) => {
  test.skip(isMobile, 'one browser is enough for the service worker');
  await page.goto('./');
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg?.active?.state === 'activated';
  });
  // Precache finished and the worker controls the page after a reload
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expectScene(page, 'Menu');
  await expect(page.locator('#game canvas')).toBeVisible();
});
