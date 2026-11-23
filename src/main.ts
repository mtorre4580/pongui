import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import './style.css';
import { registerServiceWorker } from './pwa';
import Phaser from 'phaser';
import { CANVAS_H, CANVAS_W } from './game/constants';
import { applyDomTexts } from './i18n';
import { controls } from './input/controls';
import { initNative } from './native';
import { Boot } from './scenes/Boot';
import { Game } from './scenes/Game';
import { LevelSelect } from './scenes/LevelSelect';
import { Menu } from './scenes/Menu';
import { MyLevels } from './scenes/MyLevels';
import { Overlay } from './scenes/Overlay';

registerServiceWorker();

async function start() {
  await initNative();
  applyDomTexts();
  controls.init();
  // Wait for the font (with a timeout) so texts are not rendered with a fallback font
  await Promise.race([
    Promise.all([document.fonts.load('600 16px Fredoka'), document.fonts.load('700 16px Fredoka')]),
    new Promise((r) => setTimeout(r, 1500)),
  ]).catch(() => undefined);

  const game = new Phaser.Game({
    // Canvas, not WebGL: this vector game gains nothing from the GPU and WebGL shader
    // compilation blocked the main thread for over a second on start-up (Lighthouse TBT)
    type: Phaser.CANVAS,
    parent: 'game',
    backgroundColor: '#0d1024',
    width: CANVAS_W,
    height: CANVAS_H,
    // EXPAND: the canvas fills the screen at any aspect ratio; 1280×832 is the minimum game area
    // and the extra space shows more of each scene's background (see gfx/layout.ts)
    scale: { mode: Phaser.Scale.EXPAND, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { activePointers: 4 },
    render: { antialias: true, roundPixels: false },
    disableContextMenu: true,
    // The level editor is added on first use (custom/run.ts): phones never load it
    scene: [Boot, Menu, LevelSelect, MyLevels, Game, Overlay],
  });
  document.getElementById('loading')?.classList.add('done');
  // Refit when the container resizes (rotation, browser bars, window size)
  const parent = document.getElementById('game')!;
  new ResizeObserver(() => {
    game.scale.getParentBounds();
    game.scale.refresh();
  }).observe(parent);
  if (import.meta.env.DEV) void import('./dev').then((m) => m.installDevTools(game));
}

void start();
