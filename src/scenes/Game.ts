import Phaser from 'phaser';
import { sfx, unlockAudio } from '../audio/sfx';
import {
  BALL_R,
  COLS,
  GAME_H,
  GAME_W,
  HUD_H,
  ROWS,
  START_LIVES,
  STEP,
  TILE,
} from '../game/constants';
import type { ParsedLevel } from '../game/level';
import { World, type WorldEvent } from '../game/physics';
import { isStatic, T } from '../game/tiles';
import { bakeSolids, C, drawBackground, sparkTexture } from '../gfx/textures';
import { setupCamera, text } from '../gfx/ui';
import { localized, t } from '../i18n';
import { controls } from '../input/controls';
import { LEVELS } from '../levels';
import { loadSave, recordWin } from '../save';

export interface GameData {
  index: number;
  lives?: number;
  deaths?: number;
  takenLives?: number[];
}

const OY = HUD_H;
const ITEM_TEX = { gem: 'gem', drop: 'drop', hammer: 'hammer', life: 'life' } as const;
const TILE_TEX: Record<number, string> = {
  [T.FRAGILE]: 'fragile',
  [T.FRAGILE3]: 'fragile3-0',
  [T.FIRE]: 'fire',
  [T.SPRING]: 'spring',
  [T.RAMP_L]: 'rampL',
  [T.RAMP_R]: 'rampR',
  [T.WALL]: 'wall',
  [T.SPIKE]: 'spike',
};
const TILE_COLOR: Record<number, number> = {
  [T.SOLID]: C.solidTop,
  [T.ASH]: C.ashTop,
  [T.FRAGILE]: C.fragile,
  [T.FRAGILE3]: C.fragile3,
  [T.FIRE]: C.flame,
  [T.SPRING]: C.springLight,
  [T.RAMP_L]: C.rampLight,
  [T.RAMP_R]: C.rampLight,
  [T.WALL]: C.brick,
};

export class Game extends Phaser.Scene {
  private index = 0;
  private level!: ParsedLevel;
  private world!: World;
  private lives = START_LIVES;
  private deaths = 0;
  private takenLives = new Set<number>();

  private acc = 0;
  private started = false;
  private ended = false;
  private prevX = 0;
  private prevY = 0;
  private squash = 0;

  private solids!: Phaser.GameObjects.Image;
  private solidsVersion = 0;
  private tileSprites = new Map<number, Phaser.GameObjects.Image>();
  private flames = new Map<number, Phaser.GameObjects.Image>();
  private itemSprites: (Phaser.GameObjects.Image | null)[] = [];
  private exitSprite!: Phaser.GameObjects.Image;
  private ball!: Phaser.GameObjects.Container;
  private eyes!: Phaser.GameObjects.Image;
  private trail!: Phaser.GameObjects.Particles.ParticleEmitter;
  private bursts = new Map<number, Phaser.GameObjects.Particles.ParticleEmitter>();

  private hudGems!: Phaser.GameObjects.Text;
  private hudDrops?: Phaser.GameObjects.Text;
  private hudHammers?: Phaser.GameObjects.Text;
  private hudTime!: Phaser.GameObjects.Text;
  private hudHearts: Phaser.GameObjects.Image[] = [];
  private banner?: Phaser.GameObjects.Container;

  constructor() {
    super('Game');
  }

  init(data: GameData) {
    this.index = Phaser.Math.Clamp(data.index ?? 0, 0, LEVELS.length - 1);
    this.level = LEVELS[this.index];
    this.lives = data.lives ?? START_LIVES;
    this.deaths = data.deaths ?? 0;
    this.takenLives = new Set(data.takenLives ?? []);
    this.acc = 0;
    this.started = false;
    this.ended = false;
    this.squash = 0;
    this.solidsVersion = 0;
    this.solids = undefined as unknown as Phaser.GameObjects.Image;
    this.tileSprites.clear();
    this.flames.clear();
    this.bursts.clear();
    this.itemSprites = [];
    this.hudHearts = [];
    this.hudDrops = undefined;
    this.hudHammers = undefined;
  }

