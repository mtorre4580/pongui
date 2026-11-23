import { describe, expect, it } from 'vitest';
import { BALL_R, H_HIGH, H_LOW, H_SPRING, PUSH_VX, STEP, TILE } from '../src/game/constants';
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

  it('a key opens the whole connected lock group, and locks block without one', () => {
    // Without a key the lock is a wall
    const blocked = new World(level({ 9: '#..P.L.............#', 10: '#....L.............#' }));
    for (let i = 0; i < 400; i++) blocked.step(STEP, { ...idle, right: true });
    expect(blocked.s.x).toBeLessThan(5 * TILE);
    expect(blocked.s.tiles[9 * 20 + 5]).toBe(T.LOCK);

    const w = new World(
      level({ 8: '#....L.............#', 9: '#..P.L.............#', 10: '#..k.L.............#' }),
    );
    for (let i = 0; i < 30; i++) w.step(STEP, idle);
    expect(w.s.keys).toBe(1);
    for (let i = 0; i < 400; i++) w.step(STEP, { ...idle, right: true });
    expect(w.s.keys).toBe(0);
    expect([8, 9, 10].every((r) => w.s.tiles[r * 20 + 5] === T.EMPTY)).toBe(true);
    expect(w.s.x).toBeGreaterThan(5 * TILE);
  });

  it('moss always gives a low bounce, even with jump held', () => {
    const w = new World(level({ 10: '#.P................#', 11: '#mmm################' }));
    const peak = peakAfterBounces(w, { ...idle, jump: true, jumpPressed: true }, 2);
    const h = 11 * TILE - BALL_R - peak;
    expect(h).toBeGreaterThan(H_LOW - 3);
    expect(h).toBeLessThan(H_LOW + 3);
  });

  it('a cloud catches the ball from above and lets it pass from below and the sides', () => {
    // Bouncing up from the floor through a cloud 2 rows above, then landing on it
    const w = new World(level({ 8: '#..----............#', 10: '#..P...............#' }));
    let landedOnCloud = false;
    for (let i = 0; i < 600; i++) {
      const ev = w.step(STEP, { ...idle, jump: true });
      if (ev.some((e) => e.type === 'bounce' && e.y === 8 * TILE)) landedOnCloud = true;
    }
    expect(landedOnCloud).toBe(true);
    // Sideways: a cloud wall does not stop the ball
    const side = new World(level({ 9: '#.....-............#', 10: '#..P..-............#' }));
    for (let i = 0; i < 300; i++) side.step(STEP, { ...idle, right: true });
    expect(side.s.x).toBeGreaterThan(7 * TILE);
  });

  it('an updraft lifts the ball and lets it fall back at its top', () => {
    const w = new World(level({ 10: '#..P...............#' }));
    for (let r = 4; r <= 10; r++) w.s.tiles[r * 20 + 3] = T.UPDRAFT;
    let top = Infinity;
    const events: boolean[] = [];
    for (let i = 0; i < 600; i++) {
      for (const e of w.step(STEP, idle)) if (e.type === 'wind') events.push(e.inside);
      top = Math.min(top, w.s.y);
    }
    // It rises to the top of the column (row 4) and hovers there
    expect(top).toBeLessThan(4 * TILE);
    expect(top).toBeGreaterThan(2 * TILE);
    expect(w.s.y).toBeLessThan(5 * TILE);
    expect(events[0]).toBe(true);
    expect(events).toContain(false);
  });

  it('bouncing on a switch flips the A and B blocks', () => {
    const w = new World(
      level({ 5: '#.....AAA..BBB.....#', 10: '#.P................#', 11: '##o#################' }),
    );
    const flips: boolean[] = [];
    for (let i = 0; i < 200; i++)
      for (const e of w.step(STEP, idle)) if (e.type === 'switch') flips.push(e.on);
    expect(flips[0]).toBe(true);
    expect(w.s.switchOn).toBe(flips.length % 2 === 1);
    // Every bounce on the switch flips again
    expect(flips.length).toBeGreaterThan(1);
    expect(flips).toEqual(flips.map((_, i) => i % 2 === 0));
  });

  it('A blocks are open while off and solid while on; B blocks the other way round', () => {
    const w = new World(level({ 8: '#.AAAA.............#', 10: '#.P................#' }));
    // Off: the ball bounces high through the A row
    let top = Infinity;
    for (let i = 0; i < 300; i++) {
      w.step(STEP, { ...idle, jump: true });
      top = Math.min(top, w.s.y);
    }
    expect(top).toBeLessThan(8 * TILE);
    // On: the A row is a ceiling
    const on = new World(level({ 8: '#.AAAA.............#', 10: '#.P................#' }));
    on.s.switchOn = true;
    top = Infinity;
    for (let i = 0; i < 300; i++) {
      on.step(STEP, { ...idle, jump: true });
      top = Math.min(top, on.s.y);
    }
    expect(top).toBeGreaterThanOrEqual(9 * TILE + BALL_R);
    const b = new World(level({ 8: '#.BBBB.............#', 10: '#.P................#' }));
    top = Infinity;
    for (let i = 0; i < 300; i++) {
      b.step(STEP, { ...idle, jump: true });
      top = Math.min(top, b.s.y);
    }
    expect(top).toBeGreaterThanOrEqual(9 * TILE + BALL_R);
  });

  it('bonking a switch from below flips the blocks', () => {
    const w = new World(level({ 8: '#.o................#', 10: '#.P................#' }));
    w.s.x = 2 * TILE + TILE / 2;
    let flipped = false;
    for (let i = 0; i < 200 && !flipped; i++)
      flipped = w.step(STEP, { ...idle, jump: true }).some((e) => e.type === 'switch');
    expect(flipped).toBe(true);
    expect(w.s.switchOn).toBe(true);
  });

  it('a block that turns solid around the ball waits until the ball leaves it', () => {
    // The ball falls through an open A block onto the switch right under it
    const w = new World(
      level({ 9: '#.P................#', 10: '#.A................#', 11: '##o#################' }),
    );
    let flipped = false;
    for (let i = 0; i < 200 && !flipped; i++)
      flipped = w.step(STEP, idle).some((e) => e.type === 'switch');
    expect(flipped).toBe(true);
    expect(w.s.pending).toBe(1);
    // It rises out of the block instead of being stuck inside it…
    let top = Infinity;
    for (let i = 0; i < 40; i++) {
      w.step(STEP, idle);
      top = Math.min(top, w.s.y);
    }
    expect(top).toBeLessThan(10 * TILE - BALL_R);
    expect(w.s.pending).toBe(0);
    // …and then lands on it: the block closed once the ball was out
    let lowest = 0;
    for (let i = 0; i < 300; i++) {
      w.step(STEP, idle);
      lowest = Math.max(lowest, w.s.y);
    }
    expect(lowest).toBeLessThanOrEqual(10 * TILE - BALL_R);
    expect(w.s.status).toBe('playing');
  });

  it('a pusher gives a low bounce at a fixed sideways speed, whatever is held', () => {
    const w = new World(level({ 10: '#.P................#', 11: '##)#################' }));
    let launched = false;
    let top = Infinity;
    for (let i = 0; i < 200; i++) {
      const ev = w.step(STEP, { left: true, right: false, jump: true, jumpPressed: i === 0 });
      if (ev.some((e) => e.type === 'bounce' && e.kind === 'push')) launched = true;
      if (launched) {
        expect(w.s.vx).toBe(PUSH_VX);
        top = Math.min(top, w.s.y);
      }
      if (launched && w.s.vy > 0) break;
    }
    expect(launched).toBe(true);
    const h = 11 * TILE - BALL_R - top;
    expect(h).toBeLessThan(H_LOW + 3);
  });
});
