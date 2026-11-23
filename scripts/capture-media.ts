/**
 * Regenerates every recorded asset:
 *   docs/media/        README screenshots, gameplay GIF and video
 *   public/landing/    landing page hero video, one clip per mechanic, device screenshots
 *   public/og-image.jpg  social sharing image
 * It starts its own Vite dev server: videos use the dev-only `demo()` helper, which plays the
 * solver's solution in real time inside the real game. Needs ffmpeg on the PATH.
 * Usage: pnpm media
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, devices, type Browser, type Page } from '@playwright/test';
import { createServer } from 'vite';

const DOCS = 'docs/media';
const LANDING = 'public/landing';
const TMP = join(DOCS, '.video');
const PORT = 5199;
const GAME = `http://localhost:${PORT}/play/`;

// Every level unlocked with a few stars, so the level select looks like a game in progress
const SAVE = {
  unlocked: 9,
  sound: false,
  levels: Object.fromEntries(
    [3, 3, 2, 3, 2, 3, 1, 2].map((stars, i) => [
      `w1-${String(i + 1).padStart(2, '0')}`,
      { stars, bestTime: 10 },
    ]),
  ),
};

// One clip per mechanic, recorded from the level that introduces it (0-based level index)
const CLIPS: { name: string; level: number }[] = [
  { name: 'high-bounce', level: 1 },
  { name: 'fragile', level: 2 },
  { name: 'ramps', level: 3 },
  { name: 'springs', level: 4 },
  { name: 'fire', level: 5 },
  { name: 'hammer', level: 6 },
  { name: 'spikes', level: 7 },
];

const waitScene = (page: Page, scene: string) =>
  page.waitForFunction((s) => document.body.dataset.scene === s, scene, { timeout: 20_000 });

async function prepare(page: Page) {
  await page.addInitScript((save) => {
    localStorage.setItem('boinky:locale', 'en');
    localStorage.setItem('boinky:save', JSON.stringify(save));
  }, SAVE);
}

const ffmpeg = (args: string[]) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...args]);

const toJpeg = (src: string, out: string, width: number) =>
  ffmpeg(['-i', src, '-vf', `scale=${width}:-2:flags=lanczos`, '-q:v', '3', out]);

/**
 * Records real-time demos of the given levels in one video. Returns the raw file and, per level,
 * the second it started and the second it was won (when the result panel opened).
 */
async function record(
  browser: Browser,
  levels: number[],
  { banner = true, pause = 1600 } = {},
): Promise<{ raw: string; parts: { start: number; won: number }[] }> {
  rmSync(TMP, { recursive: true, force: true });
  const context = await browser.newContext({
    viewport: { width: 960, height: 624 },
    recordVideo: { dir: TMP, size: { width: 960, height: 624 } },
  });
  const page = await context.newPage();
  const t0 = Date.now();
  const now = () => (Date.now() - t0) / 1000;
  await prepare(page);
  await page.goto(`${GAME}?level=1`);
  await waitScene(page, 'Game');
  await page.waitForTimeout(500);
  const parts: { start: number; won: number }[] = [];
  for (const level of levels) {
    const start = now();
    await page.evaluate(
      ([i, b]) =>
        (window as unknown as { demo(i: number, o: { banner: boolean }): void }).demo(i, {
          banner: b,
        }),
      [level, banner] as const,
    );
    await waitScene(page, 'Overlay'); // won: the result panel opens
    parts.push({ start, won: now() });
    await page.waitForTimeout(pause);
  }
  await context.close();
  const raw = join(
    TMP,
    readdirSync(TMP).find((f) => f.endsWith('.webm'))!,
  );
  return { raw, parts };
}

/** Encodes a section of a raw recording as a small, web-friendly MP4 plus a JPEG poster. */
function clip(raw: string, from: number, to: number, out: string, width: number) {
  const len = (to - from).toFixed(2);
  ffmpeg(
    ['-ss', from.toFixed(2), '-t', len, '-i', raw, '-vf', `scale=${width}:-2:flags=lanczos`]
      .concat(['-c:v', 'libx264', '-crf', '30', '-preset', 'slow', '-pix_fmt', 'yuv420p'])
      .concat(['-movflags', '+faststart', '-an', `${out}.mp4`]),
  );
  ffmpeg(
    ['-ss', (from + (to - from) * 0.45).toFixed(2), '-i', raw, '-frames:v', '1'].concat([
      '-vf',
      `scale=${width}:-2:flags=lanczos`,
      '-q:v',
      '4',
      `${out}.jpg`,
    ]),
  );
}

