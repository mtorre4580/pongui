import { describe, expect, it } from 'vitest';
import { BOSSES } from '../src/bosses';
import { BossFight } from '../src/game/boss';
import { BALL_R, STEP } from '../src/game/constants';
import { World, type InputState } from '../src/game/physics';

const idle: InputState = { left: false, right: false, jump: false, jumpPressed: false };

const fight = (hp?: number) => {
  const { arena, def } = BOSSES[1];
  return new BossFight(new World(arena), def, hp);
};

const LEDGE_TOP = 8 * 32;
const HOME = 56; // the middle of the left ledge

/**
 * A way to play it that works at any speed: wait on the left ledge, drop on the boss's head
 * when it comes close, and steer back to the ledge while it is dazed.
 */
function play(f: BossFight, seconds: number) {
  const s = f.world.s;
  const hits: number[] = [];
  for (let i = 0; i < seconds / STEP && s.status === 'playing' && !f.won; i++) {
    const [left, top] = f.box;
    const onLedge = s.x < 3 * 32 && s.y < LEDGE_TOP;
    const above = s.y + BALL_R < top - 4;
    // Go for it only from above, when it is awake, on the ground and within reach of the ledge
    const reach = left < 5 * 32 && f.boss.lift === 0;
    const attack = !f.dazed && above && (onLedge ? reach : s.x >= 3 * 32);
    const target = attack ? f.boss.x : HOME;
    // Back from the floor to the ledge: a high bounce, steering in
    const input = { ...idle, jump: !onLedge, left: s.x > target + 3, right: s.x < target - 3 };
    for (const e of f.step(STEP, input).boss) if (e.type === 'boss-hit') hits.push(s.time);
  }
  return { status: s.status, won: f.won, hp: f.boss.hp, hits, time: s.time };
}

describe('boss fight', () => {
  it('can be won by bouncing on its head three times', () => {
    const result = play(fight(), 120);
    expect(result).toMatchObject({ won: true, hp: 0, status: 'playing' });
    expect(result.hits).toHaveLength(2);
  });

  it('kills the ball that touches its side', () => {
    const f = fight();
    const s = f.world.s;
    // On the floor, right in its way
    s.x = f.boss.x - 60;
    s.y = f.def.floorY - BALL_R;
    let died = false;
    for (let i = 0; i < 600 && s.status === 'playing'; i++)
      died ||= f.step(STEP, idle).events.some((e) => e.type === 'die' && e.cause === 'boss');
    expect(died).toBe(true);
    expect(s.status).toBe('dead');
    expect(f.boss.hp).toBe(3);
  });

  it('is harmless while dazed, and until the ball is clear of it', () => {
    const f = fight();
    const s = f.world.s;
    const drop = () => {
      const [, top] = f.box;
      s.x = f.boss.x;
      s.y = top - BALL_R - 1;
      s.vy = 400;
    };
    drop();
    expect(f.step(STEP, idle).boss).toEqual([{ type: 'boss-hit', hp: 2 }]);
    expect(f.boss.stun).toBeGreaterThan(0);
    // Dropped on it again at once: it bounces off, with no second hit and no death
    drop();
    expect(f.step(STEP, idle).boss).toEqual([{ type: 'boss-bonk' }]);
    expect(s.status).toBe('playing');
    expect(f.boss.hp).toBe(2);
    // Still inside it when it wakes up: it waits for the ball to leave
    for (let i = 0; i < 1.2 / STEP; i++) {
      s.x = f.boss.x;
      s.y = f.def.floorY - 20;
      s.vy = 0;
      f.step(STEP, idle);
    }
    expect(f.boss.stun).toBe(0);
    expect(s.status).toBe('playing');
  });

  it('stays dazed until the ball has been back on the ground', () => {
    const f = fight();
    const s = f.world.s;
    const [, top] = f.box;
    s.x = f.boss.x;
    s.y = top - BALL_R - 1;
    s.vy = 400;
    f.step(STEP, idle);
    // Held in the air well past its daze
    for (let i = 0; i < 2 / STEP; i++) {
      s.x = 48;
      s.y = 100;
      s.vy = 0;
      f.step(STEP, idle);
    }
    expect(f.boss.stun).toBe(0);
    expect(f.dazed).toBe(true);
    // Let go over the ledge: one bounce wakes it up
    for (let i = 0; i < 2 / STEP && f.dazed; i++) f.step(STEP, idle);
    expect(f.dazed).toBe(false);
  });

  it('gets faster with every hit and hops in its last phase', () => {
    const { def } = BOSSES[1];
    expect([...def.speeds]).toEqual([...def.speeds].sort((a, b) => a - b));
    expect(def.speeds).toHaveLength(def.hp);
    const last = fight(1);
    expect(last.phase).toBe(2);
    let hopped = false;
    for (let i = 0; i < 4 / STEP; i++) {
      // Keep the ball out of the way, up on the ledge
      last.world.s.x = 48;
      last.world.s.y = 8 * 32 - BALL_R;
      last.world.s.vy = 0;
      hopped ||= last.step(STEP, idle).boss.some((e) => e.type === 'boss-hop');
    }
    expect(hopped).toBe(true);
    expect(last.box[1]).toBeLessThanOrEqual(def.floorY - def.height);
  });

  it('can start at any number of hits left, within its own', () => {
    expect(fight(2).boss.hp).toBe(2);
    expect(fight(99).boss.hp).toBe(3);
    expect(fight(0).boss.hp).toBe(1);
  });

  it('walks only between the two ledges', () => {
    const f = fight();
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < 30 / STEP; i++) {
      f.world.s.x = 48;
      f.world.s.y = 8 * 32 - BALL_R;
      f.world.s.vy = 0;
      f.step(STEP, idle);
      min = Math.min(min, f.box[0]);
      max = Math.max(max, f.box[2]);
    }
    expect(min).toBeGreaterThanOrEqual(3 * 32);
    expect(max).toBeLessThanOrEqual(17 * 32);
  });
});
