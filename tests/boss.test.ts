import { describe, expect, it } from 'vitest';
import { BOSSES, bossOf } from '../src/bosses';
import { SCRIPTS } from '../src/bosses/scripts';
import { arena } from '../src/bosses/types';
import type { Serpent } from '../src/bosses/w2-serpstone';
import type { Bird } from '../src/bosses/w3-squall';
import { BossFight, MIN_WARN, seeded, type BossBrain, type BossDef } from '../src/game/boss';
import { BALL_R, COLS, STEP, TILE, V_LOW } from '../src/game/constants';
import { World, type InputState } from '../src/game/physics';
import { T } from '../src/game/tiles';
import { BOSS_WORLDS } from '../src/levels/worlds';

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

/** Plays a boss with its script, like a person holding keys: jump presses are edges. */
export function playScript(world: number, seconds: number, hp?: number) {
  const { arena: level, def } = bossOf(world)!;
  const f = new BossFight(new World(level), def, hp);
  const player = SCRIPTS[world]();
  const s = f.world.s;
  const hits: number[] = [];
  let jump = false;
  for (let i = 0; i < seconds / STEP && s.status === 'playing' && !f.won; i++) {
    const keys = player(f);
    const input = { ...keys, jumpPressed: keys.jump && !jump };
    jump = keys.jump;
    for (const e of f.step(STEP, input).boss) if (e.type === 'boss-hit') hits.push(s.time);
  }
  return { f, status: s.status, won: f.won, hits, time: s.time };
}

/** Plays a boss holding the same keys all the time: what someone who has no plan would do. */
function playNaive(world: number, keys: Partial<InputState>, seconds = 120) {
  const { arena: level, def } = bossOf(world)!;
  const f = new BossFight(new World(level), def);
  const s = f.world.s;
  for (let i = 0; i < seconds / STEP && s.status === 'playing' && !f.won; i++)
    f.step(STEP, { ...idle, ...keys });
  return { status: s.status, hp: f.boss.hp, time: s.time };
}

/** A fresh fight with a boss, and a way to run it with the ball held somewhere out of it. */
function fightOf(world: number, hp?: number) {
  const { arena: level, def } = bossOf(world)!;
  const f = new BossFight(new World(level), def, hp);
  const s = f.world.s;
  /** Steps until `until` is true (or `seconds` pass), with the ball held at `at` if given. */
  const run = (seconds: number, until?: () => boolean, at?: { x: number; y: number }) => {
    const all = [];
    // Held like in a grab: nothing the boss does reaches the ball
    if (at) f.grab = { ...at, need: Infinity, wiggles: 0, last: 0 };
    for (let i = 0; i < seconds / STEP && s.status === 'playing' && !until?.(); i++)
      all.push(...f.step(STEP, idle).boss);
    if (at) f.grab = null;
    return all;
  };
  return { f, s, run, def };
}

describe('every boss', () => {
  it('is in BOSS_WORLDS and has a script that beats it', () => {
    expect(Object.keys(BOSSES).map(Number)).toEqual([...BOSS_WORLDS]);
    for (const world of BOSS_WORLDS) {
      const result = playScript(world, 240);
      expect(result, `boss ${world}`).toMatchObject({ won: true, status: 'playing' });
      expect(result.hits).toHaveLength(bossOf(world)!.def.hp - 1);
    }
  });

  it('is taller than a low bounce climbs, or standing still would beat it', () => {
    for (const world of BOSS_WORLDS) expect(bossOf(world)!.def.height).toBeGreaterThan(51);
  });

  it('beats a player who stands still or only runs to one side', () => {
    for (const world of BOSS_WORLDS)
      for (const keys of [{}, { right: true }, { left: true }, { right: true, jump: true }]) {
        // Grumble's ledge is a place to rest: the first boss lets the player take their time
        if (world === 1 && !keys.right) continue;
        const result = playNaive(world, keys);
        expect(result, `boss ${world} against ${JSON.stringify(keys)}`).toMatchObject({
          status: 'dead',
          hp: bossOf(world)!.def.hp,
        });
      }
  });

  it('announces everything it throws, for at least the minimum time', () => {
    for (const world of BOSS_WORLDS) {
      const { arena: level, def } = bossOf(world)!;
      const f = new BossFight(new World(level), def);
      const player = SCRIPTS[world]();
      const s = f.world.s;
      // When a warning of each kind last ran out
      const over = new Map<string, number>();
      let before = new Map<object, string>();
      let shots = 0;
      for (let i = 0; i < 240 / STEP && s.status === 'playing' && !f.won; i++) {
        const { boss } = f.step(STEP, { ...player(f), jumpPressed: false });
        const now = new Map<object, string>(f.warns.map((w) => [w, w.kind]));
        for (const [w, kind] of before) if (!now.has(w)) over.set(kind, s.time);
        for (const w of f.warns) expect(w.total).toBeGreaterThanOrEqual(MIN_WARN);
        before = now;
        for (const e of boss) {
          if (e.type !== 'boss-shot') continue;
          shots++;
          // A warning of its kind ran out just before (volleys follow their warning closely)
          expect(
            s.time - (over.get(e.kind) ?? -Infinity),
            `${e.kind} of boss ${world}`,
          ).toBeLessThan(1.5);
        }
      }
      if (world > 1) expect(shots, `shots of boss ${world}`).toBeGreaterThan(0);
    }
  });
});

