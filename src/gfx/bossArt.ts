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
  /** Draws the body for a pose. `w` and `h` are its box in texture pixels, from (0, top). */
  draw(g: G, w: number, h: number, pose: string): void;
}

export interface ShotArt {
  /** Draws it centered in a `w` × `h` texture. */
  draw(g: G, w: number, h: number): void;
}

export interface WarnArt {
  color: number;
  /** A rectangle (the default) or a soft spot on the ground. */
  shape?: 'rect' | 'spot';
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
};

/** What bosses throw, by the shot's kind. */
const SHOTS: Record<string, ShotArt> = {};

/** The color (and shape) of each kind of warning. */
const WARNS: Record<string, WarnArt> = {};

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