const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error' });
await server.listen();
mkdirSync(DOCS, { recursive: true });
mkdirSync(LANDING, { recursive: true });
mkdirSync(TMP, { recursive: true });
const browser = await chromium.launch();

try {
  // --- README screenshots (the game canvas is 1280×832) ---
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 832 } });
  const page = await desktop.newPage();
  await prepare(page);
  await page.goto(GAME);
  await waitScene(page, 'Menu');
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(DOCS, 'menu.png') });

  // Menu → level select with the keyboard (first Enter focuses, the second one activates).
  // Presses are edge-triggered per frame: leave a frame between them
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await waitScene(page, 'LevelSelect');
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(DOCS, 'levels.png') });

  // Mid-level: replay part of the solution of the grand finale
  await page.evaluate(() =>
    (window as unknown as { replay(i: number, n: number): Promise<unknown> }).replay(9, 6),
  );
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(DOCS, 'gameplay.png') });
  await desktop.close();

  // Phone in landscape, with the touch controls
  const phone = await browser.newContext({ ...devices['Pixel 7 landscape'] });
  const phonePage = await phone.newPage();
  await prepare(phonePage);
  await phonePage.goto(`${GAME}?level=5`);
  await waitScene(phonePage, 'Game');
  await phonePage.waitForTimeout(3800); // let the level banner fade out
  await phonePage.screenshot({ path: join(DOCS, 'phone.png') });
  await phone.close();

  // Tablet in landscape (landing page only)
  const tablet = await browser.newContext({ ...devices['iPad (gen 7) landscape'] });
  const tabletPage = await tablet.newPage();
  await prepare(tabletPage);
  await tabletPage.goto(`${GAME}?level=6`);
  await waitScene(tabletPage, 'Game');
  await tabletPage.waitForTimeout(3800);
  await tabletPage.screenshot({ path: join(TMP, 'tablet.png') });
  await tablet.close();

  // Social sharing image: the menu at 1200×630
  const og = await browser.newContext({ viewport: { width: 1200, height: 630 } });
  const ogPage = await og.newPage();
  await prepare(ogPage);
  await ogPage.goto(GAME);
  await waitScene(ogPage, 'Menu');
  await ogPage.waitForTimeout(800);
  await ogPage.screenshot({ path: join(TMP, 'og.png') });
  await og.close();

  toJpeg(join(DOCS, 'gameplay.png'), join(LANDING, 'desktop.jpg'), 1280);
  toJpeg(join(DOCS, 'phone.png'), join(LANDING, 'phone.jpg'), 1100);
  toJpeg(join(TMP, 'tablet.png'), join(LANDING, 'tablet.jpg'), 1024);
  toJpeg(join(TMP, 'og.png'), 'public/og-image.jpg', 1200);

  // --- README GIF and video: levels 4 and 10 with their result panels ---
  const readme = await record(browser, [3, 9]);
  ffmpeg(
    ['-ss', '0.8', '-i', readme.raw, '-vf'].concat([
      'fps=20,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4',
      join(DOCS, 'demo.gif'),
    ]),
  );
  ffmpeg(
    ['-i', readme.raw, '-c:v', 'libx264', '-pix_fmt', 'yuv420p'].concat([
      '-movflags',
      '+faststart',
      '-an',
      join(DOCS, 'demo.mp4'),
    ]),
  );

  // --- Landing: hero (grand finale) and one clip per mechanic, without banners ---
  const hero = await record(browser, [9], { banner: false, pause: 300 });
  clip(hero.raw, hero.parts[0].start + 0.7, hero.parts[0].won - 0.1, join(LANDING, 'hero'), 960);
  const clips = await record(
    browser,
    CLIPS.map((c) => c.level),
    { banner: false, pause: 300 },
  );
  CLIPS.forEach((c, i) => {
    const part = clips.parts[i];
    clip(clips.raw, part.start + 0.7, part.won - 0.1, join(LANDING, c.name), 640);
  });

  rmSync(TMP, { recursive: true, force: true });
  console.log(`Media written to ${DOCS}/, ${LANDING}/ and public/og-image.jpg`);
} finally {
  await browser.close();
  await server.close();
}
