import { describe, expect, it } from 'vitest';
import { BOSSES, bossOf } from '../src/bosses';
import { SCRIPTS } from '../src/bosses/scripts';
import { arena } from '../src/bosses/types';
import type { Serpent } from '../src/bosses/w2-serpstone';
import type { Bird } from '../src/bosses/w3-squall';
import { SWITCH, type Robot } from '../src/bosses/w4-sprocket';
import type { Octopus } from '../src/bosses/w5-inkwell';
import { LEDGES, type Giant } from '../src/bosses/w6-flurry';
import type { Dragon } from '../src/bosses/w7-cinder';
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

describe('Sprocket (world 4)', () => {
  const { def } = BOSSES[4];
  const brain = (f: BossFight) => f.brain as Robot;
  const STEP_TOP = 10 * TILE;
  /** Brings the switch back and puts the ball on it: the next step is a bounce that flips it. */
  const onSwitch = (f: BossFight) => {
    brain(f).lock = STEP / 2;
    f.step(STEP, idle);
    expect(f.world.s.tiles[SWITCH]).toBe(T.SWITCH);
    Object.assign(f.world.s, { x: 5 * TILE + 16, y: STEP_TOP - BALL_R - 1, vx: 0, vy: 200 });
  };

  it('locks the switch away at first and after every time its shield comes back', () => {
    const { f, s, run } = fightOf(4);
    f.step(STEP, idle);
    expect(s.tiles[SWITCH]).toBe(T.SOLID);
    const events = run(def.lock[0] + 0.5, () => s.tiles[SWITCH] === T.SWITCH, { x: 100, y: 200 });
    expect(s.tiles[SWITCH]).toBe(T.SWITCH);
    expect(events).toContainEqual({ type: 'boss-tiles', idxs: [SWITCH] });
    expect(s.time).toBeGreaterThan(def.lock[0] - 0.1);
  });

  it('is shielded: a ball landing on its head bounces off', () => {
    const { f, s } = fightOf(4);
    expect(f.boss.armor).toBe(true);
    Object.assign(s, { x: f.boss.x, y: f.box[1] - BALL_R - 1, vy: 300 });
    expect(f.step(STEP, idle).boss).toContainEqual({ type: 'boss-bonk' });
    expect(f.boss.hp).toBe(def.hp);
    expect(s.status).toBe('playing');
  });

  it('loses its shield to the switch, stands still, and gets it back after a warning', () => {
    const { f, s } = fightOf(4);
    f.shoot({ kind: 'screw', x: 400, y: 340, vx: -100 });
    onSwitch(f);
    const events = [];
    for (let i = 0; i < 0.1 / STEP; i++) events.push(...f.step(STEP, idle).boss);
    expect(f.world.s.switchOn).toBe(true);
    expect(f.boss.armor).toBe(false);
    expect(events).toContainEqual(expect.objectContaining({ type: 'boss-fx', name: 'shield-off' }));
    // What it had fired is gone, and it neither walks nor attacks meanwhile
    expect(f.shots).toHaveLength(0);
    const x0 = f.boss.x;
    const t0 = s.time;
    const during = [];
    let warned = -1;
    for (let i = 0; i < 10 / STEP && !f.boss.armor; i++) {
      Object.assign(s, { x: 100, y: 200, vx: 0, vy: 0 });
      const now = f.step(STEP, idle).boss;
      if (warned < 0 && now.some((e) => e.type === 'boss-warn' && e.kind === 'shield'))
        warned = s.time;
      during.push(...now);
    }
    expect(f.boss.x).toBe(x0);
    expect(during.some((e) => e.type === 'boss-shot')).toBe(false);
    expect(s.time - t0).toBeGreaterThan(def.open[0] - 0.2);
    // The shield flickers before it is back, and the switch goes off with it
    expect(s.time - warned).toBeGreaterThanOrEqual(MIN_WARN - STEP);
    expect(f.world.s.switchOn).toBe(false);
  });

  it('closes the bridge with the switch: the way to its head', () => {
    const { f, s } = fightOf(4);
    const bridge = 8 * COLS + 9;
    expect(f.world.isOpen(T.BLOCK_A, bridge)).toBe(true);
    onSwitch(f);
    f.step(STEP, idle);
    expect(f.world.isOpen(T.BLOCK_A, bridge)).toBe(false);
    // From the end of the bridge, a drop on its head
    Object.assign(s, { x: 400, y: 8 * TILE - BALL_R - 1, vx: 0, vy: 0 });
    let hit = false;
    for (let i = 0; i < 2 / STEP && !hit && s.status === 'playing'; i++)
      hit = f
        .step(STEP, { ...idle, right: s.x < f.boss.x - 3 })
        .boss.some((e) => e.type === 'boss-hit');
    expect(hit).toBe(true);
    // Hit, its shield is back as soon as it wakes; the bridge stays a little longer
    for (let i = 0; i < 3 / STEP && f.dazed; i++) f.step(STEP, { ...idle, left: s.x > 380 });
    expect(f.boss.armor).toBe(true);
    expect(f.world.isOpen(T.BLOCK_A, bridge)).toBe(false);
    for (let i = 0; i < (def.reopen + 0.2) / STEP; i++) f.step(STEP, { ...idle, left: s.x > 150 });
    expect(f.world.isOpen(T.BLOCK_A, bridge)).toBe(true);
    expect(s.status).toBe('playing');
  });

  it('fires screws along the lane after a warning: deadly there, stopped by the step', () => {
    const lane = fightOf(4);
    brain(lane.f).gear = 99;
    const events = [];
    for (let i = 0; i < 10 / STEP && lane.s.status === 'playing'; i++) {
      // Kept on the floor of the lane, where the screws fly
      Object.assign(lane.s, { x: 250, y: def.floorY - BALL_R, vx: 0, vy: 0 });
      brain(lane.f).gear = 99;
      events.push(...lane.f.step(STEP, idle).boss);
    }
    expect(events).toContainEqual(expect.objectContaining({ type: 'boss-warn', kind: 'screw' }));
    expect(lane.s.status).toBe('dead');
    // On the step they never arrive
    const step = fightOf(4);
    const ends = [];
    for (let i = 0; i < 10 / STEP && step.s.status === 'playing'; i++) {
      brain(step.f).gear = 99;
      ends.push(...step.f.step(STEP, idle).boss.filter((e) => e.type === 'boss-shot-end'));
    }
    expect(step.s.status).toBe('playing');
    expect(ends.length).toBeGreaterThan(0);
    ends.forEach((e) => expect(e).toMatchObject({ kind: 'screw', why: 'wall' }));
  });

  it('lobs a gear at where the ball is: deadly to wait for, easy to step away from', () => {
    const still = fightOf(4);
    const events = still.run(12);
    expect(events).toContainEqual(expect.objectContaining({ type: 'boss-warn', kind: 'gear' }));
    expect(still.s.status).toBe('dead');
    const moved = fightOf(4);
    const x0 = moved.s.x;
    let landed = false;
    for (let i = 0; i < 12 / STEP && !landed && moved.s.status === 'playing'; i++) {
      const busy =
        moved.f.warns.some((w) => w.kind === 'gear') ||
        moved.f.shots.some((g) => g.kind === 'gear');
      const goal = busy ? x0 + 60 : x0;
      landed = moved.f
        .step(STEP, { ...idle, left: moved.s.x > goal + 3, right: moved.s.x < goal - 3 })
        .boss.some((e) => e.type === 'boss-shot-end' && e.kind === 'gear');
    }
    expect(landed).toBe(true);
    expect(moved.s.status).toBe('playing');
  });

  it('gives less time and throws more with each phase', () => {
    for (const list of [def.open, def.boltEvery, def.gearEvery]) {
      expect(list).toHaveLength(def.hp);
      expect([...list]).toEqual([...list].sort((a, b) => b - a));
    }
    expect(def.boltCount[3]).toBeGreaterThan(def.boltCount[0]);
    expect(def.gearCount[3]).toBeGreaterThan(def.gearCount[0]);
    expect(Math.min(def.boltWarn, def.gearWarn)).toBeGreaterThanOrEqual(MIN_WARN);
  });
});

