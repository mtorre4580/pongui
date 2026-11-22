import Phaser from 'phaser';
import { sfx, unlockAudio } from '../audio/sfx';
import { GAME_H, GAME_W, ZOOM } from '../game/constants';
import { controls } from '../input/controls';
import { C } from './textures';

export const FONT = 'Fredoka, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Zoom 2: el mundo mide 640×416 pero se dibuja a 1280×832 para que se vea nítido. */
export function setupCamera(scene: Phaser.Scene) {
  scene.cameras.main.setZoom(ZOOM).centerOn(GAME_W / 2, GAME_H / 2);
}

export function text(
  scene: Phaser.Scene,
  x: number,
  y: number,
  str: string,
  size = 16,
  color = '#ffffff',
  opts: Partial<Phaser.Types.GameObjects.Text.TextStyle> = {},
) {
  return scene.add
    .text(x, y, str, {
      fontFamily: FONT,
      fontSize: `${size}px`,
      fontStyle: '600',
      color,
      resolution: ZOOM * Math.min(2, window.devicePixelRatio || 1),
      ...opts,
    })
    .setOrigin(0.5);
}

export interface Button extends Phaser.GameObjects.Container {
  setFocus(on: boolean): void;
  activate(): void;
  setLabel(s: string): void;
}

export function button(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  opts: { w?: number; h?: number; color?: number; size?: number } = {},
): Button {
  const w = opts.w ?? 180;
  const h = opts.h ?? 38;
  const color = opts.color ?? C.uiLight;
  const bg = scene.add.graphics();
  const draw = (focus: boolean) => {
    bg.clear();
    bg.fillStyle(0x000000, 0.25).fillRoundedRect(-w / 2, -h / 2 + 3, w, h, h / 2);
    bg.fillStyle(color, 1).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    bg.fillStyle(0xffffff, 0.12).fillRoundedRect(-w / 2 + 4, -h / 2 + 3, w - 8, h / 2 - 3, h / 4);
    if (focus) bg.lineStyle(3, C.accent, 1).strokeRoundedRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, h / 2 + 3);
  };
  draw(false);
  const t = text(scene, 0, -1, label, opts.size ?? 17);
  const c = scene.add.container(x, y, [bg, t]) as Button;
  c.setSize(w, h);
  c.setInteractive({ useHandCursor: true });
  c.setFocus = (on) => {
    draw(on);
    scene.tweens.add({ targets: c, scale: on ? 1.05 : 1, duration: 100 });
  };
  c.activate = () => {
    unlockAudio();
    sfx.click();
    scene.tweens.add({ targets: c, scale: 0.94, duration: 60, yoyo: true });
    onClick();
  };
  c.setLabel = (s) => t.setText(s);
  c.on('pointerover', () => c.setFocus(true));
  c.on('pointerout', () => c.setFocus(false));
  c.on('pointerup', () => c.activate());
  return c;
}

/**
 * Navegación con flechas / cruceta entre botones, y confirmación con Enter / A.
 * `cols` define el ancho de la grilla (1 = lista vertical).
 */
export class ButtonGroup {
  private focus = -1;
  constructor(
    private buttons: Button[],
    private cols = 1,
    private onBack?: () => void,
  ) {}

  setButtons(b: Button[]) {
    this.buttons = b;
    if (this.focus >= b.length) this.focus = b.length - 1;
  }

  private move(d: number) {
    const n = this.buttons.length;
    if (!n) return;
    const prev = this.focus;
    this.focus = this.focus < 0 ? 0 : Math.max(0, Math.min(n - 1, this.focus + d));
    if (prev >= 0 && prev !== this.focus) this.buttons[prev].setFocus(false);
    this.buttons[this.focus].setFocus(true);
    if (prev !== this.focus) sfx.click();
  }

  update() {
    controls.poll();
    if (controls.consume('down')) this.move(this.cols);
    if (controls.consume('up')) this.move(-this.cols);
    if (this.cols > 1) {
      if (controls.consume('right')) this.move(1);
      if (controls.consume('left')) this.move(-1);
    }
    if (controls.consume('confirm')) {
      if (this.focus < 0) this.move(0);
      else this.buttons[this.focus]?.activate();
    }
    if (controls.consume('back')) this.onBack?.();
  }
}

/** Transición con fundido a otra escena. */
export function goTo(scene: Phaser.Scene, key: string, data?: object) {
  scene.cameras.main.fadeOut(160, 13, 16, 36);
  scene.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => scene.scene.start(key, data));
}