describe('Serpstone (world 2)', () => {
  const brain = (f: BossFight) => f.brain as Serpent;
  const SAFE = { x: 600, y: 100 };

  it('shakes its burrow before coming up, and is not there until then', () => {
    const { f, run } = fightOf(2);
    const { def } = BOSSES[2];
    expect(f.boss.away).toBe(true);
    const events = run(5, () => brain(f).mode === 'burrow', SAFE);
    expect(events).toContainEqual(expect.objectContaining({ type: 'boss-warn', kind: 'burrow' }));
    expect(f.boss.away).toBe(true);
    const t0 = f.world.s.time;
    run(5, () => brain(f).mode === 'rising', SAFE);
    expect(f.world.s.time - t0).toBeGreaterThanOrEqual(def.warn[0] - STEP);
    expect(f.boss.away).toBe(false);
    run(5, () => brain(f).mode === 'up', SAFE);
    expect(f.box[1]).toBe(def.floorY - def.height);
    // And goes back under after a while, to come up somewhere else
    const first = f.boss.x;
    run(10, () => brain(f).mode === 'under', SAFE);
    expect(f.boss.away).toBe(true);
    run(10, () => brain(f).mode === 'up', SAFE);
    expect(f.boss.x).not.toBe(first);
  });

  it('kills a ball waiting on its burrow, and cannot be hurt while it comes up', () => {
    const { f, s, run } = fightOf(2);
    const { def } = BOSSES[2];
    run(5, () => brain(f).mode === 'burrow', SAFE);
    // Bouncing on the moss right over the burrow
    s.x = f.boss.x;
    s.y = def.floorY - BALL_R;
    run(4);
    expect(s.status).toBe('dead');
    expect(f.boss.hp).toBe(3);
  });

  it('cannot be reached from the moss, only from a stone', () => {
    const up = () => {
      const fight = fightOf(2);
      fight.run(5, () => brain(fight.f).mode === 'up', SAFE);
      return fight;
    };
    // From the moss beside it, holding jump: a low bounce, into its side
    const low = up();
    Object.assign(low.s, { x: low.f.boss.x + 50, y: BOSSES[2].def.floorY - BALL_R, vy: 0 });
    for (let i = 0; i < 2 / STEP && low.s.status === 'playing'; i++)
      low.f.step(STEP, { ...idle, left: true, jump: true });
    expect(low.s.status).toBe('dead');
    expect(low.f.boss.hp).toBe(3);
    // From the edge of the stone next to it: a high bounce, onto its head
    const high = up();
    Object.assign(high.s, { x: 250, y: 10 * TILE - BALL_R - 1, vy: 50 });
    let hit = false;
    for (let i = 0; i < 2 / STEP && !hit && high.s.status === 'playing'; i++) {
      const go = high.s.y < 10 * TILE - BALL_R - 40;
      hit = high.f
        .step(STEP, { ...idle, right: go, jump: true })
        .boss.some((e) => e.type === 'boss-hit');
    }
    expect(hit).toBe(true);
    expect(high.f.boss.hp).toBe(2);
  });

  it('drops a stalactite on the ball: deadly to wait under, easy to step away from', () => {
    const still = fightOf(2);
    const events = still.run(20, () => still.f.shots.length > 0);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'boss-warn', kind: 'stalactite' }),
    );
    // Over the ball's own column
    expect(Math.abs(still.f.shots[0].x - still.s.x)).toBeLessThan(TILE / 2 + 1);
    still.run(3, () => still.f.shots.length === 0);
    expect(still.s.status).toBe('dead');
    // Stepping to the other half of the stone when the warning shows
    const moved = fightOf(2);
    const x0 = moved.s.x;
    let ended = false;
    for (let i = 0; i < 20 / STEP && !ended && moved.s.status === 'playing'; i++) {
      const warned = moved.f.warns.some((w) => w.kind === 'stalactite') || moved.f.shots.length;
      const goal = warned ? x0 + 30 : x0;
      ended = moved.f
        .step(STEP, { ...idle, left: moved.s.x > goal + 3, right: moved.s.x < goal - 3 })
        .boss.some((e) => e.type === 'boss-shot-end');
    }
    expect(ended).toBe(true);
    expect(moved.s.status).toBe('playing');
  });

  it('is quicker and drops two stalactites at once in its last phase', () => {
    const { def } = BOSSES[2];
    for (const list of [def.warn, def.up, def.rest, def.stalEvery, def.stalWarn]) {
      expect(list).toHaveLength(def.hp);
      expect([...list]).toEqual([...list].sort((a, b) => b - a));
      expect(Math.min(...list)).toBeGreaterThanOrEqual(MIN_WARN);
    }
    const last = fightOf(2, 1);
    last.run(20, () => last.f.shots.length > 0, { x: 300, y: 100 });
    expect(last.f.shots).toHaveLength(2);
  });
});

