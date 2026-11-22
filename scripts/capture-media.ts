/**
 * Regenerates the README screenshots and gameplay GIF in docs/media.
 * It starts its own Vite dev server (the GIF uses the dev-only `demo()` helper, which plays the
 * solver's solution in real time). The GIF needs ffmpeg on the PATH.
 * Usage: pnpm media
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, devices, type Page } from '@playwright/test';
import { createServer } from 'vite';

const OUT = 'docs/media';
const PORT = 5199;
const URL = `http://localhost:${PORT}/`;

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

const waitScene = (page: Page, scene: string) =>
  page.waitForFunction((s) => document.body.dataset.scene === s, scene, { timeout: 15_000 });

async function prepare(page: Page) {
  await page.addInitScript((save) => {
    localStorage.setItem('boinky:locale', 'en');
    localStorage.setItem('boinky:save', JSON.stringify(save));
  }, SAVE);
}

const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error' });
await server.listen();
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

try {
  // Desktop screenshots (the game canvas is 1280×832)
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 832 } });
  const page = await desktop.newPage();
  await prepare(page);
  await page.goto(URL);
  await waitScene(page, 'Menu');
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, 'menu.png') });

  // Menu → level select with the keyboard (first Enter focuses, the second one activates)
  // Presses are edge-triggered per frame: leave a frame between them
  await page.keyboard.press('Enter');
  await page.waitForTimeout(150);
  await page.keyboard.press('Enter');
  await waitScene(page, 'LevelSelect');
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUT, 'levels.png') });

  // Mid-level: replay part of the solution of the grand finale
  await page.evaluate(() =>
    (window as unknown as { replay(i: number, n: number): Promise<unknown> }).replay(9, 6),
  );
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, 'gameplay.png') });
  await desktop.close();

  // Phone in landscape, with the touch controls
  const phone = await browser.newContext({ ...devices['Pixel 7 landscape'] });
  const phonePage = await phone.newPage();
  await prepare(phonePage);
  await phonePage.goto(`${URL}?level=5`);
  await waitScene(phonePage, 'Game');
  await phonePage.waitForTimeout(3800); // let the level banner fade out
  await phonePage.screenshot({ path: join(OUT, 'phone.png') });
  await phone.close();

  // Gameplay GIF: record a real-time demo of a level and convert it with ffmpeg
  const videoDir = join(OUT, '.video');
  const rec = await browser.newContext({
    viewport: { width: 960, height: 624 },
    recordVideo: { dir: videoDir, size: { width: 960, height: 624 } },
  });
  const recPage = await rec.newPage();
  await prepare(recPage);
  await recPage.goto(`${URL}?level=1`);
  await waitScene(recPage, 'Game');
  for (const level of [3, 9]) {
    await recPage.evaluate((i) => (window as unknown as { demo(i: number): void }).demo(i), level);
    await waitScene(recPage, 'Game');
    await waitScene(recPage, 'Overlay'); // the level is won and the result panel opens
    await recPage.waitForTimeout(1600);
  }
  await rec.close();
  const webm = join(
    videoDir,
    readdirSync(videoDir).find((f) => f.endsWith('.webm'))!,
  );
  const raw = join(OUT, 'raw.webm');
  renameSync(webm, raw);
  rmSync(videoDir, { recursive: true, force: true });
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-ss',
    '0.8',
    '-i',
    raw,
    '-vf',
    'fps=20,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4',
    join(OUT, 'demo.gif'),
  ]);
  execFileSync('ffmpeg', [
    '-y',
    '-loglevel',
    'error',
    '-i',
    raw,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-an',
    join(OUT, 'demo.mp4'),
  ]);
  rmSync(raw);
  console.log(`Media written to ${OUT}/`);
} finally {
  await browser.close();
  await server.close();
}
