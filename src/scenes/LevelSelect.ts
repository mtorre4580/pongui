import Phaser from 'phaser';
import { sfx, unlockAudio } from '../audio/sfx';
import { GAME_H, GAME_W } from '../game/constants';
import { C, drawBackground } from '../gfx/textures';
import { themeOf } from '../gfx/themes';
import { button, ButtonGroup, goTo, setupCamera, text, type Button } from '../gfx/ui';
import { controls } from '../input/controls';
import { localized, t, type MessageKey } from '../i18n';
import { LEVELS, WORLDS, worldOf } from '../levels';
import { isUnlocked, loadSave } from '../save';

export interface LevelSelectData {
  /** 1-based world to show. Defaults to the world of the player's latest open level. */
  world?: number;
  /** Button to focus (when paging with the keyboard or a gamepad). */
  focus?: number;
}

const COLS = 5;
const IDS = LEVELS.map((l) => l.id);

/** The world where the player left off: the first open level that is not beaten yet. */
function currentWorld(): number {
  const save = loadSave();
  let latest = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (!isUnlocked(i, IDS)) break;
    latest = i;
    if (!(LEVELS[i].id in save.levels)) break;
  }
  return worldOf(latest).n;
}

export class LevelSelect extends Phaser.Scene {
  private group!: ButtonGroup;
  private worldN = 1;
  private focus = -1;
  private paging = false;

  constructor() {
    super('LevelSelect');
  }

  init(data: LevelSelectData) {
    const valid = WORLDS.some((w) => w.n === data.world);
    this.worldN = valid ? data.world! : currentWorld();
    this.focus = data.focus ?? -1;
    this.paging = data.focus !== undefined;
  }

  create() {
    setupCamera(this);
    if (!this.paging) this.cameras.main.fadeIn(200, 13, 16, 36);
    controls.enableGestures(false);
    controls.clearEdges();
    const world = WORLDS.find((w) => w.n === this.worldN)!;
    const pos = WORLDS.indexOf(world);
    drawBackground(this, GAME_W, GAME_H, 3, themeOf(world.n));
    const save = loadSave();

    const name = t(`world.${world.n}` as MessageKey);
    text(this, GAME_W / 2, 36, t('select.world', { n: world.n, name }), 26, '#ffffff', {
      fontStyle: '700',
      stroke: '#161a33',
      strokeThickness: 6,
    });
    const levels = LEVELS.slice(world.first, world.first + world.count);
    const stars = levels.reduce((n, l) => n + (save.levels[l.id]?.stars ?? 0), 0);
    this.add.image(GAME_W / 2 - 34, 68, 'star').setScale(0.36);
    text(this, GAME_W / 2 + 8, 68, `${stars} / ${levels.length * 3}`, 15, '#ffd166');

    // One dot per world, the current one highlighted
    const dots = this.add.graphics();
    WORLDS.forEach((_, i) => {
      const x = GAME_W / 2 + (i - (WORLDS.length - 1) / 2) * 16;
      dots.fillStyle(i === pos ? C.accent : C.uiLight, 1).fillCircle(x, 92, i === pos ? 5 : 4);
    });

    const cw = 104;
    const ch = 116;
    const x0 = GAME_W / 2 - ((COLS - 1) * cw) / 2;
    const y0 = 168;
    const cards: Button[] = levels.map((lvl, k) => {
      const i = world.first + k;
      const x = x0 + (k % COLS) * cw;
      const y = y0 + Math.floor(k / COLS) * ch;
      const locked = !isUnlocked(i, IDS);
      return this.levelCard(
        x,
        y,
        i,
        k + 1,
        localized(lvl.name),
        locked,
        save.levels[lvl.id]?.stars ?? 0,
      );
    });
    if (!isUnlocked(world.first, IDS))
      text(this, GAME_W / 2, 116, t('select.locked', { n: world.n - 1 }), 13, '#c9cff7');

    // Arrows to the previous and next world (keyboard and gamepad page at the row edges)
    const prev = WORLDS[pos - 1];
    const next = WORLDS[pos + 1];
    if (prev) this.arrow(26, y0 + ch / 2, -1, () => this.page(prev.n));
    if (next) this.arrow(GAME_W - 26, y0 + ch / 2, 1, () => this.page(next.n));

    const back = button(this, 70, GAME_H - 30, t('select.back'), () => goTo(this, 'Menu'), {
      w: 110,
      h: 32,
      size: 15,
    });
    this.group = new ButtonGroup(
      [...cards, back],
      COLS,
      () => goTo(this, 'Menu'),
      (dir, focus) => {
        const target = dir < 0 ? prev : next;
        if (!target) return;
        // Keep the row: arriving from the right edge lands on the last column, and back
        const row = Math.floor(focus / COLS);
        const isBack = focus === cards.length;
        const col = dir < 0 ? COLS - 1 : 0;
        this.page(target.n, isBack ? target.count : Math.min(row * COLS + col, target.count - 1));
      },
    );
    if (this.focus >= 0) this.group.focusOn(Math.min(this.focus, cards.length));
  }

