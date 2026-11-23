// Every texture is drawn with vectors at 2× resolution (used at scale 0.5).
import Phaser from 'phaser';
import { BALL_R, TILE } from '../game/constants';
import { THEMES, type Theme } from './themes';

export const TEX = 2; // texture resolution factor
const S = TILE * TEX; // 64 px per tile

export const C = {
  // Background and solid block colors depend on the world: see themes.ts
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
  key: 0xffc53d,
  keyLight: 0xffe8a3,
  keyDark: 0xb7791f,
  lock: 0x6c7a99,
  lockTop: 0xa9b6d3,
  lockDark: 0x48536e,
  moss: 0x40916c,
  mossTop: 0x95d5b2,
  mossDark: 0x1b4332,
  cloud: 0xffffff,
  cloudShade: 0xc9dcff,
  wind: 0xd7ecff,
  gearBody: 0x5c677d,
  gearTop: 0x9aa6bf,
  gearDark: 0x3a4152,
  blockA: 0xff9f1c,
  blockALight: 0xffd08a,
  blockADark: 0xc46f00,
  blockB: 0x2ec4b6,
  blockBLight: 0x9ff0e7,
  blockBDark: 0x168a80,
  pusher: 0xe63946,
  pusherLight: 0xff8fa3,
  pusherDark: 0x9d1c28,
  portal1: 0xff4d9d,
  portal2: 0xa7f432,
  portal3: 0xff9e00,
  ice: 0x9bdcf5,
  iceLight: 0xe6f8ff,
  iceDark: 0x5aa7cf,
  crumble: 0x8a5a44,
  crumbleTop: 0xc08a6a,
  crumbleDark: 0x4e3027,
  ventRock: 0x3b3a42,
  ventGrate: 0x1c1b22,
  lava: 0xff6d00,
  lavaLight: 0xffd166,
  zone: 0x9d4edd,
  zoneLight: 0xe0aaff,
  bumper: 0xff006e,
  bumperLight: 0xff8fc0,
  bumperDark: 0xa1004a,
  water: 0x3fa7d6,
  waterLight: 0xb8f2ff,
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

  make(scene, 'lockblock', S, S, (g) => {
    block(g, C.lock, C.lockTop, C.lockDark);
    // Rivets and a gold plate with a keyhole
    g.fillStyle(C.lockDark, 1);
    for (const [x, y] of [
      [9, 21],
      [55, 21],
      [9, 49],
      [55, 49],
    ])
      g.fillCircle(x, y, 3);
    g.fillStyle(C.keyDark, 1).fillCircle(32, 35, 14);
    g.fillStyle(C.key, 1).fillCircle(32, 34, 12);
    g.fillStyle(C.ink, 1).fillCircle(32, 31, 4.5);
    g.fillTriangle(28, 42, 36, 42, 32, 31);
  });
  make(scene, 'moss', S, S, (g) => {
    g.fillStyle(C.mossDark, 1).fillRoundedRect(0, 0, S, S, 10);
    g.fillStyle(C.moss, 1).fillRoundedRect(0, 0, S, S - 6, 10);
    // A soft, bumpy cushion on top
    g.fillStyle(C.mossTop, 1).fillRoundedRect(0, 0, S, 14, { tl: 10, tr: 10, bl: 0, br: 0 });
    for (let x = 6; x < S; x += 13) g.fillCircle(x, 14, 6);
    g.fillStyle(C.mossDark, 0.35);
    for (const [x, y] of [
      [14, 34],
      [36, 44],
      [50, 30],
      [24, 50],
    ])
      g.fillCircle(x, y, 3);
  });

  make(scene, 'cloud', S, S, (g) => {
    // A puffy one-way platform: flat top, soft underside
    g.fillStyle(C.cloudShade, 1);
    g.fillCircle(14, 30, 14).fillCircle(34, 32, 16).fillCircle(52, 30, 13);
    g.fillStyle(C.cloud, 1);
    g.fillRoundedRect(0, 2, S, 20, 10);
    g.fillCircle(14, 24, 13).fillCircle(33, 25, 15).fillCircle(51, 24, 12);
    g.fillStyle(C.cloudShade, 0.6).fillRoundedRect(6, 4, S - 12, 4, 2);
  });
  make(scene, 'updraft', S, S, (g) => {
    // Rising air: a faint column with chevrons pointing up
    g.fillStyle(C.wind, 0.1).fillRect(4, 0, S - 8, S);
    g.lineStyle(4, C.wind, 0.4);
    for (const y of [14, 42]) {
      g.beginPath()
        .moveTo(18, y + 12)
        .lineTo(32, y)
        .lineTo(46, y + 12)
        .strokePath();
    }
  });

  // --- Gear Works: switches, A/B blocks, pushers ---
  // A switch is a steel block with a lamp showing which blocks are solid (amber A or teal B)
  for (const on of [false, true]) {
    make(scene, on ? 'switch-on' : 'switch-off', S, S, (g) => {
      block(g, C.gearBody, C.gearTop, C.gearDark);
      const lamp = on ? C.blockA : C.blockB;
      const lampLight = on ? C.blockALight : C.blockBLight;
      g.fillStyle(C.gearDark, 1).fillRoundedRect(14, 4, 36, 12, 6);
      g.fillStyle(lamp, 1).fillRoundedRect(17, 2, 30, 10, 5);
      g.fillStyle(lampLight, 1).fillRoundedRect(21, 3, 12, 3, 1.5);
      // Two arrows that point at each other: "flip"
      g.fillStyle(C.ink, 0.55);
      g.fillTriangle(12, 34, 24, 27, 24, 41);
      g.fillTriangle(52, 42, 40, 35, 40, 49);
      g.fillRect(24, 32, 10, 4).fillRect(30, 40, 10, 4);
    });
  }
  // Solid A/B blocks, and the dashed outline they leave while open
  const toggle = (key: string, body: number, light: number, dark: number, mark: 'A' | 'B') => {
    make(scene, key, S, S, (g) => {
      block(g, body, light, dark);
      g.fillStyle(dark, 0.9);
      if (mark === 'A') {
        g.fillTriangle(22, 48, 32, 22, 42, 48);
        g.fillStyle(body, 1).fillTriangle(28, 48, 32, 36, 36, 48);
      } else {
        // B blocks carry a ring, A blocks a triangle: they differ in shape, not only color
        g.fillCircle(32, 36, 12);
        g.fillStyle(body, 1).fillCircle(32, 36, 6);
      }
    });
    make(scene, `${key}-open`, S, S, (g) => {
      g.fillStyle(body, 0.12).fillRoundedRect(4, 4, S - 8, S - 8, 8);
      g.fillStyle(body, 0.75);
      for (let i = 8; i < S - 8; i += 12) {
        g.fillRect(i, 3, 6, 3).fillRect(i, S - 6, 6, 3);
        g.fillRect(3, i, 3, 6).fillRect(S - 6, i, 3, 6);
      }
    });
  };
  toggle('blockA', C.blockA, C.blockALight, C.blockADark, 'A');
  toggle('blockB', C.blockB, C.blockBLight, C.blockBDark, 'B');
  for (const dir of ['L', 'R'] as const) {
    make(scene, `push${dir}`, S, S, (g) => {
      block(g, C.pusher, C.pusherLight, C.pusherDark);
      // A piston plate on top and a low, flat arrow
      g.fillStyle(C.gearTop, 1).fillRoundedRect(6, 2, S - 12, 8, 4);
      g.fillStyle(C.white, 0.9);
      if (dir === 'R') {
        g.fillRect(12, 32, 24, 8);
        g.fillTriangle(34, 24, 52, 36, 34, 48);
      } else {
        g.fillRect(28, 32, 24, 8);
        g.fillTriangle(30, 24, 12, 36, 30, 48);
      }
    });
  }

  // --- Coral Lagoon: portals and water ---
  // Portals: glowing rings with one, two or three dots, so pairs read without color too
  [C.portal1, C.portal2, C.portal3].forEach((color, i) => {
    make(scene, `portal${i + 1}`, S, S, (g) => {
      g.fillStyle(color, 0.18).fillCircle(32, 32, 30);
      g.lineStyle(5, color, 1).strokeCircle(32, 32, 25);
      g.lineStyle(3, color, 0.6);
      g.beginPath()
        .arc(32, 32, 16, 0, Math.PI * 1.2)
        .strokePath();
      g.fillStyle(C.white, 0.95);
      for (let k = 0; k <= i; k++) {
        const a = (k / (i + 1)) * Math.PI * 2 - Math.PI / 2;
        g.fillCircle(32 + Math.cos(a) * (i ? 7 : 0), 32 + Math.sin(a) * (i ? 7 : 0), 4);
      }
    });
  });

  // --- Frost Peaks: ice and thin ice ---
  make(scene, 'ice', S, S, (g) => {
    block(g, C.ice, C.iceLight, C.iceDark);
    // Diagonal shine streaks: smooth and slippery
    g.fillStyle(C.white, 0.75);
    g.fillTriangle(10, 44, 18, 44, 30, 20);
    g.fillTriangle(30, 20, 38, 20, 18, 44);
    g.fillStyle(C.white, 0.45);
    g.fillTriangle(34, 50, 40, 50, 50, 30);
    g.fillTriangle(50, 30, 56, 30, 40, 50);
  });
  make(scene, 'thinice', S, S, (g) => {
    // A see-through slab with cracks: it will not take a high bounce
    g.fillStyle(C.ice, 0.45).fillRoundedRect(0, 0, S, 24, 8);
    g.fillStyle(C.iceLight, 0.9).fillRoundedRect(0, 0, S, 7, { tl: 8, tr: 8, bl: 0, br: 0 });
    g.lineStyle(2.5, C.white, 0.85);
    g.beginPath().moveTo(12, 6).lineTo(20, 14).lineTo(16, 22).strokePath();
    g.beginPath().moveTo(20, 14).lineTo(32, 12).lineTo(42, 20).strokePath();
    g.beginPath().moveTo(42, 20).lineTo(52, 8).strokePath();
  });

  // --- Ember Core: crumbling blocks and vents ---
  make(scene, 'crumble', S, S, (g) => {
    block(g, C.crumble, C.crumbleTop, C.crumbleDark);
    // Loose chunks and deep cracks
    g.lineStyle(3, C.crumbleDark, 1);
    g.beginPath().moveTo(8, 20).lineTo(22, 30).lineTo(16, 46).strokePath();
    g.beginPath().moveTo(22, 30).lineTo(40, 26).lineTo(50, 40).lineTo(44, 56).strokePath();
    g.beginPath().moveTo(40, 26).lineTo(46, 14).strokePath();
    g.fillStyle(C.crumbleDark, 0.8).fillCircle(30, 48, 3).fillCircle(52, 22, 2.5);
  });
  // A vent is a grate in dark rock; lit, the grate glows with lava (its flame is drawn apart)
  for (const lit of [false, true]) {
    make(scene, lit ? 'vent-lit' : 'vent-off', S, S, (g) => {
      g.fillStyle(C.ventGrate, 1).fillRoundedRect(0, 0, S, S, 10);
      g.fillStyle(C.ventRock, 1).fillRoundedRect(0, 0, S, S - 6, 10);
      g.fillStyle(lit ? C.lava : C.ventGrate, 1).fillRoundedRect(8, 4, S - 16, 18, 6);
      g.fillStyle(lit ? C.lavaLight : C.ventRock, 1);
      for (let x = 14; x < S - 10; x += 10) g.fillRect(x, 4, 4, 18);
      g.fillStyle(lit ? C.lava : 0x55535e, lit ? 0.6 : 1);
      for (const [x, y] of [
        [14, 38],
        [34, 46],
        [50, 34],
      ])
        g.fillCircle(x, y, 3);
    });
  }

  // --- Star Station: bumpers (zones are a baked layer, see scenes/Game.ts) ---
  make(scene, 'bumper', S, S, (g) => {
    // A round pinball bumper on a steel base: rings and a star
    g.fillStyle(0x353b48, 1).fillRoundedRect(0, 0, S, S, 10);
    g.fillStyle(C.bumperDark, 1).fillCircle(32, 32, 30);
    g.fillStyle(C.bumper, 1).fillCircle(32, 31, 27);
    g.fillStyle(C.bumperLight, 1).fillCircle(32, 31, 18);
    g.fillStyle(C.bumper, 1).fillCircle(32, 31, 13);
    g.fillStyle(C.white, 1);
    star(g, 32, 32, 10, 4.5);
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
  make(scene, 'key', 40, 40, (g) => {
    g.fillStyle(C.keyDark, 1).fillCircle(12, 21, 11);
    g.fillStyle(C.key, 1).fillCircle(12, 20, 10);
    g.fillStyle(C.ink, 1).fillCircle(12, 20, 4);
    g.fillStyle(C.key, 1).fillRoundedRect(19, 17, 19, 7, 3);
    g.fillRect(29, 22, 4, 9).fillRect(35, 22, 3, 6);
    g.fillStyle(C.keyLight, 1).fillEllipse(8, 15, 6, 4);
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
  theme: Theme,
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
      const body = isAsh ? C.ash : theme.solid;
      const dark = isAsh ? 0x34364a : theme.solidDark;
      const top = isAsh ? C.ashTop : theme.solidTop;
      g.fillStyle(body, 1).fillRect(x, y, T2, T2);
      if (!isSolid(at(c, r + 1))) g.fillStyle(dark, 1).fillRect(x, y + T2 - 3 * k, T2, 3 * k);
      if (!isSolid(at(c - 1, r))) g.fillStyle(dark, 0.5).fillRect(x, y, 2 * k, T2);
      if (!isSolid(at(c + 1, r))) g.fillStyle(dark, 0.5).fillRect(x + T2 - 2 * k, y, 2 * k, T2);
      if (!isSolid(at(c, r - 1))) {
        g.fillStyle(top, 1).fillRect(x, y, T2, 6 * k);
        g.fillStyle(0xffffff, 0.18).fillRect(x, y, T2, 2 * k);
      }
      // subtle texture: pebbles, or crystal shards in some worlds
      const seed = (c * 7 + r * 13) % 5;
      if (theme.pattern === 'crystals' && !isAsh) {
        const cx = x + (9 + seed * 3) * k;
        const cy = y + (20 + (seed % 3) * 2) * k;
        g.fillStyle(theme.speck, 0.55);
        g.fillTriangle(cx - 2 * k, cy, cx + 2 * k, cy, cx, cy - 6 * k);
        g.fillTriangle(cx + 1 * k, cy, cx + 4 * k, cy, cx + 3 * k, cy - 4 * k);
        g.fillStyle(dark, 0.35).fillCircle(
          x + (23 - seed) * k,
          y + (25 - (seed % 2) * 4) * k,
          1.2 * k,
        );
      } else if (theme.pattern === 'panels' && !isAsh) {
        // Metal panels: a seam and two screws
        g.fillStyle(theme.speck, 0.5);
        g.fillRect(x, y + 20 * k, T2, 1 * k);
        g.fillCircle(x + 6 * k, y + 14 * k, 1.3 * k);
        g.fillCircle(x + 26 * k, y + 26 * k, 1.3 * k);
      } else if (theme.pattern === 'embers' && !isAsh) {
        // Glowing cracks in dark basalt
        g.lineStyle(1.2 * k, theme.speck, 0.7);
        const ex = x + (7 + seed * 3) * k;
        const ey = y + (16 + (seed % 3) * 3) * k;
        g.beginPath()
          .moveTo(ex, ey)
          .lineTo(ex + 4 * k, ey + 3 * k)
          .lineTo(ex + 3 * k, ey + 7 * k)
          .strokePath();
        g.fillStyle(theme.speck, 0.6).fillCircle(
          x + (23 - seed) * k,
          y + (25 - (seed % 2) * 4) * k,
          1 * k,
        );
      } else if (theme.pattern === 'snow' && !isAsh) {
        // Snowflakes: small plus signs
        g.fillStyle(theme.speck, 0.6);
        const fx = x + (9 + seed * 3) * k;
        const fy = y + (18 + (seed % 3) * 3) * k;
        g.fillRect(fx - 2.5 * k, fy - 0.6 * k, 5 * k, 1.2 * k);
        g.fillRect(fx - 0.6 * k, fy - 2.5 * k, 1.2 * k, 5 * k);
        g.fillCircle(x + (23 - seed) * k, y + (25 - (seed % 2) * 4) * k, 1.1 * k);
      } else if (theme.pattern === 'coral' && !isAsh) {
        // Little coral polyps: rings of different sizes
        g.lineStyle(1.2 * k, theme.speck, 0.55);
        g.strokeCircle(x + (8 + seed * 3) * k, y + (17 + (seed % 3) * 3) * k, 2.2 * k);
        g.strokeCircle(x + (22 - seed) * k, y + (25 - (seed % 2) * 4) * k, 1.5 * k);
        g.fillStyle(theme.speck, 0.4).fillCircle(x + (15 + seed) * k, y + 22 * k, 1 * k);
      } else if (theme.pattern === 'rivets' && !isAsh) {
        // Bolted metal plates
        g.fillStyle(theme.speck, 0.6);
        for (const [px, py] of [
          [5, 11],
          [27, 11],
          [5, 26],
          [27, 26],
        ])
          g.fillCircle(x + px * k, y + py * k, 1.5 * k);
        g.fillStyle(theme.solidTop, 0.25).fillRect(x + 4 * k, y + 18 * k, 24 * k, 1 * k);
      } else {
        g.fillStyle(isAsh ? dark : theme.speck, 0.35);
        g.fillCircle(x + (8 + seed * 3) * k, y + (18 + (seed % 3) * 3) * k, 1.6 * k);
        g.fillCircle(x + (22 - seed) * k, y + (24 - (seed % 2) * 4) * k, 1.2 * k);
      }
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
  theme: Theme = THEMES[1],
) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  drawSolids(g, tiles, cols, rows, isSolid, ash, theme);
  g.generateTexture(key, cols * TILE * TEX, rows * TILE * TEX);
  g.destroy();
}

/** Particle texture of a given color (Canvas does not tint images). */
export function sparkTexture(scene: Phaser.Scene, color: number) {
  const key = `spark-${color.toString(16)}`;
  make(scene, key, 12, 12, (g) => g.fillStyle(color, 1).fillCircle(6, 6, 6));
  return key;
}

/**
 * Background with a gradient, soft bubbles and dots, baked once per seed. It covers far more than
 * the w×h world (3× wide, 2× tall, centered on it) so it fills the screen at any aspect ratio.
 * It is soft, so it is baked at 1 texture pixel per world unit to save memory.
 */
export function drawBackground(
  scene: Phaser.Scene,
  w: number,
  h: number,
  seed = 1,
  theme: Theme = THEMES[1],
) {
  const key = `bg-${theme.bgTop.toString(16)}-${seed}-${w}x${h}`;
  const x0 = -w;
  const y0 = -h / 2;
  const W = w * 3;
  const H = h * 2;
  if (!scene.textures.exists(key)) {
    const tex = scene.textures.createCanvas(key, W, H)!;
    const ctx = tex.getContext();
    const css = (c: number, a = 1) =>
      `rgba(${(c >> 16) & 255}, ${(c >> 8) & 255}, ${c & 255}, ${a})`;
    // Same gradient as before over the world (top → bottom); beyond it the end colors continue
    const grad = ctx.createLinearGradient(0, -y0, 0, h - y0);
    grad.addColorStop(0, css(theme.bgTop));
    grad.addColorStop(1, css(theme.bgBottom));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    let s = seed * 9301 + 49297;
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const circle = (x: number, y: number, r: number) => {
      ctx.beginPath();
      ctx.arc(x - x0, y - y0, r, 0, Math.PI * 2);
      ctx.fill();
    };
    const bubble = (i: number, x: number, y: number) => {
      const color = theme.bubbles[i % 3];
      ctx.fillStyle = css(color, 0.05 + rnd() * 0.05);
      circle(x, y, 20 + rnd() * 60);
    };
    // The world area keeps its bubbles; the extended area gets its own
    for (let i = 0; i < 14; i++) bubble(i, rnd() * w, rnd() * h);
    for (let i = 0; i < 40; i++) {
      const x = x0 + rnd() * W;
      const y = y0 + rnd() * H;
      if (x > 0 && x < w && y > 0 && y < h) continue;
      bubble(i, x, y);
    }
    ctx.fillStyle = css(0xffffff, 0.05);
    for (let y = y0 + 16; y < y0 + H; y += 32)
      for (let x = x0 + 16; x < x0 + W; x += 32) circle(x, y, 1);
    tex.refresh();
  }
  return scene.add.image(x0, y0, key).setOrigin(0).setDepth(-10);
}
