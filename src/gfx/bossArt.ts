// How each boss looks: vector drawings baked into textures once (Canvas renderer: no tint, no
// gradient fills). Bodies, the things they throw and the colors of their warnings.
import type Phaser from 'phaser';
import { C, TEX } from './textures';

type G = Phaser.GameObjects.Graphics;

export interface BossArt {
  /** Room above the body's box, in texture pixels (horns, crests). */
  top: number;
  /** Room on each side of the box, in texture pixels (wings, arms). */
  side?: number;
  /** Depth of the body: 4 by default (over the tiles, under the ball). */
  depth?: number;
  /** It comes out of the ground: the part of it under its floor is not drawn. */
  buried?: boolean;
  /** Draws the body for a pose. `w` and `h` are its box in texture pixels, from (0, top). */
  draw(g: G, w: number, h: number, pose: string): void;
}

export interface ShotArt {
  /** Draws it centered in a `w` × `h` texture. */
  draw(g: G, w: number, h: number): void;
}

export interface WarnArt {
  color: number;
  /** A rectangle (the default), a soft spot on the ground, or streaks of wind blowing. */
  shape?: 'rect' | 'spot' | 'wind';
  /** Wind: which way it blows, and whether it is only the warning (fainter and slower). */
  dir?: -1 | 1;
  soft?: boolean;
}

const GRUMBLE = { body: 0x8e2f4f, dark: 0x5e1c35, light: 0xb5486b };

