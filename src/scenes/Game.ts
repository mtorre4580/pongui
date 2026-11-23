import Phaser from 'phaser';
import { track, trackLevelStart } from '../analytics';
import { sfx, unlockAudio } from '../audio/sfx';
import {
  BALL_R,
  COLS,
  GAME_H,
  GAME_W,
  HUD_H,
  ROWS,
  START_LIVES,
  PHASE_CYCLE,
  STEP,
  TILE,
  VENT_CYCLE,
} from '../game/constants';
import { FIELD, type ParsedLevel } from '../game/level';
import { World, type WorldEvent } from '../game/physics';
import { isPortal, isStatic, isToggle, T } from '../game/tiles';
import { bakeSolids, C, drawBackground, sparkTexture, TEX } from '../gfx/textures';
import { ITEM_TEX, TILE_TEX } from '../gfx/tileTextures';
import { themeOf, type Theme } from '../gfx/themes';
import { setupCamera, text } from '../gfx/ui';
import { localized, t } from '../i18n';
import { controls } from '../input/controls';
import { haptic } from '../native';
import { levelLabel, LEVELS, worldOf } from '../levels';
import { loadSave, recordWin } from '../save';
import { parseCustom, type CustomRun } from '../custom/run';
import { bestTime, getLevel, isVerified, recordCustomWin } from '../custom/store';

export interface GameData {
  index: number;
  lives?: number;
  deaths?: number;
  takenLives?: number[];
  /** A player-made level instead of an official one (`index` is ignored). */
  custom?: CustomRun;
}

// The level starts at the top of the world: the HUD sits over its first row, which is always a
// solid wall (parseLevel enforces it), so it costs no screen space
const OY = 0;

// The whole level must stay visible: there are no on-screen buttons to leave room for (touch
// play uses gestures over the level), so it takes all the free space, centered

// Particle colors per tile (solid blocks use the world's color)
const TILE_COLOR: Record<number, number> = {
  [T.ASH]: C.ashTop,
  [T.FRAGILE]: C.fragile,
  [T.FRAGILE3]: C.fragile3,
  [T.FIRE]: C.flame,
  [T.SPRING]: C.springLight,
  [T.RAMP_L]: C.rampLight,
  [T.RAMP_R]: C.rampLight,
  [T.WALL]: C.brick,
  [T.LOCK]: C.key,
  [T.MOSS]: C.mossTop,
  [T.CLOUD]: C.cloud,
  [T.SWITCH]: C.gearTop,
  [T.BLOCK_A]: C.blockA,
  [T.BLOCK_B]: C.blockB,
  [T.PUSH_L]: C.pusherLight,
  [T.PUSH_R]: C.pusherLight,
  [T.PORTAL_1]: C.portal1,
  [T.PORTAL_2]: C.portal2,
  [T.PORTAL_3]: C.portal3,
  [T.ICE]: C.iceLight,
  [T.THIN_ICE]: C.iceLight,
  [T.CRUMBLE]: C.crumbleTop,
  [T.VENT]: C.lava,
  [T.BUMPER]: C.bumperLight,
  [T.PHASE_A]: C.phaseA,
  [T.PHASE_B]: C.phaseB,
  [T.BRIDGE]: C.rainbow[1],
};

export class Game extends Phaser.Scene {
  private index = 0;
  private custom?: CustomRun;
  private level!: ParsedLevel;
  private theme!: Theme;
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
  private lastBonk = 0;

  private solids!: Phaser.GameObjects.Image;
  private solidsVersion = 0;
  private tileSprites = new Map<number, Phaser.GameObjects.Image>();
  private flames = new Map<number, Phaser.GameObjects.Image>();
  /** Vents: the tile and its flame, which shows when lit and flickers just before. */
  private vents: { img: Phaser.GameObjects.Image; flame: Phaser.GameObjects.Image }[] = [];
  /** Blocks that open and close during play: their solid texture key and sprite. */
  private toggles: { idx: number; tex: string; img: Phaser.GameObjects.Image }[] = [];
  private switches: Phaser.GameObjects.Image[] = [];
  private itemSprites: (Phaser.GameObjects.Image | null)[] = [];
  private exitSprite!: Phaser.GameObjects.Image;
  private ball!: Phaser.GameObjects.Container;
  /** Dark levels: a black veil with a hole of light that follows the ball. */
  private darkness?: Phaser.GameObjects.Image;
  private eyes!: Phaser.GameObjects.Image;
  private trail!: Phaser.GameObjects.Particles.ParticleEmitter;
  private bursts = new Map<number, Phaser.GameObjects.Particles.ParticleEmitter>();

