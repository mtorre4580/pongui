// Level editor (computers only: it needs a mouse and a big screen). Its code is loaded on first
// use (custom/run.ts → openEditor), so phones never download it.
//
// Paint with the mouse (right click erases) or the keyboard; every change is saved at once. The
// bot (the solver, in a Web Worker) checks the level after each change, and the creator must beat
// it too: only then it can be shared.
import Phaser from 'phaser';
import { sfx, unlockAudio } from '../audio/sfx';
import { COLS, ROWS, TILE } from '../game/constants';
import {
  cleanName,
  draftIssues,
  emptyMap,
  mapHash,
  MAX_ITEMS,
  paint,
  THEME_COUNT,
} from '../game/custom';
import { FIELD, fieldsOf } from '../game/level';
import { CHAR_TO_TILE, T } from '../game/tiles';
import { bakeSolids, C, drawBackground } from '../gfx/textures';
import { ITEM_TEX, TILE_TEX } from '../gfx/tileTextures';
import { themeOf } from '../gfx/themes';
import { button, goTo, setupCamera, text, type Button } from '../gfx/ui';
import { t, type MessageKey } from '../i18n';
import { controls } from '../input/controls';
import { cancelBot, checkLevel } from '../custom/bot';
import { askName, dialogOpen, showShare } from '../custom/dialogs';
import {
  botResult,
  getLevel,
  hashOf,
  isVerified,
  setBotResult,
  updateLevel,
  type CustomLevel,
} from '../custom/store';

export interface EditorData {
  id: string;
}

type ItemChar = 'g' | 'd' | 'h' | 'l' | 'k';
const ITEM_CHARS: Record<ItemChar, keyof typeof ITEM_TEX> = {
  g: 'gem',
  d: 'drop',
  h: 'hammer',
  l: 'life',
  k: 'key',
};

/** Every tool: map character, name and the world that introduces it (0: the eraser). */
const PALETTE: [string, MessageKey, number][] = [
  ['#', 'tile.solid', 1],
  ['P', 'tile.start', 1],
  ['E', 'tile.exit', 1],
  ['g', 'tile.gem', 1],
  ['x', 'tile.fragile', 1],
  ['X', 'tile.fragile3', 1],
  ['s', 'tile.spring', 1],
  ['<', 'tile.rampL', 1],
  ['>', 'tile.rampR', 1],
  ['^', 'tile.fire', 1],
  ['d', 'tile.drop', 1],
  ['w', 'tile.wall', 1],
  ['h', 'tile.hammer', 1],
  ['*', 'tile.spike', 1],
  ['l', 'tile.life', 1],
  ['k', 'tile.key', 2],
  ['L', 'tile.lock', 2],
  ['m', 'tile.moss', 2],
  ['-', 'tile.cloud', 3],
  ['|', 'tile.updraft', 3],
  ['o', 'tile.switch', 4],
  ['A', 'tile.blockA', 4],
  ['B', 'tile.blockB', 4],
  ['(', 'tile.pushL', 4],
  [')', 'tile.pushR', 4],
  ['1', 'tile.portal1', 5],
  ['2', 'tile.portal2', 5],
  ['3', 'tile.portal3', 5],
  ['~', 'tile.water', 5],
  ['i', 'tile.ice', 6],
  ['j', 'tile.thinIce', 6],
  ['c', 'tile.crumble', 7],
  ['!', 'tile.vent', 7],
  ['z', 'tile.zone', 8],
  ['b', 'tile.bumper', 8],
  ['%', 'tile.phaseA', 9],
  ['&', 'tile.phaseB', 9],
  ['=', 'tile.bridge', 10],
  ['.', 'tile.erase', 0],
];

// Layout in world units: the 640×384 grid at the origin, the palette on its left, the checklist
// on its right, a title bar above and a help line below
const PAL_COLS = 5;
const PAL_CELL = 32;
const PAL_GAP = 3;
const PAL_X = -186;
const RIGHT_X = 746;
const FIT = { x: -196, y: -50, w: 1046, h: 466 };

