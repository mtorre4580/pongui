import { describe, expect, it } from 'vitest';
import { Gestures } from '../src/input/gestures';

describe('touch gestures', () => {
  it('steers once the finger slides past the dead zone', () => {
    const g = new Gestures();
    g.down(1, 200, 300, 0);
    expect(g.dir).toBe(0);
    g.move(1, 210, 300); // inside the dead zone
    expect(g.dir).toBe(0);
    g.move(1, 230, 300);
    expect(g.dir).toBe(1);
    g.move(1, 170, 300);
    expect(g.dir).toBe(-1);
    g.up(1, 170, 300, 900);
    expect(g.dir).toBe(0);
  });

  it('drags the anchor along so reversing is immediate', () => {
    const g = new Gestures();
    g.down(1, 100, 300, 0);
    g.move(1, 400, 300); // far to the right: the anchor follows at 56px
    expect(g.stick!.anchor.x).toBe(344);
    g.move(1, 320, 300); // a short way back is enough to go left
    expect(g.dir).toBe(-1);
  });

  it('a second finger holds the high bounce', () => {
    const g = new Gestures();
    g.down(1, 100, 300, 0);
    g.move(1, 160, 300);
    expect(g.down(2, 600, 300, 100)).toEqual(['jump']);
    expect(g.jumpHeld).toBe(true);
    expect(g.dir).toBe(1); // still steering with the first finger
    g.up(2, 600, 300, 400);
    expect(g.jumpHeld).toBe(false);
  });

  it('a quick double tap queues a high bounce', () => {
    const g = new Gestures();
    g.down(1, 300, 200, 0);
    expect(g.up(1, 300, 200, 80)).toEqual([]);
    g.down(2, 305, 204, 200);
    expect(g.up(2, 305, 204, 260)).toEqual(['doubleTap']);
  });

  it('does not take drags, slow touches or far taps for a double tap', () => {
    const g = new Gestures();
    // A drag, then a tap
    g.down(1, 300, 200, 0);
    g.move(1, 360, 200);
    g.up(1, 360, 200, 100);
    g.down(2, 360, 200, 200);
    expect(g.up(2, 360, 200, 250)).toEqual([]);
    // Too slow between taps
    g.down(3, 360, 200, 900);
    expect(g.up(3, 360, 200, 950)).toEqual([]);
    // Far apart
    g.down(4, 50, 50, 1000);
    expect(g.up(4, 50, 50, 1040)).toEqual([]);
    // A long press is not a tap either
    g.down(5, 50, 50, 1100);
    expect(g.up(5, 50, 50, 1600)).toEqual([]);
  });

  it('forgets everything on reset', () => {
    const g = new Gestures();
    g.down(1, 100, 100, 0);
    g.move(1, 200, 100);
    g.down(2, 300, 100, 10);
    g.reset();
    expect(g.dir).toBe(0);
    expect(g.jumpHeld).toBe(false);
    expect(g.stick).toBeNull();
  });
});
