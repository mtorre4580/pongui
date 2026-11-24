// How a boss looks: its body (a vector texture, like everything else) and its hit bar.
import type Phaser from 'phaser';
import type { BossFight } from '../game/boss';
import { GAME_W, HUD_H } from '../game/constants';
import { C, TEX } from './textures';

const BODY = 0x8e2f4f;
const BODY_DARK = 0x5e1c35;
const BODY_LIGHT = 0xb5486b;

/** The boss of a world, drawn once. `w` and `h` are its size in world units. */
function bossTexture(scene: Phaser.Scene, world: number, w: number, h: number): string {
  const key = `boss-${world}`;
  if (scene.textures.exists(key)) return key;
  const W = w * TEX;
  const H = h * TEX;
  // Room above the body for the horns
  const TOP = 14;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(BODY_DARK, 1);
  g.fillTriangle(10, TOP + 8, 26, TOP + 8, 14, 0).fillTriangle(
    W - 10,
    TOP + 8,
    W - 26,
    TOP + 8,
    W - 14,
    0,
  );
  g.fillRoundedRect(0, TOP, W, H, 18);
  g.fillStyle(BODY, 1).fillRoundedRect(0, TOP, W, H - 10, 18);
  g.fillStyle(BODY_LIGHT, 1).fillRoundedRect(6, TOP + 5, W - 12, 16, 9);
  // Eyes under slanted brows
  const eyeY = TOP + H * 0.4;
  g.fillStyle(C.white, 1)
    .fillEllipse(W * 0.3, eyeY, 26, 30)
    .fillEllipse(W * 0.7, eyeY, 26, 30);
  g.fillStyle(C.ink, 1)
    .fillCircle(W * 0.33, eyeY + 4, 7)
    .fillCircle(W * 0.67, eyeY + 4, 7);
  g.fillStyle(BODY_DARK, 1);
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
  g.generateTexture(key, W, H + TOP);
  g.destroy();
  return key;
}

export class BossView {
  private readonly body: Phaser.GameObjects.Image;
  private readonly bar: Phaser.GameObjects.Graphics;
  private shownHp = -1;
  private gone = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly fight: BossFight,
    world: number,
    oy: number,
  ) {
    const { def } = fight;
    // The texture is taller than the body by its horns: anchor it by the feet
    this.body = scene.add
      .image(0, 0, bossTexture(scene, world, def.width, def.height))
      .setOrigin(0.5, 1)
      .setScale(1 / TEX)
      .setDepth(4);
    this.bar = scene.add.graphics().setDepth(11);
    this.oy = oy;
    this.update();
  }

  private readonly oy: number;

  /** Places the body where the fight says and redraws the hit bar when it changes. */
  update() {
    if (this.gone) return;
    const { fight } = this;
    const [, , , bottom] = fight.box;
    const dazed = fight.dazed;
    this.body.setPosition(fight.boss.x, bottom + this.oy);
    this.body.setFlipX(fight.boss.dir > 0);
    // Dazed: it blinks (the Canvas renderer has no tint) and sags a little
    this.body.setAlpha(dazed ? (Math.floor(fight.world.s.time * 12) % 2 ? 0.35 : 0.8) : 1);
    this.body.setScale(1 / TEX, (dazed ? 0.86 : 1) / TEX);
    if (fight.boss.hp === this.shownHp) return;
    this.shownHp = fight.boss.hp;
    const w = 150;
    const x = GAME_W / 2 - w / 2;
    const y = HUD_H + 8;
    this.bar.clear();
    this.bar.fillStyle(0x0b0e22, 0.82).fillRoundedRect(x - 4, y - 4, w + 8, 18, 9);
    const gap = 4;
    const piece = (w - gap * (fight.def.hp - 1)) / fight.def.hp;
    for (let i = 0; i < fight.def.hp; i++) {
      this.bar
        .fillStyle(i < fight.boss.hp ? 0xe85d75 : 0x3a3f6b, 1)
        .fillRoundedRect(x + i * (piece + gap), y, piece, 10, 5);
    }
  }

  /** Beaten: it shrinks away. */
  defeat() {
    this.gone = true;
    this.bar.clear();
    this.scene.tweens.add({
      targets: this.body,
      scaleX: 0,
      scaleY: 0,
      angle: 200,
      alpha: 0,
      duration: 700,
      ease: 'Quad.in',
    });
  }
}
