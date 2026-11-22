import { describe, expect, it } from 'vitest';
import { checkBudget, chunkName } from '../scripts/bundle-budget';

describe('bundle budget', () => {
  it('strips the content hash from chunk names', () => {
    expect(chunkName('index-ywmbuSRv.js')).toBe('index.js');
    expect(chunkName('workbox-window.prod.es5-B9K5rw8f.js')).toBe('workbox-window.prod.es5.js');
  });

  it('flags chunks and the initial load over their limits', () => {
    const rows = checkBudget(
      [
        { file: 'index-aaaaaaaa.js', gzipBytes: 400 * 1024, initial: true },
        { file: 'extra-bbbbbbbb.js', gzipBytes: 10 * 1024, initial: false },
      ],
      { initial: 380, defaultChunk: 60, chunks: { 'index.js': 370 } },
    );
    expect(rows.find((r) => r.label === 'initial load (JS + CSS)')?.ok).toBe(false);
    expect(rows.find((r) => r.label === 'index.js')?.ok).toBe(false);
    expect(rows.find((r) => r.label === 'extra.js')?.ok).toBe(true);
  });
});
