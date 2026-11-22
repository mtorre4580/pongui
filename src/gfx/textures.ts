// Every texture is drawn with vectors at 2× resolution (used at scale 0.5).
import Phaser from 'phaser';
import { BALL_R, TILE } from '../game/constants';

export const TEX = 2; // texture resolution factor
const S = TILE * TEX; // 64 px per tile

export const C = {
  bgTop: 0x23285a,
  bgBottom: 0x0d1024,
  solidTop: 0x5ee6d6,
  solid: 0x2a9d8f,
  solidDark: 0x1d6f66,
  ash: 0x4a4e69,
  ashTop: 0x6c7090,
  fragile: 0xf6d365,
  fragileDark: 0xd9a53f,
  fragile3: 0xf4a261,
  fragile3Dark: 0xc7713a,
  crack: 0x6b3d12,
  fireBase: 0x7a0b18,
  fireGlow: 0xe85d04,
  flame: 0xffba08,
  flameCore: 0xfff3b0,
  spring: 0x7b2cbf,
  springLight: 0xc77dff,
  springPad: 0xf1d6ff,
  ramp: 0x4361ee,
  rampLight: 0xa9b8ff,
  brick: 0xc8553d,
  brickDark: 0x8c3a2b,
  mortar: 0x5c241a,
  spikeBase: 0x495057,
  spike: 0xe9ecef,
  ball: 0xff6b6b,
  ballLight: 0xffb3b3,
  ballDark: 0xd94f5c,
  ink: 0x161a33,
  gem: 0x4cc9f0,
  gemLight: 0xc3f3ff,
  drop: 0x4895ef,
  dropLight: 0xbfe0ff,
  hammerHead: 0xffd166,
  hammerHandle: 0x9c6644,
  heart: 0xff4d6d,
  exit: 0x80ed99,
  exitDark: 0x2d6a4f,
  locked: 0x6c757d,
  white: 0xffffff,
  ui: 0x2b3170,
  uiLight: 0x3d44a0,
  accent: 0xffd166,
};

