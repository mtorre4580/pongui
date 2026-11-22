// Herramientas sólo para desarrollo (no se incluyen en el build de producción).
// Desde la consola del navegador: `await replay(3)` reproduce la solución del solver del nivel 4.
import type Phaser from 'phaser';
import { STEP } from './game/constants';
import { solve } from './game/solver';
import type { World } from './game/physics';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyGame = Record<string, any>;

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
    sc.update = function (this: AnyGame, _t: number, d: number) {
      this.renderBall(d / 1000);
    };
    const world = sc['world'] as World;
    const r = solve(world.level);
    let k = 0;
    let steps = 0;
    for (const d of r.plan) {
      if (k++ >= stopAfter) break;
      for (let i = 0; i < 480; i++) {
        const held = i * STEP < d.dur;
        const ev = world.step(STEP, { left: held && d.dir < 0, right: held && d.dir > 0, jump: d.jump, jumpPressed: false });
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
    return { solved: r.solved, bounces: r.plan.length, status: s.status, gems: `${s.gemsTaken}/${s.gemsTotal}`, time: +s.time.toFixed(1) };
  };

  Object.assign(window, { game, tick, replay });
}