  private hudGems!: Phaser.GameObjects.Text;
  private hudDrops?: Phaser.GameObjects.Text;
  private hudHammers?: Phaser.GameObjects.Text;
  private hudKeys?: Phaser.GameObjects.Text;
  private hudTime!: Phaser.GameObjects.Text;
  private hudHearts: Phaser.GameObjects.Image[] = [];
  private banner?: Phaser.GameObjects.Container;

  constructor() {
    super('Game');
  }

  init(data: GameData) {
    this.index = Phaser.Math.Clamp(data.index ?? 0, 0, LEVELS.length - 1);
    this.custom = data.custom;
    const own = data.custom && getLevel(data.custom.id);
    if (own) {
      const hint = data.custom!.from === 'editor' ? t('editor.testHint') : undefined;
      this.level = parseCustom(own, hint);
      this.theme = themeOf(own.theme);
    } else {
      this.custom = undefined;
      this.level = LEVELS[this.index];
      this.theme = themeOf(worldOf(this.index).n);
    }
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
    this.toggles = [];
    this.switches = [];
    this.vents = [];
    this.bursts.clear();
    this.itemSprites = [];
    this.hudHearts = [];
    this.hudDrops = undefined;
    this.hudHammers = undefined;
    this.hudKeys = undefined;
  }