type G = Phaser.GameObjects.Graphics;

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: G) => void) {
  if (scene.textures.exists(key)) return;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

function block(g: G, body: number, top: number, dark: number) {
  g.fillStyle(dark, 1).fillRoundedRect(0, 0, S, S, 10);
  g.fillStyle(body, 1).fillRoundedRect(0, 0, S, S - 6, 10);
  g.fillStyle(top, 1).fillRoundedRect(0, 0, S, 14, { tl: 10, tr: 10, bl: 0, br: 0 });
}

function fragileCracks(g: G, stage: number) {
  g.lineStyle(3, C.crack, 0.9);
  if (stage >= 1) {
    g.beginPath().moveTo(14, 16).lineTo(24, 30).lineTo(18, 44).strokePath();
  }
  if (stage >= 2) {
    g.beginPath().moveTo(46, 14).lineTo(38, 28).lineTo(48, 40).lineTo(42, 52).strokePath();
    g.beginPath().moveTo(24, 30).lineTo(38, 28).strokePath();
  }
}

function star(g: G, cx: number, cy: number, outer: number, inner: number) {
  const pts: Phaser.Math.Vector2[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? outer : inner;
    pts.push(new Phaser.Math.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
  }
  g.fillPoints(pts, true);
}

export function createTextures(scene: Phaser.Scene) {
  // --- Special tiles ---
  make(scene, 'fragile', S, S, (g) => {
    block(g, C.fragile, 0xfff0a8, C.fragileDark);
    g.fillStyle(C.fragileDark, 0.6);
    for (const [x, y] of [
      [12, 24],
      [30, 38],
      [48, 26],
      [20, 48],
      [44, 50],
    ])
      g.fillCircle(x, y, 3);
  });
  for (let st = 0; st < 3; st++) {
    make(scene, `fragile3-${st}`, S, S, (g) => {
      block(g, C.fragile3, 0xffc896, C.fragile3Dark);
      g.fillStyle(C.fragile3Dark, 1);
      for (let i = 0; i < 3 - st; i++) g.fillCircle(20 + i * 12, 36, 4);
      fragileCracks(g, st);
    });
  }
  make(scene, 'fire', S, S, (g) => {
    g.fillStyle(C.fireBase, 1).fillRoundedRect(0, 0, S, S, 10);
    g.fillStyle(C.fireGlow, 1).fillRoundedRect(0, 0, S, 18, { tl: 10, tr: 10, bl: 0, br: 0 });
    g.fillStyle(0xff8c1a, 0.7);
    for (const [x, y] of [
      [14, 32],
      [34, 44],
      [50, 30],
      [22, 52],
    ])
      g.fillCircle(x, y, 4);
  });
  make(scene, 'flame', S, S, (g) => {
    const tongue = (x: number, h: number, w: number, color: number) => {
      g.fillStyle(color, 1);
      g.fillTriangle(x - w, S, x + w, S, x, S - h);
      g.fillCircle(x, S - w * 0.8, w);
    };
    tongue(14, 40, 11, C.fireGlow);
    tongue(34, 56, 13, C.fireGlow);
    tongue(52, 38, 10, C.fireGlow);
    tongue(16, 26, 7, C.flame);
    tongue(34, 40, 9, C.flame);
    tongue(51, 24, 6, C.flame);
    tongue(34, 22, 5, C.flameCore);
  });
  make(scene, 'ash', S, S, (g) => block(g, C.ash, C.ashTop, 0x34364a));
  make(scene, 'spring', S, S, (g) => {
    g.fillStyle(C.spring, 1).fillRoundedRect(4, 38, S - 8, 26, 8);
    g.lineStyle(7, C.springLight, 1);
    g.beginPath().moveTo(14, 40).lineTo(50, 32).lineTo(14, 24).lineTo(50, 16).strokePath();
    g.fillStyle(C.springPad, 1).fillRoundedRect(2, 2, S - 4, 14, 7);
    g.fillStyle(C.spring, 1).fillRoundedRect(2, 10, S - 4, 6, { tl: 0, tr: 0, bl: 6, br: 6 });
  });
  for (const dir of ['L', 'R'] as const) {
    make(scene, `ramp${dir}`, S, S, (g) => {
      block(g, C.ramp, 0x7b93ff, 0x2b3fae);
      g.fillStyle(C.rampLight, 1);
      const chev = (x: number) => {
        if (dir === 'R') g.fillTriangle(x, 22, x + 14, 36, x, 50);
        else g.fillTriangle(x + 14, 22, x, 36, x + 14, 50);
      };
      chev(10);
      chev(32);
    });
  }
  make(scene, 'wall', S, S, (g) => {
    g.fillStyle(C.mortar, 1).fillRect(0, 0, S, S);
    g.fillStyle(C.brick, 1);
    const bh = 14;
    for (let row = 0; row < 4; row++) {
      const y = row * (bh + 2) + 1;
      const off = row % 2 === 0 ? 0 : -16;
      for (let x = off; x < S; x += 32)
        g.fillRoundedRect(Math.max(0, x + 1), y, Math.min(30, S - x - 1), bh, 3);
    }
    g.fillStyle(C.brickDark, 0.5).fillRect(0, S - 6, S, 6);
  });
  make(scene, 'spike', S, S, (g) => {
    g.fillStyle(C.spikeBase, 1).fillRoundedRect(0, 36, S, 28, 6);
    g.fillStyle(C.spike, 1);
    for (let i = 0; i < 4; i++) g.fillTriangle(i * 16, 40, i * 16 + 16, 40, i * 16 + 8, 6);
    g.fillStyle(0xadb5bd, 1);
    for (let i = 0; i < 4; i++) g.fillTriangle(i * 16 + 8, 40, i * 16 + 16, 40, i * 16 + 8, 6);
  });

  // --- Ball ---
  const BR = BALL_R * TEX + 2;
  make(scene, 'ball', BR * 2, BR * 2, (g) => {
    g.fillStyle(C.ballDark, 1).fillCircle(BR, BR, BR);
    g.fillStyle(C.ball, 1).fillCircle(BR - 1, BR - 2, BR - 3);
    g.fillStyle(C.ballLight, 0.9).fillEllipse(BR - 7, BR - 9, 12, 8);
  });
  make(scene, 'eyes', 28, 16, (g) => {
    g.fillStyle(C.white, 1).fillEllipse(7, 8, 11, 14).fillEllipse(21, 8, 11, 14);
    g.fillStyle(C.ink, 1).fillCircle(9, 9, 3.5).fillCircle(23, 9, 3.5);
    g.fillStyle(C.white, 1).fillCircle(10, 7.5, 1.2).fillCircle(24, 7.5, 1.2);
  });

  // --- Items ---
  make(scene, 'gem', 36, 36, (g) => {
    g.fillStyle(C.gem, 1).fillPoints(
      [
        new Phaser.Math.Vector2(18, 2),
        new Phaser.Math.Vector2(34, 14),
        new Phaser.Math.Vector2(18, 34),
        new Phaser.Math.Vector2(2, 14),
      ],
      true,
    );
    g.fillStyle(C.gemLight, 1).fillPoints(
      [
        new Phaser.Math.Vector2(18, 2),
        new Phaser.Math.Vector2(26, 14),
        new Phaser.Math.Vector2(18, 14),
        new Phaser.Math.Vector2(10, 14),
      ],
      true,
    );
    g.fillStyle(0x2b9fc4, 1).fillPoints(
      [
        new Phaser.Math.Vector2(2, 14),
        new Phaser.Math.Vector2(18, 14),
        new Phaser.Math.Vector2(18, 34),
      ],
      true,
    );
  });
  make(scene, 'drop', 32, 40, (g) => {
    g.fillStyle(C.drop, 1);
    g.fillCircle(16, 26, 12);
    g.fillTriangle(5, 21, 27, 21, 16, 2);
    g.fillStyle(C.dropLight, 1).fillEllipse(11, 25, 6, 10);
  });
  make(scene, 'hammer', 40, 40, (g) => {
    g.fillStyle(C.hammerHandle, 1).fillRoundedRect(17, 12, 7, 26, 3);
    g.fillStyle(C.hammerHead, 1).fillRoundedRect(4, 4, 32, 14, 5);
    g.fillStyle(0xffe8a3, 1).fillRoundedRect(6, 6, 12, 4, 2);
  });
  make(scene, 'life', 36, 34, (g) => {
    g.fillStyle(C.heart, 1);
    g.fillCircle(11, 12, 9).fillCircle(25, 12, 9);
    g.fillTriangle(3, 16, 33, 16, 18, 32);
    g.fillStyle(0xffb3c1, 1).fillCircle(9, 9, 3);
  });

  // --- Exit ---
  make(scene, 'exit', 60, 60, (g) => {
    g.fillStyle(C.exit, 0.25).fillCircle(30, 30, 29);
    g.lineStyle(5, C.exit, 1).strokeCircle(30, 30, 24);
    g.lineStyle(4, 0xd8f3dc, 1);
    g.beginPath()
      .arc(30, 30, 15, 0, Math.PI * 1.3)
      .strokePath();
    g.beginPath()
      .arc(30, 30, 8, Math.PI, Math.PI * 2.2)
      .strokePath();
  });
  make(scene, 'exit-locked', 60, 60, (g) => {
    g.lineStyle(4, C.locked, 0.8);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.beginPath()
        .arc(30, 30, 24, a, a + 0.3)
        .strokePath();
    }
    g.fillStyle(C.locked, 0.9).fillRoundedRect(22, 28, 16, 12, 3);
    g.lineStyle(3, C.locked, 0.9).beginPath().arc(30, 28, 5, Math.PI, 0).strokePath();
  });

  // --- Particles and UI ---
  make(scene, 'spark', 12, 12, (g) => g.fillStyle(C.white, 1).fillCircle(6, 6, 6));
  make(scene, 'star', 48, 48, (g) => {
    g.fillStyle(C.accent, 1);
    star(g, 24, 25, 22, 10);
  });
  make(scene, 'star-off', 48, 48, (g) => {
    g.fillStyle(0x4a4f7a, 1);
    star(g, 24, 25, 22, 10);
  });
  make(scene, 'lock', 32, 36, (g) => {
    g.lineStyle(5, 0xa0a4c8, 1).beginPath().arc(16, 16, 9, Math.PI, 0).strokePath();
    g.fillStyle(0xa0a4c8, 1).fillRoundedRect(3, 15, 26, 20, 5);
    g.fillStyle(C.ui, 1).fillCircle(16, 24, 3);
  });
}

/** Static layer: solid blocks drawn as one piece, with a light edge where they face open air. */
function drawSolids(
  g: G,
  tiles: Uint8Array,
  cols: number,
  rows: number,
  isSolid: (t: number) => boolean,
  ash: number,
) {
  const at = (c: number, r: number) =>
    c < 0 || c >= cols || r < 0 || r >= rows ? -1 : tiles[r * cols + c];
  const k = TEX;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const t = at(c, r);
      if (!isSolid(t)) continue;
      const x = c * TILE * k;
      const y = r * TILE * k;
      const T2 = TILE * k;
      const isAsh = t === ash;
      const body = isAsh ? C.ash : C.solid;
      const dark = isAsh ? 0x34364a : C.solidDark;
      const top = isAsh ? C.ashTop : C.solidTop;
      g.fillStyle(body, 1).fillRect(x, y, T2, T2);
      if (!isSolid(at(c, r + 1))) g.fillStyle(dark, 1).fillRect(x, y + T2 - 3 * k, T2, 3 * k);
      if (!isSolid(at(c - 1, r))) g.fillStyle(dark, 0.5).fillRect(x, y, 2 * k, T2);
      if (!isSolid(at(c + 1, r))) g.fillStyle(dark, 0.5).fillRect(x + T2 - 2 * k, y, 2 * k, T2);
      if (!isSolid(at(c, r - 1))) {
        g.fillStyle(top, 1).fillRect(x, y, T2, 6 * k);
        g.fillStyle(0xffffff, 0.18).fillRect(x, y, T2, 2 * k);
      }
      // subtle texture
      g.fillStyle(dark, 0.35);
      const seed = (c * 7 + r * 13) % 5;
      g.fillCircle(x + (8 + seed * 3) * k, y + (18 + (seed % 3) * 3) * k, 1.6 * k);
      g.fillCircle(x + (22 - seed) * k, y + (24 - (seed % 2) * 4) * k, 1.2 * k);
    }
  }
}

