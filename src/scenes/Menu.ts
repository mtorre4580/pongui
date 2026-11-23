import Phaser from 'phaser';
import { setSound, soundEnabled } from '../audio/sfx';
import { GAME_H, GAME_W } from '../game/constants';
import { C, drawBackground } from '../gfx/textures';
import { button, ButtonGroup, goTo, setupCamera, text, type Button } from '../gfx/ui';
import { nextLocale, setLocale, t } from '../i18n';
import { controls } from '../input/controls';
import {
  canFullscreen,
  canInstall,
  isIOS,
  isStandalone,
  onInstallChange,
  promptInstall,
  toggleFullscreen,
} from '../pwa';

export class Menu extends Phaser.Scene {
  private group!: ButtonGroup;

  constructor() {
    super('Menu');
  }

  create() {
    setupCamera(this);
    this.cameras.main.fadeIn(200, 13, 16, 36);
    controls.enableGestures(false);
    controls.clearEdges();
    drawBackground(this, GAME_W, GAME_H, 7);

    // Title with a small ball bouncing next to it
    const title = text(this, GAME_W / 2, 92, 'Boinky', 64, '#ffffff', {
      fontStyle: '700',
      stroke: '#161a33',
      strokeThickness: 8,
      shadow: { offsetX: 0, offsetY: 5, color: '#0b0d1f', blur: 0, fill: true, stroke: true },
    });
    this.tweens.add({
      targets: title,
      y: 96,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
    text(this, GAME_W / 2, 140, t('app.tagline'), 16, '#a9b8ff');

    const ball = this.add.container(GAME_W / 2 + 118, 40, [
      this.add.image(0, 0, 'ball').setScale(0.5),
      this.add.image(2, -2, 'eyes').setScale(0.5),
    ]);
    this.tweens.add({
      targets: ball,
      y: 62,
      duration: 380,
      yoyo: true,
      repeat: -1,
      ease: 'Quad.in',
      onYoyo: () =>
        this.tweens.add({ targets: ball, scaleY: 0.75, scaleX: 1.2, duration: 70, yoyo: true }),
    });

    // Buttons
    const buttons: Button[] = [];
    let y = 196;
    buttons.push(
      button(this, GAME_W / 2, y, t('menu.play'), () => goTo(this, 'LevelSelect'), {
        color: 0xe85d75,
        w: 200,
        h: 44,
        size: 20,
      }),
    );
    y += 52;
    // Sound and language share a row
    const soundLabel = () => t(soundEnabled() ? 'menu.soundOn' : 'menu.soundOff');
    const sound = button(
      this,
      GAME_W / 2 - 96,
      y,
      soundLabel(),
      () => {
        setSound(!soundEnabled());
        sound.setLabel(soundLabel());
      },
      { w: 180 },
    );
    const language = button(
      this,
      GAME_W / 2 + 96,
      y,
      t('menu.language'),
      () => {
        setLocale(nextLocale());
        this.scene.restart();
      },
      { w: 180 },
    );
    buttons.push(sound, language);
    if (canFullscreen()) {
      y += 46;
      buttons.push(
        button(this, GAME_W / 2, y, t('menu.fullscreen'), () => void toggleFullscreen()),
      );
    }
    y += 46;
    const install = button(this, GAME_W / 2, y, t('menu.install'), () => void promptInstall(), {
      color: 0x2a9d8f,
    });
    buttons.push(install);

    const iosHint = text(this, GAME_W / 2, y, t('menu.iosHint'), 12, '#a9b8ff');
    const refreshInstall = () => {
      const show = canInstall() && !isStandalone();
      install.setVisible(show);
      install.disableInteractive();
      if (show) install.setInteractive({ useHandCursor: true });
      iosHint.setVisible(!show && isIOS() && !isStandalone());
      this.group.setButtons(buttons.filter((b) => b.visible));
    };
    this.group = new ButtonGroup(buttons);
    refreshInstall();
    const off = onInstallChange(refreshInstall);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => off());

    const help = t(controls.touchMode ? 'menu.helpTouch' : 'menu.helpKeys');
    text(this, GAME_W / 2, GAME_H - 22, help, 12, '#7d84c4');

    this.add.rectangle(GAME_W / 2, GAME_H - 44, 260, 1, C.uiLight, 0.6);
  }

  update() {
    this.group.update();
  }
}
