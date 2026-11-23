// Player-made levels on this device: the ones made in the editor and the ones opened from a
// shared link. Everyone can play them (phones too); creating and editing needs a computer.
import Phaser from 'phaser';
import { sfx, unlockAudio } from '../audio/sfx';
import { GAME_H, GAME_W } from '../game/constants';
import { C, drawBackground } from '../gfx/textures';
import { thumbnail } from '../gfx/thumbnail';
import { button, ButtonGroup, goTo, setupCamera, text, type Button } from '../gfx/ui';
import { t } from '../i18n';
import { controls } from '../input/controls';
import { checkLevel } from '../custom/bot';
import { askCode, confirmDelete, dialogOpen, showShare } from '../custom/dialogs';
import { canCreate, openEditor } from '../custom/run';
import {
  addReceived,
  bestTime,
  botResult,
  createLevel,
  deleteLevel,
  getLevel,
  isVerified,
  listLevels,
  setBotResult,
  type CustomLevel,
} from '../custom/store';

export interface MyLevelsData {
  /** Level to show (its page is opened). */
  focus?: string;
  /** Opens that level's panel right away (a level that just arrived from a link). */
  open?: boolean;
  /** A link that could not be read. */
  badLink?: boolean;
  page?: number;
}

const PER_PAGE = 6;
const GRID_COLS = 3;

export class MyLevels extends Phaser.Scene {
  private group!: ButtonGroup;
  private panelGroup: ButtonGroup | null = null;
  private data_: MyLevelsData = {};
  private page = 0;

  constructor() {
    super('MyLevels');
  }

  init(data: MyLevelsData) {
    this.data_ = data ?? {};
    this.panelGroup = null;
    const levels = listLevels();
    const at = data?.focus ? levels.findIndex((l) => l.id === data.focus) : -1;
    this.page = at >= 0 ? Math.floor(at / PER_PAGE) : (data?.page ?? 0);
  }

  create() {
    setupCamera(this);
    this.cameras.main.fadeIn(200, 13, 16, 36);
    controls.enableGestures(false);
    controls.clearEdges();
    drawBackground(this, GAME_W, GAME_H, 4);

    text(this, GAME_W / 2, 34, t('mine.title'), 26, '#ffffff', {
      fontStyle: '700',
      stroke: '#161a33',
      strokeThickness: 6,
    });

    const levels = listLevels();
    const pages = Math.max(1, Math.ceil(levels.length / PER_PAGE));
    this.page = Phaser.Math.Clamp(this.page, 0, pages - 1);
    const shown = levels.slice(this.page * PER_PAGE, (this.page + 1) * PER_PAGE);

    // Top actions: a new level (computers only) and opening a link someone sent
    const top: Button[] = [];
    const creating = canCreate();
    if (creating)
      top.push(
        button(this, 0, 74, t('mine.new'), () => this.newLevel(), {
          w: 170,
          h: 32,
          size: 15,
          color: 0xe85d75,
        }),
      );
    top.push(
      button(this, 0, 74, t('mine.openCode'), () => void this.openCode(), {
        w: 170,
        h: 32,
        size: 15,
      }),
    );
    top.forEach((b, i) => b.setX(GAME_W / 2 + (i - (top.length - 1) / 2) * 184));

    const cw = 196;
    const ch = 134;
    const x0 = GAME_W / 2 - cw;
    const y0 = 168;
    const cards = shown.map((l, k) =>
      this.card(x0 + (k % GRID_COLS) * cw, y0 + Math.floor(k / GRID_COLS) * ch, l),
    );
    if (!levels.length)
      text(this, GAME_W / 2, 210, t(creating ? 'mine.empty' : 'mine.emptyPhone'), 15, '#c9cff7', {
        align: 'center',
        wordWrap: { width: 460 },
      });
    if (this.data_.badLink) text(this, GAME_W / 2, 104, t('mine.badLink'), 13, '#ff8fa3');
    else if (!creating && levels.length)
      text(this, GAME_W / 2, 104, t('mine.createOnComputer'), 12, '#a9b8ff');

    if (pages > 1) {
      text(this, GAME_W / 2, GAME_H - 30, `${this.page + 1} / ${pages}`, 14, '#a9b8ff');
      if (this.page > 0) this.arrow(26, y0 + ch / 2, -1);
      if (this.page < pages - 1) this.arrow(GAME_W - 26, y0 + ch / 2, 1);
    }

    const back = button(this, 70, GAME_H - 30, t('select.back'), () => goTo(this, 'Menu'), {
      w: 110,
      h: 32,
      size: 15,
    });
    this.group = new ButtonGroup([...top, ...cards, back], 1, () => goTo(this, 'Menu'));

    const focus = this.data_.focus && getLevel(this.data_.focus);
    if (focus && this.data_.open) this.openPanel(focus);
  }

