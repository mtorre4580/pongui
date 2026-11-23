// A small picture of a level's map (one colored square per cell), for the list of player-made
// levels. Baked once per map and look into a canvas texture.
import type Phaser from 'phaser';
import { COLS, ROWS } from '../game/constants';
import { mapHash, type CustomLevelData } from '../game/custom';
import { C } from './textures';
import { themeOf } from './themes';

const COLORS: Record<string, number> = {
  x: C.fragile,
  X: C.fragile3,
  '^': C.flame,
  s: C.spring,
  '<': C.ramp,
  '>': C.ramp,
  w: C.brick,
  '*': C.spike,
  L: C.key,
  m: C.mossTop,
  '-': C.cloud,
  '|': C.cloud,
  o: C.gearTop,
  A: C.blockA,
  B: C.blockB,
  '(': C.pusherLight,
  ')': C.pusherLight,
  '1': C.portal1,
  '2': C.portal2,
  '3': C.portal3,
  i: C.iceLight,
  j: C.iceLight,
  c: C.crumbleTop,
  '!': C.lava,
  b: C.bumperLight,
  '%': C.phaseA,
  '&': C.phaseB,
  '=': C.rainbow[1],
  '~': C.water,
  z: C.zone,
  g: C.gem,
  d: C.drop,
  h: C.hammerHead,
  l: C.ball,
  k: C.key,
  P: C.ball,
  E: C.accent,
};

const css = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

/** Returns the texture key of the level's thumbnail (`cell` texture px per map cell). */
export function thumbnail(scene: Phaser.Scene, level: CustomLevelData, cell = 10): string {
  const key = `thumb-${mapHash(level.map, level.dark)}-${level.theme}-${cell}`;
  if (scene.textures.exists(key)) return key;
  const theme = themeOf(level.theme);
  const tex = scene.textures.createCanvas(key, COLS * cell, ROWS * cell)!;
  const ctx = tex.getContext();
  ctx.fillStyle = css(theme.bgBottom);
  ctx.fillRect(0, 0, COLS * cell, ROWS * cell);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = level.map[r][c];
      if (ch === '.') continue;
      const x = c * cell;
      const y = r * cell;
      if (ch === '#') {
        ctx.fillStyle = css(theme.solid);
        ctx.fillRect(x, y, cell, cell);
        continue;
      }
      ctx.fillStyle = css(COLORS[ch] ?? theme.solidTop);
      ctx.globalAlpha = ch === '~' || ch === 'z' || ch === '|' ? 0.5 : 1;
      // Items, the start and the exit are round; tiles are squares
      if ('gdhlkPE'.includes(ch)) {
        ctx.beginPath();
        ctx.arc(x + cell / 2, y + cell / 2, cell * 0.38, 0, Math.PI * 2);
        ctx.fill();
      } else ctx.fillRect(x, y, cell, cell);
      ctx.globalAlpha = 1;
    }
  }
  if (level.dark) {
    ctx.fillStyle = 'rgba(6, 4, 14, 0.45)';
    ctx.fillRect(0, 0, COLS * cell, ROWS * cell);
  }
  tex.refresh();
  return key;
}