  create() {
    setupCamera(this, { fit: { x: 0, y: 0, w: COLS * TILE, h: ROWS * TILE } });
    this.cameras.main.fadeIn(180, 13, 16, 36);
    controls.clearEdges();
    controls.enableGestures(true);
    if (!this.custom) trackLevelStart(this.level.id);
    this.world = new World(this.level, this.takenLives);

    drawBackground(this, GAME_W, GAME_H, this.index + 11, this.theme);
    this.redrawSolids();
    this.buildTiles();
    this.buildItems();
    this.buildBall();
    if (this.level.dark) this.buildDarkness();
    this.buildHud();
    this.showBanner();

    this.time.delayedCall(450, () => (this.started = true));

    const onHide = () => {
      if (document.hidden) this.pauseGame();
    };
    document.addEventListener('visibilitychange', onHide);
    this.events.on(Phaser.Scenes.Events.RESUME, () => {
      controls.clearEdges();
      controls.enableGestures(true);
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
    const key = `solids-${this.level.id}-${++this.solidsVersion}`;
    bakeSolids(this, key, this.world.s.tiles, COLS, ROWS, isStatic, T.ASH, this.theme);
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
        // Spikes on the bottom row always point up (there is nothing under them to hang from)
        const below = r < ROWS - 1 ? tiles[idx + COLS] : T.SOLID;
        if (above !== T.EMPTY && below === T.EMPTY) img.setFlipY(true);
      }
      if (t === T.SPRING) img.setOrigin(0.5, 1).setY((r + 1) * TILE + OY);
      if (isToggle(t)) this.toggles.push({ idx, tex, img });
      if (isPortal(t)) this.tweens.add({ targets: img, angle: 360, duration: 2600, repeat: -1 });
      if (t === T.SWITCH) this.switches.push(img);
      if (t === T.VENT) {
        const flame = this.add
          .image(c * TILE + TILE / 2, r * TILE + OY + 6, 'flame')
          .setOrigin(0.5, 1)
          .setScale(0.5)
          .setDepth(-1)
          .setVisible(false);
        this.vents.push({ img, flame });
      }
      this.tileSprites.set(idx, img);
      if (t === T.FIRE) {
        const fl = this.add
          .image(c * TILE + TILE / 2, r * TILE + OY + 6, 'flame')
          .setOrigin(0.5, 1)
          .setScale(0.5, 0.5)
          // Behind the tiles: blocks that close over a fire pit hide its flames
          .setDepth(-1);
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
    this.buildWind();
    this.buildFields();
    this.syncToggles(false);
  }

  /**
   * Water and low-gravity zones are static: one baked image over the ball. Pools get a surface
   * line on their top row; zones a faint violet fill, a dotted outline and a few stars.
   */
  private buildFields() {
    const field = this.level.field;
    if (!field.some((f) => f !== FIELD.NONE)) return;
    const key = `fields-${this.level.id}`;
    if (!this.textures.exists(key)) {
      const k = TEX;
      const T2 = TILE * k;
      const tex = this.textures.createCanvas(key, COLS * T2, ROWS * T2)!;
      const ctx = tex.getContext();
      const css = (c: number, a: number) =>
        `rgba(${(c >> 16) & 255}, ${(c >> 8) & 255}, ${c & 255}, ${a})`;
      const at = (c: number, r: number) =>
        c < 0 || c >= COLS || r < 0 || r >= ROWS ? FIELD.NONE : field[r * COLS + c];
      for (let idx = 0; idx < field.length; idx++) {
        const f = field[idx];
        if (f === FIELD.NONE) continue;
        const c = idx % COLS;
        const r = Math.floor(idx / COLS);
        const x = c * T2;
        const y = r * T2;
        if (f === FIELD.WATER) {
          const top = at(c, r - 1) !== FIELD.WATER;
          ctx.fillStyle = css(C.water, 0.32);
          ctx.fillRect(x, y + (top ? 5 * k : 0), T2, T2 - (top ? 5 * k : 0));
          if (top) {
            ctx.fillStyle = css(C.waterLight, 0.7);
            ctx.fillRect(x, y + 4 * k, T2, 2 * k);
          }
          continue;
        }
        ctx.fillStyle = css(C.zone, 0.16);
        ctx.fillRect(x, y, T2, T2);
        // A dotted outline where the zone ends
        ctx.fillStyle = css(C.zoneLight, 0.6);
        for (let d = 2 * k; d < T2; d += 6 * k) {
          if (at(c, r - 1) !== FIELD.ZONE) ctx.fillRect(x + d, y, 2 * k, 1.5 * k);
          if (at(c, r + 1) !== FIELD.ZONE) ctx.fillRect(x + d, y + T2 - 1.5 * k, 2 * k, 1.5 * k);
          if (at(c - 1, r) !== FIELD.ZONE) ctx.fillRect(x, y + d, 1.5 * k, 2 * k);
          if (at(c + 1, r) !== FIELD.ZONE) ctx.fillRect(x + T2 - 1.5 * k, y + d, 1.5 * k, 2 * k);
        }
        ctx.fillStyle = css(C.white, 0.5);
        const seed = (c * 7 + r * 13) % 5;
        ctx.fillRect(x + (6 + seed * 4) * k, y + (8 + seed * 3) * k, 1.5 * k, 1.5 * k);
      }
      tex.refresh();
    }
    this.add
      .image(0, OY, key)
      .setOrigin(0)
      .setScale(1 / TEX)
      .setDepth(6);
  }

  /**
   * Vents follow the world's clock: lit, the grate glows and a tall flame rises; in the last
   * 0.4 s before lighting, a small flame flickers as a warning.
   */
  private syncVents() {
    const phase = this.world.s.ticks % VENT_CYCLE;
    const lit = this.world.ventLit;
    const warn = !lit && phase >= VENT_CYCLE / 2 - 48;
    const t = this.time.now / 1000;
    for (const v of this.vents) {
      v.img.setTexture(lit ? 'vent-lit' : 'vent-off');
      v.flame.setVisible(lit || warn);
      if (lit) v.flame.setScale(0.5, 0.62 + Math.sin(t * 18 + v.img.x) * 0.08).setAlpha(1);
      else if (warn) v.flame.setScale(0.32, 0.22 + Math.sin(t * 30) * 0.06).setAlpha(0.8);
    }
  }

  /** Shows each toggle block as solid or as an outline, following the world. */
  private syncToggles(fx = true) {
    // Phase blocks about to swap (the last 0.3 s of each half cycle) flicker as a warning
    const half = PHASE_CYCLE / 2;
    const warn = this.world.s.ticks % half >= half - 36;
    const flicker = warn ? 0.55 + 0.45 * Math.abs(Math.sin(this.time.now / 60)) : 1;
    for (const tg of this.toggles) {
      const t = this.world.s.tiles[tg.idx];
      const open = this.world.isOpen(t, tg.idx);
      if (t === T.PHASE_A || t === T.PHASE_B) tg.img.setAlpha(flicker);
      const key = open ? `${tg.tex}-open` : tg.tex;
      if (tg.img.texture.key === key) continue;
      tg.img.setTexture(key);
      if (fx && !open)
        this.tweens.add({ targets: tg.img, scale: { from: 0.42, to: 0.5 }, duration: 120 });
    }
  }

  /** One particle emitter for every updraft tile: streaks of air rising through the columns. */
  private buildWind() {
    const cells: number[] = [];
    this.world.s.tiles.forEach((t, idx) => t === T.UPDRAFT && cells.push(idx));
    if (!cells.length) return;
    const source = {
      getRandomPoint: (point: Phaser.Types.Math.Vector2Like) => {
        const idx = cells[Math.floor(Math.random() * cells.length)];
        point.x = (idx % COLS) * TILE + 6 + Math.random() * (TILE - 12);
        point.y = Math.floor(idx / COLS) * TILE + Math.random() * TILE + OY;
        return point;
      },
    };
    this.add
      .particles(0, 0, sparkTexture(this, C.wind), {
        speedY: { min: -140, max: -90 },
        scale: { start: 0.35, end: 0 },
        alpha: { start: 0.7, end: 0 },
        lifespan: 520,
        frequency: Math.max(12, 160 / cells.length),
        emitZone: { type: 'random', source },
      })
      .setDepth(1);
  }

  private buildItems() {
    this.world.s.items.forEach((it, i) => {
      if (it.taken) {
        this.itemSprites.push(null);
        return;
      }
      const x = it.col * TILE + TILE / 2;
      const y = it.row * TILE + TILE / 2 + OY;
      // In dark levels items glow over the darkness
      const img = this.add
        .image(x, y, ITEM_TEX[it.kind])
        .setScale(0.5)
        .setDepth(this.level.dark ? 8 : 0);
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
      .setScale(0.5)
      .setDepth(this.level.dark ? 8 : 0);
    if (this.world.exitOpen) this.openExit(false);
  }

  /**
   * One baked image (at a quarter of the resolution: it is all soft) much larger than the
   * screen, with a soft round hole in its middle. It moves with the ball every frame.
   */
  private buildDarkness() {
    const key = 'darkness';
    const q = 4; // world units per texture pixel
    const w = (GAME_W * 4) / q;
    const h = (GAME_H * 3) / q;
    if (!this.textures.exists(key)) {
      const tex = this.textures.createCanvas(key, w, h)!;
      const ctx = tex.getContext();
      const grad = ctx.createRadialGradient(w / 2, h / 2, 64 / q, w / 2, h / 2, 118 / q);
      grad.addColorStop(0, 'rgba(6, 4, 14, 0)');
      grad.addColorStop(0.55, 'rgba(6, 4, 14, 0.7)');
      grad.addColorStop(1, 'rgba(6, 4, 14, 0.97)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      tex.refresh();
    }
    this.darkness = this.add
      .image(this.world.s.x, this.world.s.y + OY, key)
      .setScale(q)
      .setDepth(7);
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
    // A translucent band over the top wall row, as wide as the screen (see gfx/layout.ts)
    g.fillStyle(0x0b0e22, 0.82).fillRect(-GAME_W, 0, GAME_W * 3, HUD_H);
    g.fillStyle(C.uiLight, 0.6).fillRect(-GAME_W, HUD_H - 1, GAME_W * 3, 1);
    text(
      this,
      TILE + 6,
      HUD_H / 2,
      this.custom
        ? localized(this.level.name)
        : `${levelLabel(this.index)} · ${localized(this.level.name)}`,
      14,
      '#ffffff',
    )
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
      x += 46;
    }
    if (this.level.items.some((i) => i.kind === 'key')) {
      icon('key', 0.4);
      this.hudKeys = text(this, x + 11, HUD_H / 2, '', 14)
        .setOrigin(0, 0.5)
        .setDepth(11);
    }

    this.hudTime = text(this, GAME_W - TILE - 100, HUD_H / 2, '0.0', 14, '#a9b8ff')
      .setOrigin(1, 0.5)
      .setDepth(11);
    this.refreshHearts();

    const pause = this.add.container(GAME_W - TILE - 14, HUD_H / 2).setDepth(11);
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
          .image(GAME_W - TILE - 42 - i * 16, HUD_H / 2, 'life')
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
    this.hudKeys?.setText(String(s.keys));
  }

  private showBanner() {
    const w = 420;
    const source = (controls.touchMode && this.level.hintTouch) || this.level.hint;
    const hint = source ? localized(source) : '';
    const hasHint = hint !== '';
    const h = hasHint ? 86 : 56;
    const bg = this.add.graphics();
    bg.fillStyle(0x0b0e22, 0.82).fillRoundedRect(-w / 2, -h / 2, w, h, 16);
    bg.lineStyle(2, C.uiLight, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 16);
    const title = text(
      this,
      0,
      hasHint ? -20 : 0,
      this.custom
        ? localized(this.level.name)
        : t('game.level', { n: levelLabel(this.index), name: localized(this.level.name) }),
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
      if (this.toggles.length) this.syncToggles();
      if (this.vents.length) this.syncVents();
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
    this.darkness?.setPosition(x, y + OY);
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
          if (e.idx >= 0 && this.level.tiles[e.idx] === T.ICE) sfx.ice();
          // A double tap's queued high bounce is spent on this landing
          controls.disarmJump();
          // Low bounces happen constantly: only the bigger ones vibrate on phones
          if (e.kind === 'spring' || e.kind === 'ramp') haptic('medium');
          else if (e.kind === 'high' || e.kind === 'push') haptic('light');
          const t = e.idx >= 0 ? this.level.tiles[e.idx] : T.SOLID;
          this.burst(
            TILE_COLOR[t] ?? this.theme.solidTop,
            e.x,
            e.y + OY,
            e.kind === 'low' ? 3 : 6,
            90,
          );
          const spr = this.tileSprites.get(e.idx);
          if (spr && e.kind === 'spring')
            this.tweens.add({ targets: spr, scaleY: 0.32, duration: 70, yoyo: true });
          else if (spr && (e.kind === 'ramp' || e.kind === 'push'))
            this.tweens.add({ targets: spr, alpha: 0.6, duration: 80, yoyo: true });
          break;
        }
        case 'boost':
          sfx.boost();
          this.burst(C.ballLight, this.world.s.x, this.world.s.y + OY + BALL_R, 5, 80);
          break;
        case 'bonk':
          // A ball held against a ceiling (by an updraft) bonks every step: play it once
          if (this.time.now - this.lastBonk > 150) sfx.bonk();
          this.lastBonk = this.time.now;
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
          // Walls and locks open as a wave from where the ball touched them
          const spread = e.tile === T.WALL || e.tile === T.LOCK;
          const first = this.cellCenter(e.idxs[0]);
          e.idxs.forEach((idx) => {
            const p = this.cellCenter(idx);
            const delay = spread
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
          if (e.tile === T.LOCK) {
            sfx.unlock();
            haptic('medium');
          } else if (e.tile === T.THIN_ICE) {
            sfx.shatter();
            haptic('medium');
          } else sfx.break();
          if (e.tile === T.WALL) {
            this.cameras.main.shake(140, 0.004);
            haptic('heavy');
          }
          // A hammer or a key was used up
          if (spread) this.refreshHud();
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
            const color = {
              gem: C.gem,
              drop: C.drop,
              hammer: C.hammerHead,
              life: C.heart,
              key: C.key,
            }[e.kind];
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
        case 'wind':
          if (e.inside) sfx.wind();
          break;
        case 'portal': {
          sfx.portal();
          haptic('light');
          const color = TILE_COLOR[this.level.tiles[e.from]] ?? C.white;
          const a = this.cellCenter(e.from);
          const b = this.cellCenter(e.to);
          this.burst(color, a.x, a.y, 10, 120);
          this.burst(color, b.x, b.y, 14, 160);
          // Jump the drawn ball too, instead of sliding it across the screen
          this.prevX = this.world.s.x;
          this.prevY = this.world.s.y;
          this.trail.emitting = false;
          break;
        }
        case 'water':
          sfx.splash(e.inside);
          this.burst(C.waterLight, this.world.s.x, this.world.s.y + OY, e.inside ? 8 : 5, 90);
          break;
        case 'crumble': {
          sfx.crumble();
          const spr = this.tileSprites.get(e.idx);
          if (spr)
            this.tweens.add({
              targets: spr,
              x: { from: spr.x - 1.5, to: spr.x + 1.5 },
              alpha: { from: 1, to: 0.55 },
              duration: 60,
              yoyo: true,
              repeat: 4,
            });
          const p = this.cellCenter(e.idx);
          this.burst(C.crumbleTop, p.x, p.y - 12, 4, 60);
          break;
        }
        case 'bump': {
          sfx.bump();
          haptic('medium');
          const spr = this.tileSprites.get(e.idx);
          if (spr) this.tweens.add({ targets: spr, scale: 0.58, duration: 70, yoyo: true });
          this.burst(C.bumperLight, this.world.s.x, this.world.s.y + OY, 8, 140);
          break;
        }
        case 'zone':
          if (e.inside) sfx.zone();
          break;
        case 'phase':
          sfx.phase();
          this.syncToggles();
          break;
        case 'vent':
          if (e.lit) sfx.vent();
          break;
        case 'switch':
          sfx.switch(e.on);
          haptic('light');
          for (const spr of this.switches) {
            spr.setTexture(e.on ? 'switch-on' : 'switch-off');
            this.tweens.add({ targets: spr, scaleY: 0.44, duration: 60, yoyo: true });
          }
          this.syncToggles();
          break;
        case 'die':
          haptic('error');
          this.onDeath();
          break;
        case 'win':
          haptic('success');
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
    if (this.level.tiles.includes(T.BRIDGE)) sfx.bridge();
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
          custom: this.custom,
          lives: this.lives,
          deaths: this.deaths,
          takenLives: [...this.takenLives],
        });
      } else {
        controls.enableGestures(false);
        this.scene.pause();
        this.scene.launch('Overlay', { mode: 'gameover', index: this.index, custom: this.custom });
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
    let prevBest: number | undefined;
    let verified = false;
    if (this.custom) {
      const own = getLevel(this.custom.id);
      prevBest = (own && bestTime(own)) ?? undefined;
      const wasVerified = !!own && isVerified(own);
      recordCustomWin(this.custom.id, time);
      const now = getLevel(this.custom.id);
      verified = !wasVerified && !!now && isVerified(now);
    } else {
      prevBest = loadSave().levels[this.level.id]?.bestTime;
      recordWin(this.level.id, this.index, stars, time, LEVELS.length);
      track('level_complete', { level: this.level.id, stars });
    }
    this.time.delayedCall(750, () => {
      this.ball.setVisible(false);
      controls.enableGestures(false);
      this.scene.pause();
      this.scene.launch('Overlay', {
        mode: 'complete',
        index: this.index,
        custom: this.custom,
        verified,
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
    controls.enableGestures(false);
    this.scene.pause();
    this.scene.launch('Overlay', { mode: 'pause', index: this.index, custom: this.custom });
  }

  private restartLevel() {
    this.scene.restart({
      index: this.index,
      custom: this.custom,
      lives: this.lives,
      deaths: this.deaths,
      takenLives: [...this.takenLives],
    });
  }
}