const ART: Record<number, BossArt> = {
  // Grumble: a block with horns, slanted brows and a mouth full of teeth
  1: {
    top: 14,
    draw(g, W, H) {
      const TOP = 14;
      g.fillStyle(GRUMBLE.dark, 1);
      g.fillTriangle(10, TOP + 8, 26, TOP + 8, 14, 0).fillTriangle(
        W - 10,
        TOP + 8,
        W - 26,
        TOP + 8,
        W - 14,
        0,
      );
      g.fillRoundedRect(0, TOP, W, H, 18);
      g.fillStyle(GRUMBLE.body, 1).fillRoundedRect(0, TOP, W, H - 10, 18);
      g.fillStyle(GRUMBLE.light, 1).fillRoundedRect(6, TOP + 5, W - 12, 16, 9);
      // Eyes under slanted brows
      const eyeY = TOP + H * 0.4;
      g.fillStyle(C.white, 1)
        .fillEllipse(W * 0.3, eyeY, 26, 30)
        .fillEllipse(W * 0.7, eyeY, 26, 30);
      g.fillStyle(C.ink, 1)
        .fillCircle(W * 0.33, eyeY + 4, 7)
        .fillCircle(W * 0.67, eyeY + 4, 7);
      g.fillStyle(GRUMBLE.dark, 1);
      g.fillTriangle(W * 0.14, eyeY - 22, W * 0.46, eyeY - 6, W * 0.14, eyeY - 8);
      g.fillTriangle(W * 0.86, eyeY - 22, W * 0.54, eyeY - 6, W * 0.86, eyeY - 8);
      // A mouth full of teeth
      const mouthY = TOP + H * 0.68;
      g.fillStyle(C.ink, 1).fillRoundedRect(W * 0.18, mouthY, W * 0.64, 22, 8);
      g.fillStyle(C.white, 1);
      for (let i = 0; i < 5; i++) {
        const x = W * 0.22 + i * ((W * 0.56) / 5);
        g.fillTriangle(x, mouthY, x + (W * 0.56) / 5, mouthY, x + (W * 0.56) / 10, mouthY + 12);
      }
    },
  },
  // Serpstone: the head and neck of a serpent of ochre rock, with a crest of crystals
  2: {
    top: 18,
    buried: true,
    draw(g, W, H) {
      const TOP = 18;
      const rock = { body: 0xb07d48, dark: 0x7a5230, light: 0xd9a868, belly: 0xf0d9a8 };
      // Crystals along the crest
      g.fillStyle(0x7ae7ff, 1);
      g.fillTriangle(W * 0.3, TOP + 10, W * 0.42, TOP + 10, W * 0.34, 2);
      g.fillTriangle(W * 0.44, TOP + 8, W * 0.6, TOP + 8, W * 0.52, 0);
      g.fillStyle(0xb9f3ff, 1).fillTriangle(W * 0.58, TOP + 10, W * 0.72, TOP + 10, W * 0.68, 6);
      // Neck and head: one rounded column, darker on its back edge
      g.fillStyle(rock.dark, 1).fillRoundedRect(0, TOP, W, H + 20, 30);
      g.fillStyle(rock.body, 1).fillRoundedRect(0, TOP, W - 10, H + 20, 30);
      g.fillStyle(rock.light, 1).fillRoundedRect(8, TOP + 6, W - 34, 14, 7);
      // Belly plates down the neck
      g.fillStyle(rock.belly, 1);
      for (let y = TOP + H * 0.58; y < TOP + H; y += 18)
        g.fillRoundedRect(W * 0.14, y, W * 0.5, 12, 6);
      // Slit eyes
      const eyeY = TOP + H * 0.26;
      g.fillStyle(0xffe66d, 1)
        .fillEllipse(W * 0.26, eyeY, 24, 20)
        .fillEllipse(W * 0.62, eyeY, 24, 20);
      g.fillStyle(C.ink, 1)
        .fillEllipse(W * 0.26, eyeY, 7, 18)
        .fillEllipse(W * 0.62, eyeY, 7, 18);
      // Mouth with two fangs
      const mouthY = TOP + H * 0.42;
      g.fillStyle(C.ink, 1).fillRoundedRect(W * 0.1, mouthY, W * 0.66, 12, 6);
      g.fillStyle(C.white, 1);
      g.fillTriangle(W * 0.18, mouthY + 2, W * 0.3, mouthY + 2, W * 0.24, mouthY + 20);
      g.fillTriangle(W * 0.56, mouthY + 2, W * 0.68, mouthY + 2, W * 0.62, mouthY + 20);
    },
  },
  // Squall: a round storm bird with spread wings, a lightning crest and a hooked beak
  3: {
    top: 16,
    side: 40,
    draw(g, W, H) {
      const TOP = 16;
      const sky = { body: 0x3d5a80, dark: 0x293f5c, light: 0x6f8fb8, belly: 0xc9d6ea };
      // Wings, behind the body
      g.fillStyle(sky.dark, 1);
      g.fillTriangle(8, TOP + H * 0.3, -40, TOP + H * 0.1, -18, TOP + H * 0.75);
      g.fillTriangle(W - 8, TOP + H * 0.3, W + 40, TOP + H * 0.1, W + 18, TOP + H * 0.75);
      g.fillStyle(sky.body, 1);
      g.fillTriangle(10, TOP + H * 0.35, -26, TOP + H * 0.3, 0, TOP + H * 0.8);
      g.fillTriangle(W - 10, TOP + H * 0.35, W + 26, TOP + H * 0.3, W, TOP + H * 0.8);
      // A crest like a lightning bolt
      g.fillStyle(0xffe66d, 1);
      g.fillTriangle(W * 0.42, TOP + 6, W * 0.62, TOP + 6, W * 0.46, 0);
      g.fillTriangle(W * 0.5, TOP + 8, W * 0.7, TOP + 8, W * 0.66, 2);
      g.fillStyle(sky.dark, 1).fillEllipse(W / 2, TOP + H / 2, W, H);
      g.fillStyle(sky.body, 1).fillEllipse(W / 2, TOP + H / 2 - 4, W - 6, H - 10);
      g.fillStyle(sky.belly, 1).fillEllipse(W / 2, TOP + H * 0.74, W * 0.56, H * 0.4);
      g.fillStyle(sky.light, 1).fillEllipse(W * 0.4, TOP + H * 0.16, W * 0.4, 12);
      // Eyes under heavy brows
      const eyeY = TOP + H * 0.4;
      g.fillStyle(C.white, 1)
        .fillEllipse(W * 0.3, eyeY, 24, 26)
        .fillEllipse(W * 0.7, eyeY, 24, 26);
      g.fillStyle(C.ink, 1)
        .fillCircle(W * 0.33, eyeY + 3, 6)
        .fillCircle(W * 0.67, eyeY + 3, 6);
      g.fillStyle(sky.dark, 1);
      g.fillTriangle(W * 0.14, eyeY - 20, W * 0.46, eyeY - 6, W * 0.16, eyeY - 8);
      g.fillTriangle(W * 0.86, eyeY - 20, W * 0.54, eyeY - 6, W * 0.84, eyeY - 8);
      // Beak
      g.fillStyle(0xf4a261, 1).fillTriangle(
        W * 0.4,
        eyeY + 14,
        W * 0.6,
        eyeY + 14,
        W * 0.5,
        eyeY + 40,
      );
      g.fillStyle(0xd97b3a, 1).fillTriangle(
        W * 0.46,
        eyeY + 28,
        W * 0.54,
        eyeY + 28,
        W * 0.5,
        eyeY + 40,
      );
    },
  },
  // Sprocket: a bronze robot with an antenna and a grille mouth, under a dome of light while
  // its shield is on ('open': no dome, its eyes dim)
  4: {
    top: 20,
    side: 14,
    draw(g, W, H, pose) {
      const TOP = 20;
      const metal = { body: 0xc98a4b, dark: 0x8a5a2b, light: 0xf0c08a, steel: 0x5b6b82 };
      // Antenna
      g.fillStyle(metal.steel, 1).fillRect(W / 2 - 3, 4, 6, TOP);
      g.fillStyle(pose === 'open' ? 0x8d99ae : 0xff5964, 1).fillCircle(W / 2, 6, 6);
      // Treads
      g.fillStyle(metal.steel, 1).fillRoundedRect(4, TOP + H - 22, W - 8, 22, 10);
      g.fillStyle(C.ink, 1);
      for (let x = 14; x < W - 10; x += 18) g.fillCircle(x, TOP + H - 11, 5);
      // Body
      g.fillStyle(metal.dark, 1).fillRoundedRect(0, TOP, W, H - 14, 12);
      g.fillStyle(metal.body, 1).fillRoundedRect(0, TOP, W, H - 22, 12);
      g.fillStyle(metal.light, 1).fillRoundedRect(6, TOP + 5, W - 12, 10, 5);
      // Rivets
      g.fillStyle(metal.dark, 1);
      for (const x of [10, W - 10]) for (const y of [TOP + 26, TOP + H - 34]) g.fillCircle(x, y, 4);
      // A visor with two eyes
      const eyeY = TOP + H * 0.36;
      g.fillStyle(C.ink, 1).fillRoundedRect(W * 0.14, eyeY - 14, W * 0.72, 28, 10);
      g.fillStyle(pose === 'open' ? 0x8d99ae : 0x7ae7ff, 1)
        .fillCircle(W * 0.34, eyeY, 8)
        .fillCircle(W * 0.66, eyeY, 8);
      // Grille mouth
      g.fillStyle(C.ink, 1).fillRoundedRect(W * 0.26, TOP + H * 0.58, W * 0.48, 16, 4);
      g.fillStyle(metal.light, 1);
      for (let i = 0; i < 4; i++) g.fillRect(W * 0.3 + i * W * 0.11, TOP + H * 0.58 + 3, 5, 10);
      if (pose === 'open') return;
      // The shield: a dome of light around it
      g.lineStyle(6, 0x7ae7ff, 0.9).strokeRoundedRect(-11, 3, W + 22, H + TOP - 6, 34);
      g.fillStyle(0x7ae7ff, 0.18).fillRoundedRect(-11, 3, W + 22, H + TOP - 6, 34);
    },
  },
  // Inkwell: an octopus with a big round head. Guarding, two arms cross over it; 'open', they
  // hang at its sides and its eyes spin
  5: {
    top: 30,
    side: 26,
    draw(g, W, H, pose) {
      const TOP = 30;
      const skin = { body: 0xd65db1, dark: 0x9b3d86, light: 0xf3a6d8, sucker: 0xffd6ef };
      /** An arm: fat dots along a curve from (x0, y0), bending by `bend` per dot. */
      const arm = (x0: number, y0: number, angle: number, bend: number, n: number) => {
        let x = x0;
        let y = y0;
        let a = angle;
        for (let i = 0; i < n; i++) {
          const r = 13 - (i * 8) / n;
          g.fillStyle(skin.dark, 1).fillCircle(x, y, r);
          g.fillStyle(skin.sucker, 1).fillCircle(x, y, r * 0.35);
          x += Math.cos(a) * r * 1.3;
          y += Math.sin(a) * r * 1.3;
          a += bend;
        }
      };
      const open = pose === 'open';
      // The arms on the sand, always there
      arm(W * 0.2, TOP + H - 14, Math.PI, -0.3, 6);
      arm(W * 0.8, TOP + H - 14, 0, 0.3, 6);
      if (open) {
        // Gathered: hanging limp by its sides
        arm(4, TOP + H * 0.55, Math.PI * 0.6, -0.12, 9);
        arm(W - 4, TOP + H * 0.55, Math.PI * 0.4, 0.12, 9);
      }
      // Head
      g.fillStyle(skin.dark, 1).fillRoundedRect(0, TOP, W, H, { tl: 70, tr: 70, bl: 30, br: 30 });
      g.fillStyle(skin.body, 1).fillRoundedRect(0, TOP, W - 12, H - 12, {
        tl: 70,
        tr: 60,
        bl: 30,
        br: 30,
      });
      g.fillStyle(skin.light, 1).fillEllipse(W * 0.36, TOP + 30, W * 0.4, 22);
      // Spots
      g.fillStyle(skin.dark, 0.5)
        .fillCircle(W * 0.72, TOP + 46, 9)
        .fillCircle(W * 0.6, TOP + 24, 6);
      const eyeY = TOP + H * 0.5;
      g.fillStyle(C.white, 1)
        .fillEllipse(W * 0.3, eyeY, 34, 40)
        .fillEllipse(W * 0.68, eyeY, 34, 40);
      if (open) {
        // Dizzy: rings instead of pupils
        g.lineStyle(4, C.ink, 1)
          .strokeCircle(W * 0.3, eyeY, 9)
          .strokeCircle(W * 0.68, eyeY, 9);
      } else {
        g.fillStyle(C.ink, 1)
          .fillEllipse(W * 0.32, eyeY + 4, 14, 22)
          .fillEllipse(W * 0.66, eyeY + 4, 14, 22);
        g.fillStyle(skin.dark, 1);
        g.fillTriangle(W * 0.12, eyeY - 30, W * 0.46, eyeY - 12, W * 0.14, eyeY - 14);
        g.fillTriangle(W * 0.86, eyeY - 30, W * 0.52, eyeY - 12, W * 0.84, eyeY - 14);
      }
      // A small round mouth
      g.fillStyle(C.ink, 1).fillEllipse(W * 0.49, TOP + H * 0.74, open ? 22 : 30, open ? 22 : 14);
      if (open) return;
      // Guarding: two arms crossed over its head
      arm(-10, TOP + H * 0.42, -Math.PI * 0.42, 0.2, 11);
      arm(W + 10, TOP + H * 0.42, -Math.PI * 0.58, -0.2, 11);
    },
  },
};

