import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import './style.css';
import './pwa';
import Phaser from 'phaser';
import { CANVAS_H, CANVAS_W } from './game/constants';
import { controls } from './input/controls';
import { Boot } from './scenes/Boot';
import { Game } from './scenes/Game';
import { LevelSelect } from './scenes/LevelSelect';
import { Menu } from './scenes/Menu';
import { Overlay } from './scenes/Overlay';

async function start() {
  controls.init();
  // Esperamos la tipografía (con un límite) para que los textos no salgan con otra fuente
  await Promise.race([
    Promise.all([document.fonts.load('600 16px Fredoka'), document.fonts.load('700 16px Fredoka')]),
    new Promise((r) => setTimeout(r, 1500)),
  ]).catch(() => undefined);

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#0d1024',
    width: CANVAS_W,
    height: CANVAS_H,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    input: { activePointers: 4 },
    render: { antialias: true, roundPixels: false },
    disableContextMenu: true,
    scene: [Boot, Menu, LevelSelect, Game, Overlay],
  });
  document.getElementById('loading')?.classList.add('done');
  // Si el contenedor cambia de tamaño (rotación, barra del navegador, ventana), reajustamos
  const parent = document.getElementById('game')!;
  new ResizeObserver(() => {
    game.scale.getParentBounds();
    game.scale.refresh();
  }).observe(parent);
  if (import.meta.env.DEV) void import('./dev').then((m) => m.installDevTools(game));
}

void start();