  private paging(dir: -1 | 1) {
    sfx.click();
    this.scene.restart({ page: this.page + dir } satisfies MyLevelsData);
  }

  private arrow(x: number, y: number, dir: -1 | 1) {
    const g = this.add.graphics();
    g.fillStyle(C.ui, 0.9).fillCircle(0, 0, 18);
    g.fillStyle(0xffffff, 1);
    if (dir < 0) g.fillTriangle(5, -9, 5, 9, -8, 0);
    else g.fillTriangle(-5, -9, -5, 9, 8, 0);
    const c = this.add.container(x, y, [g]).setSize(44, 44);
    c.setInteractive({ useHandCursor: true }).on('pointerup', () => {
      unlockAudio();
      this.paging(dir);
    });
  }

  /** One level: its map, name and status. */
  private card(x: number, y: number, level: CustomLevel): Button {
    const w = 180;
    const h = 122;
    const bg = this.add.graphics();
    const draw = (focus: boolean) => {
      bg.clear();
      bg.fillStyle(0x000000, 0.25).fillRoundedRect(-w / 2, -h / 2 + 4, w, h, 14);
      bg.fillStyle(C.ui, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 14);
      if (focus)
        bg.lineStyle(3, C.accent, 1).strokeRoundedRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 16);
    };
    draw(false);
    const thumb = this.add.image(0, -18, thumbnail(this, level)).setScale(0.5);
    const name = text(this, 0, 32, level.name || t('editor.untitled'), 13, '#ffffff').setOrigin(
      0.5,
    );
    if (name.width > w - 16) name.setScale((w - 16) / name.width);
    const status = text(this, 0, 50, this.statusLine(level), 10, this.statusColor(level));
    const c = this.add.container(x, y, [bg, thumb, name, status]) as Button;
    c.setSize(w, h).setInteractive({ useHandCursor: true });
    c.setFocus = (on) => {
      draw(on);
      this.tweens.add({ targets: c, scale: on ? 1.04 : 1, duration: 100 });
    };
    c.setLabel = () => undefined;
    c.activate = () => {
      unlockAudio();
      sfx.click();
      this.openPanel(level);
    };
    c.on('pointerover', () => c.setFocus(true));
    c.on('pointerout', () => c.setFocus(false));
    c.on('pointerup', () => c.activate());
    return c;
  }

  private statusLine(l: CustomLevel): string {
    const best = bestTime(l);
    const parts: string[] = [];
    if (l.origin === 'received') parts.push(t('mine.received'));
    else parts.push(t(isVerified(l) ? 'mine.verified' : 'mine.draft'));
    if (best !== null) parts.push(t('mine.best', { t: best.toFixed(1) }));
    return parts.join('  ·  ');
  }

  private statusColor(l: CustomLevel): string {
    if (l.origin === 'received') return '#a9b8ff';
    return isVerified(l) ? '#7ae582' : '#ffd166';
  }

  // ---------- A level's panel ----------

  private openPanel(level: CustomLevel) {
    const dim = this.add
      .rectangle(GAME_W / 2, GAME_H / 2, GAME_W * 4, GAME_H * 4, 0x05060f, 0.6)
      .setInteractive()
      .setDepth(30);
    const w = 380;
    const h = 330;
    const panel = this.add.container(GAME_W / 2, GAME_H / 2).setDepth(31);
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.3).fillRoundedRect(-w / 2, -h / 2 + 6, w, h, 22);
    bg.fillStyle(C.ui, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 22);
    bg.lineStyle(2, C.uiLight, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 22);
    panel.add(bg);
    const title = text(this, 0, -h / 2 + 28, level.name || t('editor.untitled'), 22, '#ffffff', {
      fontStyle: '700',
    });
    if (title.width > w - 30) title.setScale((w - 30) / title.width);
    panel.add(title);
    panel.add(this.add.image(0, -h / 2 + 100, thumbnail(this, level, 12)).setScale(0.5));

    // The bot checks levels that arrive from links on this device: nothing in a link is trusted
    const bot = text(this, 0, -h / 2 + 152, '', 12, '#c9cff7', {
      align: 'center',
      wordWrap: { width: w - 40 },
    });
    panel.add(bot);
    const showBot = (l: CustomLevel) => {
      const r = botResult(l);
      if (!r) bot.setText(t('editor.botThinking'));
      else if (r.solved) bot.setText(t('mine.botOk', { t: r.time.toFixed(1) }));
      else bot.setText(t('mine.botFail'));
    };
    showBot(level);
    if (!botResult(level))
      void checkLevel(level).then((r) => {
        if (!r) return;
        setBotResult(level.id, { hash: r.hash, solved: r.solved, time: r.time, gems: r.gems });
        const now = getLevel(level.id);
        if (now && bot.active) showBot(now);
      });

    const buttons: Button[] = [];
    const add = (label: string, fn: () => void, color?: number) => {
      const b = button(this, 0, 0, label, fn, { w: 160, h: 34, color, size: 15 });
      panel.add(b);
      buttons.push(b);
    };
    add(
      t('mine.play'),
      () => goTo(this, 'Game', { index: 0, custom: { id: level.id, from: 'list' } }),
      0xe85d75,
    );
    if (level.origin === 'mine' && canCreate())
      add(t('mine.edit'), () => void openEditor(this, level.id));
    // A creator shares a level once it is verified; a received one can be passed on as it came
    if (level.origin === 'received' || isVerified(level))
      add(t('editor.share'), () => void showShare(level), 0x2a9d8f);
    add(t('mine.delete'), () => void this.remove(level));
    add(t('dialog.close'), () => close());
    // Two columns of buttons under the map
    buttons.forEach((b, i) => {
      const col = buttons.length > 1 ? i % 2 : 0;
      b.setPosition(
        buttons.length > 1 ? (col ? 86 : -86) : 0,
        h / 2 - 112 + Math.floor(i / 2) * 42,
      );
    });
    if (buttons.length % 2) buttons[buttons.length - 1].setX(0);

    const close = () => {
      sfx.click();
      dim.destroy();
      panel.destroy();
      this.panelGroup = null;
    };
    this.panelGroup = new ButtonGroup(buttons, 2, close);
    this.panelGroup.focusOn(0);
  }

  private async remove(level: CustomLevel) {
    if (!(await confirmDelete(level.name || t('editor.untitled')))) return;
    deleteLevel(level.id);
    this.scene.restart({ page: this.page } satisfies MyLevelsData);
  }

  private newLevel() {
    const level = createLevel(t('editor.newName'));
    void openEditor(this, level.id);
  }

  private async openCode() {
    const data = await askCode();
    if (!data) return;
    const level = addReceived(data);
    this.scene.restart({ focus: level.id, open: true } satisfies MyLevelsData);
  }

  update() {
    if (dialogOpen()) {
      controls.clearEdges();
      return;
    }
    if (this.panelGroup) return this.panelGroup.update();
    // Left and right turn the page
    const pages = Math.ceil(listLevels().length / PER_PAGE);
    if (controls.consume('left') && this.page > 0) return this.paging(-1);
    if (controls.consume('right') && this.page < pages - 1) return this.paging(1);
    this.group.update();
  }
}
