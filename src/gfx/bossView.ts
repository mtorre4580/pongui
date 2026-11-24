// A boss on screen: its body, what it throws, the warnings of its attacks and its hit bar.
import type Phaser from 'phaser';
import type { BossFight } from '../game/boss';
import { GAME_W, HUD_H } from '../game/constants';
import { artOf, bossTexture, shotTexture, warnArt } from './bossArt';
import { TEX } from './textures';

export class BossView {
  private readonly body: Phaser.GameObjects.Image;
  private readonly bar: Phaser.GameObjects.Graphics;
  /** Warnings and the line to a grabbed ball: redrawn every frame while there are any. */
  private readonly marks: Phaser.GameObjects.Graphics;
  private readonly shots = new Map<number, Phaser.GameObjects.Image>();
  private marked = false;
  private pose = '';
  private shownHp = -1;
  private gone = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly fight: BossFight,
    private readonly world: number,
    private readonly oy: number,
  ) {
    const { def } = fight;
    this.pose = fight.boss.pose;
    // The texture is taller than the body by its horns: anchor it by the feet
    this.body = scene.add
      .image(0, 0, bossTexture(scene, world, def.width, def.height, this.pose))
      .setOrigin(0.5, 1)
      .setScale(1 / TEX)
      .setDepth(artOf(world).depth ?? 4);
    this.marks = scene.add.graphics().setDepth(3);
    this.bar = scene.add.graphics().setDepth(11);
    this.update();
  }

  /** Places everything where the fight says and redraws the hit bar when it changes. */
  update() {
    if (this.gone) return;
    const { fight } = this;
    const { boss, def } = fight;
    const [, , , bottom] = fight.box;
    const dazed = fight.dazed;
    if (boss.pose !== this.pose) {
      this.pose = boss.pose;
      this.body.setTexture(bossTexture(this.scene, this.world, def.width, def.height, this.pose));
    }
    this.body.setVisible(!boss.away && boss.alpha > 0);
    this.body.setPosition(boss.x, bottom + this.oy);
    this.body.setFlipX(boss.dir > 0);
    // Dazed: it blinks (the Canvas renderer has no tint) and sags a little
    const blink = dazed ? (Math.floor(fight.world.s.time * 12) % 2 ? 0.35 : 0.8) : 1;
    this.body.setAlpha(blink * boss.alpha);
    this.body.setScale(1 / TEX, (dazed ? 0.86 : 1) / TEX);
    this.drawShots();
    this.drawMarks();
    if (boss.hp === this.shownHp) return;
    this.shownHp = boss.hp;
    const w = 150;
    const x = GAME_W / 2 - w / 2;
    const y = HUD_H + 8;
    this.bar.clear();
    this.bar.fillStyle(0x0b0e22, 0.82).fillRoundedRect(x - 4, y - 4, w + 8, 18, 9);
    const gap = 4;
    const piece = (w - gap * (def.hp - 1)) / def.hp;
    for (let i = 0; i < def.hp; i++) {
      this.bar
        .fillStyle(i < boss.hp ? 0xe85d75 : 0x3a3f6b, 1)
        .fillRoundedRect(x + i * (piece + gap), y, piece, 10, 5);
    }
  }

  /** One image per shot in the air, made when it appears and destroyed when it is gone. */
  private drawShots() {
    const { fight, scene } = this;
    const seen = new Set<number>();
    for (const shot of fight.shots) {
      seen.add(shot.id);
      let img = this.shots.get(shot.id);
      if (!img) {
        img = scene.add
          .image(0, 0, shotTexture(scene, shot.kind, shot.rx, shot.ry))
          .setScale(1 / TEX)
          .setDepth(6);
        this.shots.set(shot.id, img);
      }
      img.setPosition(shot.x, shot.y + this.oy);
    }
    for (const [id, img] of this.shots) {
      if (seen.has(id)) continue;
      img.destroy();
      this.shots.delete(id);
    }
  }

  /** Warnings pulse faster and brighter as their attack gets close. */
  private drawMarks() {
    const { fight, marks } = this;
    if (!fight.warns.length && !fight.grab) {
      if (this.marked) marks.clear();
      this.marked = false;
      return;
    }
    this.marked = true;
    marks.clear();
    for (const w of fight.warns) {
      const art = warnArt(w.kind);
      const k = 1 - w.left / w.total;
      const pulse = 0.5 + 0.5 * Math.sin(k * k * 40);
      marks.fillStyle(art.color, 0.12 + 0.3 * k + 0.12 * pulse);
      if (art.shape === 'spot') marks.fillEllipse(w.x, w.y + this.oy, w.w, w.h);
      else marks.fillRect(w.x - w.w / 2, w.y - w.h / 2 + this.oy, w.w, w.h);
    }
    const g = fight.grab;
    if (g) {
      const [left, top, right, bottom] = fight.box;
      marks.lineStyle(5, warnArt('grab').color, 0.9);
      marks.lineBetween((left + right) / 2, (top + bottom) / 2 + this.oy, g.x, g.y + this.oy);
    }
  }

  /** Beaten: it shrinks away, and everything it threw goes with it. */
  defeat() {
    this.gone = true;
    this.bar.clear();
    this.marks.clear();
    this.shots.forEach((img) => img.destroy());
    this.shots.clear();
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
