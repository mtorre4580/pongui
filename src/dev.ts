// Development-only tools (not included in the production build).
// From the browser console: `await replay(3)` replays the solver's solution for level 4.
import type Phaser from 'phaser';
import { STEP } from './game/constants';
import { solve } from './game/solver';
import type { World } from './game/physics';

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
        if (world.s.status !== 'playing' || ev.some((e) => e.type === 'bounce')) break;
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
  const demo = (index: number) => {
    {
      const sc = game.scene.getScene('Game') as unknown as AnyGame;
      // Subscribe before starting: outside the game loop Phaser starts the scene synchronously
      sc.events.once('create', () => {
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
            if (ev.some((e) => e.type === 'bounce')) {
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

  Object.assign(window, { game, tick, replay, demo });
}
