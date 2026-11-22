import Phaser from 'phaser';
import { createTextures } from '../gfx/textures';

export class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    createTextures(this);
    const params = new URLSearchParams(location.search);
    const lvl = params.get('nivel');
    if (lvl) this.scene.start('Game', { index: Math.max(0, Number(lvl) - 1) });
    else this.scene.start('Menu');
  }
}
