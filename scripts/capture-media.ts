/**
 * Regenerates every recorded asset:
 *   docs/media/        README screenshots, gameplay GIF and video
 *   public/landing/    landing page hero video, one clip per world, the editor clip and device
 *                      screenshots
 *   public/og-image.jpg  social sharing image
 * It starts its own Vite dev server: videos use the dev-only `demo()` helper, which plays the
 * solver's solution in real time inside the real game. Needs ffmpeg on the PATH.
 * Usage: pnpm media          everything above
 *        pnpm media editor   only the landing's editor clip
 *        pnpm media banner   only the YouTube channel banner in docs/social/
 *        pnpm media:social   vertical videos for social networks in docs/social/ (not committed)
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, devices, type Browser, type Page } from '@playwright/test';
import { createServer } from 'vite';

const DOCS = 'docs/media';
const LANDING = 'public/landing';
const TMP = join(DOCS, '.video');
const PORT = 5199;
const GAME = `http://localhost:${PORT}/play/`;

// The first worlds finished with a few stars, so the level select looks like a game in progress
const STARS = [3, 3, 2, 3, 2, 3, 1, 2, 3, 2, 3, 3, 1, 2, 3, 2, 3, 3, 2, 1, 3, 2, 3];
const SAVE = {
  unlocked: STARS.length,
  sound: false,
  levels: Object.fromEntries(
    STARS.map((stars, i) => [
      `w${Math.floor(i / 10) + 1}-${String((i % 10) + 1).padStart(2, '0')}`,
      { stars, bestTime: 10 },
    ]),
  ),
};

const WORLDS = 10;
/** 0-based index of a world's last level: it mixes that world's mechanics. */
const finale = (world: number) => world * 10 - 1;
// One clip per world for the landing page
const CLIPS = Array.from({ length: WORLDS }, (_, i) => ({
  name: `world-${i + 1}`,
  level: finale(i + 1),
}));

const waitScene = (page: Page, scene: string) =>
  page.waitForFunction((s) => document.body.dataset.scene === s, scene, { timeout: 20_000 });

