import { describe, expect, it } from 'vitest';
import { levelUrl, starsText } from '../src/share';

describe('sharing a result', () => {
  it('writes the stars as text', () => {
    expect(starsText(3)).toBe('★★★');
    expect(starsText(1)).toBe('★☆☆');
    expect(starsText(0)).toBe('☆☆☆');
  });

  it('links to the level on the game page, dropping what the address carried', () => {
    expect(levelUrl('https://pongui.com/play/', '3-4')).toBe(
      'https://pongui.com/play/?level=3-4&utm_source=share',
    );
    expect(levelUrl('https://pongui.com/play/?level=1-1#x', '10-10')).toBe(
      'https://pongui.com/play/?level=10-10&utm_source=share',
    );
  });
});
