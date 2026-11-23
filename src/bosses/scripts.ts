// A way to beat each boss that a person could follow, written as a player made of simple
// rules. `tests/boss.test.ts` plays every boss with its script (what keeps a boss winnable) and
// `pnpm play:boss` plays them in the real scene with real key presses. Never part of the game:
// only tests and the development tools import this file.
import type { BossFight } from '../game/boss';
import { BALL_R, GRAVITY, MAX_VX } from '../game/constants';
import type { Serpent } from './w2-serpstone';
import type { Giant } from './w6-flurry';
import type { Saucer } from './w8-orbit';
import type { Specter } from './w9-gloom';
import type { InputState } from '../game/physics';

/** What the script wants held right now (`jumpPressed` is left to whoever presses the keys). */
export type Keys = Pick<InputState, 'left' | 'right' | 'jump'>;
/** A new player for one fight: called every step, it says which keys to hold. */
export type BossScript = () => (f: BossFight) => Keys;

/** Steers towards `x` (within `slack` px). */
export const steer = (from: number, x: number, slack = 3) => ({
  left: from > x + slack,
  right: from < x - slack,
});

/** Seconds until the ball's bottom is down at `y` (0 if it is already there or below). */
export function fallTime(f: BossFight, y: number): number {
  const s = f.world.s;
  const d = y - (s.y + BALL_R);
  if (d <= 0) return 0;
  return (-s.vy + Math.sqrt(s.vy * s.vy + 2 * GRAVITY * d)) / GRAVITY;
}

/**
 * Whether the ball, steering from now on, comes down on the boss's head: it is above it and
 * has the time in the air to get over it.
 */
export function canStomp(f: BossFight, slack = 0.8): boolean {
  const s = f.world.s;
  const [left, top, right] = f.box;
  if (s.y + BALL_R > top - 2) return false;
  const gap = Math.max(left - 4 - s.x, s.x - right - 4, 0);
  return gap <= MAX_VX * fallTime(f, top) * slack;
}

/**
 * Where to head for on the way to `goal` without walking under what is coming down: x of
 * every warning and shot of these kinds is kept `near` px away. Under one, it steps out to the
 * nearest clear spot; with one in the way, it waits where it is.
 */
export function around(f: BossFight, kinds: readonly string[], goal: number, near = 24): number {
  const x = f.world.s.x;
  const xs = [...f.warns, ...f.shots].filter((w) => kinds.includes(w.kind)).map((w) => w.x);
  const clear = (at: number) => xs.every((d) => Math.abs(d - at) >= near);
  if (!clear(x)) {
    for (let d = 4; d < 200; d += 4) {
      // The side of the goal first
      const first = goal >= x ? x + d : x - d;
      const second = goal >= x ? x - d : x + d;
      for (const at of [first, second])
        if (at > 44 && at < 596 && clear(at)) return at + (at > x ? 6 : -6);
    }
    return goal;
  }
  const lo = Math.min(x, goal) - near;
  const hi = Math.max(x, goal) + near;
  return xs.some((d) => d > lo && d < hi) ? x : goal;
}

/**
 * Grumble: wait on the left ledge, drop on its head when it comes close, and bounce back up
 * to the ledge while it is dazed.
 */
const grumble: BossScript = () => (f) => {
  const s = f.world.s;
  const [left, top] = f.box;
  const onLedge = s.x < 3 * 32 && s.y < 8 * 32;
  const above = s.y + BALL_R < top - 4;
  // Go for it only from above, when it is awake, on the ground and within reach of the ledge
  const reach = left < 5 * 32 && f.boss.lift === 0;
  const attack = !f.dazed && above && (onLedge ? reach : s.x >= 3 * 32);
  return { jump: !onLedge, ...steer(s.x, attack ? f.boss.x : 56) };
};

/**
 * Serpstone: wait on a stone, step aside from the stalactites, and when it is up bounce high
 * from the edge of the stone next to it and come down on its head.
 */
const serpstone: BossScript = () => (f) => {
  const s = f.world.s;
  const { boss } = f;
  const up = (f.brain as Serpent).mode === 'up' && !f.dazed;
  // The stone on the ball's side of the serpent, and the edge of it that faces the serpent
  const stones = [224, 416];
  const stone = boss.x < 200 ? 224 : boss.x > 440 ? 416 : s.x < boss.x ? 224 : 416;
  if (up && canStomp(f)) return { jump: false, ...steer(s.x, boss.x) };
  const goal = up
    ? stone + Math.sign(boss.x - stone) * 22
    : stones.reduce((a, b) => (Math.abs(a - s.x) <= Math.abs(b - s.x) ? a : b));
  // Only the stones give a high bounce, and only when going for the head
  return { jump: up, ...steer(s.x, around(f, ['stalactite'], goal)) };
};

