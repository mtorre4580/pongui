import Phaser from 'phaser';
import { track } from '../analytics';
import { createTextures } from '../gfx/textures';
import { decodeLevel } from '../game/custom';
import { LEVELS, levelFromParam } from '../levels';
import { bossOf } from '../bosses';
import { addReceived } from '../custom/store';
import { hideSplash } from '../native';
import { bossOpen, isFirstVisit } from '../save';

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
    // `?boss=2`: straight to a boss the player has reached (any boss while developing)
    const boss = bossOf(Number(params.get('boss')));
    if (
      boss &&
      (import.meta.env.DEV ||
        bossOpen(
          boss.world,
          LEVELS.map((l) => l.id),
        ))
    )
      this.scene.start('Game', { index: 0, boss: boss.world });
    else if (index !== null) this.scene.start('Game', { index });
    // Someone new plays at once: the first level teaches the game better than a menu, and the
    // menu is one step away (pause, then the level list)
    else if (isFirstVisit()) this.scene.start('Game', { index: 0 });
    else this.scene.start('Menu');
  }
}
