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
  expect(manifest.name).toBe('Pongui');
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

test('a precache holding an old page repairs itself', async ({ page, isMobile }) => {
  test.skip(isMobile, 'one browser is enough for the service worker');
  await page.goto('./play/');
  await page.waitForFunction(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return reg?.active?.state === 'activated';
  });
  await expect
    .poll(
      async () => {
        await page.reload();
        return page.evaluate(() => !!navigator.serviceWorker.controller);
      },
      { timeout: 20_000, intervals: [250, 500, 1000] },
    )
    .toBe(true);
  // What a release caught half-way leaves behind: the stored page asks for a script the
  // current release does not have
  await page.evaluate(async () => {
    const name = (await caches.keys()).find((n) => n.startsWith('workbox-precache'))!;
    const cache = await caches.open(name);
    const key = (await cache.keys()).find((r) =>
      new URL(r.url).pathname.endsWith('/play/index.html'),
    )!;
    const html = await (await cache.match(key))!.text();
    await cache.put(
      key,
      new Response(
        html.replace(
          '</body>',
          '<script type="module" src="/assets/ghost-0000.js"></script></body>',
        ),
        { headers: { 'Content-Type': 'text/html' } },
      ),
    );
  });
  await page.reload();
  expect(await page.locator('script[src*="ghost"]').count()).toBe(1);
  // The check runs a few seconds after loading, then the page comes back from the network
  await expect(page.locator('script[src*="ghost"]')).toHaveCount(0, { timeout: 15_000 });
  await expectScene(page, 'Menu');
  expect(await page.evaluate(() => sessionStorage.getItem('pongui:sw-healed'))).toBe('1');
});
