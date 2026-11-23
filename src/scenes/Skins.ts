// The balls to choose from. Each one opens with a number of stars (see skins.ts).
import Phaser from 'phaser';
import { sfx, unlockAudio } from '../audio/sfx';
import { GAME_H, GAME_W } from '../game/constants';
import { ballTexture, C, drawBackground } from '../gfx/textures';
import { button, ButtonGroup, goTo, setupCamera, text, type Button } from '../gfx/ui';
import { t } from '../i18n';
import { controls } from '../input/controls';
import { chooseSkin, currentSkin, isSkinOpen, SKINS, totalStars, type Skin } from '../skins';

const COLS = 5;

export class Skins extends Phaser.Scene {
  private group!: ButtonGroup;
  private note!: Phaser.GameObjects.Text;
  private focusOn = 0;

  constructor() {
    super('Skins');
  }

  init(data: { focus?: number }) {
    this.focusOn = data.focus ?? -1;
  }

  create() {
    setupCamera(this);
    this.cameras.main.fadeIn(160, 13, 16, 36);
    controls.enableGestures(false);
    controls.clearEdges();
    drawBackground(this, GAME_W, GAME_H, 7);

    const stars = totalStars();
    const chosen = currentSkin();
    text(this, GAME_W / 2, 40, t('skins.title'), 28, '#ffffff', { fontStyle: '700' });
    this.add.image(GAME_W / 2 - 34, 72, 'star').setScale(0.4);
    const last = SKINS[SKINS.length - 1];
    text(this, GAME_W / 2 + 10, 73, `${stars} / ${last.stars}`, 15, '#ffd166');

    const buttons = SKINS.map((skin, i) =>
      this.card(
        GAME_W / 2 + ((i % COLS) - (COLS - 1) / 2) * 104,
        152 + Math.floor(i / COLS) * 116,
        skin,
        i,
        isSkinOpen(skin, stars),
        skin.id === chosen.id,
      ),
    );
    this.note = text(this, GAME_W / 2, GAME_H - 66, '', 14, '#ffd166').setAlpha(0);
    const back = button(this, 70, GAME_H - 30, t('select.back'), () => goTo(this, 'Menu'), {
      w: 110,
      h: 34,
      size: 15,
    });
    this.group = new ButtonGroup([...buttons, back], COLS, () => goTo(this, 'Menu'));
    if (this.focusOn >= 0) this.group.focusOn(this.focusOn);
  }

  private card(x: number, y: number, skin: Skin, i: number, open: boolean, chosen: boolean) {
    const w = 88;
    const h = 100;
    const bg = this.add.graphics();
    const draw = (focus: boolean) => {
      bg.clear();
      bg.fillStyle(0x000000, 0.25).fillRoundedRect(-w / 2, -h / 2 + 4, w, h, 14);
      bg.fillStyle(open ? C.ui : 0x262a52, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 14);
      // The ball in use keeps a gold frame; the focused card gets the usual outline around it
      if (chosen)
        bg.lineStyle(3, 0xffd166, 1).strokeRoundedRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4, 12);
      if (focus)
        bg.lineStyle(3, C.accent, 1).strokeRoundedRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 16);
    };
    draw(false);
    const ball = this.add.container(0, -12, [
      this.add.image(0, 0, ballTexture(this, skin)),
      this.add.image(2, -3, 'eyes'),
    ]);
    ball.setScale(0.8).setAlpha(open ? 1 : 0.35);
    const parts: Phaser.GameObjects.GameObject[] = [bg, ball];
    if (open) {
      if (chosen) parts.push(text(this, 0, 32, '✓', 18, '#ffd166', { fontStyle: '700' }));
    } else {
      parts.push(this.add.image(-16, 32, 'star').setScale(0.3));
      parts.push(text(this, 8, 33, String(skin.stars), 15, '#ffd166'));
    }
    const c = this.add.container(x, y, parts) as Button;
    c.setSize(w, h).setInteractive({ useHandCursor: open });
    c.setFocus = (on) => {
      draw(on);
      this.tweens.add({ targets: c, scale: on ? 1.06 : 1, duration: 100 });
    };
    c.setLabel = () => undefined;
    c.activate = () => {
      unlockAudio();
      if (!open || !chooseSkin(skin.id)) {
        sfx.bonk();
        this.tweens.add({ targets: c, x: x + 4, duration: 40, yoyo: true, repeat: 2 });
        this.say(t('skins.locked', { n: skin.stars }));
        return;
      }
      sfx.click();
      // Redraw with the new choice framed, keeping the focus where it was
      this.scene.restart({ focus: i });
    };
    c.on('pointerover', () => c.setFocus(true));
    c.on('pointerout', () => c.setFocus(false));
    c.on('pointerup', () => c.activate());
    return c;
  }

  private say(message: string) {
    this.note.setText(message);
    this.tweens.killTweensOf(this.note);
    this.note.setAlpha(1);
    this.tweens.add({ targets: this.note, alpha: 0, delay: 1800, duration: 400 });
  }

  update() {
    this.group.update();
  }
}