  create() {
    setupCamera(this);
    this.cameras.main.fadeIn(180, 13, 16, 36);
    controls.clearEdges();
    controls.reserveTouchLayout(true);
    controls.showTouchUi(true);
    this.world = new World(this.level, this.takenLives);

    drawBackground(this, GAME_W, GAME_H, this.index + 11);
    this.redrawSolids();
    this.buildTiles();
    this.buildItems();
    this.buildBall();
    this.buildHud();
    this.showBanner();

    this.time.delayedCall(450, () => (this.started = true));

    const onHide = () => {
      if (document.hidden) this.pauseGame();
    };
    document.addEventListener('visibilitychange', onHide);
    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      controls.clearEdges();
      controls.showTouchUi(true);
      this.acc = 0;
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.removeEventListener('visibilitychange', onHide);
      this.events.off(Phaser.Scenes.Events.RESUME);
    });
  }

  // ---------- Construction ----------

  private redrawSolids() {
    // A new key per version: the old texture is removed once the image no longer uses it
    const old = this.solids?.texture.key;
    const key = `solids-${this.index}-${++this.solidsVersion}`;
    bakeSolids(this, key, this.world.s.tiles, COLS, ROWS, isStatic, T.ASH);
    if (this.solids) this.solids.setTexture(key);
    else this.solids = this.add.image(0, OY, key).setOrigin(0).setScale(0.5);
    if (old && old !== key) this.textures.remove(old);
  }

  private buildTiles() {
    const { tiles } = this.world.s;
    for (let idx = 0; idx < tiles.length; idx++) {
      const t = tiles[idx];
      const tex = TILE_TEX[t];
      if (!tex) continue;
      const c = idx % COLS;
      const r = Math.floor(idx / COLS);
      const img = this.add.image(c * TILE + TILE / 2, r * TILE + TILE / 2 + OY, tex).setScale(0.5);
      if (t === T.SPIKE) {
        const above = r > 0 ? tiles[idx - COLS] : T.SOLID;
        const below = r < ROWS - 1 ? tiles[idx + COLS] : T.EMPTY;
        if (above !== T.EMPTY && below === T.EMPTY) img.setFlipY(true);
      }
      if (t === T.SPRING) img.setOrigin(0.5, 1).setY((r + 1) * TILE + OY);
      this.tileSprites.set(idx, img);
      if (t === T.FIRE) {
        const fl = this.add
          .image(c * TILE + TILE / 2, r * TILE + OY + 6, 'flame')
          .setOrigin(0.5, 1)
          .setScale(0.5, 0.5);
        this.tweens.add({
          targets: fl,
          scaleY: { from: 0.42, to: 0.6 },
          scaleX: { from: 0.5, to: 0.46 },
          duration: 220 + ((c * 37 + r * 11) % 160),
          yoyo: true,
          repeat: -1,
          ease: 'Sine.inOut',
        });
        this.flames.set(idx, fl);
      }
    }
  }

  private buildItems() {
    this.world.s.items.forEach((it, i) => {
      if (it.taken) {
        this.itemSprites.push(null);
        return;
      }
      const x = it.col * TILE + TILE / 2;
      const y = it.row * TILE + TILE / 2 + OY;
      const img = this.add.image(x, y, ITEM_TEX[it.kind]).setScale(0.5);
      this.tweens.add({
        targets: img,
        y: y - 3,
        duration: 700 + (i % 3) * 120,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.inOut',
      });
      if (it.kind === 'gem')
        this.tweens.add({
          targets: img,
          scaleX: 0.42,
          duration: 900,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.inOut',
        });
      this.itemSprites.push(img);
    });
    const ex = this.level.exit;
    this.exitSprite = this.add
      .image(ex.col * TILE + TILE / 2, ex.row * TILE + TILE / 2 + OY, 'exit-locked')
      .setScale(0.5);
    if (this.world.exitOpen) this.openExit(false);
  }

  private buildBall() {
    const { x, y } = this.world.s;
    this.prevX = x;
    this.prevY = y;
    this.trail = this.add.particles(0, 0, sparkTexture(this, C.ball), {
      lifespan: 260,
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.45, end: 0 },
      frequency: 24,
      emitting: false,
    });
    const body = this.add.image(0, 0, 'ball').setScale(0.5);
    this.eyes = this.add.image(1, -2, 'eyes').setScale(0.5);
    this.ball = this.add
      .container(x, y + OY, [body, this.eyes])
      .setDepth(5)
      .setScale(0);
    this.tweens.add({ targets: this.ball, scale: 1, duration: 260, ease: 'Back.out' });
    this.trail.startFollow(this.ball);
  }

  private buildHud() {
    const g = this.add.graphics().setDepth(10);
    g.fillStyle(0x0b0e22, 0.85).fillRect(0, 0, GAME_W, HUD_H);
    g.fillStyle(C.uiLight, 0.6).fillRect(0, HUD_H - 1, GAME_W, 1);
    text(this, 10, HUD_H / 2, `${this.index + 1}. ${localized(this.level.name)}`, 14, '#ffffff')
      .setOrigin(0, 0.5)
      .setDepth(11);

    let x = 236;
    const icon = (tex: string, scale: number) =>
      this.add
        .image(x, HUD_H / 2, tex)
        .setScale(scale)
        .setDepth(11);
    icon('gem', 0.42);
    this.hudGems = text(this, x + 12, HUD_H / 2, '', 14)
      .setOrigin(0, 0.5)
      .setDepth(11);
    x += 62;
    if (this.level.items.some((i) => i.kind === 'drop')) {
      icon('drop', 0.38);
      this.hudDrops = text(this, x + 11, HUD_H / 2, '', 14)
        .setOrigin(0, 0.5)
        .setDepth(11);
      x += 46;
    }
    if (this.level.items.some((i) => i.kind === 'hammer')) {
      icon('hammer', 0.36);
      this.hudHammers = text(this, x + 11, HUD_H / 2, '', 14)
        .setOrigin(0, 0.5)
        .setDepth(11);
    }

    this.hudTime = text(this, 500, HUD_H / 2, '0.0', 14, '#a9b8ff')
      .setOrigin(1, 0.5)
      .setDepth(11);
    this.refreshHearts();

    const pause = this.add.container(GAME_W - 18, HUD_H / 2).setDepth(11);
    const pg = this.add.graphics();
    pg.fillStyle(C.uiLight, 1).fillCircle(0, 0, 11);
    pg.fillStyle(0xffffff, 1)
      .fillRoundedRect(-5, -5, 3.5, 10, 1)
      .fillRoundedRect(1.5, -5, 3.5, 10, 1);
    pause.add(pg);
    pause.setSize(30, 30).setInteractive({ useHandCursor: true });
    pause.on('pointerup', () => this.pauseGame());

    this.refreshHud();
  }

  private refreshHearts() {
    this.hudHearts.forEach((h) => h.destroy());
    this.hudHearts = [];
    const n = Math.min(this.lives, 6);
    for (let i = 0; i < n; i++) {
      this.hudHearts.push(
        this.add
          .image(560 - i * 16, HUD_H / 2, 'life')
          .setScale(0.36)
          .setDepth(11),
      );
    }
  }

  private refreshHud() {
    const s = this.world.s;
    this.hudGems.setText(`${s.gemsTaken}/${s.gemsTotal}`);
    this.hudDrops?.setText(String(s.drops));
    this.hudHammers?.setText(String(s.hammers));
  }

  private showBanner() {
    const w = 420;
    const hint = this.level.hint ? localized(this.level.hint) : '';
    const hasHint = hint !== '';
    const h = hasHint ? 86 : 56;
    const bg = this.add.graphics();
    bg.fillStyle(0x0b0e22, 0.82).fillRoundedRect(-w / 2, -h / 2, w, h, 16);
    bg.lineStyle(2, C.uiLight, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 16);
    const title = text(
      this,
      0,
      hasHint ? -20 : 0,
      t('game.level', { n: this.index + 1, name: localized(this.level.name) }),
      22,
      '#ffffff',
      { fontStyle: '700' },
    );
    const parts: Phaser.GameObjects.GameObject[] = [bg, title];
    if (hasHint)
      parts.push(
        text(this, 0, 16, hint, 13, '#c9cff7', {
          align: 'center',
          wordWrap: { width: w - 30 },
        }),
      );
    this.banner = this.add
      .container(GAME_W / 2, 150, parts)
      .setDepth(20)
      .setAlpha(0);
    this.tweens.add({ targets: this.banner, alpha: 1, y: 140, duration: 250 });
    this.time.delayedCall(3200, () => this.hideBanner());
  }

  private hideBanner() {
    const b = this.banner;
    if (!b) return;
    this.banner = undefined;
    this.tweens.add({
      targets: b,
      alpha: 0,
      y: b.y - 12,
      duration: 300,
      onComplete: () => b.destroy(),
    });
  }

  // ---------- Loop ----------

  update(_time: number, deltaMs: number) {
    controls.poll();
    if (this.ended) return;
    if (controls.consume('pause')) return this.pauseGame();
    if (controls.consume('restart')) return this.restartLevel();

    const s = this.world.s;
    if (this.started && s.status === 'playing') {
      const input = {
        left: controls.held('left'),
        right: controls.held('right'),
        jump: controls.held('jump'),
        jumpPressed: controls.consume('jump'),
      };
      if ((input.left || input.right || input.jumpPressed) && this.banner && s.time > 0.6)
        this.hideBanner();
      if (input.jumpPressed || input.left || input.right) unlockAudio();
      this.acc += Math.min(deltaMs / 1000, 0.1);
      while (this.acc >= STEP && s.status === 'playing') {
        this.prevX = s.x;
        this.prevY = s.y;
        const ev = this.world.step(STEP, input);
        input.jumpPressed = false;
        if (ev.length) this.handle(ev);
        this.acc -= STEP;
      }
      this.hudTime.setText(s.time.toFixed(1));
    }
    this.renderBall(deltaMs / 1000);
  }

  private renderBall(dt: number) {
    const s = this.world.s;
    if (s.status === 'dead' || this.ended) return;
    const a = this.started ? Math.min(1, this.acc / STEP) : 1;
    const x = this.prevX + (s.x - this.prevX) * a;
    const y = this.prevY + (s.y - this.prevY) * a;
    this.squash = Math.max(0, this.squash - dt / 0.12);
    const stretch = Math.min(0.18, Math.abs(s.vy) / 4500);
    const sq = Math.sin(this.squash * Math.PI) * 0.32;
    if (this.ball.scale >= 0.99 || this.started) {
      const sy = (1 - sq) * (1 + stretch);
      const sx = (1 + sq) * (1 - stretch * 0.5);
      this.ball.setScale(sx, sy);
      this.ball.setPosition(x, y + OY + BALL_R * (1 - sy) * (this.squash > 0 ? 1 : 0));
    }
    this.eyes.setPosition(
      Phaser.Math.Clamp(s.vx / 45, -3.5, 3.5) + 1,
      Phaser.Math.Clamp(s.vy / 260, -3, 3) - 2,
    );
    this.trail.emitting = Math.abs(s.vy) > 600 || s.lockVx !== null;
  }

  // ---------- Events ----------

  private burst(color: number, x: number, y: number, n = 8, speed = 140) {
    let e = this.bursts.get(color);
    if (!e) {
      e = this.add
        .particles(0, 0, sparkTexture(this, color), {
          speed: { min: speed * 0.3, max: speed },
          angle: { min: 0, max: 360 },
          scale: { start: 0.55, end: 0 },
          lifespan: { min: 280, max: 620 },
          gravityY: 380,
          emitting: false,
        })
        .setDepth(6);
      this.bursts.set(color, e);
    }
    e.explode(n, x, y);
  }

  private cellCenter(idx: number) {
    return { x: (idx % COLS) * TILE + TILE / 2, y: Math.floor(idx / COLS) * TILE + TILE / 2 + OY };
  }

  private handle(events: WorldEvent[]) {
    for (const e of events) {
      switch (e.type) {
        case 'bounce': {
          this.squash = 1;
          sfx.bounce(e.kind);
          const t = e.idx >= 0 ? this.level.tiles[e.idx] : T.SOLID;
          this.burst(TILE_COLOR[t] ?? C.solidTop, e.x, e.y + OY, e.kind === 'low' ? 3 : 6, 90);
          const spr = this.tileSprites.get(e.idx);
          if (spr && e.kind === 'spring')
            this.tweens.add({ targets: spr, scaleY: 0.32, duration: 70, yoyo: true });
          else if (spr && e.kind === 'ramp')
            this.tweens.add({ targets: spr, alpha: 0.6, duration: 80, yoyo: true });
          break;
        }
        case 'boost':
          sfx.boost();
          this.burst(C.ballLight, this.world.s.x, this.world.s.y + OY + BALL_R, 5, 80);
          break;
        case 'bonk':
          sfx.bonk();
          break;
        case 'crack': {
          const spr = this.tileSprites.get(e.idx);
          spr?.setTexture(`fragile3-${Math.min(2, e.hits)}`);
          if (spr)
            this.tweens.add({
              targets: spr,
              angle: { from: -4, to: 4 },
              duration: 50,
              yoyo: true,
              repeat: 1,
              onComplete: () => spr.setAngle(0),
            });
          const p = this.cellCenter(e.idx);
          this.burst(C.fragile3Dark, p.x, p.y - 12, 5, 90);
          sfx.crack();
          break;
        }
        case 'break': {
          const first = this.cellCenter(e.idxs[0]);
          e.idxs.forEach((idx) => {
            const p = this.cellCenter(idx);
            const delay =
              e.tile === T.WALL
                ? Phaser.Math.Distance.Between(first.x, first.y, p.x, p.y) * 1.2
                : 0;
            const spr = this.tileSprites.get(idx);
            this.tileSprites.delete(idx);
            this.time.delayedCall(delay, () => {
              this.burst(TILE_COLOR[e.tile] ?? C.white, p.x, p.y, 10, 170);
              if (spr)
                this.tweens.add({
                  targets: spr,
                  scale: 0.2,
                  alpha: 0,
                  angle: 25,
                  duration: 160,
                  onComplete: () => spr.destroy(),
                });
            });
          });
          sfx.break();
          if (e.tile === T.WALL) this.cameras.main.shake(140, 0.004);
          break;
        }
        case 'extinguish':
          for (const idx of e.idxs) {
            const p = this.cellCenter(idx);
            this.tileSprites.get(idx)?.destroy();
            this.tileSprites.delete(idx);
            const fl = this.flames.get(idx);
            if (fl)
              this.tweens.add({
                targets: fl,
                scaleY: 0,
                alpha: 0,
                duration: 250,
                onComplete: () => fl.destroy(),
              });
            this.flames.delete(idx);
            this.burst(C.dropLight, p.x, p.y - 14, 14, 120);
          }
          this.redrawSolids();
          this.refreshHud();
          sfx.extinguish();
          break;
        case 'collect': {
          const spr = this.itemSprites[e.item];
          this.itemSprites[e.item] = null;
          if (spr) {
            this.tweens.killTweensOf(spr);
            this.tweens.add({
              targets: spr,
              scale: 0.9,
              alpha: 0,
              y: spr.y - 10,
              duration: 220,
              onComplete: () => spr.destroy(),
            });
            const color = { gem: C.gem, drop: C.drop, hammer: C.hammerHead, life: C.heart }[e.kind];
            this.burst(color, spr.x, spr.y, 12, 150);
          }
          if (e.kind === 'gem') sfx.gem();
          else if (e.kind === 'life') {
            sfx.life();
            this.lives++;
            this.takenLives.add(e.item);
            this.refreshHearts();
          } else sfx.powerup();
          this.refreshHud();
          break;
        }
        case 'exitOpen':
          this.openExit(true);
          break;
        case 'die':
          this.onDeath();
          break;
        case 'win':
          this.onWin();
          break;
      }
    }
  }

  private openExit(fx: boolean) {
    const ex = this.exitSprite;
    ex.setTexture('exit');
    this.tweens.add({ targets: ex, angle: 360, duration: 2400, repeat: -1 });
    this.tweens.add({
      targets: ex,
      scale: 0.56,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.inOut',
    });
    if (!fx) return;
    sfx.exitOpen();
    this.burst(C.exit, ex.x, ex.y, 20, 200);
    const toast = text(this, GAME_W / 2, 64, t('game.exitOpen'), 20, '#80ed99', {
      fontStyle: '700',
      stroke: '#0b0e22',
      strokeThickness: 5,
    }).setDepth(20);
    this.tweens.add({
      targets: toast,
      y: 54,
      alpha: 0,
      delay: 900,
      duration: 500,
      onComplete: () => toast.destroy(),
    });
  }

  private onDeath() {
    sfx.die();
    this.ended = true;
    this.trail.emitting = false;
    this.ball.setVisible(false);
    const s = this.world.s;
    this.burst(C.ball, s.x, Math.min(s.y, ROWS * TILE) + OY, 22, 220);
    this.cameras.main.shake(220, 0.008);
    this.lives--;
    this.deaths++;
    this.refreshHearts();
    this.time.delayedCall(950, () => {
      if (this.lives > 0) {
        this.scene.restart({
          index: this.index,
          lives: this.lives,
          deaths: this.deaths,
          takenLives: [...this.takenLives],
        });
      } else {
        controls.showTouchUi(false);
        this.scene.pause();
        this.scene.launch('Overlay', { mode: 'gameover', index: this.index });
      }
    });
  }

  private onWin() {
    sfx.win();
    this.ended = true;
    this.trail.emitting = false;
    const ex = this.exitSprite;
    this.tweens.add({
      targets: this.ball,
      x: ex.x,
      y: ex.y,
      scale: 0,
      angle: 540,
      duration: 520,
      ease: 'Quad.in',
    });
    this.burst(C.accent, ex.x, ex.y, 24, 220);
    const time = this.world.s.time;
    const stars = 1 + (this.deaths === 0 ? 1 : 0) + (time <= this.level.par ? 1 : 0);
    const prevBest = loadSave().levels[this.level.id]?.bestTime;
    recordWin(this.level.id, this.index, stars, time, LEVELS.length);
    this.time.delayedCall(750, () => {
      this.ball.setVisible(false);
      controls.showTouchUi(false);
      this.scene.pause();
      this.scene.launch('Overlay', {
        mode: 'complete',
        index: this.index,
        stars,
        time,
        par: this.level.par,
        deaths: this.deaths,
        record: prevBest === undefined || time < prevBest,
      });
    });
  }

  private pauseGame() {
    if (this.ended || !this.scene.isActive()) return;
    controls.showTouchUi(false);
    this.scene.pause();
    this.scene.launch('Overlay', { mode: 'pause', index: this.index });
  }

  private restartLevel() {
    this.scene.restart({
      index: this.index,
      lives: this.lives,
      deaths: this.deaths,
      takenLives: [...this.takenLives],
    });
  }
}
