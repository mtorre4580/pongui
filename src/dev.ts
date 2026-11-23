// Development-only tools (not included in the production build).
// From the browser console: `await replay(3)` replays the solver's solution for level 4.
import type Phaser from 'phaser';
import { unlockAudio } from './audio/sfx';
import { STEP } from './game/constants';
import { endsStep, solve } from './game/solver';
import type { World } from './game/physics';
import type { BossFight } from './game/boss';
import { SCRIPTS, type Keys } from './bosses/scripts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyGame = Record<string, any>;

/**
 * Replaces a running scene's update. Phaser copies `scene.update` into `sys.sceneUpdate` when the
 * scene is created, so assigning `scene.update` alone would have no effect.
 */
function setUpdate(sc: AnyGame, fn: (this: AnyGame, time: number, delta: number) => void) {
  sc.update = fn;
  sc.sys.sceneUpdate = fn;
}

export function installDevTools(game: Phaser.Game) {
  let now = performance.now();
  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      now += 1000 / 60;
      game.step(now, 1000 / 60);
    }
  };

  const replay = async (index: number, stopAfter = Infinity) => {
    game.scene.getScenes(true).forEach((s) => s.scene.key !== 'Game' && s.scene.stop());
    game.scene.start('Game', { index });
    tick(2);
    const sc = game.scene.getScene('Game') as unknown as AnyGame;
    setUpdate(sc, function (this: AnyGame, _t: number, d: number) {
      this.renderBall(d / 1000);
    });
    const world = sc['world'] as World;
    const r = solve(world.level);
    let k = 0;
    let steps = 0;
    for (const d of r.plan) {
      if (k++ >= stopAfter) break;
      for (let i = 0; i < 480; i++) {
        const held = i * STEP < d.dur;
        const ev = world.step(STEP, {
          left: held && d.dir < 0,
          right: held && d.dir > 0,
          jump: d.jump,
          jumpPressed: false,
        });
        sc['prevX'] = world.s.x;
        sc['prevY'] = world.s.y;
        if (ev.length) sc.handle(ev);
        if (++steps % 2 === 0) tick(1);
        if (world.s.status !== 'playing' || endsStep(ev)) break;
      }
      if (world.s.status !== 'playing') break;
    }
    tick(90);
    const s = world.s;
    return {
      solved: r.solved,
      bounces: r.plan.length,
      status: s.status,
      gems: `${s.gemsTaken}/${s.gemsTotal}`,
      time: +s.time.toFixed(1),
    };
  };

  /**
   * Plays the solver's solution in real time inside the real scene (used to record the README
   * GIF). When the level ends the usual result panel opens (`data-scene="Overlay"`).
   */
  const demo = (index: number, { banner = true } = {}) => {
    // Nobody presses a key in a demo: start the audio here (recordings allow it without one)
    unlockAudio();
    {
      const sc = game.scene.getScene('Game') as unknown as AnyGame;
      // Subscribe before starting: outside the game loop Phaser starts the scene synchronously
      sc.events.once('create', () => {
        // Clean clips for the landing page: no level title banner
        if (!banner) sc.hideBanner();
        const world = sc['world'] as World;
        const plan = solve(world.level).plan;
        let k = 0;
        let i = 0;
        let acc = 0;
        let done = false;
        setUpdate(sc, function (this: AnyGame, _t: number, dms: number) {
          if (!this['started'] || done) return this.renderBall(dms / 1000);
          acc += Math.min(dms / 1000, 0.1);
          while (acc >= STEP && world.s.status === 'playing') {
            const d = plan[k] ?? { dir: 0, dur: 0, jump: false };
            const held = i * STEP < d.dur;
            this['prevX'] = world.s.x;
            this['prevY'] = world.s.y;
            const ev = world.step(STEP, {
              left: held && d.dir < 0,
              right: held && d.dir > 0,
              jump: d.jump,
              jumpPressed: false,
            });
            i++;
            if (endsStep(ev)) {
              k++;
              i = 0;
            }
            if (ev.length) this.handle(ev);
            acc -= STEP;
          }
          this['hudTime'].setText(world.s.time.toFixed(1));
          this.renderBall(dms / 1000);
          if (world.s.status !== 'playing') done = true;
        });
      });
      game.scene.getScenes(true).forEach((s) => s.scene.key !== 'Game' && s.scene.stop());
      game.scene.start('Game', { index });
    }
  };

  /**
   * The boss fight on screen, for `pnpm play:boss`: what its script would hold right now and
   * how the fight is going. Null when no boss is being fought.
   */
  const players = new WeakMap<BossFight, (f: BossFight) => Keys>();
  const boss = () => {
    const sc = game.scene.getScene('Game') as unknown as AnyGame;
    const fight = sc['fight'] as BossFight | null;
    const world = sc['bossN'] as number | undefined;
    if (!fight || !world || !game.scene.isActive('Game')) return null;
    let player = players.get(fight);
    if (!player) players.set(fight, (player = SCRIPTS[world]()));
    const s = fight.world.s;
    return {
      keys: sc['started'] && s.status === 'playing' && !fight.won ? player(fight) : null,
      hp: fight.boss.hp,
      won: fight.won,
      status: s.status,
      lives: sc['lives'] as number,
      time: s.time,
      // Something worth a screenshot: the boss in sight with an attack under way
      busy: !fight.boss.away && !fight.dazed && fight.shots.length + fight.warns.length > 0,
    };
  };

  Object.assign(window, { game, tick, replay, demo, unlockAudio, boss });
}