/** What bosses throw, by the shot's kind. */
const SHOTS: Record<string, ShotArt> = {
  // A shard of cave rock, point down
  stalactite: {
    draw(g, w, h) {
      g.fillStyle(0x4a3c78, 1).fillTriangle(0, 0, w, 0, w / 2, h);
      g.fillStyle(0xcdb8ff, 1).fillTriangle(w * 0.2, 0, w * 0.6, 0, w * 0.45, h * 0.7);
    },
  },
  // Lightning: a jagged line from the ceiling to the floor
  bolt: {
    draw(g, w, h) {
      const steps = 10;
      for (const [width, color] of [
        [14, 0xffe66d],
        [5, 0xffffff],
      ] as const) {
        g.lineStyle(width, color, 1)
          .beginPath()
          .moveTo(w / 2, 0);
        for (let i = 1; i <= steps; i++)
          g.lineTo(w / 2 + (i === steps ? 0 : i % 2 ? w * 0.3 : -w * 0.3), (h * i) / steps);
        g.strokePath();
      }
    },
  },
  // A screw flying point first, and a spinning gear
  screw: {
    draw(g, w, h) {
      g.fillStyle(0x5b6b82, 1).fillRect(w * 0.3, h * 0.25, w * 0.7, h * 0.5);
      g.fillStyle(0xd9e2ec, 1).fillTriangle(0, h / 2, w * 0.34, 0, w * 0.34, h);
      g.fillStyle(0x8d99ae, 1);
      for (let x = w * 0.45; x < w; x += 8) g.fillRect(x, h * 0.25, 3, h * 0.5);
    },
  },
  gear: {
    draw(g, w, h) {
      g.fillStyle(0x8a5a2b, 1);
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        g.fillCircle(w / 2 + Math.cos(a) * w * 0.4, h / 2 + Math.sin(a) * h * 0.4, w * 0.12);
      }
      g.fillStyle(0xc98a4b, 1).fillCircle(w / 2, h / 2, w * 0.38);
      g.fillStyle(0x23285a, 1).fillCircle(w / 2, h / 2, w * 0.14);
    },
  },
  // A bubble of ink
  ink: {
    draw(g, w, h) {
      g.fillStyle(0x2b1d4f, 1).fillEllipse(w / 2, h / 2, w, h);
      g.fillStyle(0x5a3e9b, 1).fillEllipse(w / 2, h / 2, w * 0.74, h * 0.74);
      g.fillStyle(0xcdb8ff, 0.9).fillEllipse(w * 0.36, h * 0.32, w * 0.22, h * 0.16);
    },
  },
};

