import Phaser from 'phaser';
import { setSound, sfx, soundEnabled } from '../audio/sfx';
import { GAME_H, GAME_W } from '../game/constants';
import { C } from '../gfx/textures';
import { button, ButtonGroup, setupCamera, text, type Button } from '../gfx/ui';
import { t } from '../i18n';
import { controls } from '../input/controls';
import { LEVELS } from '../levels';

export interface OverlayData {
  mode: 'pause' | 'complete' | 'gameover';
  index: number;
  stars?: number;
  time?: number;
  par?: number;
  deaths?: number;
  record?: boolean;
}

export class Overlay extends Phaser.Scene {
  private group!: ButtonGroup;
  private data_!: OverlayData;

  constructor() {
    super('Overlay');
  }

  init(data: OverlayData) {
    this.data_ = data;
  }

  create() {
    setupCamera(this);
    controls.clearEdges();
    const d = this.data_;
    const last = d.index >= LEVELS.length - 1;

    const dim = this.add
      .rectangle(GAME_W / 2, GAME_H / 2, GAME_W, GAME_H, 0x05060f, 0)
      .setInteractive();
    this.tweens.add({ targets: dim, fillAlpha: 0.6, duration: 200 });

    const w = 340;
    const h = d.mode === 'complete' ? 300 : 250;
    const panel = this.add.container(GAME_W / 2, GAME_H / 2 + 20).setAlpha(0);
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.3).fillRoundedRect(-w / 2, -h / 2 + 6, w, h, 22);
    bg.fillStyle(C.ui, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 22);
    bg.lineStyle(2, C.uiLight, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 22);
    panel.add(bg);
    this.tweens.add({ targets: panel, alpha: 1, y: GAME_H / 2, duration: 240, ease: 'Back.out' });

    const buttons: Button[] = [];
    const add = (label: string, fn: () => void, color?: number) => {
      const b = button(this, 0, 0, label, fn, { w: 220, h: 36, color });
      panel.add(b);
      buttons.push(b);
      return b;
    };
    const layout = (startY: number) => buttons.forEach((b, i) => b.setPosition(0, startY + i * 44));

    if (d.mode === 'pause') {
      panel.add(
        text(this, 0, -h / 2 + 34, t('overlay.paused'), 28, '#ffffff', { fontStyle: '700' }),
      );
      add(t('overlay.resume'), () => this.resumeGame(), 0xe85d75);
      add(t('overlay.restart'), () => this.startLevel(d.index));
      const soundLabel = () => t(soundEnabled() ? 'menu.soundOn' : 'menu.soundOff');
      const s = add(soundLabel(), () => {
        setSound(!soundEnabled());
        s.setLabel(soundLabel());
      });
      add(t('overlay.levels'), () => this.toLevels());
      layout(-h / 2 + 84);
      this.group = new ButtonGroup(buttons, 1, () => this.resumeGame());
    } else if (d.mode === 'gameover') {
      panel.add(
        text(this, 0, -h / 2 + 36, t('overlay.outOfLives'), 28, '#ff8fa3', { fontStyle: '700' }),
      );
      panel.add(text(this, 0, -h / 2 + 70, t('overlay.outOfLivesText'), 14, '#c9cff7'));
      add(t('overlay.retry'), () => this.startLevel(d.index), 0xe85d75);
      add(t('overlay.levels'), () => this.toLevels());
      layout(-h / 2 + 128);
      this.group = new ButtonGroup(buttons, 1, () => this.toLevels());
    } else {
      panel.add(
        text(
          this,
          0,
          -h / 2 + 34,
          t(last ? 'overlay.worldComplete' : 'overlay.complete'),
          26,
          '#ffd166',
          { fontStyle: '700' },
        ),
      );
      const stars = d.stars ?? 1;
      for (let i = 0; i < 3; i++) {
        const st = this.add
          .image(-56 + i * 56, -h / 2 + 88, i < stars ? 'star' : 'star-off')
          .setScale(0);
        panel.add(st);
        this.tweens.add({
          targets: st,
          scale: i === 1 ? 0.95 : 0.8,
          duration: 260,
          delay: 250 + i * 220,
          ease: 'Back.out',
          onStart: () => i < stars && sfx.star(i),
        });
      }
      const time = t('overlay.time', { t: (d.time ?? 0).toFixed(1) });
      const timeStr = d.record ? `${time}  ·  ${t('overlay.record')}` : time;
      panel.add(text(this, 0, -h / 2 + 134, timeStr, 14, '#ffffff'));
      const tips: string[] = [];
      if ((d.deaths ?? 0) > 0) tips.push(t('overlay.starNoDeaths'));
      if ((d.time ?? 0) > (d.par ?? 0)) tips.push(t('overlay.starTime', { par: d.par ?? 0 }));
      if (tips.length)
        panel.add(
          text(
            this,
            0,
            -h / 2 + 154,
            t('overlay.missing', { list: tips.join('  ·  ') }),
            11,
            '#a9b8ff',
          ),
        );
      if (!last) add(t('overlay.next'), () => this.startLevel(d.index + 1), 0xe85d75);
      add(t('overlay.replay'), () => this.startLevel(d.index));
      add(t('overlay.levels'), () => this.toLevels(), last ? 0xe85d75 : undefined);
      layout(-h / 2 + 190);
      this.group = new ButtonGroup(buttons, 1, () => this.toLevels());
    }
  }

  private resumeGame() {
    document.body.dataset.scene = 'Game';
    this.scene.resume('Game');
    this.scene.stop();
  }

  private startLevel(index: number) {
    this.scene.stop('Game');
    this.scene.start('Game', { index });
  }

  private toLevels() {
    this.scene.stop('Game');
    this.scene.start('LevelSelect');
  }

  update() {
    if (this.data_.mode === 'pause' && controls.consume('pause')) return this.resumeGame();
    this.group.update();
  }
}
