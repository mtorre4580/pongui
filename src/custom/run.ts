// Playing a player-made level: which one, where it was started from, and the way back.
import type Phaser from 'phaser';
import { toLevelData } from '../game/custom';
import { parseLevel, type ParsedLevel } from '../game/level';
import { IS_NATIVE } from '../native';
import type { CustomLevel } from './store';

export interface CustomRun {
  id: string;
  /** The editor's "Test" button (the level goes back to the editor) or the level list. */
  from: 'editor' | 'list';
}

export function parseCustom(level: CustomLevel, hint?: string): ParsedLevel {
  return parseLevel(toLevelData(level, hint));
}

/**
 * The editor needs a mouse and a big screen; phones and the native apps only play levels.
 * `?editor=1` forces it on (browser tests).
 */
export function canCreate(): boolean {
  if (IS_NATIVE) return false;
  if (new URLSearchParams(location.search).has('editor')) return true;
  return (
    !!window.matchMedia?.('(pointer: fine)').matches &&
    Math.min(screen.width, window.innerWidth) >= 900
  );
}

/** Opens the editor (its code loads on first use: phones never download it). */
export async function openEditor(scene: Phaser.Scene, id: string) {
  const { Editor } = await import('../scenes/Editor');
  const manager = scene.scene.manager;
  if (!manager.getScene('Editor')) manager.add('Editor', Editor, false);
  scene.scene.start('Editor', { id });
}

/** Leaves a custom level: back to the editor or to the level list. */
export function leaveCustom(scene: Phaser.Scene, run: CustomRun) {
  if (run.from === 'editor') void openEditor(scene, run.id);
  else scene.scene.start('MyLevels', { focus: run.id });
}