describe('Squall (world 3)', () => {
  const { def } = BOSSES[3];
  const brain = (f: BossFight) => f.brain as Bird;

  it('flies too high for any bounce from the floor', () => {
    const { f, s } = fightOf(3);
    // Right under it all the time, bouncing as high as the floor allows
    for (let i = 0; i < 3 / STEP; i++) {
      s.x = f.boss.x;
      brain(f).bolt = 9;
      f.step(STEP, { ...idle, jump: true });
    }
    expect(s.status).toBe('playing');
    expect(f.boss.hp).toBe(3);
    expect(f.box[3]).toBeLessThan(def.floorY - 115 - 2 * BALL_R);
  });

  it('is hit by a ball that walks off the cloud onto it, and then flies away fast', () => {
    const { f, s } = fightOf(3);
    f.boss.x = 200;
    f.boss.dir = 1;
    Object.assign(s, { x: 150, y: 3 * TILE - BALL_R - 1, vy: 0 });
    let hit = false;
    for (let i = 0; i < 2 / STEP && !hit; i++) {
      brain(f).bolt = 9;
      hit = f
        .step(STEP, { ...idle, right: s.x < f.boss.x })
        .boss.some((e) => e.type === 'boss-hit');
    }
    expect(hit).toBe(true);
    // The ball lands back on the cloud: the bird wakes up and leaves at more than its speed
    for (let i = 0; i < 3 / STEP && f.dazed; i++) f.step(STEP, { ...idle, left: s.x > 130 });
    expect(f.dazed).toBe(false);
    const x0 = f.boss.x;
    for (let i = 0; i < 0.5 / STEP; i++) {
      brain(f).bolt = 9;
      f.step(STEP, { ...idle, left: s.x > 130 });
    }
    expect(f.boss.dir).toBe(1);
    expect(f.boss.x - x0).toBeGreaterThan(def.speeds[1] * 0.5 * 1.5);
  });

  it('lights a column up before lightning strikes it: deadly to stay, easy to leave', () => {
    const still = fightOf(3);
    const events = still.run(10, () => still.f.shots.length > 0);
    expect(events).toContainEqual(expect.objectContaining({ type: 'boss-warn', kind: 'bolt' }));
    expect(Math.abs(still.f.shots[0].x - still.s.x)).toBeLessThanOrEqual(TILE / 2);
    still.run(1);
    expect(still.s.status).toBe('dead');
    // One column to the side when it lights up
    const moved = fightOf(3);
    const x0 = moved.s.x;
    let struck = false;
    for (let i = 0; i < 10 / STEP && !struck && moved.s.status === 'playing'; i++) {
      const goal = moved.f.warns.length || moved.f.shots.length ? x0 + 40 : x0;
      struck = moved.f
        .step(STEP, { ...idle, left: moved.s.x > goal + 3, right: moved.s.x < goal - 3 })
        .boss.some((e) => e.type === 'boss-shot-end');
    }
    expect(struck).toBe(true);
    expect(moved.s.status).toBe('playing');
  });

  it('strikes more columns at once with each phase', () => {
    expect([...def.boltCount]).toEqual([1, 2, 3]);
    for (const hp of [2, 1]) {
      const { f, run } = fightOf(3, hp);
      run(10, () => f.shots.length > 0, { x: 320, y: 40 });
      expect(f.shots).toHaveLength(def.boltCount[f.phase]);
      expect(new Set(f.shots.map((b) => b.x)).size).toBe(f.shots.length);
    }
  });

  it('blows gusts from its second phase on: announced, and the ball can hold against them', () => {
    const calm = fightOf(3);
    const first = calm.run(12, undefined, { x: 320, y: 40 });
    expect(first.some((e) => e.type === 'boss-warn' && e.kind.startsWith('gust'))).toBe(false);
    // Second phase: the wind is announced, then pushes a ball that does nothing
    const gusty = fightOf(3, 2);
    const s = gusty.s;
    const warned = gusty.run(10, () => s.drift !== 0, { x: 320, y: 300 });
    const warning = warned.find((e) => e.type === 'boss-warn' && e.kind.startsWith('gust'));
    expect(warning).toBeDefined();
    expect(def.gustWarn).toBeGreaterThanOrEqual(MIN_WARN);
    expect(Math.abs(s.drift)).toBe(def.gustPush);
    const dir = Math.sign(s.drift);
    const x0 = s.x;
    for (let i = 0; i < 0.5 / STEP; i++) {
      brain(gusty.f).bolt = 9;
      gusty.f.step(STEP, idle);
    }
    expect((s.x - x0) * dir).toBeGreaterThan(def.gustPush * 0.4);
    // Steering against it wins ground back
    const x1 = s.x;
    for (let i = 0; i < 0.5 / STEP; i++) {
      brain(gusty.f).bolt = 9;
      gusty.f.step(STEP, { ...idle, left: dir > 0, right: dir < 0 });
    }
    expect((s.x - x1) * dir).toBeLessThan(0);
    // And it dies down
    for (let i = 0; i < 2 / STEP; i++) {
      brain(gusty.f).bolt = 9;
      brain(gusty.f).gust = 9;
      gusty.f.step(STEP, idle);
    }
    expect(s.drift).toBe(0);
  });
});

