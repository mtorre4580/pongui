import Phaser from 'phaser';
import { track } from '../analytics';
import { createTextures } from '../gfx/textures';
import { decodeLevel } from '../game/custom';
import { levelFromParam } from '../levels';
import { addReceived } from '../custom/store';
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
    const code = params.get('c');
    if (code !== null) {
      // A shared level: keep it with the player's levels and show it. The code leaves the address
      // so a reload does not open it again
      const data = decodeLevel(code);
      params.delete('c');
      const rest = params.toString();
      history.replaceState(null, '', location.pathname + (rest ? `?${rest}` : '') + location.hash);
      if (data) {
        track('shared_level_opened');
        this.scene.start('MyLevels', { focus: addReceived(data).id, open: true });
      } else this.scene.start('MyLevels', { badLink: true });
      return;
    }
    const index = levelFromParam(params.get('level'));
    if (index !== null) this.scene.start('Game', { index });
    else this.scene.start('Menu');
  }
}