/**
 * Bakes the solid blocks into a texture. The Canvas renderer replays Graphics commands every
 * frame, so static layers are drawn once and shown as a single image.
 */
export function bakeSolids(
  scene: Phaser.Scene,
  key: string,
  tiles: Uint8Array,
  cols: number,
  rows: number,
  isSolid: (t: number) => boolean,
  ash: number,
) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  drawSolids(g, tiles, cols, rows, isSolid, ash);
  g.generateTexture(key, cols * TILE * TEX, rows * TILE * TEX);
  g.destroy();
}

/** Particle texture of a given color (Canvas does not tint images). */
export function sparkTexture(scene: Phaser.Scene, color: number) {
  const key = `spark-${color.toString(16)}`;
  make(scene, key, 12, 12, (g) => g.fillStyle(color, 1).fillCircle(6, 6, 6));
  return key;
}

/** Background with a gradient, soft bubbles and dots, baked once per seed. */
export function drawBackground(scene: Phaser.Scene, w: number, h: number, seed = 1) {
  const key = `bg-${seed}-${w}x${h}`;
  if (!scene.textures.exists(key)) {
    const tex = scene.textures.createCanvas(key, w * TEX, h * TEX)!;
    const ctx = tex.getContext();
    const css = (c: number, a = 1) =>
      `rgba(${(c >> 16) & 255}, ${(c >> 8) & 255}, ${c & 255}, ${a})`;
    const grad = ctx.createLinearGradient(0, 0, 0, h * TEX);
    grad.addColorStop(0, css(C.bgTop));
    grad.addColorStop(1, css(C.bgBottom));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w * TEX, h * TEX);
    let s = seed * 9301 + 49297;
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const circle = (x: number, y: number, r: number) => {
      ctx.beginPath();
      ctx.arc(x * TEX, y * TEX, r * TEX, 0, Math.PI * 2);
      ctx.fill();
    };
    for (let i = 0; i < 14; i++) {
      const color = i % 3 === 0 ? 0x4cc9f0 : i % 3 === 1 ? 0xc77dff : 0xff6b6b;
      ctx.fillStyle = css(color, 0.05 + rnd() * 0.05);
      circle(rnd() * w, rnd() * h, 20 + rnd() * 60);
    }
    ctx.fillStyle = css(0xffffff, 0.05);
    for (let y = 16; y < h; y += 32) for (let x = 16; x < w; x += 32) circle(x, y, 1);
    tex.refresh();
  }
  return scene.add
    .image(0, 0, key)
    .setOrigin(0)
    .setScale(1 / TEX)
    .setDepth(-10);
}