// The frame every boss shares, with a boss that does only what each test tells it to
describe('boss engine', () => {
  const ROOM = [
    '####################',
    '#..................#',
    '#..................#',
    '#..................#',
    '#..................#',
    '#..................#',
    '#..................#',
    '#..................#',
    '#..................#',
    '#..................#',
    '#P.................#',
    'E###################',
  ];
  const still: BossBrain = { think: () => undefined };
  const make = (brain: Partial<BossBrain> = {}, def: Partial<BossDef> = {}) => {
    const full: BossDef = {
      width: 40,
      height: 60,
      hp: 2,
      floorY: 11 * TILE,
      stun: 0.5,
      brain: () => ({ ...still, ...brain }),
      ...def,
    };
    const f = new BossFight(new World(arena(0, ROOM)), full);
    f.boss.x = 16 * TILE;
    return f;
  };
  const run = (f: BossFight, seconds: number, input: InputState = idle) => {
    const all = [];
    for (let i = 0; i < seconds / STEP && f.world.s.status === 'playing'; i++)
      all.push(...f.step(STEP, input).boss);
    return all;
  };

  it('gives the same random numbers in every fight', () => {
    const a = make();
    const b = make();
    const first = [a.rand(), a.rand(), a.rand()];
    expect([b.rand(), b.rand(), b.rand()]).toEqual(first);
    expect(new Set(first).size).toBe(3);
    expect(first.every((n) => n >= 0 && n < 1)).toBe(true);
    expect(seeded(7)()).not.toBe(seeded(8)());
  });

  it('never announces an attack for less than the minimum', () => {
    const f = make();
    let fired = -1;
    f.announce('test', { x: 100, y: 100, w: 32, h: 32 }, 0.1, () => (fired = f.world.s.time));
    expect(f.warns).toHaveLength(1);
    const events = run(f, 1);
    expect(fired).toBeGreaterThanOrEqual(MIN_WARN - STEP);
    expect(fired).toBeLessThan(MIN_WARN + 2 * STEP);
    expect(f.warns).toHaveLength(0);
    // The scene hears about it through the step that follows
    f.announce('test', { x: 1, y: 1, w: 1, h: 1 }, 1, () => undefined);
    expect([...events, ...f.step(STEP, idle).boss]).toContainEqual({
      type: 'boss-warn',
      kind: 'test',
      x: 1,
      y: 1,
    });
  });

  it('kills with a shot, and lets it fly by when the ball is out of its way', () => {
    const f = make();
    const s = f.world.s;
    // Along the floor, towards the ball
    f.shoot({ kind: 'bolt', x: 300, y: 11 * TILE - 30, ry: 30, vx: -200, wall: 'pass' });
    run(f, 2);
    expect(s.status).toBe('dead');
    // The same shot under a ball kept in the air
    const g = make();
    g.shoot({ kind: 'bolt', x: 300, y: 11 * TILE - 10, vx: -200, wall: 'stop' });
    const ends = [];
    for (let i = 0; i < 2 / STEP; i++) {
      g.world.s.y = 200;
      g.world.s.vy = 0;
      ends.push(...g.step(STEP, idle).boss.filter((e) => e.type === 'boss-shot-end'));
    }
    expect(g.world.s.status).toBe('playing');
    // It ended against the left wall
    expect(ends).toHaveLength(1);
    expect(ends[0]).toMatchObject({ kind: 'bolt', why: 'wall' });
    expect(g.shots).toHaveLength(0);
  });

  it('lets the ball bounce on a shot that can be stomped', () => {
    const f = make();
    const s = f.world.s;
    const shot = f.shoot({ kind: 'crate', x: s.x, y: 250, rx: 12, ry: 12, stomp: true });
    s.y = shot.y - 12 - BALL_R - 2;
    s.vy = 300;
    const events = run(f, 0.05);
    expect(events).toContainEqual(expect.objectContaining({ type: 'boss-shot-end', why: 'stomp' }));
    expect(s.status).toBe('playing');
    expect(s.vy).toBeLessThan(0);
    expect(f.shots).toHaveLength(0);
  });

  it('pulls shots down with gravity, bounces them off walls and ends them in time', () => {
    const f = make();
    const lob = f.shoot({ kind: 'lob', x: 200, y: 100, vx: 60, g: 600, wall: 'bounce', life: 9 });
    const timed = f.shoot({ kind: 'spark', x: 400, y: 100, life: 0.5, wall: 'pass' });
    let lowest = 0;
    let rose = false;
    for (let i = 0; i < 3 / STEP; i++) {
      f.world.s.x = 48;
      f.world.s.y = 100;
      f.world.s.vy = 0;
      f.step(STEP, idle);
      lowest = Math.max(lowest, lob.y);
      rose ||= lob.vy < 0;
    }
    expect(lowest).toBeLessThan(11 * TILE + 8);
    expect(rose).toBe(true);
    expect(f.shots).toContain(lob);
    expect(f.shots).not.toContain(timed);
  });

  it('changes arena tiles, tells the scene, and never puts a block on the ball', () => {
    const f = make();
    const s = f.world.s;
    const under = 11 * COLS + 5;
    expect(f.setTile(under, T.ICE)).toBe(true);
    expect(s.tiles[under]).toBe(T.ICE);
    expect(f.step(STEP, idle).boss).toContainEqual({ type: 'boss-tiles', idxs: [under] });
    // The cell the ball is in: a block is refused, a toggle block waits for the ball to leave
    const here = Math.floor(s.y / TILE) * COLS + Math.floor(s.x / TILE);
    expect(f.setTile(here, T.SOLID)).toBe(false);
    expect(s.tiles[here]).toBe(T.EMPTY);
    expect(f.setTile(here, T.BRIDGE)).toBe(true);
    expect(f.world.isOpen(T.BRIDGE, here)).toBe(true);
    run(f, 0.5);
    expect(s.status).toBe('playing');
    // The floor taken from under the ball: it falls out of the arena
    f.setTile(here, T.EMPTY);
    for (let c = 1; c < 4; c++) f.setTile(11 * COLS + c, T.EMPTY);
    run(f, 3);
    expect(s.status).toBe('dead');
  });

  it('holds a grabbed ball until the player shakes it loose', () => {
    const f = make();
    const s = f.world.s;
    f.seize(200, 200, 4);
    const held = run(f, 1, { ...idle, right: true });
    expect(held).toContainEqual({ type: 'boss-grab' });
    expect([s.x, s.y]).toEqual([200, 200]);
    expect(f.grab).not.toBeNull();
    // Dragged along with the grab, and out of reach of shots meanwhile
    f.grab!.x = 240;
    f.shoot({ kind: 'bolt', x: 240, y: 200, wall: 'pass', life: 0.2 });
    run(f, 0.3);
    expect(s.x).toBe(240);
    expect(s.status).toBe('playing');
    // Left, right, left, right…
    const events = [];
    for (let i = 0; i < 12 && f.grab; i++)
      events.push(...run(f, 0.1, { ...idle, left: i % 2 === 0, right: i % 2 === 1 }));
    expect(f.grab).toBeNull();
    expect(events).toContainEqual({ type: 'boss-release' });
    expect(s.vy).toBeGreaterThanOrEqual(-V_LOW);
  });

  it('turns the light off and on once per change', () => {
    const f = make();
    f.setDark(true);
    f.setDark(true);
    expect(f.dark).toBe(true);
    expect(f.step(STEP, idle).boss.filter((e) => e.type === 'boss-dark')).toEqual([
      { type: 'boss-dark', on: true },
    ]);
    f.setDark(false);
    expect(f.step(STEP, idle).boss).toContainEqual({ type: 'boss-dark', on: false });
  });

  it('bounces the ball off a shielded boss without hurting it, and lets it through one away', () => {
    const f = make();
    const s = f.world.s;
    const drop = () => {
      s.x = f.boss.x;
      s.y = f.box[1] - BALL_R - 1;
      s.vy = 400;
    };
    f.boss.armor = true;
    drop();
    expect(f.step(STEP, idle).boss).toEqual([{ type: 'boss-bonk' }]);
    expect(f.boss.hp).toBe(2);
    f.boss.armor = false;
    f.boss.away = true;
    s.y = f.def.floorY - 30;
    run(f, 0.2);
    expect(s.status).toBe('playing');
    f.boss.away = false;
    f.boss.hold = false;
    s.x = f.boss.x;
    s.y = f.def.floorY - 30;
    run(f, 0.2);
    expect(s.status).toBe('dead');
  });

  it('clears shots and warnings on a hit and tells the brain', () => {
    let hits = 0;
    let woke = 0;
    const f = make({ hit: () => hits++, wake: () => woke++ });
    const s = f.world.s;
    f.shoot({ kind: 'bolt', x: 100, y: 40, wall: 'pass' });
    f.announce('test', { x: 0, y: 0, w: 1, h: 1 }, 1, () => {
      throw new Error('a cleared warning must not fire');
    });
    s.x = f.boss.x;
    s.y = f.box[1] - BALL_R - 1;
    s.vy = 400;
    expect(f.step(STEP, idle).boss).toContainEqual({ type: 'boss-hit', hp: 1 });
    expect([f.shots.length, f.warns.length, hits]).toEqual([0, 0, 1]);
    expect(f.phase).toBe(1);
    // Back on the ground, away from it: it wakes up
    s.x = 48;
    run(f, 3);
    expect(woke).toBe(1);
    expect(f.dazed).toBe(false);
  });

  it('pushes the ball sideways with a gust, and the ball can steer against it', () => {
    const f = make();
    const s = f.world.s;
    const x0 = s.x;
    s.drift = 60;
    run(f, 1);
    expect(s.x).toBeGreaterThan(x0 + 50);
    const x1 = s.x;
    run(f, 1, { ...idle, left: true });
    expect(s.x).toBeLessThan(x1);
    // Pinned to the right wall by the gust, it can still leave
    s.x = 19 * TILE - BALL_R;
    run(f, 0.3);
    expect(s.x).toBe(19 * TILE - BALL_R);
    run(f, 0.5, { ...idle, left: true });
    expect(s.x).toBeLessThan(19 * TILE - BALL_R - 20);
  });
});
