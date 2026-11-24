// Plays a boss fight in the real scene with real key presses: `pnpm play:boss 2` (needs
// `pnpm dev` running, or starts on PLAY_BOSS_URL). The boss's script (src/bosses/scripts.ts)
// decides which keys to hold; Playwright presses them. A screenshot is saved at the start of
// each phase in docs/bosses/.
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';

const world = Number(process.argv[2] ?? 1);
const tries = Number(process.argv[3] ?? 3);
const base = process.env.PLAY_BOSS_URL ?? 'http://localhost:5173/';
const out = 'docs/bosses';
const KEYS = { left: 'ArrowLeft', right: 'ArrowRight', jump: 'Space' } as const;

interface Report {
  keys: Record<keyof typeof KEYS, boolean> | null;
  hp: number;
  won: boolean;
  status: string;
  lives: number;
  time: number;
  busy: boolean;
}

mkdirSync(out, { recursive: true });
// PLAY_BOSS_CHROMIUM: a Chromium to use instead of the one Playwright downloads
const browser = await chromium.launch({ executablePath: process.env.PLAY_BOSS_CHROMIUM });
const page = await browser.newPage({ viewport: { width: 960, height: 624 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() =>
  localStorage.setItem('pongui:save', JSON.stringify({ unlocked: 0, levels: {}, sound: false })),
);

const shot = (name: string) =>
  page.screenshot({ path: `${out}/w${world}-${name}.jpg`, type: 'jpeg', quality: 60 });

let won = false;
/** Hits the boss takes (the first report of a fight says it). */
let def = 0;
for (let attempt = 1; attempt <= tries && !won; attempt++) {
  await page.goto(`${base}play/?boss=${world}`);
  await page.waitForFunction(() => document.body.dataset.scene === 'Game');
  const held = { left: false, right: false, jump: false };
  let hp = -1;
  let lives = -1;
  let since = 0;
  let busyAt = -1;
  const taken = new Set<number>();
  const t0 = Date.now();
  while (Date.now() - t0 < 240_000) {
    const r = await page.evaluate(
      () => (window as unknown as { boss(): Report | null }).boss?.() ?? null,
    );
    const scene = await page.evaluate(() => document.body.dataset.scene);
    if (!r || scene === 'Overlay') {
      if (scene === 'Overlay') break;
      await page.waitForTimeout(30);
      continue;
    }
    if (r.won) {
      won = true;
      break;
    }
    def = Math.max(def, r.hp);
    if (r.keys && (r.hp !== hp || r.lives !== lives) && r.time > 0.3) {
      hp = r.hp;
      lives = r.lives;
      since = r.time;
      console.log(
        `attempt ${attempt}: ${r.time.toFixed(1)} s, hits left ${r.hp}, lives ${r.lives}`,
      );
    }
    // One picture per phase: a moment after the boss is in sight with an attack under way (or a few seconds in, if that
    // never comes)
    const phase = def - r.hp + 1;
    if (r.busy && busyAt < since) busyAt = r.time;
    const ready = busyAt >= since && r.time - busyAt > 0.4;
    if (r.keys && !taken.has(phase) && (ready || r.time - since > 4)) {
      taken.add(phase);
      await shot(`phase-${phase}`);
    }
    for (const k of Object.keys(KEYS) as (keyof typeof KEYS)[]) {
      const want = r.keys?.[k] ?? false;
      if (want === held[k]) continue;
      held[k] = want;
      if (want) await page.keyboard.down(KEYS[k]);
      else await page.keyboard.up(KEYS[k]);
    }
  }
  for (const k of Object.keys(KEYS) as (keyof typeof KEYS)[])
    if (held[k]) await page.keyboard.up(KEYS[k]);
  if (won) {
    await page.waitForTimeout(600);
    await shot('down');
    await page.waitForFunction(() => document.body.dataset.scene === 'Overlay');
    await page.waitForTimeout(400);
    await shot('won');
  }
  console.log(`attempt ${attempt}: ${won ? 'boss beaten' : 'lost'}`);
}
const save = await page.evaluate(() => JSON.parse(localStorage.getItem('pongui:save')!));
console.log(
  `bosses on record: ${JSON.stringify(save.bosses ?? [])}; page errors: ${errors.length}`,
);
errors.forEach((e) => console.log(`  ${e}`));
await browser.close();
process.exit(won && errors.length === 0 ? 0 : 1);