  /** Shows another world, focusing a button (-1: none, when tapping the arrows). */
  private page(world: number, focus = -1) {
    sfx.click();
    this.scene.restart({ world, focus } satisfies LevelSelectData);
  }

  private arrow(x: number, y: number, dir: -1 | 1, onTap: () => void) {
    const g = this.add.graphics();
    g.fillStyle(C.ui, 0.9).fillCircle(0, 0, 18);
    g.fillStyle(0xffffff, 1);
    if (dir < 0) g.fillTriangle(5, -9, 5, 9, -8, 0);
    else g.fillTriangle(-5, -9, -5, 9, 8, 0);
    const c = this.add.container(x, y, [g]);
    c.setSize(44, 44).setInteractive({ useHandCursor: true });
    c.on('pointerup', () => {
      unlockAudio();
      onTap();
    });
    c.on('pointerover', () => c.setScale(1.1));
    c.on('pointerout', () => c.setScale(1));
  }

  private levelCard(
    x: number,
    y: number,
    i: number,
    n: number,
    name: string,
    locked: boolean,
    stars: number,
  ): Button {
    const w = 88;
    const h = 100;
    const bg = this.add.graphics();
    const draw = (focus: boolean) => {
      bg.clear();
      bg.fillStyle(0x000000, 0.25).fillRoundedRect(-w / 2, -h / 2 + 4, w, h, 14);
      bg.fillStyle(locked ? 0x262a52 : C.ui, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 14);
      if (!locked)
        bg.fillStyle(0xffffff, 0.07).fillRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, 38, 10);
      if (focus)
        bg.lineStyle(3, C.accent, 1).strokeRoundedRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 16);
    };
    draw(false);
    const parts: Phaser.GameObjects.GameObject[] = [bg];
    if (locked) {
      parts.push(this.add.image(0, -10, 'lock').setScale(0.6));
    } else {
      parts.push(text(this, 0, -22, String(n), 30, '#ffffff', { fontStyle: '700' }));
      parts.push(
        text(this, 0, 10, name, 10, '#c9cff7', { align: 'center', wordWrap: { width: w - 10 } }),
      );
      for (let s = 0; s < 3; s++) {
        parts.push(this.add.image(-22 + s * 22, 34, s < stars ? 'star' : 'star-off').setScale(0.3));
      }
    }
    const c = this.add.container(x, y, parts) as Button;
    c.setSize(w, h).setInteractive({ useHandCursor: !locked });
    c.setFocus = (on) => {
      draw(on);
      this.tweens.add({ targets: c, scale: on ? 1.06 : 1, duration: 100 });
    };
    c.setLabel = () => undefined;
    c.activate = () => {
      unlockAudio();
      if (locked) {
        sfx.bonk();
        this.tweens.add({ targets: c, x: x + 4, duration: 40, yoyo: true, repeat: 2 });
        return;
      }
      sfx.click();
      goTo(this, 'Game', { index: i });
    };
    c.on('pointerover', () => c.setFocus(true));
    c.on('pointerout', () => c.setFocus(false));
    c.on('pointerup', () => c.activate());
    return c;
  }

  update() {
    this.group.update();
  }
}
