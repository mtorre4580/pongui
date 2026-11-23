// Sharing a result: "I beat level 3-4 in 12.3 s. Can you do better?" with a link to that level.
import { IS_NATIVE } from './native';

/** Three stars as text: earned ones filled, the rest hollow. */
export const starsText = (stars: number) => '★'.repeat(stars) + '☆'.repeat(Math.max(0, 3 - stars));

/**
 * Link that opens a level, marked so the statistics can tell these visits apart. `base` is the
 * address of the game page.
 */
export function levelUrl(base: string, level: string): string {
  const url = new URL(base);
  return `${url.origin}${url.pathname}?level=${level}&utm_source=share`;
}

/** The game page: this one, or the public site inside the apps. */
export const gamePage = () =>
  IS_NATIVE
    ? new URL('play/', import.meta.env.VITE_SITE_URL as string).href
    : new URL('./', location.href).href;

/**
 * Hands the text to the system share sheet (phones, some desktop browsers) or copies it.
 * Resolves with what happened: the caller only needs to confirm a copy.
 */
export async function shareText(text: string): Promise<'shared' | 'copied' | 'failed'> {
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (e) {
      // Closing the sheet is a choice, not an error: do not fall back to copying
      if (e instanceof DOMException && e.name === 'AbortError') return 'failed';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
