// Full-bleed layout. The canvas always covers the whole screen (Phaser `Scale.EXPAND`); the
// 640×416 world is zoomed and centered inside the free area: the screen minus the safe-area
// insets (notch, Dynamic Island, home indicator) and minus the strips the touch controls use.
// Everything around it shows the scene's background, so there are no empty bars.
import type Phaser from 'phaser';
import { GAME_H, GAME_W } from '../game/constants';

export const LAYOUT_EVENT = 'pongui:layout';

interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/**
 * Reads the space to keep clear, in CSS px. `#layout-probe` is an invisible full-screen element
 * whose padding CSS sets to the safe areas plus the touch-control strips (see style.css).
 */
function readInsets(): Insets {
  const probe = document.getElementById('layout-probe');
  if (!probe) return { top: 0, right: 0, bottom: 0, left: 0 };
  const s = getComputedStyle(probe);
  return {
    top: parseFloat(s.paddingTop) || 0,
    right: parseFloat(s.paddingRight) || 0,
    bottom: parseFloat(s.paddingBottom) || 0,
    left: parseFloat(s.paddingLeft) || 0,
  };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Placement {
  /**
   * World rectangle that must be fully visible in the free area (default: the whole world). A
   * function is evaluated on every placement, so it can depend on the touch controls being shown.
   */
  fit?: Rect | (() => Rect);
}

/** Zooms and places the camera so `fit` fills as much of the free area as possible. */
export function placeCamera(scene: Phaser.Scene, { fit }: Placement = {}) {
  const area = (typeof fit === 'function' ? fit() : fit) ?? { x: 0, y: 0, w: GAME_W, h: GAME_H };
  const cam = scene.cameras.main;
  const { width, height } = scene.scale.gameSize;
  // Game pixels per CSS pixel (the canvas is drawn at a higher resolution than CSS px)
  const k = scene.scale.displayScale.x || 1;
  const ins = readInsets();
  const left = ins.left * k;
  const right = ins.right * k;
  const top = ins.top * k;
  const bottom = ins.bottom * k;
  const freeW = width - left - right;
  const freeH = height - top - bottom;
  const zoom = Math.max(0.1, Math.min(freeW / area.w, freeH / area.h));
  cam.setSize(width, height);
  cam.setZoom(zoom);
  // Screen point where the rectangle's center must land
  const sx = left + freeW / 2;
  const sy = top + freeH / 2;
  cam.centerOn(
    area.x + area.w / 2 - (sx - width / 2) / zoom,
    area.y + area.h / 2 - (sy - height / 2) / zoom,
  );
}

/** Places the camera now and again whenever the screen or the touch controls change. */
export function keepCameraPlaced(scene: Phaser.Scene, placement: Placement = {}) {
  const place = () => placeCamera(scene, placement);
  place();
  scene.scale.on('resize', place);
  window.addEventListener(LAYOUT_EVENT, place);
  scene.events.once('shutdown', () => {
    scene.scale.off('resize', place);
    window.removeEventListener(LAYOUT_EVENT, place);
  });
}