describe('Inkwell (world 5)', () => {
  const { def } = BOSSES[5];
  const brain = (f: BossFight) => f.brain as Octopus;
  /** Runs with the ink held back until the octopus is in `mode`. */
  const until = (f: BossFight, mode: Octopus['mode'], input: InputState = idle, seconds = 12) => {
    const all = [];
    for (
      let i = 0;
      i < seconds / STEP && brain(f).mode !== mode && f.world.s.status === 'playing';
      i++
    ) {
      brain(f).ink = 9;
      all.push(...f.step(STEP, input).boss);
    }
    return all;
  };

  it('guards its head with its arms: a landing there bounces off', () => {
    const { f, s } = fightOf(5);
    expect(f.boss.armor).toBe(true);
    Object.assign(s, { x: f.boss.x, y: f.box[1] - BALL_R - 1, vy: 200 });
    expect(f.step(STEP, idle).boss).toContainEqual({ type: 'boss-bonk' });
    expect(f.boss.hp).toBe(def.hp);
    // And it is taller than a low bounce climbs under water
    let top = Infinity;
    Object.assign(s, { x: 100, y: def.floorY - BALL_R - 1, vy: 100 });
    for (let i = 0; i < 2 / STEP; i++) {
      brain(f).ink = 9;
      brain(f).t = 9;
      f.step(STEP, idle);
      top = Math.min(top, s.y + BALL_R);
    }
    expect(top).toBeGreaterThan(f.box[1] + 8);
  });

  it('announces its reach, catches a ball on that side and drags it to its mouth', () => {
    const { f, s } = fightOf(5);
    const warned = until(f, 'reach');
    expect(warned).toContainEqual(expect.objectContaining({ type: 'boss-warn', kind: 'reach' }));
    const t0 = s.time;
    const caught = until(f, 'drag');
    expect(s.time - t0).toBeGreaterThanOrEqual(def.reachWarn[0] - STEP);
    expect(caught).toContainEqual({ type: 'boss-grab' });
    // Doing nothing (or holding one side), the ball is pulled in and lost
    const x0 = s.x;
    for (let i = 0; i < (def.squeeze + 1) / STEP; i++) f.step(STEP, { ...idle, left: true });
    expect(s.x).toBeGreaterThan(x0 + def.drag[0] * 0.5);
    for (let i = 0; i < 10 / STEP && s.status === 'playing'; i++)
      f.step(STEP, { ...idle, left: true });
    expect(s.status).toBe('dead');
    expect(f.boss.hp).toBe(def.hp);
  });

  it('lets go of a ball that shakes left and right, and then its head is open', () => {
    const { f, s } = fightOf(5);
    until(f, 'drag');
    const events = [];
    let shakes = 0;
    for (let i = 0; f.grab && i < 5 / STEP; i++) {
      // A change of direction every tenth of a second
      const right = Math.floor(i / 12) % 2 === 1;
      if (i % 12 === 0) shakes++;
      events.push(...f.step(STEP, { ...idle, left: !right, right }).boss);
    }
    expect(f.grab).toBeNull();
    expect(events).toContainEqual({ type: 'boss-release' });
    expect(shakes).toBeGreaterThanOrEqual(def.shakes[0]);
    expect(shakes).toBeLessThanOrEqual(def.shakes[0] + 2);
    expect(brain(f).mode).toBe('open');
    expect(f.boss.armor).toBe(false);
    expect(s.status).toBe('playing');
    // Open for a while, then its arms are back over its head
    const t0 = s.time;
    for (let i = 0; i < 8 / STEP && !f.boss.armor; i++) {
      Object.assign(s, { x: 80, y: 300, vx: 0, vy: 0 });
      brain(f).ink = 9;
      f.step(STEP, idle);
    }
    expect(f.boss.armor).toBe(true);
    expect(s.time - t0).toBeGreaterThan(def.open[0] - 0.1);
  });

  it('misses a ball above its reach or on its other side, and opens up all the same', () => {
    // High over the sand when the arms arrive
    const high = fightOf(5);
    until(high.f, 'reach');
    for (let i = 0; i < 3 / STEP && brain(high.f).mode === 'reach'; i++) {
      Object.assign(high.s, { y: def.floorY - def.reachHeight - 30, vy: 0 });
      high.f.step(STEP, idle);
    }
    expect(high.f.grab).toBeNull();
    expect(brain(high.f).mode).toBe('open');
    // Through the portal to the other side while the warning lasts
    const far = fightOf(5);
    until(far.f, 'reach');
    const side = Math.sign(far.s.x - far.f.boss.x);
    Object.assign(far.s, { x: 80, y: 5 * TILE + 16, vx: -100, vy: 0 });
    const events = until(far.f, 'open', { ...idle, left: true });
    expect(far.s.x * side).toBeLessThan(far.f.boss.x * side);
    expect(events).not.toContainEqual({ type: 'boss-grab' });
    expect(far.s.status).toBe('playing');
  });

  it('is hit by a high bounce from the sand while its head is open', () => {
    const { f, s } = fightOf(5);
    until(f, 'reach');
    for (let i = 0; i < 3 / STEP && brain(f).mode === 'reach'; i++) {
      Object.assign(s, { y: 100, vy: 0 });
      f.step(STEP, idle);
    }
    expect(brain(f).mode).toBe('open');
    Object.assign(s, { x: f.box[0] - 30, y: def.floorY - BALL_R - 1, vx: 0, vy: 100 });
    let hit = false;
    for (let i = 0; i < def.open[0] / STEP && !hit && s.status === 'playing'; i++) {
      const over = s.y + BALL_R < f.box[1] - 2;
      hit = f
        .step(STEP, { ...idle, jump: true, right: over && s.x < f.boss.x })
        .boss.some((e) => e.type === 'boss-hit');
    }
    expect(hit).toBe(true);
    expect(f.boss.armor).toBe(true);
  });

  it('sends ink up from the sand under the ball: announced, deadly, and gone after a while', () => {
    const still = fightOf(5);
    const events = [];
    for (let i = 0; i < 8 / STEP && still.s.status === 'playing'; i++) {
      brain(still.f).t = 9;
      events.push(...still.f.step(STEP, idle).boss);
    }
    expect(events).toContainEqual(expect.objectContaining({ type: 'boss-warn', kind: 'ink' }));
    expect(still.s.status).toBe('dead');
    // Stepping aside when the mark shows; the bubble pops on its own
    const moved = fightOf(5);
    const x0 = moved.s.x;
    let popped = false;
    for (let i = 0; i < 12 / STEP && !popped && moved.s.status === 'playing'; i++) {
      brain(moved.f).t = 9;
      const goal = moved.f.warns.length || moved.f.shots.length ? x0 - 44 : x0;
      popped = moved.f
        .step(STEP, { ...idle, left: moved.s.x > goal + 3, right: moved.s.x < goal - 3 })
        .boss.some((e) => e.type === 'boss-shot-end' && e.why === 'time');
    }
    expect(popped).toBe(true);
    expect(moved.s.status).toBe('playing');
  });

  it('asks for more shakes, drags faster and leaves less time with each phase', () => {
    for (const up of [def.shakes, def.drag, def.inkCount])
      expect([...up]).toEqual([...up].sort((a, b) => a - b));
    for (const down of [def.rest, def.reachWarn, def.open, def.inkEvery])
      expect([...down]).toEqual([...down].sort((a, b) => b - a));
    expect(Math.min(...def.reachWarn, def.inkWarn)).toBeGreaterThanOrEqual(MIN_WARN);
    // At four changes of direction a second, a ball caught a tile and a half away gets loose
    // in every phase
    def.shakes.forEach((n, phase) =>
      expect(n / 4).toBeLessThan(def.squeeze + (1.5 * TILE) / def.drag[phase]),
    );
  });
});