/** The color (and shape) of each kind of warning. */
const WARNS: Record<string, WarnArt> = {
  burrow: { color: 0xffd166, shape: 'spot' },
  stalactite: { color: 0xcdb8ff },
  bolt: { color: 0xffe66d },
  screw: { color: 0xff5964 },
  gear: { color: 0xffb703, shape: 'spot' },
  shield: { color: 0x7ae7ff },
  reach: { color: 0xd65db1 },
  grab: { color: 0x9b3d86 },
  ink: { color: 0x5a3e9b, shape: 'spot' },
  'gust-left': { color: 0xffffff, shape: 'wind', dir: -1, soft: true },
  'gust-right': { color: 0xffffff, shape: 'wind', dir: 1, soft: true },
  'blow-left': { color: 0xffffff, shape: 'wind', dir: -1 },
  'blow-right': { color: 0xffffff, shape: 'wind', dir: 1 },
};

/** A round shot: a ball of one color with a lighter core. */
export const orb = (color: number, core: number): ShotArt => ({
  draw(g, w, h) {
    g.fillStyle(color, 1).fillEllipse(w / 2, h / 2, w, h);
    g.fillStyle(core, 1).fillEllipse(w * 0.42, h * 0.4, w * 0.5, h * 0.5);
  },
});

export const artOf = (world: number): BossArt => ART[world] ?? ART[1];
export const warnArt = (kind: string): WarnArt => WARNS[kind] ?? { color: 0xff5964 };

/** The texture of a boss's body in a pose, drawn the first time it is asked for. */
export function bossTexture(
  scene: Phaser.Scene,
  world: number,
  w: number,
  h: number,
  pose = '',
): string {
  const key = pose ? `boss-${world}-${pose}` : `boss-${world}`;
  if (scene.textures.exists(key)) return key;
  const art = artOf(world);
  const side = art.side ?? 0;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  // The art draws the box from (0, top): shift it right by the side room
  g.translateCanvas(side, 0);
  art.draw(g, w * TEX, h * TEX, pose);
  g.generateTexture(key, w * TEX + side * 2, h * TEX + art.top);
  g.destroy();
  return key;
}

/** The texture of a shot of a kind, `rx` × `ry` world units of half size. */
export function shotTexture(scene: Phaser.Scene, kind: string, rx: number, ry: number): string {
  const key = `shot-${kind}`;
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const w = rx * 2 * TEX;
  const h = ry * 2 * TEX;
  (SHOTS[kind] ?? orb(0xff7b54, 0xffd166)).draw(g, w, h);
  g.generateTexture(key, w, h);
  g.destroy();
  return key;
}
