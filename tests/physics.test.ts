import { describe, expect, it } from 'vitest';
import { BALL_R, H_HIGH, H_LOW, H_SPRING, STEP, TILE } from '../src/game/constants';
import { parseLevel } from '../src/game/level';
import { World, type InputState } from '../src/game/physics';
import { T } from '../src/game/tiles';

const empty = '#..................#';
function level(rows: Partial<Record<number, string>>) {
  const map = Array.from(
    { length: 12 },
    (_, r) =>
      rows[r] ??
      (r === 0 || r === 11 ? '####################' : r === 1 ? '#.................E#' : empty),
  );
  return parseLevel({ id: 't', name: { en: 't', es: 't', 'pt-BR': 't' }, par: 10, map });
}
const idle: InputState = { left: false, right: false, jump: false, jumpPressed: false };

function peakAfterBounces(w: World, inp: InputState, bounces: number) {
  let n = 0;
  let minY = Infinity;
  for (let i = 0; i < 2000 && n < bounces + 1; i++) {
    const ev = w.step(STEP, inp);
    if (ev.some((e) => e.type === 'bounce')) {
      n++;
      if (n === bounces) minY = Infinity;
    }
    if (n === bounces) minY = Math.min(minY, w.s.y);
  }
  return minY;
}

describe('bounce physics', () => {
  it('a normal bounce rises ~1.6 tiles', () => {
    const w = new World(level({ 10: '#.P................#' }));
    const peak = peakAfterBounces(w, idle, 2);
    const h = 11 * TILE - BALL_R - peak;
    expect(h).toBeGreaterThan(H_LOW - 3);
    expect(h).toBeLessThan(H_LOW + 3);
  });

  it('holding jump gives a high bounce', () => {
    const w = new World(level({ 10: '#.P................#' }));
    const peak = peakAfterBounces(w, { ...idle, jump: true }, 2);
    const h = 11 * TILE - BALL_R - peak;
    expect(h).toBeGreaterThan(H_HIGH - 3);
    expect(h).toBeLessThan(H_HIGH + 3);
  });

  it('a spring launches much higher', () => {
    const w = new World(level({ 10: '#.P................#', 11: '##s#################' }));
    const peak = peakAfterBounces(w, idle, 1);
    const h = 11 * TILE - BALL_R - peak;
    expect(h).toBeGreaterThan(H_SPRING - 4);
  });

  it('a fragile tile breaks after one bounce and the ball falls on the spikes', () => {
    const w = new World(level({ 10: '#.P................#', 11: '##x#################' }));
    const events: string[] = [];
    for (let i = 0; i < 600 && w.s.status === 'playing'; i++)
      events.push(...w.step(STEP, idle).map((e) => e.type));
    expect(events).toContain('break');
    expect(w.s.status).toBe('dead');
  });

  it('a ramp forces the direction', () => {
    const w = new World(level({ 10: '#.P................#', 11: '##>#################' }));
    for (let i = 0; i < 60; i++) w.step(STEP, { ...idle, left: true });
    expect(w.s.x).toBeGreaterThan(3 * TILE);
  });

  it('fire kills without a drop and goes out with one', () => {
    const fire = level({ 10: '#.P................#', 11: '##^#################' });
    const w1 = new World(fire);
    for (let i = 0; i < 200; i++) w1.step(STEP, idle);
    expect(w1.s.status).toBe('dead');
    const w2 = new World(
      parseLevel({
        id: 't',
        name: { en: 't', es: 't', 'pt-BR': 't' },
        par: 1,
        map: [
          '####################',
          '#.................E#',
          empty,
          empty,
          empty,
          empty,
          empty,
          empty,
          empty,
          '#.d................#',
          '#.P................#',
          '##^#################',
        ],
      }),
    );
    w2.s.x = 2 * TILE + 16;
    w2.s.y = 9 * TILE + 16; // falls through the drop
    for (let i = 0; i < 300; i++) w2.step(STEP, idle);
    expect(w2.s.status).toBe('playing');
    expect(w2.s.tiles[11 * 20 + 2]).toBe(T.ASH);
  });

  it('the hammer breaks the whole connected wall', () => {
    const w = new World(
      level({
        8: '#....w.............#',
        9: '#..P.w.............#',
        10: '#..h.w.............#',
      }),
    );
    for (let i = 0; i < 30; i++) w.step(STEP, idle);
    expect(w.s.hammers).toBe(1);
    for (let i = 0; i < 400; i++) w.step(STEP, { ...idle, right: true });
    expect(w.s.hammers).toBe(0);
    expect([8, 9, 10].every((r) => w.s.tiles[r * 20 + 5] === T.EMPTY)).toBe(true);
  });
});
