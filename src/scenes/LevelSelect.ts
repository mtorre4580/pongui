import Phaser from 'phaser';
import { sfx, unlockAudio } from '../audio/sfx';
import { GAME_H, GAME_W } from '../game/constants';
import { C, drawBackground } from '../gfx/textures';
import { button, ButtonGroup, goTo, setupCamera, text, type Button } from '../gfx/ui';
import { controls } from '../input/controls';
import { localized, t } from '../i18n';
import { LEVELS } from '../levels';
import { loadSave } from '../save';

export class LevelSelect extends Phaser.Scene {
  private group!: ButtonGroup;

  constructor() {
    super('LevelSelect');
  }

  create() {
    setupCamera(this);
    this.cameras.main.fadeIn(200, 13, 16, 36);
    controls.showTouchUi(false);
    controls.reserveTouchLayout(false);
    controls.clearEdges();
    drawBackground(this, GAME_W, GAME_H, 3);
    const save = loadSave();

    text(this, GAME_W / 2, 40, t('select.world', { n: 1, name: t('world.1') }), 26, '#ffffff', {
      fontStyle: '700',
      stroke: '#161a33',
      strokeThickness: 6,
    });
    const totalStars = LEVELS.reduce((n, l) => n + (save.levels[l.id]?.stars ?? 0), 0);
    this.add.image(GAME_W / 2 - 34, 74, 'star').setScale(0.36);
    text(this, GAME_W / 2 + 8, 74, `${totalStars} / ${LEVELS.length * 3}`, 15, '#ffd166');

    const cols = 5;
    const cw = 104;
    const ch = 116;
    const x0 = GAME_W / 2 - ((cols - 1) * cw) / 2;
    const y0 = 158;
    const cards: Button[] = [];

    LEVELS.forEach((lvl, i) => {
      const x = x0 + (i % cols) * cw;
      const y = y0 + Math.floor(i / cols) * ch;
      const locked = i > save.unlocked;
      const stars = save.levels[lvl.id]?.stars ?? 0;
      const card = this.levelCard(x, y, i, localized(lvl.name), locked, stars);
      cards.push(card);
    });

    const back = button(this, 70, GAME_H - 30, t('select.back'), () => goTo(this, 'Menu'), {
      w: 110,
      h: 32,
      size: 15,
    });
    this.group = new ButtonGroup([...cards, back], cols, () => goTo(this, 'Menu'));
  }

  private levelCard(
    x: number,
    y: number,
    i: number,
    name: string,
    locked: boolean,
    stars: number,
  ): Button {
    const w = 88;
    const h = 100;
    const bg = this.add.graphics();
    const draw = (focus: boolean) => {
      bg.clear();
      bg.fillStyle(0x000000, 0.25).fillRoundedRect(-w / 2, -h / 2 + 4, w, h, 14);
      bg.fillStyle(locked ? 0x262a52 : C.ui, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 14);
      if (!locked)
        bg.fillStyle(0xffffff, 0.07).fillRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, 38, 10);
      if (focus)
        bg.lineStyle(3, C.accent, 1).strokeRoundedRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 16);
    };
    draw(false);
    const parts: Phaser.GameObjects.GameObject[] = [bg];
    if (locked) {
      parts.push(this.add.image(0, -10, 'lock').setScale(0.6));
    } else {
      parts.push(text(this, 0, -22, String(i + 1), 30, '#ffffff', { fontStyle: '700' }));
      parts.push(
        text(this, 0, 10, name, 10, '#c9cff7', { align: 'center', wordWrap: { width: w - 10 } }),
      );
      for (let s = 0; s < 3; s++) {
        parts.push(this.add.image(-22 + s * 22, 34, s < stars ? 'star' : 'star-off').setScale(0.3));
      }
    }
    const c = this.add.container(x, y, parts) as Button;
    c.setSize(w, h).setInteractive({ useHandCursor: !locked });
    c.setFocus = (on) => {
      draw(on);
      this.tweens.add({ targets: c, scale: on ? 1.06 : 1, duration: 100 });
    };
    c.setLabel = () => undefined;
    c.activate = () => {
      unlockAudio();
      if (locked) {
        sfx.bonk();
        this.tweens.add({ targets: c, x: x + 4, duration: 40, yoyo: true, repeat: 2 });
        return;
      }
      sfx.click();
      goTo(this, 'Game', { index: i });
    };
    c.on('pointerover', () => c.setFocus(true));
    c.on('pointerout', () => c.setFocus(false));
    c.on('pointerup', () => c.activate());
    return c;
  }

  update() {
    this.group.update();
  }
}