/**
 * Squall: ride the left updraft to the cloud beside it, keep out of the columns that light
 * up, and walk off the cloud's edge onto the bird when it flies by underneath.
 */
const squall: BossScript = () => (f) => {
  const s = f.world.s;
  const { boss } = f;
  const [, top] = f.box;
  const cloud = 3 * 32; // the top of the cloud; its cells go from x = 64 to x = 160
  const onCloud = s.y + BALL_R <= cloud + 1 && s.x > 58 && s.x < 170;
  // In the air below the cloud's top but over the bird: keep over its head
  if (!onCloud && !f.dazed && canStomp(f)) return { jump: false, ...steer(s.x, boss.x) };
  if (onCloud) {
    // The bird about to be right past the edge of the cloud: walk off onto it
    const soon = boss.x + boss.dir * 30;
    const near = !f.dazed && soon > 178 && soon < 236 && top > cloud;
    const goal = near ? Math.max(boss.x, 196) : 128;
    return { jump: false, ...steer(s.x, around(f, ['bolt'], goal, 22)) };
  }
  // Up the left updraft, then right onto the cloud from over its top
  if (s.wind || (s.x < 64 && s.y < cloud))
    return { jump: false, left: false, right: s.y < cloud - 14 };
  // Back on the floor: to the updraft, stopping for lightning in the way. After a hit the
  // bounce off the bird's head is enough to steer straight back onto the cloud
  const goal = s.y < cloud ? 128 : around(f, ['bolt'], 48, 22);
  return { jump: false, ...steer(s.x, goal) };
};

/**
 * Sprocket: bounce on the switch, jump from the end of the step onto the bridge that closes,
 * cross it and drop on the robot while its shield is off; then back to the step before the
 * bridge opens. Gears are stepped away from; the bolts never reach the step.
 */
const sprocket: BossScript = () => (f) => {
  const s = f.world.s;
  const { boss } = f;
  const open = !boss.armor && !f.dazed;
  const bridge = 8 * 32;
  const bottom = s.y + BALL_R;
  if (open && canStomp(f)) return { jump: false, ...steer(s.x, boss.x) };
  // Shield on (or the robot dazed): back along the bridge to the step, and onto the switch
  // once the bridge has opened again
  if (!open) {
    const goal = s.x >= 224 ? 120 : around(f, ['gear'], f.world.s.switchOn ? 110 : 176, 26);
    return { jump: s.x > 224 && bottom > bridge + 1, ...steer(s.x, goal) };
  }
  // Shield off. On the bridge: to its far end, and off it with a high bounce
  if (bottom <= bridge + 1 && s.x > 214) return { jump: s.x > 360, right: true, left: false };
  // On the step: a high bounce from its end, then right once the ball is over the bridge
  if (s.x < 224) return { jump: true, ...steer(s.x, bottom < bridge - 2 ? 260 : 208) };
  // In the lane: back to the step
  return { jump: true, ...steer(s.x, 150) };
};

/**
 * Inkwell: keep to its left, away from the ink coming up. Caught, shake left and right until
 * the ball is loose; then, while its head is open, bounce high next to it and come down on it.
 */
const inkwell: BossScript = () => {
  return (f) => {
    const s = f.world.s;
    const { boss } = f;
    // Shaking: a change of direction five times a second
    const beat = Math.floor(s.time * 5) % 2 === 0;
    if (f.grab) return { jump: false, left: beat, right: !beat };
    const [left, top] = f.box;
    const open = !boss.armor && !f.dazed;
    if (open && s.y + BALL_R < top - 2) return { jump: false, ...steer(s.x, boss.x) };
    // Open: from the sand right beside it, as high as a bounce goes. Guarded: further away
    const goal = open ? left - 30 : Math.min(left - 24, around(f, ['ink'], left - 110, 26));
    return { jump: open, ...steer(s.x, goal) };
  };
};

/**
 * Flurry: stay on the floor near the ledge by the far wall, stepping away from the snowballs
 * (they leave the ice it will slip on). After its last snowball, bounce high beside the ledge
 * and land on it softly. When it has slid into the wall, walk off the ledge onto its head.
 */