async function prepare(page: Page) {
  await page.addInitScript((save) => {
    localStorage.setItem('pongui:locale', 'en');
    localStorage.setItem('pongui:save', JSON.stringify(save));
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
  { banner = true, pause = 1600, width = 960, height = 624 } = {},
): Promise<{ raw: string; parts: { start: number; won: number }[] }> {
  rmSync(TMP, { recursive: true, force: true });
  const context = await browser.newContext({
    viewport: { width, height },
    recordVideo: { dir: TMP, size: { width, height } },
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

/** Presses are edge-triggered per frame: leave a few frames between them. */
async function press(page: Page, keys: string[], gap = 140) {
  for (const key of keys) {
    await page.keyboard.press(key);
    await page.waitForTimeout(gap);
  }
}

const times = (key: string, n: number) => Array.from({ length: n }, () => key);

/**
 * Records the editor being used with the keyboard: paint a ledge and three gems, let the bot
 * check the level, beat it with "Test" and open the share dialog. Returns the raw file and the
 * seconds where the editor appears and where the dialog has been on screen for a moment.
 */
async function recordEditor(
  browser: Browser,
  width = 960,
): Promise<{ raw: string; from: number; to: number }> {
  // Same shape as the game's world (640×416), so the canvas has no side bars
  const height = Math.round((width * 416) / 640);
  rmSync(TMP, { recursive: true, force: true });
  const context = await browser.newContext({
    viewport: { width, height },
    recordVideo: { dir: TMP, size: { width, height } },
  });
  const page = await context.newPage();
  const t0 = Date.now();
  const now = () => (Date.now() - t0) / 1000;
  await prepare(page);
  await page.goto(`${GAME}?editor=1`);
  await waitScene(page, 'Menu');
  // Menu: Play, My levels. My levels: "New level" is the first button
  await press(page, ['Enter', 'ArrowDown', 'Enter']);
  await waitScene(page, 'MyLevels');
  await press(page, ['Enter', 'Enter']);
  await waitScene(page, 'Editor');
  await page.waitForTimeout(600);
  const from = now();
  // The cursor starts at the top left cell. A ledge of solid blocks, painted as one stroke
  await press(page, [...times('ArrowRight', 7), ...times('ArrowDown', 5)], 70);
  await page.keyboard.down('Space');
  await press(page, times('ArrowRight', 4), 110);
  await page.keyboard.up('Space');
  // The gem is the fourth tool: three gems two rows above the floor, on the way to the exit
  await press(page, times('KeyE', 3), 160);
  await press(page, [...times('ArrowLeft', 6), ...times('ArrowDown', 3), 'Space'], 70);
  await press(page, [...times('ArrowRight', 4), 'Space'], 70);
  await press(page, [...times('ArrowRight', 4), 'Space'], 70);
  // The bot runs in a worker after each change
  await page.waitForFunction(
    () => {
      const raw = localStorage.getItem('pongui:custom');
      return (
        raw !== null &&
        (JSON.parse(raw) as { levels: { bot?: { solved: boolean } }[] }).levels[0]?.bot?.solved ===
          true
      );
    },
    undefined,
    { timeout: 20_000 },
  );
  await page.waitForTimeout(900);
  // Test: holding right takes the three gems and reaches the exit
  await page.keyboard.press('KeyT');
  await waitScene(page, 'Game');
  await page.keyboard.down('ArrowRight');
  await waitScene(page, 'Overlay');
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(1200);
  // Result panel: the first button goes back to the editor
  await press(page, ['Enter', 'Enter']);
  await waitScene(page, 'Editor');
  await page.waitForTimeout(900);
  // The dialog warns that a localhost link cannot be opened by a phone: true here, never on the
  // public site this clip is for
  await page.addStyleTag({ content: '.ui-note { display: none }' });
  // "Share" has no key: click it where it sits (measured in a 960×624 viewport)
  const share = { x: (864 * width) / 960, y: (354 * width) / 960 };
  await page.mouse.move(share.x, share.y, { steps: 8 });
  await page.mouse.click(share.x, share.y);
  await page.getByRole('dialog').waitFor({ state: 'visible' });
  await page.waitForTimeout(2600);
  await context.close();
  const raw = join(
    TMP,
    readdirSync(TMP).find((f) => f.endsWith('.webm'))!,
  );
  return { raw, from, to: now() - 0.3 };
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

// --- Vertical videos for Instagram Reels, TikTok and YouTube Shorts (`pnpm media:social`) ---

const SOCIAL = 'docs/social';
const SOCIAL_W = 1080;
const SOCIAL_H = 1920;
// The recording keeps the world's shape and sits in the middle of the card
const SHOT_H = Math.round((SOCIAL_W * 416) / 640);
const SHOT_Y = 640;

const SOCIAL_TEXT = {
  en: { world: 'World', cta: 'Play free', editor: 'Build your own levels', where: 'No download' },
  es: {
    world: 'Mundo',
    cta: 'Jugá gratis',
    editor: 'Creá tus propios niveles',
    where: 'Sin descargar nada',
  },
} as const;
type SocialLang = keyof typeof SOCIAL_TEXT;

const escapeHtml = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/**
 * Draws the still part of a vertical video (title above, call to action below, an empty slot for
 * the recording) with the page's own font and colors, as a PNG. ffmpeg has no text filter in
 * every build, and a browser lays text out better anyway.
 */
async function drawCard(
  page: Page,
  out: string,
  { kicker, title, text, cta, site }: Record<'kicker' | 'title' | 'text' | 'cta' | 'site', string>,
) {
  // Embedded: a page made with setContent has no origin to fetch the font files from
  const font = (weight: number) =>
    `url(data:font/woff2;base64,${readFileSync(
      `node_modules/@fontsource/fredoka/files/fredoka-latin-${weight}-normal.woff2`,
    ).toString('base64')})`;
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    @font-face { font-family: Fredoka; font-weight: 700; src: ${font(700)}; }
    @font-face { font-family: Fredoka; font-weight: 500; src: ${font(500)}; }
    * { margin: 0; box-sizing: border-box; }
    body { width: ${SOCIAL_W}px; height: ${SOCIAL_H}px; overflow: hidden; color: #f1f2ff;
      font-family: Fredoka, sans-serif; text-align: center;
      background: radial-gradient(900px 700px at 15% 8%, #2a2f7a 0, transparent 70%),
        radial-gradient(900px 800px at 90% 95%, #4a2360 0, transparent 70%), #0d1024; }
    .top { position: absolute; inset: 150px 70px auto; }
    .brand { display: inline-flex; align-items: center; gap: 22px; font: 700 76px Fredoka; }
    .ball { width: 84px; height: 84px; border-radius: 50%; background: #ff6b6b; position: relative; }
    .ball::before, .ball::after { content: ''; position: absolute; top: 24px; width: 20px;
      height: 26px; border-radius: 50%; background: #fff; box-shadow: inset 5px 4px 0 5px #161a33; }
    .ball::before { left: 18px; } .ball::after { right: 18px; }
    .kicker { margin-top: 70px; font: 700 44px Fredoka; color: #ffd166; letter-spacing: 2px;
      text-transform: uppercase; }
    h1 { margin-top: 8px; font: 700 96px/1.05 Fredoka; }
    .slot { position: absolute; left: 0; top: ${SHOT_Y}px; width: ${SOCIAL_W}px; height: ${SHOT_H}px;
      background: #070918; box-shadow: 0 0 0 6px #2a2f5c; }
    .bottom { position: absolute; inset: ${SHOT_Y + SHOT_H + 70}px 80px auto; }
    p { font: 500 50px/1.25 Fredoka; color: #b8bde8; }
    .cta { display: inline-block; margin-top: 70px; padding: 26px 64px; border-radius: 999px;
      background: #ff6b6b; color: #161a33; font: 700 60px Fredoka; }
    .site { margin-top: 30px; font: 700 54px Fredoka; color: #5ee6d6; }
  </style>
  <div class="top"><div class="brand"><span class="ball"></span>Pongui</div>
    <div class="kicker">${escapeHtml(kicker)}</div><h1>${escapeHtml(title)}</h1></div>
  <div class="slot"></div>
  <div class="bottom"><p>${escapeHtml(text)}</p><div class="cta">${escapeHtml(cta)}</div>
    <div class="site">${escapeHtml(site)}</div></div>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out });
}

/** Lays a section of a recording over a card: a 1080×1920 MP4 ready to upload. */
function vertical(card: string, raw: string, from: number, to: number, out: string) {
  ffmpeg(
    ['-loop', '1', '-i', card, '-ss', from.toFixed(2), '-t', (to - from).toFixed(2), '-i', raw]
      .concat([
        '-filter_complex',
        `[1:v]scale=${SOCIAL_W}:${SHOT_H}:flags=lanczos[v];[0:v][v]overlay=0:${SHOT_Y}:shortest=1`,
      ])
      .concat([
        '-r',
        '30',
        '-c:v',
        'libx264',
        '-crf',
        '20',
        '-preset',
        'slow',
        '-pix_fmt',
        'yuv420p',
      ])
      .concat(['-movflags', '+faststart', '-an', out]),
  );
}

/**
 * Channel banner for YouTube: 2048×1152, with everything that matters inside the centered
 * 1235×338 area, the only part every device shows (phones crop the rest).
 */
async function drawBanner(browser: Browser, out: string, site: string, tagline: string) {
  const context = await browser.newContext({ viewport: { width: 2048, height: 1152 } });
  const page = await context.newPage();
  const font = (weight: number) =>
    `url(data:font/woff2;base64,${readFileSync(
      `node_modules/@fontsource/fredoka/files/fredoka-latin-${weight}-normal.woff2`,
    ).toString('base64')})`;
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>
    @font-face { font-family: Fredoka; font-weight: 700; src: ${font(700)}; }
    @font-face { font-family: Fredoka; font-weight: 500; src: ${font(500)}; }
    * { margin: 0; box-sizing: border-box; }
    body { width: 2048px; height: 1152px; overflow: hidden; color: #f1f2ff;
      font-family: Fredoka, sans-serif; display: grid; place-items: center;
      background: radial-gradient(1100px 800px at 12% 10%, #2a2f7a 0, transparent 70%),
        radial-gradient(1100px 900px at 90% 95%, #4a2360 0, transparent 70%), #0d1024; }
    .bubble { position: absolute; border-radius: 50%; background: #ffffff0f; }
    .safe { width: 1235px; height: 338px; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 14px; text-align: center; }
    .brand { display: flex; align-items: center; gap: 30px; font: 700 150px/1 Fredoka; }
    .ball { width: 150px; height: 150px; border-radius: 50%; background: #ff6b6b;
      position: relative; }
    .ball::before, .ball::after { content: ''; position: absolute; top: 42px; width: 36px;
      height: 46px; border-radius: 50%; background: #fff; box-shadow: inset 9px 7px 0 9px #161a33; }
    .ball::before { left: 32px; } .ball::after { right: 32px; }
    p { font: 500 50px/1.2 Fredoka; color: #b8bde8; }
    .site { font: 700 50px/1.2 Fredoka; color: #5ee6d6; }
  </style>
  <div class="bubble" style="width:520px;height:520px;left:-120px;top:560px"></div>
  <div class="bubble" style="width:300px;height:300px;left:330px;top:90px"></div>
  <div class="bubble" style="width:420px;height:420px;right:120px;top:-90px"></div>
  <div class="bubble" style="width:260px;height:260px;right:380px;bottom:60px"></div>
  <div class="safe"><div class="brand"><span class="ball"></span>Pongui</div>
    <p>${escapeHtml(tagline)}</p><div class="site">${escapeHtml(site)}</div></div>`);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out });
  await context.close();
}

async function social(browser: Browser) {
  const { loadEnv } = await import('vite');
  const site = new URL(loadEnv('production', process.cwd()).VITE_SITE_URL).hostname;
  const game = {
    en: (await import('../src/i18n/messages/en')).en,
    es: (await import('../src/i18n/messages/es')).es,
  };
  const landing = {
    en: (await import('../src/landing/messages/en')).en,
    es: (await import('../src/landing/messages/es')).es,
  };
  const langs = Object.keys(SOCIAL_TEXT) as SocialLang[];
  rmSync(SOCIAL, { recursive: true, force: true });
  langs.forEach((lang) => mkdirSync(join(SOCIAL, lang), { recursive: true }));
  const cards = join(SOCIAL, '.cards');
  mkdirSync(cards, { recursive: true });
  const context = await browser.newContext({ viewport: { width: SOCIAL_W, height: SOCIAL_H } });
  const page = await context.newPage();

  const size = { width: SOCIAL_W, height: SHOT_H };
  const worlds = await record(
    browser,
    CLIPS.map((c) => c.level),
    { banner: false, pause: 300, ...size },
  );
  // The recording is overwritten by the next one: finish every video that uses it first
  for (const lang of langs) {
    for (let i = 0; i < WORLDS; i++) {
      const n = i + 1;
      const card = join(cards, `${lang}-world-${n}.png`);
      await drawCard(page, card, {
        kicker: `${SOCIAL_TEXT[lang].world} ${n}`,
        title: game[lang][`world.${n}` as keyof typeof game.en],
        text: landing[lang][`world.${n}.text` as keyof typeof landing.en],
        cta: SOCIAL_TEXT[lang].cta,
        site,
      });
      const part = worlds.parts[i];
      const out = join(SOCIAL, lang, `world-${String(n).padStart(2, '0')}.mp4`);
      vertical(card, worlds.raw, part.start + 0.7, part.won + 0.2, out);
    }
  }
  const editor = await recordEditor(browser, SOCIAL_W);
  for (const lang of langs) {
    const card = join(cards, `${lang}-editor.png`);
    await drawCard(page, card, {
      kicker: SOCIAL_TEXT[lang].where,
      title: SOCIAL_TEXT[lang].editor,
      text: landing[lang]['create.3.text'],
      cta: SOCIAL_TEXT[lang].cta,
      site,
    });
    vertical(card, editor.raw, editor.from, editor.to, join(SOCIAL, lang, 'editor.mp4'));
  }
  await context.close();
  // The game is international: the banner speaks English
  await drawBanner(browser, join(SOCIAL, 'youtube-banner.png'), site, landing.en['hero.kicker']);
  rmSync(cards, { recursive: true, force: true });
  rmSync(TMP, { recursive: true, force: true });
  console.log(`Social videos written to ${SOCIAL}/`);
}

/** The whole set: README media, landing clips and screenshots, and the social image. */
async function everything(browser: Browser) {
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
  // Both skip the first 0.8 s: the page loading and level 1 before the demo starts
  ffmpeg(
    ['-ss', '0.8', '-i', readme.raw, '-vf'].concat([
      'fps=20,scale=640:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=4',
      join(DOCS, 'demo.gif'),
    ]),
  );
  ffmpeg(
    ['-ss', '0.8', '-i', readme.raw, '-c:v', 'libx264', '-pix_fmt', 'yuv420p'].concat([
      '-movflags',
      '+faststart',
      '-an',
      join(DOCS, 'demo.mp4'),
    ]),
  );

  // --- Landing: hero (the last level of the game) and one clip per world, without banners ---
  const hero = await record(browser, [finale(WORLDS)], { banner: false, pause: 300 });
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

  // --- Landing: the level editor, from an empty level to the share dialog ---
  const editor = await recordEditor(browser);
  clip(editor.raw, editor.from, editor.to, join(LANDING, 'editor'), 960);

  rmSync(TMP, { recursive: true, force: true });
  console.log(`Media written to ${DOCS}/, ${LANDING}/ and public/og-image.jpg`);
}

// `pnpm media editor` records only the editor clip (handy while changing it) and
// `pnpm media social` only the vertical videos
const only = process.argv[2];

const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error' });
await server.listen();
mkdirSync(DOCS, { recursive: true });
mkdirSync(LANDING, { recursive: true });
mkdirSync(TMP, { recursive: true });
const browser = await chromium.launch();

try {
  if (only === 'social') await social(browser);
  else if (only === 'banner') {
    mkdirSync(SOCIAL, { recursive: true });
    const { loadEnv } = await import('vite');
    const site = new URL(loadEnv('production', process.cwd()).VITE_SITE_URL).hostname;
    const { en } = await import('../src/landing/messages/en');
    await drawBanner(browser, join(SOCIAL, 'youtube-banner.png'), site, en['hero.kicker']);
  } else if (only === 'editor') {
    const editor = await recordEditor(browser);
    clip(editor.raw, editor.from, editor.to, join(LANDING, 'editor'), 960);
    rmSync(TMP, { recursive: true, force: true });
  } else await everything(browser);
} finally {
  await browser.close();
  await server.close();
}