const UNDO_MAX = 100;
const BOT_DELAY = 450; // ms after the last change

type BotState = 'idle' | 'waiting' | 'running' | 'blocked';

export class Editor extends Phaser.Scene {
  private level!: CustomLevel;
  private map: string[] = [];
  private tool = 0;
  private undo: string[][] = [];
  private redo: string[][] = [];

  private strokeStart: string[] | null = null;
  private strokeErase = false;
  private cursor = { col: 1, row: 1 };
  private bot: BotState = 'idle';
  private botTimer?: Phaser.Time.TimerEvent;

  private bg?: Phaser.GameObjects.Image;
  private solids?: Phaser.GameObjects.Image;
  private solidsVersion = 0;
  private solidsDirty = true;
  private fields!: Phaser.GameObjects.Graphics;
  private cells: Phaser.GameObjects.Image[] = [];
  private startSprite!: Phaser.GameObjects.Container;
  private exitSprite!: Phaser.GameObjects.Image;
  private ghost!: Phaser.GameObjects.Image;
  private cursorBox!: Phaser.GameObjects.Graphics;
  private paletteCells: { box: Phaser.GameObjects.Graphics; draw: (on: boolean) => void }[] = [];
  private toolName!: Phaser.GameObjects.Text;
  private toolWorld!: Phaser.GameObjects.Text;
  private themeLabel!: Phaser.GameObjects.Text;
  private darkButton!: Button;
  private nameText!: Phaser.GameObjects.Text;
  private savedText!: Phaser.GameObjects.Text;
  private checks!: Phaser.GameObjects.Container;
  private flash!: Phaser.GameObjects.Text;
  private shareButton!: Button;

  constructor() {
    super('Editor');
  }

  init(data: EditorData) {
    const level = getLevel(data.id);
    this.level = level!;
    this.map = level ? level.map.slice() : emptyMap();
    this.undo = [];
    this.redo = [];
    this.strokeStart = null;
    this.bot = 'idle';
    this.solids = undefined;
    this.solidsDirty = true;
    this.cells = [];
    this.paletteCells = [];
  }