const flurry: BossScript = () => (f) => {
  const s = f.world.s;
  const { boss } = f;
  const giant = f.brain as Giant;
  const top = 8 * 32; // the top of the ledges
  // The ledge by the wall it will run to: its outer and inner edges
  const left = boss.dir < 0;
  const [outer, inner] = left ? [128, 224] : [512, 416];
  const out = left ? 1 : -1; // from that ledge towards the middle of the arena
  const onLedge = s.y + BALL_R <= top + 1 && (s.x - outer) * out > -8 && (s.x - inner) * out < 8;
  if (giant.mode === 'sit' && !f.dazed) {
    if (canStomp(f) || onLedge) return { jump: false, ...steer(s.x, boss.x) };
    return { jump: true, ...steer(s.x, boss.x + out * 60) };
  }
  // On the ledge: wait in its middle (never holding jump: thin ice)
  if (onLedge) return { jump: false, ...steer(s.x, (outer + inner) / 2) };
  // Time to climb: no snowballs left to come
  const climb = giant.mode !== 'throw' || giant.left === 0;
  if (climb) {
    // Over the ledge's top: onto it. Otherwise a high bounce from just past its inner edge
    if (s.y + BALL_R < top - 2) return { jump: false, ...steer(s.x, inner - out * 30) };
    return { jump: true, ...steer(s.x, inner + out * 16) };
  }
  // Snowballs: on the floor, a little further out
  return { jump: false, ...steer(s.x, around(f, ['snow'], inner + out * 50, 28)) };
};

/**
 * A player that plans one bounce at a time, like a person hopping over bad ground: at each
 * bounce it picks where to come down next, within a low bounce's reach, and steers there for
 * the whole flight. `cost` says how bad a landing spot is; nearer to `target` is better.
 */
function hopper(cost: (f: BossFight, x: number) => number) {
  let spot: number | null = null;
  let vy = 0;
  return (f: BossFight, target: number) => {
    const s = f.world.s;
    const bounced = vy > 0 && s.vy < 0;
    vy = s.vy;
    if (spot === null || bounced) {
      let best = Infinity;
      for (const d of [0, -0.5, 0.5, -1, 1]) {
        const x = s.x + d * 62;
        const c = cost(f, x) + Math.abs(x - target);
        if (c < best) [best, spot] = [c, x];
      }
    }
    return steer(s.x, spot ?? s.x, 2);
  };
}

/**
 * Cinder: keep to one side of the dragon, hopping between whole tiles and away from where
 * fire is about to land. When the dragon turns back towards that side, bounce high from the
 * floor beside the ledge onto the ledge, and from the ledge onto its head as it comes within
 * reach.
 */
const cinder: BossScript = () => {
  // How bad it is to come down at x: holes, lit vents, cracked rock, fire on its way
  const hop = hopper((f, x) => {
    const s = f.world.s;
    const idx = 11 * 20 + Math.floor(x / 32);
    const tile = s.tiles[idx];
    // Vents are lit during the second half of their 360 steps; the ball lands in about 60
    const lit = (s.ticks + 60) % 360 >= 165;
    // Cracked rock (25) holds one more bounce, unless it is already crumbling
    const cracked = tile === 25 && s.hits[idx] === 0;
    const ground = tile === 1 ? 0 : tile === 26 && !lit ? 60 : cracked ? 800 : 1e6;
    const fire = [...f.warns, ...f.shots].some((w) => w.kind === 'fire' && Math.abs(w.x - x) < 28);
    // The tiles beside the ledges are for bouncing up from: not for waiting on (fire follows
    // the ball, and they would be the next to crack)
    const col = Math.floor(x / 32);
    const kept = !climbing && [4, 5, 14, 15].includes(col) ? 150 : 0;
    return ground + kept + (fire ? 1e5 : 0);
  });
  let climbing = false;
  return (f) => {
    const s = f.world.s;
    const { boss } = f;
    if (!f.dazed && canStomp(f)) return { jump: false, ...steer(s.x, boss.x) };
    // Everything below is worked out as if the ball were on the left side: `flip` mirrors it
    const mirror = s.x > boss.x;
    const flip = (x: number) => (mirror ? 640 - x : x);
    const X = flip(s.x);
    const bossX = flip(boss.x);
    const towards = (mirror ? -boss.dir : boss.dir) < 0;
    const top = 8 * 32; // the top of the ledge (its cells go from x = 64 to x = 128)
    const bottom = s.y + BALL_R;
    const whole = (col: number) => s.tiles[11 * 20 + (mirror ? 19 - col : col)] === 1;
    if (bottom <= top + 1 && X > 54 && X < 138) {
      // On the ledge: out from under fire first; then to its edge, and up when the dragon is
      // within a high bounce of it
      const reach = !f.dazed && bossX < 262;
      const goal = around(f, ['fire'], flip(reach ? 124 : 104), 26);
      return { jump: reach && goal === flip(124), ...steer(s.x, goal) };
    }
    // Up to the ledge while the dragon is still on its way: never a high bounce under its belly
    const launch = whole(4) ? 148 : whole(5) ? 168 : 0;
    climbing = !f.dazed && towards && bossX > 250 && launch > 0;
    // Over the ledge's top: onto it
    if (climbing && bottom < top - 2 && X < 190) return { jump: false, ...steer(s.x, flip(112)) };
    // Hop to the floor beside the ledge (and bounce high there), or wait a few tiles away
    // (with no floor left beside this ledge, under the dragon to the other side)
    const keys = hop(f, flip(climbing ? launch : launch ? 250 : 420));
    return { jump: climbing && Math.abs(X - launch) < 14, ...keys };
  };
};