describe('Flurry (world 6)', () => {
  const { def } = BOSSES[6];
  const brain = (f: BossFight) => f.brain as Giant;
  const LEDGE = { x: 176, y: 8 * TILE - BALL_R }; // on the left ledge
  const FLOOR_ROW = 11 * COLS;
  /** Steps with the given input until the giant is in `mode`. */
  const until = (f: BossFight, mode: Giant['mode'], input: InputState = idle, seconds = 20) => {
    const all = [];
    for (
      let i = 0;
      i < seconds / STEP && brain(f).mode !== mode && f.world.s.status === 'playing';
      i++
    )
      all.push(...f.step(STEP, input).boss);
    return all;
  };
  const ice = (f: BossFight) =>
    [...f.world.s.tiles.subarray(FLOOR_ROW, FLOOR_ROW + COLS)].filter((t) => t === T.ICE).length;

  it('throws snowballs at the ball: announced, deadly, and they leave ice on the floor', () => {
    const still = fightOf(6);
    const events = still.run(8);
    expect(events).toContainEqual(expect.objectContaining({ type: 'boss-warn', kind: 'snow' }));
    expect(still.s.status).toBe('dead');
    // Stepping away from the mark, towards the far wall
    const moved = fightOf(6);
    const x0 = moved.s.x;
    let landed = false;
    for (let i = 0; i < 8 / STEP && !landed && moved.s.status === 'playing'; i++) {
      const goal = moved.f.warns.length || moved.f.shots.length ? x0 - 50 : x0;
      landed = moved.f
        .step(STEP, { ...idle, left: moved.s.x > goal + 3, right: moved.s.x < goal - 3 })
        .boss.some((e) => e.type === 'boss-shot-end');
    }
    expect(landed).toBe(true);
    expect(moved.s.status).toBe('playing');
    expect(ice(moved.f)).toBe(1);
    expect(moved.s.tiles[FLOOR_ROW + Math.floor(x0 / TILE)]).toBe(T.ICE);
  });

  it('charges across the whole floor after its snowballs: only a ledge is out of its way', () => {
    const floor = fightOf(6);
    brain(floor.f).left = 0;
    const warned = until(floor.f, 'charge', idle, 6);
    expect(warned).toContainEqual(expect.objectContaining({ type: 'boss-warn', kind: 'charge' }));
    Object.assign(floor.s, { x: 48, y: def.floorY - BALL_R, vx: 0 });
    floor.run(4);
    expect(floor.s.status).toBe('dead');
    // On a ledge it runs by underneath; with no ice on its way it stops at the far end, shielded
    const up = fightOf(6);
    brain(up.f).left = 0;
    until(up.f, 'charge', idle, 6);
    Object.assign(up.s, { ...LEDGE, vx: 0, vy: 0 });
    until(up.f, 'throw', idle, 6);
    expect(up.s.status).toBe('playing');
    expect(up.f.boss.x).toBe(def.minX);
    expect(up.f.boss.armor).toBe(true);
    expect(up.f.boss.dir).toBe(1);
  });

  it('slips on its own ice, slams into the wall and sits there open to a hit', () => {
    const { f, s } = fightOf(6);
    brain(f).left = 0;
    f.setTile(FLOOR_ROW + 9, T.ICE);
    until(f, 'charge', idle, 6);
    Object.assign(s, { ...LEDGE, vx: 0, vy: 0 });
    const events = until(f, 'sit', idle, 6);
    expect(events).toContainEqual(expect.objectContaining({ type: 'boss-fx', name: 'slip' }));
    expect(f.boss.x).toBe(def.minX);
    expect(f.boss.armor).toBe(false);
    // The ice it ran over is gone
    expect(ice(f)).toBe(0);
    // Off the edge of the ledge, onto its head
    let hit = false;
    for (let i = 0; i < def.sit[0] / STEP && !hit && s.status === 'playing'; i++)
      hit = f
        .step(STEP, { ...idle, left: s.x > f.boss.x + 3 })
        .boss.some((e) => e.type === 'boss-hit');
    expect(hit).toBe(true);
    expect(f.boss.armor).toBe(true);
  });

  it('gets back up, shielded, if nobody hits it in time', () => {
    const { f, s } = fightOf(6);
    brain(f).left = 0;
    f.setTile(FLOOR_ROW + 9, T.ICE);
    until(f, 'charge', idle, 6);
    Object.assign(s, { ...LEDGE, vx: 0, vy: 0 });
    until(f, 'sit', idle, 6);
    const t0 = s.time;
    f.grab = { ...LEDGE, need: Infinity, wiggles: 0, last: 0 };
    until(f, 'throw', idle, 8);
    expect(s.time - t0).toBeGreaterThan(def.sit[0] - 0.1);
    expect(f.boss.armor).toBe(true);
  });

  it('stomps a ledge out from under a ball that stays on it, and the ledge grows back', () => {
    const { f, s } = fightOf(6);
    Object.assign(s, { ...LEDGE, vx: 0, vy: 0 });
    brain(f).t = 99; // no snowballs meanwhile
    const warned = until(f, 'stomp', idle, 6);
    expect(warned).toContainEqual(expect.objectContaining({ type: 'boss-warn', kind: 'stomp' }));
    expect(s.time).toBeGreaterThan(def.camp - 0.1);
    until(f, 'throw', idle, 3);
    for (const idx of LEDGES[0]) expect(s.tiles[idx]).toBe(T.EMPTY);
    // The ball falls to the floor
    brain(f).t = 99;
    for (let i = 0; i < 1 / STEP; i++) f.step(STEP, idle);
    expect(s.y).toBeGreaterThan(9 * TILE);
    brain(f).t = 99;
    f.grab = { x: 320, y: 150, need: Infinity, wiggles: 0, last: 0 };
    for (let i = 0; i < (def.regrow + 0.5) / STEP; i++) f.step(STEP, idle);
    for (const idx of LEDGES[0]) expect(s.tiles[idx]).toBe(T.THIN_ICE);
  });

  it('charges faster, warns less and sits for less time with each phase', () => {
    for (const up of [def.throws, def.chargeSpeed])
      expect([...up]).toEqual([...up].sort((a, b) => a - b));
    for (const down of [def.throwEvery, def.chargeWarn, def.sit])
      expect([...down]).toEqual([...down].sort((a, b) => b - a));
    expect(Math.min(...def.chargeWarn, def.snowWarn, def.stompWarn)).toBeGreaterThanOrEqual(
      MIN_WARN,
    );
    // It fits under the ledges
    expect(def.floorY - def.height).toBeGreaterThan(9 * TILE);
  });
});