  create() {
    if (!this.level) {
      this.scene.start('MyLevels');
      return;
    }
    setupCamera(this, { fit: FIT });
    this.cameras.main.fadeIn(180, 13, 16, 36);
    controls.enableGestures(false);
    controls.clearEdges();

    this.drawTheme();
    this.fields = this.add.graphics().setDepth(2);
    this.buildCells();
    this.buildGridOverlay();
    this.buildPalette();
    this.buildLeftOptions();
    this.buildTopBar();
    this.buildRightPanel();
    text(this, 320, 404, t('editor.help'), 11, '#7d84c4');
    this.flash = text(this, 320, -2, '', 13, '#ffd166').setDepth(20).setAlpha(0);

    this.bindPointer();
    this.bindKeys();
    this.renderAll();
    this.selectTool(0);

    // A stored bot result for this exact map is still good; anything else is checked again
    if (botResult(this.level)) this.refreshChecks();
    else this.scheduleBot();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      cancelBot();
      this.botTimer?.remove();
    });
  }

  update() {
    if (this.solidsDirty) this.bakeSolidsNow();
  }

  // ---------- Drawing the level ----------

  private drawTheme() {
    const theme = themeOf(this.level.theme);
    this.bg?.destroy();
    this.bg = drawBackground(this, COLS * TILE, ROWS * TILE + 32, 5 + this.level.theme, theme);
    this.solidsDirty = true;
  }

  private bakeSolidsNow() {
    this.solidsDirty = false;
    const tiles = new Uint8Array(COLS * ROWS);
    this.map.forEach((row, r) => {
      for (let c = 0; c < COLS; c++) if (row[c] === '#') tiles[r * COLS + c] = T.SOLID;
    });
    const old = this.solids?.texture.key;
    const key = `editor-solids-${++this.solidsVersion}`;
    bakeSolids(
      this,
      key,
      tiles,
      COLS,
      ROWS,
      (t) => t === T.SOLID,
      T.ASH,
      themeOf(this.level.theme),
    );
    if (this.solids) this.solids.setTexture(key);
    else this.solids = this.add.image(0, 0, key).setOrigin(0).setScale(0.5).setDepth(1);
    if (old && old !== key) this.textures.remove(old);
  }

  private buildCells() {
    for (let idx = 0; idx < COLS * ROWS; idx++) {
      const c = idx % COLS;
      const r = Math.floor(idx / COLS);
      this.cells.push(
        this.add
          .image(c * TILE + TILE / 2, r * TILE + TILE / 2, 'gem')
          .setScale(0.5)
          .setDepth(3)
          .setVisible(false),
      );
    }
    this.startSprite = this.add
      .container(0, 0, [
        this.add.image(0, 0, 'ball').setScale(0.5),
        this.add.image(1, -2, 'eyes').setScale(0.5),
      ])
      .setDepth(4);
    this.exitSprite = this.add.image(0, 0, 'exit').setScale(0.5).setDepth(3);
    // Where the bot got stuck: a faint ball
    this.ghost = this.add.image(0, 0, 'ball').setScale(0.5).setAlpha(0.35).setDepth(5);
    this.ghost.setVisible(false);
    this.tweens.add({ targets: this.ghost, alpha: 0.12, duration: 600, yoyo: true, repeat: -1 });
  }

  private buildGridOverlay() {
    const g = this.add.graphics().setDepth(6);
    g.lineStyle(1, 0xffffff, 0.07);
    for (let c = 1; c < COLS; c++) g.lineBetween(c * TILE, TILE, c * TILE, ROWS * TILE);
    for (let r = 1; r < ROWS; r++) g.lineBetween(0, r * TILE, COLS * TILE, r * TILE);
    // Row 0 is always walls (the HUD covers it in play)
    g.fillStyle(0x05060f, 0.45).fillRect(0, 0, COLS * TILE, TILE);
    g.lineStyle(2, C.uiLight, 1).strokeRect(-1, -1, COLS * TILE + 2, ROWS * TILE + 2);
    this.cursorBox = this.add.graphics().setDepth(7).setVisible(false);
  }

  /** Shows one cell's tile or item. */
  private renderCell(idx: number) {
    const c = idx % COLS;
    const r = Math.floor(idx / COLS);
    const ch = this.map[r][c];
    const img = this.cells[idx];
    const tile = CHAR_TO_TILE[ch];
    const item = ITEM_CHARS[ch as ItemChar];
    const key = tile !== undefined ? TILE_TEX[tile] : item ? ITEM_TEX[item] : undefined;
    if (!key) {
      img.setVisible(false);
      return;
    }
    img.setTexture(key).setVisible(true);
    // Springs stand on the cell's floor, like in the game
    if (tile === T.SPRING) img.setOrigin(0.5, 1).setY((r + 1) * TILE);
    else img.setOrigin(0.5).setY(r * TILE + TILE / 2);
  }

  private renderFields() {
    const field = fieldsOf(this.map);
    const g = this.fields.clear();
    for (let idx = 0; idx < field.length; idx++) {
      if (field[idx] === FIELD.NONE) continue;
      const x = (idx % COLS) * TILE;
      const y = Math.floor(idx / COLS) * TILE;
      if (field[idx] === FIELD.WATER) g.fillStyle(C.water, 0.32).fillRect(x, y, TILE, TILE);
      else g.fillStyle(C.zone, 0.22).fillRect(x, y, TILE, TILE);
    }
  }

  private renderAll() {
    for (let idx = 0; idx < COLS * ROWS; idx++) this.renderCell(idx);
    this.renderMarkers();
    this.renderFields();
    this.solidsDirty = true;
  }

  private renderMarkers() {
    const find = (ch: string) => {
      for (let r = 0; r < ROWS; r++) {
        const c = this.map[r].indexOf(ch);
        if (c >= 0) return { x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 };
      }
      return null;
    };
    const p = find('P');
    this.startSprite.setVisible(!!p);
    if (p) this.startSprite.setPosition(p.x, p.y);
    const e = find('E');
    this.exitSprite.setVisible(!!e);
    if (e) this.exitSprite.setPosition(e.x, e.y);
  }

  // ---------- Palette and options ----------

  private iconFor(ch: string, x: number, y: number): Phaser.GameObjects.GameObject[] {
    const tile = CHAR_TO_TILE[ch];
    const item = ITEM_CHARS[ch as ItemChar];
    const theme = themeOf(this.level.theme);
    if (ch === 'P')
      return [
        this.add.image(x, y, 'ball').setScale(0.4),
        this.add.image(x + 1, y - 2, 'eyes').setScale(0.4),
      ];
    if (ch === 'E') return [this.add.image(x, y, 'exit').setScale(0.4)];
    if (item) return [this.add.image(x, y, ITEM_TEX[item]).setScale(0.4)];
    if (tile === T.SOLID) {
      const g = this.add.graphics();
      g.fillStyle(theme.solid, 1).fillRect(x - 11, y - 11, 22, 22);
      g.fillStyle(theme.solidTop, 1).fillRect(x - 11, y - 11, 22, 5);
      return [g];
    }
    if (tile !== undefined && TILE_TEX[tile])
      return [this.add.image(x, y, TILE_TEX[tile]).setScale(0.36)];
    const g = this.add.graphics();
    if (ch === '~') {
      g.fillStyle(C.water, 0.55).fillRect(x - 11, y - 8, 22, 19);
      g.fillStyle(C.waterLight, 0.9).fillRect(x - 11, y - 9, 22, 2);
    } else if (ch === 'z') {
      g.fillStyle(C.zone, 0.4).fillRect(x - 11, y - 11, 22, 22);
      g.fillStyle(C.zoneLight, 1)
        .fillCircle(x - 4, y - 3, 1.5)
        .fillCircle(x + 5, y + 4, 1.5);
    } else {
      // The eraser: a crossed-out cell
      g.lineStyle(2, 0xff8fa3, 1).strokeRect(x - 10, y - 10, 20, 20);
      g.lineBetween(x - 10, y + 10, x + 10, y - 10);
    }
    return [g];
  }

  private buildPalette() {
    const w = PAL_COLS * (PAL_CELL + PAL_GAP) - PAL_GAP;
    const panel = this.add.graphics();
    panel.fillStyle(0x0b0e22, 0.78).fillRoundedRect(PAL_X - 8, -8, w + 16, 400, 14);
    PALETTE.forEach(([ch], i) => {
      const x = PAL_X + (i % PAL_COLS) * (PAL_CELL + PAL_GAP) + PAL_CELL / 2;
      const y = Math.floor(i / PAL_COLS) * (PAL_CELL + PAL_GAP) + PAL_CELL / 2;
      const box = this.add.graphics();
      const draw = (on: boolean) => {
        box.clear();
        box.fillStyle(on ? C.uiLight : C.ui, 1).fillRoundedRect(x - 16, y - 16, 32, 32, 7);
        if (on) box.lineStyle(2.5, C.accent, 1).strokeRoundedRect(x - 17, y - 17, 34, 34, 8);
      };
      draw(false);
      this.iconFor(ch, x, y);
      const hit = this.add.zone(x, y, PAL_CELL, PAL_CELL).setInteractive({ useHandCursor: true });
      hit.on('pointerup', () => {
        unlockAudio();
        sfx.click();
        this.selectTool(i);
      });
      hit.on('pointerover', () => this.showToolName(i));
      hit.on('pointerout', () => this.showToolName(this.tool));
      this.paletteCells.push({ box, draw });
    });
    const rows = Math.ceil(PALETTE.length / PAL_COLS);
    const y = rows * (PAL_CELL + PAL_GAP) + 4;
    this.toolName = text(this, PAL_X + w / 2, y + 8, '', 13).setOrigin(0.5, 0.5);
    this.toolWorld = text(this, PAL_X + w / 2, y + 25, '', 11, '#a9b8ff');
  }

  private selectTool(i: number) {
    this.paletteCells[this.tool]?.draw(false);
    this.tool = (i + PALETTE.length) % PALETTE.length;
    this.paletteCells[this.tool].draw(true);
    this.showToolName(this.tool);
  }

  private showToolName(i: number) {
    const [, key, world] = PALETTE[i];
    this.toolName.setText(t(key));
    this.toolWorld.setText(
      world ? t('editor.fromWorld', { n: world, name: t(`world.${world}` as MessageKey) }) : '',
    );
  }

  private buildLeftOptions() {
    const w = PAL_COLS * (PAL_CELL + PAL_GAP) - PAL_GAP;
    const cx = PAL_X + w / 2;
    text(this, cx, 330, t('editor.look'), 11, '#a9b8ff');
    this.themeLabel = text(this, cx, 348, '', 12);
    const arrow = (x: number, dir: -1 | 1) => {
      const g = this.add.graphics();
      g.fillStyle(C.uiLight, 1).fillCircle(0, 0, 10);
      g.fillStyle(0xffffff, 1);
      if (dir < 0) g.fillTriangle(3, -5, 3, 5, -4, 0);
      else g.fillTriangle(-3, -5, -3, 5, 4, 0);
      const c = this.add.container(x, 348, [g]).setSize(24, 24);
      c.setInteractive({ useHandCursor: true }).on('pointerup', () => this.changeTheme(dir));
    };
    arrow(PAL_X + 4, -1);
    arrow(PAL_X + w - 4, 1);
    this.darkButton = button(this, cx, 376, '', () => this.toggleDark(), {
      w: w - 6,
      h: 24,
      size: 12,
    });
    this.refreshOptions();
  }

  private refreshOptions() {
    this.themeLabel.setText(t(`world.${this.level.theme}` as MessageKey));
    this.darkButton.setLabel(t(this.level.dark ? 'editor.darkOn' : 'editor.darkOff'));
  }

  private changeTheme(dir: -1 | 1) {
    unlockAudio();
    sfx.click();
    const theme = ((this.level.theme - 1 + dir + THEME_COUNT) % THEME_COUNT) + 1;
    updateLevel(this.level.id, (l) => (l.theme = theme));
    this.drawTheme();
    this.refreshOptions();
    this.showSaved();
  }

  private toggleDark() {
    updateLevel(this.level.id, (l) => (l.dark = !l.dark));
    this.refreshOptions();
    this.afterChange();
  }

  // ---------- Title bar and checklist ----------

  private buildTopBar() {
    button(this, PAL_X + 80, -28, t('editor.back'), () => this.leave(), {
      w: 160,
      h: 30,
      size: 14,
    });
    this.nameText = text(this, 320, -28, '', 20, '#ffffff', { fontStyle: '700' });
    this.nameText.setInteractive({ useHandCursor: true }).on('pointerup', () => void this.rename());
    this.savedText = text(this, 640, -28, t('editor.saved'), 12, '#7ae582')
      .setOrigin(1, 0.5)
      .setAlpha(0);
    this.refreshName();
  }

  private refreshName() {
    this.nameText.setText(this.level.name || t('editor.untitled'));
  }

  private buildRightPanel() {
    const panel = this.add.graphics();
    panel.fillStyle(0x0b0e22, 0.78).fillRoundedRect(RIGHT_X - 98, -8, 196, 400, 14);
    text(this, RIGHT_X, 12, t('editor.checklist'), 15, '#ffffff', { fontStyle: '700' });
    this.checks = this.add.container(0, 0);
    const w = 172;
    button(this, RIGHT_X, 190, t('editor.test'), () => this.test(), {
      w,
      h: 34,
      color: 0xe85d75,
      size: 16,
    });
    this.shareButton = button(this, RIGHT_X, 230, t('editor.share'), () => void this.share(), {
      w,
      h: 34,
      color: 0x2a9d8f,
      size: 16,
    });
    const half = (w - 8) / 2;
    button(this, RIGHT_X - half / 2 - 4, 268, t('editor.undo'), () => this.doUndo(), {
      w: half,
      h: 28,
      size: 13,
    });
    button(this, RIGHT_X + half / 2 + 4, 268, t('editor.redo'), () => this.doRedo(), {
      w: half,
      h: 28,
      size: 13,
    });
    button(this, RIGHT_X - half / 2 - 4, 302, t('editor.rename'), () => void this.rename(), {
      w: half,
      h: 28,
      size: 13,
    });
    button(this, RIGHT_X + half / 2 + 4, 302, t('editor.clear'), () => this.clearMap(), {
      w: half,
      h: 28,
      size: 13,
    });
    const soon = this.add.graphics();
    soon.fillStyle(C.uiLight, 0.5).fillRoundedRect(RIGHT_X - 88, 326, 176, 56, 10);
    text(this, RIGHT_X, 354, t('editor.soon'), 11, '#c9cff7', {
      align: 'center',
      wordWrap: { width: 164 },
    });
  }

  /** The checklist: what the level still needs, the bot's verdict and the creator's own win. */
  private refreshChecks() {
    this.checks.removeAll(true);
    const issues = draftIssues(this.map);
    const has = (code: string) => issues.some((i) => i.code === code);
    const gems = this.map.join('').split('g').length - 1;
    type Mark = 'ok' | 'bad' | 'wait' | 'todo';
    const lines: [Mark, string][] = [
      [has('start') || has('exit') ? 'bad' : 'ok', t('editor.checkStartExit')],
      [gems ? 'ok' : 'bad', t('editor.checkGems', { n: gems })],
    ];
    const portals = issues.flatMap((i) => (i.code === 'portal' ? [i.n] : []));
    if (portals.length) lines.push(['bad', t('editor.checkPortal', { list: portals.join(', ') })]);
    for (const i of issues)
      if (i.code === 'items')
        lines.push(['bad', t('editor.checkItems', { n: i.n, max: MAX_ITEMS })]);
    const result = botResult(this.level);
    this.ghost.setVisible(false);
    if (issues.length) lines.push(['todo', t('editor.botBlocked')]);
    else if (this.bot === 'waiting' || this.bot === 'running' || !result)
      lines.push(['wait', t('editor.botThinking')]);
    else if (result.solved)
      lines.push(['ok', t('editor.botSolved', { t: result.time.toFixed(1) })]);
    else lines.push(['bad', t('editor.botStuck', { n: result.gems, total: gems })]);
    const cleared = this.level.cleared === hashOf(this.level);
    if (!issues.length)
      lines.push(cleared ? ['ok', t('editor.youDid')] : ['todo', t('editor.youTodo')]);

    let y = 40;
    for (const [mark, label] of lines) {
      const g = this.add.graphics();
      const x = RIGHT_X - 82;
      const color = { ok: 0x2fbf71, bad: 0xe85d75, wait: 0xf4a261, todo: 0x5a63c9 }[mark];
      g.fillStyle(color, 1).fillCircle(x, y, 7);
      g.lineStyle(2, 0xffffff, 1);
      if (mark === 'ok')
        g.beginPath()
          .moveTo(x - 3.5, y)
          .lineTo(x - 1, y + 3)
          .lineTo(x + 4, y - 3)
          .strokePath();
      else if (mark === 'bad')
        g.lineBetween(x - 3, y - 3, x + 3, y + 3).lineBetween(x - 3, y + 3, x + 3, y - 3);
      else
        g.fillStyle(0xffffff, 1)
          .fillCircle(x - 3, y, 1.2)
          .fillCircle(x, y, 1.2)
          .fillCircle(x + 3, y, 1.2);
      const label_ = text(this, x + 13, y, label, 11, '#e6e9ff', {
        wordWrap: { width: 150 },
      }).setOrigin(0, 0.5);
      this.checks.add([g, label_]);
      y += Math.max(20, label_.height + 6);
    }
    // Where the bot got furthest: a hint at the spot that may be out of reach
    if (result && !result.solved && result.at && !issues.length)
      this.ghost.setPosition(result.at.x, result.at.y).setVisible(true);
    const verified = isVerified(this.level);
    this.shareButton.setAlpha(verified ? 1 : 0.55);
    if (issues.length) return;
    const badge = text(
      this,
      RIGHT_X,
      Math.max(y + 4, 156),
      t(verified ? 'editor.verified' : 'editor.notVerified'),
      12,
      verified ? '#7ae582' : '#a9b8ff',
      { align: 'center', wordWrap: { width: 176 } },
    );
    this.checks.add(badge);
  }

  // ---------- Bot ----------

  private scheduleBot() {
    this.botTimer?.remove();
    cancelBot();
    this.bot = draftIssues(this.map).length ? 'blocked' : 'waiting';
    this.refreshChecks();
    if (this.bot === 'blocked') return;
    this.botTimer = this.time.delayedCall(BOT_DELAY, () => void this.runBot());
  }

  private async runBot() {
    this.bot = 'running';
    const level = { ...this.level, map: this.map };
    const r = await checkLevel(level);
    if (!r || !this.scene.isActive() || r.hash !== mapHash(this.map, this.level.dark)) return;
    this.bot = 'idle';
    setBotResult(this.level.id, {
      hash: r.hash,
      solved: r.solved,
      time: r.time,
      gems: r.gems,
      at: { x: r.x, y: r.y },
    });
    this.refreshChecks();
  }

  // ---------- Editing ----------

  private cellAt(p: Phaser.Input.Pointer): { col: number; row: number } | null {
    const col = Math.floor(p.worldX / TILE);
    const row = Math.floor(p.worldY / TILE);
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
    return { col, row };
  }

  private bindPointer() {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const cell = this.cellAt(p);
      if (!cell || dialogOpen()) return;
      unlockAudio();
      this.strokeStart = this.map;
      this.strokeErase = p.rightButtonDown();
      this.paintAt(cell.col, cell.row);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const cell = this.cellAt(p);
      if (cell) {
        this.cursor = cell;
        this.drawCursor();
      } else this.cursorBox.setVisible(false);
      if (cell && p.isDown && this.strokeStart) this.paintAt(cell.col, cell.row);
    });
    const end = () => {
      if (!this.strokeStart) return;
      const before = this.strokeStart;
      this.strokeStart = null;
      if (before !== this.map) this.commit(before);
    };
    this.input.on('pointerup', end);
    this.input.on('gameout', end);
  }

  private paintAt(col: number, row: number) {
    const ch = this.strokeErase ? '.' : PALETTE[this.tool][0];
    const next = paint(this.map, col, row, ch);
    if (next === this.map) return;
    const moved = ch === 'P' || ch === 'E';
    this.map = next;
    // Placing the start or the exit clears its old cell
    if (moved) for (let i = 0; i < COLS * ROWS; i++) this.renderCell(i);
    else this.renderCell(row * COLS + col);
    this.renderMarkers();
    this.renderFields();
    this.solidsDirty = true;
    if (ch === '.' || ch === '#') sfx.bonk();
    else sfx.bounce('low');
  }

  /** Saves a finished change and makes it undoable. */
  private commit(before: string[]) {
    this.undo.push(before);
    if (this.undo.length > UNDO_MAX) this.undo.shift();
    this.redo = [];
    this.save();
  }

  private save() {
    const map = this.map;
    updateLevel(this.level.id, (l) => (l.map = map));
    this.afterChange();
  }

  private afterChange() {
    this.showSaved();
    this.scheduleBot();
  }

  private showSaved() {
    this.tweens.killTweensOf(this.savedText);
    this.savedText.setAlpha(1);
    this.tweens.add({ targets: this.savedText, alpha: 0, delay: 900, duration: 500 });
  }

  private doUndo() {
    const prev = this.undo.pop();
    if (!prev) return sfx.bonk();
    this.redo.push(this.map);
    this.map = prev;
    this.renderAll();
    this.save();
  }

  private doRedo() {
    const next = this.redo.pop();
    if (!next) return sfx.bonk();
    this.undo.push(this.map);
    this.map = next;
    this.renderAll();
    this.save();
  }

  private clearMap() {
    const before = this.map;
    this.map = emptyMap();
    this.renderAll();
    this.commit(before);
  }

  private drawCursor() {
    const { col, row } = this.cursor;
    this.cursorBox
      .clear()
      .lineStyle(2, row === 0 ? 0xff8fa3 : C.accent, 1)
      .strokeRect(col * TILE + 1, row * TILE + 1, TILE - 2, TILE - 2)
      .setVisible(true);
  }

  /**
   * Window listeners, not Phaser's keyboard: Phaser skips events whose default was prevented,
   * and the game's controls prevent it for arrows, Space, Enter, Escape and Z.
   */
  private bindKeys() {
    const down = (e: KeyboardEvent) => {
      if (dialogOpen() || !this.scene.isActive()) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.code === 'KeyZ') {
        e.preventDefault();
        if (e.shiftKey) this.doRedo();
        else this.doUndo();
        return;
      }
      if (mod && e.code === 'KeyY') {
        e.preventDefault();
        this.doRedo();
        return;
      }
      if (mod) return;
      const move = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[
        e.code
      ];
      if (move) {
        this.cursor = {
          col: Phaser.Math.Clamp(this.cursor.col + move[0], 0, COLS - 1),
          row: Phaser.Math.Clamp(this.cursor.row + move[1], 1, ROWS - 1),
        };
        this.drawCursor();
        // Holding Space or Enter while moving paints a line
        if (this.strokeStart && !this.strokeErase) this.paintAt(this.cursor.col, this.cursor.row);
        return;
      }
      switch (e.code) {
        case 'Space':
        case 'Enter':
        case 'Delete':
        case 'Backspace': {
          if (e.repeat) return;
          e.preventDefault();
          this.strokeStart = this.map;
          this.strokeErase = e.code === 'Delete' || e.code === 'Backspace';
          this.paintAt(this.cursor.col, this.cursor.row);
          this.drawCursor();
          return;
        }
        case 'KeyQ':
          return this.selectTool(this.tool - 1);
        case 'KeyE':
          return this.selectTool(this.tool + 1);
        case 'KeyT':
          return this.test();
        case 'KeyN':
          return void this.rename();
        case 'Escape':
          return this.leave();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (!['Space', 'Enter', 'Delete', 'Backspace'].includes(e.code) || !this.strokeStart) return;
      const before = this.strokeStart;
      this.strokeStart = null;
      if (before !== this.map) this.commit(before);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    });
  }

  // ---------- Actions ----------

  private say(key: MessageKey) {
    this.flash.setText(t(key));
    this.tweens.killTweensOf(this.flash);
    this.flash.setAlpha(1);
    this.tweens.add({ targets: this.flash, alpha: 0, delay: 1800, duration: 500 });
  }

  private test() {
    if (draftIssues(this.map).length) {
      sfx.bonk();
      this.say('editor.fixFirst');
      return;
    }
    goTo(this, 'Game', { index: 0, custom: { id: this.level.id, from: 'editor' } });
  }

  private async share() {
    if (!isVerified(this.level)) {
      sfx.bonk();
      this.say('editor.shareLocked');
      return;
    }
    await showShare(this.level);
  }

  private async rename() {
    const name = await askName(this.level.name);
    if (name === null) return;
    updateLevel(this.level.id, (l) => (l.name = cleanName(name)));
    this.refreshName();
    this.showSaved();
  }

  private leave() {
    goTo(this, 'MyLevels', { focus: this.level.id });
  }
}