/**
 * Orbit: keep moving away from the orbs. When the beam's column lights up, step out of it;
 * once the saucer is down, bounce high from beside the beam and come down on its dome. Caught,
 * shake left and right.
 */
const orbit: BossScript = () => (f) => {
  const s = f.world.s;
  const { boss } = f;
  const beat = Math.floor(s.time * 5) % 2 === 0;
  if (f.grab) return { jump: false, left: beat, right: !beat };
  const mode = (f.brain as Saucer).mode;
  const [, top] = f.box;
  const down = (mode === 'beam' || mode === 'stall') && !f.dazed;
  if (down && s.y + BALL_R < top - 2) return { jump: false, ...steer(s.x, boss.x) };
  const orbs = f.shots.filter((shot) => shot.kind === 'orb');
  /** Whether an orb is near the way from the ball to x (they are slow: near means near). */
  const orbNear = (x: number) =>
    orbs.some(
      (o) =>
        o.x > Math.min(s.x, x) - 46 && o.x < Math.max(s.x, x) + 46 && Math.abs(o.y - s.y) < 110,
    );
  if (down || mode === 'aim') {
    // Beside the beam (or where it is about to be): the ball's side, or the other one if an
    // orb is in the way; with orbs on both, away from the beam
    const side = s.x < boss.x ? -1 : 1;
    const spots = [boss.x + side * 62, boss.x - side * 62].filter((x) => x > 60 && x < 580);
    // (the other side is reached under the saucer only before the beam is on)
    const open = spots.filter((x, i) => !orbNear(x) && (i === 0 || mode === 'aim'));
    if (open.length) return { jump: down, ...steer(s.x, open[0]) };
    return { jump: false, ...steer(s.x, s.x + side * 60) };
  }
  // Hovering: away from the nearest orb, and off the walls
  const orb = orbs.sort(
    (a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y),
  )[0];
  let goal = s.x;
  if (orb && Math.hypot(orb.x - s.x, orb.y - s.y) < 120) goal = s.x + (s.x >= orb.x ? 60 : -60);
  // Cornered: under the orb to the other side (it is slower than the ball)
  if (goal < 110) goal = orb && orb.y < s.y - 40 ? 300 : 110;
  if (goal > 530) goal = orb && orb.y < s.y - 40 ? 340 : 530;
  return { jump: false, ...steer(s.x, goal) };
};

/**
 * Gloom: go to the platform over the spot where its eyes glow. While the platform is solid,
 * bounce high from beside it and land on it; when it opens, the ball drops on the specter's
 * head. If that fails, keep away from it until it fades.
 */
const gloom: BossScript = () => (f) => {
  const s = f.world.s;
  const { boss } = f;
  const mode = (f.brain as Specter).mode;
  const top = 8 * 32; // the top of the platforms (each is 64 px wide, centered on a spot)
  const bottom = s.y + BALL_R;
  if (mode === 'solid' && !f.dazed) {
    if (canStomp(f)) return { jump: false, ...steer(s.x, boss.x) };
    // Missed it: away from where it is sweeping to
    return { jump: false, ...steer(s.x, boss.x + (s.x < boss.x ? -200 : 200)) };
  }
  if (mode !== 'eyes') return { jump: false, left: false, right: false };
  // Over the platform: stay over its middle. `%` blocks are solid in the first half of the cycle
  if (bottom < top + 1 && Math.abs(s.x - boss.x) < 40)
    return { jump: false, ...steer(s.x, boss.x) };
  const solid = s.ticks % 288 < 144;
  const side = s.x < boss.x ? -1 : 1;
  if (bottom < top - 2 && solid) return { jump: false, ...steer(s.x, boss.x) };
  // Beside it on the floor; a high bounce once it is solid
  return { jump: solid, ...steer(s.x, boss.x + side * 52) };
};

export const SCRIPTS: Record<number, BossScript> = {
  1: grumble,
  2: serpstone,
  3: squall,
  4: sprocket,
  5: inkwell,
  6: flurry,
  7: cinder,
  8: orbit,
  9: gloom,
};
