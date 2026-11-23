// Balls the player can choose. Each one opens with a number of stars: a reason to go back for
// the ones still missing. Only the look changes, never how the ball plays.
import { loadSave, persist, type SaveData } from './save';

/** What is drawn over the plain ball (under the eyes). */
export type SkinMark = 'band' | 'spots' | 'stars' | 'sparkle' | 'rings';

export interface Skin {
  id: string;
  /** Stars needed to use it (0: always available). */
  stars: number;
  /** Main color; the lighter and darker tones are derived from it. */
  color: number;
  mark?: SkinMark;
}

// Ordered by price. The last one needs every star in the game (tests check it)
export const SKINS: readonly Skin[] = [
  { id: 'coral', stars: 0, color: 0xff6b6b },
  { id: 'sky', stars: 9, color: 0x4cc9f0 },
  { id: 'lime', stars: 24, color: 0x8bd450 },
  { id: 'sun', stars: 45, color: 0xffc94a },
  { id: 'violet', stars: 70, color: 0xc77dff },
  { id: 'mint', stars: 100, color: 0x4fd8c4, mark: 'band' },
  { id: 'ember', stars: 140, color: 0xff8c42, mark: 'spots' },
  { id: 'night', stars: 185, color: 0x3d43a8, mark: 'stars' },
  { id: 'gold', stars: 240, color: 0xf5b700, mark: 'sparkle' },
  { id: 'rainbow', stars: 300, color: 0xff6b6b, mark: 'rings' },
];

export const DEFAULT_SKIN = SKINS[0];

/** Stars earned on the game's own levels. */
export const totalStars = (save: SaveData = loadSave()) =>
  Object.values(save.levels).reduce((n, level) => n + level.stars, 0);

export const isSkinOpen = (skin: Skin, stars: number) => stars >= skin.stars;

/** The chosen ball, or the default one when none was chosen or it is not open (any more). */
export function currentSkin(save: SaveData = loadSave()): Skin {
  const chosen = SKINS.find((s) => s.id === save.skin);
  return chosen && isSkinOpen(chosen, totalStars(save)) ? chosen : DEFAULT_SKIN;
}

/** Keeps the choice. Returns false (and changes nothing) for a ball that is still locked. */
export function chooseSkin(id: string): boolean {
  const skin = SKINS.find((s) => s.id === id);
  if (!skin || !isSkinOpen(skin, totalStars())) return false;
  persist((s) => {
    s.skin = id;
  });
  return true;
}

/** A color moved towards white (`amount` > 0) or black (`amount` < 0), from -1 to 1. */
export function shade(color: number, amount: number): number {
  const target = amount > 0 ? 255 : 0;
  const k = Math.abs(amount);
  const mix = (shift: number) => {
    const c = (color >> shift) & 0xff;
    return Math.round(c + (target - c) * k) << shift;
  };
  return mix(16) | mix(8) | mix(0);
}
