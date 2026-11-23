import Phaser from 'phaser';
import { createTextures } from '../gfx/textures';
import { hideSplash } from '../native';

export class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    createTextures(this);
    // The first scene draws on the next frame: hide the native splash right after it (Boot
    // stops right away, so its own timers would be cancelled)
    setTimeout(hideSplash, 100);
    const params = new URLSearchParams(location.search);
    const lvl = params.get('level');
    if (lvl) this.scene.start('Game', { index: Math.max(0, Number(lvl) - 1) });
    else this.scene.start('Menu');
  }
}
