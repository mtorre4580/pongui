import Phaser from 'phaser';
import { setSound, sfx, soundEnabled } from '../audio/sfx';
import { GAME_H, GAME_W } from '../game/constants';
import { C } from '../gfx/textures';
import { button, ButtonGroup, setupCamera, text, type Button } from '../gfx/ui';
import { t } from '../i18n';
import { controls } from '../input/controls';
import { LEVELS, worldOf } from '../levels';
import { track } from '../analytics';
import { leaveCustom, type CustomRun } from '../custom/run';
import { gamePage, levelUrl, shareText, starsText } from '../share';

export interface OverlayData {
  /** `watched`: the bot has just played the level ("watch the bot"). */
  mode: 'pause' | 'complete' | 'gameover' | 'watched';
  index: number;
  stars?: number;
  time?: number;
  par?: number;
  deaths?: number;
  record?: boolean;
  /** A player-made level: its buttons lead back to the editor or the level list. */
  custom?: CustomRun;
  /** The win that verified a player's level (its creator beat it). */
  verified?: boolean;
  /** The level of the day: back leads to the menu and there is no next level. */
  daily?: boolean;
  /** Consecutive days with the level of the day beaten, after this win. */
  streak?: number;
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
    const world = worldOf(d.index);
    const custom = d.custom;
    // The last level of a world: "World complete!" and a button to the next world, if any
    const last = !custom && !d.daily && d.index === world.first + world.count - 1;
    const hasNext = !custom && !d.daily && d.index < LEVELS.length - 1;
    // Where "back" goes: the level select, the editor or the list of player-made levels
    const backLabel = d.daily
      ? t('select.back')
      : t(
          !custom
            ? 'overlay.levels'
            : custom.from === 'editor'
              ? 'overlay.toEditor'
              : 'overlay.toMine',
        );

    const dim = this.add
      // Larger than the world: it dims the whole screen at any aspect ratio
      .rectangle(GAME_W / 2, GAME_H / 2, GAME_W * 4, GAME_H * 4, 0x05060f, 0)
      .setInteractive();
    this.tweens.add({ targets: dim, fillAlpha: 0.6, duration: 200 });

    const w = 340;
    // Finished levels of the game can be shared: one more button
    const shareable = d.mode === 'complete' && !custom;
    const h = d.mode === 'complete' ? (shareable ? 344 : 300) : 250;
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
      add(backLabel, () => this.toLevels());
      layout(-h / 2 + 84);
      this.group = new ButtonGroup(buttons, 1, () => this.resumeGame());
    } else if (d.mode === 'gameover') {
      panel.add(
        text(this, 0, -h / 2 + 36, t('overlay.outOfLives'), 28, '#ff8fa3', { fontStyle: '700' }),
      );
      panel.add(text(this, 0, -h / 2 + 70, t('overlay.outOfLivesText'), 14, '#c9cff7'));
      add(t('overlay.retry'), () => this.startLevel(d.index), 0xe85d75);
      // Out of lives means three failed attempts: offer to see how the level is done. Not on a
      // level still being tested in the editor, which the bot may not be able to beat
      if (custom?.from !== 'editor') add(t('overlay.watchBot'), () => this.watchBot());
      add(backLabel, () => this.toLevels());
      layout(-h / 2 + (buttons.length > 2 ? 108 : 128));
      this.group = new ButtonGroup(buttons, 1, () => this.toLevels());
    } else if (d.mode === 'watched') {
      panel.add(
        text(this, 0, -h / 2 + 36, t('overlay.watched'), 28, '#ffd166', { fontStyle: '700' }),
      );
      panel.add(text(this, 0, -h / 2 + 70, t('overlay.watchedText'), 14, '#c9cff7'));
      add(t('overlay.tryIt'), () => this.startLevel(d.index), 0xe85d75);
      add(t('overlay.watchAgain'), () => this.watchBot());
      add(backLabel, () => this.toLevels());
      layout(-h / 2 + 108);
      this.group = new ButtonGroup(buttons, 1, () => this.toLevels());
    } else {
      panel.add(
        text(
          this,
          0,
          -h / 2 + 34,
          t(d.daily ? 'overlay.dailyDone' : last ? 'overlay.worldComplete' : 'overlay.complete'),
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
      if (d.verified) panel.add(text(this, 0, -h / 2 + 156, t('overlay.verified'), 13, '#7ae582'));
      else if (d.streak)
        panel.add(
          text(
            this,
            0,
            -h / 2 + 156,
            t(d.streak === 1 ? 'overlay.streakOne' : 'overlay.streak', { n: d.streak }),
            13,
            '#ffd166',
          ),
        );
      else if (tips.length)
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
      if (hasNext)
        add(
          t(last ? 'overlay.nextWorld' : 'overlay.next'),
          () => this.startLevel(d.index + 1),
          0xe85d75,
        );
      if (custom?.from === 'editor') add(backLabel, () => this.toLevels(), 0xe85d75);
      add(t('overlay.replay'), () => this.startLevel(d.index));
      if (shareable) {
        const share = add(t('overlay.share'), () => {
          const level = `${world.n}-${d.index - world.first + 1}`;
          const message = t('overlay.shareText', {
            level,
            t: (d.time ?? 0).toFixed(1),
            stars: starsText(stars),
            url: levelUrl(gamePage(), level),
          });
          track('result_shared', { level });
          void shareText(message).then((outcome) => {
            // The share sheet speaks for itself; a silent copy needs a word
            if (outcome === 'copied' && share.active) share.setLabel(t('overlay.shareCopied'));
          });
        });
      }
      if (custom?.from !== 'editor')
        add(backLabel, () => this.toLevels(), hasNext ? undefined : 0xe85d75);
      layout(-h / 2 + 190);
      this.group = new ButtonGroup(buttons, 1, () => this.toLevels());
    }
  }

  private resumeGame() {
    document.body.dataset.scene = 'Game';
    this.scene.resume('Game');
    this.scene.stop();
  }

  private watchBot() {
    const d = this.data_;
    if (!d.custom) {
      const world = worldOf(d.index);
      track('bot_watched', { level: `${world.n}-${d.index - world.first + 1}` });
    }
    this.scene.stop('Game');
    this.scene.start('Game', { index: d.index, custom: d.custom, daily: d.daily, bot: true });
  }

  private startLevel(index: number) {
    this.scene.stop('Game');
    this.scene.start('Game', { index, custom: this.data_.custom, daily: this.data_.daily });
  }

  private toLevels() {
    this.scene.stop('Game');
    const custom = this.data_.custom;
    if (custom) leaveCustom(this, custom);
    else if (this.data_.daily) this.scene.start('Menu');
    else this.scene.start('LevelSelect', { world: worldOf(this.data_.index).n });
  }

  update() {
    if (this.data_.mode === 'pause' && controls.consume('pause')) return this.resumeGame();
    this.group.update();
  }
}