describe('Cinder (world 7)', () => {
  const { def } = BOSSES[7];
  const brain = (f: BossFight) => f.brain as Dragon;
  const FLOOR_ROW = 11 * COLS;
  const LEDGE_TOP = 8 * TILE;

  it('lets the ball pass under it with low bounces, and burns one that bounces high there', () => {
    const low = fightOf(7);
    // Kept right under it for three seconds, with its fire held back
    for (let i = 0; i < 3 / STEP; i++) {
      // (over plain rock, away from the vents)
      low.f.boss.x = 250;
      low.s.x = 250;
      brain(low.f).turns = -9;
      low.f.step(STEP, idle);
    }
    expect(low.s.status).toBe('playing');
    const high = fightOf(7);
    for (let i = 0; i < 3 / STEP && high.s.status === 'playing'; i++) {
      high.f.boss.x = 250;
      high.s.x = 250;
      brain(high.f).turns = -9;
      high.f.step(STEP, { ...idle, jump: true });
    }
    expect(high.s.status).toBe('dead');
    expect(high.f.boss.hp).toBe(def.hp);
  });

  it('is hit by a high bounce from a ledge, and then flies away fast', () => {
    const { f, s } = fightOf(7);
    f.boss.x = 230;
    f.boss.dir = -1;
    Object.assign(s, { x: 122, y: LEDGE_TOP - BALL_R - 1, vx: 0, vy: 100 });
    let hit = false;
    for (let i = 0; i < 2 / STEP && !hit && s.status === 'playing'; i++) {
      brain(f).turns = -9;
      const over = s.y + BALL_R < f.box[1] - 2;
      hit = f
        .step(STEP, { ...idle, jump: true, right: over && s.x < f.boss.x })
        .boss.some((e) => e.type === 'boss-hit');
    }
    expect(hit).toBe(true);
    // The ball lands; the dragon wakes and leaves at well over its speed
    for (let i = 0; i < 3 / STEP && f.dazed; i++) f.step(STEP, { ...idle, left: s.x > 100 });
    expect(f.dazed).toBe(false);
    const x0 = f.boss.x;
    for (let i = 0; i < 0.5 / STEP; i++) {
      brain(f).turns = -9;
      f.step(STEP, { ...idle, left: s.x > 100 });
    }
    expect(f.boss.x - x0).toBeGreaterThan(def.speeds[1] * 0.5 * 2);
  });

  it('spits fire as the vents go dark: announced, deadly, and it cracks the rock it lands on', () => {
    const still = fightOf(7);
    const col = Math.floor(still.s.x / TILE);
    const events = still.run(12, () => still.f.shots.length > 0);
    expect(events).toContainEqual(expect.objectContaining({ type: 'boss-warn', kind: 'fire' }));
    // The warning came as the vents went dark
    expect(still.f.warns).toHaveLength(0);
    expect(still.s.ticks % 360).toBe(Math.round(def.fireWarn / STEP));
    still.run(3);
    expect(still.s.status).toBe('dead');
    // Stepping two tiles away: the fire lands, and the tile it hit is cracked
    const moved = fightOf(7);
    const x0 = moved.s.x;
    let landed = false;
    for (let i = 0; i < 12 / STEP && !landed && moved.s.status === 'playing'; i++) {
      const goal = moved.f.warns.length || moved.f.shots.length ? x0 + 64 : x0;
      landed = moved.f
        .step(STEP, { ...idle, left: moved.s.x > goal + 3, right: moved.s.x < goal - 3 })
        .boss.some((e) => e.type === 'boss-shot-end');
    }
    expect(landed).toBe(true);
    expect(moved.s.status).toBe('playing');
    expect(moved.s.tiles[FLOOR_ROW + col]).toBe(T.CRUMBLE);
  });

  it('leaves rock that holds one more bounce and then is gone for good', () => {
    const { f, s } = fightOf(7);
    const idx = FLOOR_ROW + 3;
    f.setTile(idx, T.CRUMBLE);
    Object.assign(s, { x: 3 * TILE + 16, y: def.floorY - BALL_R - 1, vx: 0, vy: 100 });
    for (let i = 0; i < 0.3 / STEP; i++) {
      brain(f).turns = -9;
      f.step(STEP, idle);
    }
    // It held the bounce and is on its way out
    expect(s.status).toBe('playing');
    expect(s.tiles[idx]).toBe(T.CRUMBLE);
    for (let i = 0; i < 2 / STEP && s.status === 'playing'; i++) {
      brain(f).turns = -9;
      f.step(STEP, idle);
    }
    expect(s.tiles[idx]).toBe(T.EMPTY);
    expect(s.status).toBe('dead');
  });

  it('never cracks the vents, and aims no fire over a hole', () => {
    const { f, s, run } = fightOf(7);
    // The ball over a vent: the fire lands on it and leaves it as it was
    const vent = FLOOR_ROW + 6;
    expect(s.tiles[vent]).toBe(T.VENT);
    f.grab = { x: 6 * TILE + 16, y: 200, need: Infinity, wiggles: 0, last: 0 };
    let ends = 0;
    for (let i = 0; i < 14 / STEP && ends < 1; i++)
      ends += f.step(STEP, idle).boss.filter((e) => e.type === 'boss-shot-end').length;
    expect(ends).toBe(1);
    expect(s.tiles[vent]).toBe(T.VENT);
    // The ball held over a hole: nothing to aim at
    f.grab = null;
    f.setTile(FLOOR_ROW + 8, T.EMPTY);
    const events = run(13, undefined, { x: 8 * TILE + 16, y: 200 });
    expect(events.some((e) => e.type === 'boss-warn')).toBe(false);
  });

  it('flies faster and spits more with each phase', () => {
    expect([...def.speeds]).toEqual([...def.speeds].sort((a, b) => a - b));
    expect([...def.fireCount]).toEqual([...def.fireCount].sort((a, b) => a - b));
    expect(def.fireWarn).toBeGreaterThanOrEqual(MIN_WARN);
    // Its head is over a high bounce from the floor and under one from a ledge
    const head = def.fly + def.height;
    expect(head).toBeGreaterThan(115 + 8);
    expect(head).toBeLessThan(3 * TILE + 115);
    // And its turns stop short of a ball standing on a ledge
    expect(def.minX - def.width / 2).toBeGreaterThan(4 * TILE + BALL_R);
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

  it('shoves the ball off its head when a landing does no damage, if the boss says so', () => {
    for (const shove of [undefined, 140]) {
      const f = make({}, { shove });
      const s = f.world.s;
      f.boss.armor = true;
      Object.assign(s, { x: f.boss.x + 5, y: f.box[1] - BALL_R - 1, vy: 400 });
      expect(f.step(STEP, idle).boss).toEqual([{ type: 'boss-bonk' }]);
      // Left alone, the ball comes down beside it instead of on its head again
      for (let i = 0; i < 0.9 / STEP; i++) f.step(STEP, idle);
      if (shove) expect(s.x).toBeGreaterThan(f.box[2] + BALL_R);
      else expect(s.x).toBe(f.boss.x + 5);
    }
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
