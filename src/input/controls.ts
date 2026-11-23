// Unified input: keyboard, touch (HTML buttons) and gamepad.
// Scenes poll it every frame: `held` for continuous actions and `consume()` for presses.

import { LAYOUT_EVENT } from '../gfx/layout';

export type Action =
  'jump' | 'pause' | 'restart' | 'confirm' | 'back' | 'up' | 'down' | 'left' | 'right';

const KEYMAP: Record<string, Action[]> = {
  ArrowLeft: ['left'],
  KeyA: ['left'],
  ArrowRight: ['right'],
  KeyD: ['right'],
  ArrowUp: ['up', 'jump'],
  KeyW: ['up', 'jump'],
  ArrowDown: ['down'],
  KeyS: ['down'],
  Space: ['jump', 'confirm'],
  Enter: ['confirm'],
  KeyZ: ['jump'],
  KeyK: ['jump'],
  Escape: ['pause', 'back'],
  KeyP: ['pause'],
  KeyR: ['restart'],
};

const GP_BUTTONS: Record<number, Action[]> = {
  0: ['jump', 'confirm'], // A
  1: ['back'], // B
  2: ['jump'], // X
  9: ['pause'], // Start
  8: ['restart'], // Select
  12: ['up'],
  13: ['down'],
  14: ['left'],
  15: ['right'],
};

class Controls {
  private kb = new Set<Action>();
  private touch = new Map<Action, Set<number>>();
  private gp = new Set<Action>();
  private edges = new Set<Action>();
  private touchEl: HTMLElement | null = null;
  private wantTouchUi = false;
  private layoutReserved = false;
  touchMode = false;

  init() {
    window.addEventListener('keydown', (e) => {
      const acts = KEYMAP[e.code];
      if (!acts) return;
      e.preventDefault();
      this.setTouchMode(false);
      if (e.repeat) return;
      for (const a of acts) {
        this.kb.add(a);
        this.edges.add(a);
      }
    });
    window.addEventListener('keyup', (e) => {
      for (const a of KEYMAP[e.code] ?? []) this.kb.delete(a);
    });
    window.addEventListener('blur', () => {
      this.kb.clear();
      this.touch.clear();
    });

    const coarse = window.matchMedia?.('(pointer: coarse)').matches;
    this.touchMode = !!coarse;
    window.addEventListener('touchstart', () => this.setTouchMode(true), { passive: true });

    this.touchEl = document.getElementById('touch');
    this.bindTouch('tc-l', 'left');
    this.bindTouch('tc-r', 'right');
    this.bindTouch('tc-j', 'jump');
    this.refreshTouchUi();
  }

  private bindTouch(id: string, action: Action) {
    const el = document.getElementById(id);
    if (!el) return;
    const ids = new Set<number>();
    this.touch.set(action, ids);
    const down = (e: PointerEvent) => {
      e.preventDefault();
      if (!ids.size) this.edges.add(action);
      ids.add(e.pointerId);
      el.classList.add('on');
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    const up = (e: PointerEvent) => {
      ids.delete(e.pointerId);
      if (!ids.size) el.classList.remove('on');
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setTouchMode(on: boolean) {
    if (this.touchMode === on) return;
    this.touchMode = on;
    this.refreshTouchUi();
  }

  /** The game scene asks for the touch buttons; they only appear while touch is in use. */
  showTouchUi(on: boolean) {
    this.wantTouchUi = on;
    this.refreshTouchUi();
  }

  /**
   * Reserves (or frees) the side strips for the controls. It stays on for the whole level,
   * even while paused, so the game does not resize when pausing.
   */
  reserveTouchLayout(on: boolean) {
    this.layoutReserved = on;
    this.refreshTouchUi();
  }

  private refreshTouchUi() {
    if (!this.touchEl) return;
    this.touchEl.hidden = !(this.wantTouchUi && this.touchMode);
    const reserved = this.layoutReserved && this.touchMode;
    if (document.body.classList.contains('touch-ui') !== reserved) {
      document.body.classList.toggle('touch-ui', reserved);
      // The free area for the level changed: scenes re-place their cameras
      window.dispatchEvent(new Event(LAYOUT_EVENT));
    }
    if (this.touchEl.hidden) {
      for (const ids of this.touch.values()) ids.clear();
      this.touchEl.querySelectorAll('.on').forEach((n) => n.classList.remove('on'));
    }
  }

  /** Reads the gamepad (call once per frame). */
  poll() {
    const pads = navigator.getGamepads?.() ?? [];
    const now = new Set<Action>();
    for (const p of pads) {
      if (!p) continue;
      p.buttons.forEach((b, i) => {
        if (b.pressed) for (const a of GP_BUTTONS[i] ?? []) now.add(a);
      });
      const ax = p.axes[0] ?? 0;
      const ay = p.axes[1] ?? 0;
      if (ax < -0.4) now.add('left');
      if (ax > 0.4) now.add('right');
      if (ay < -0.5) now.add('up');
      if (ay > 0.5) now.add('down');
    }
    for (const a of now) if (!this.gp.has(a)) this.edges.add(a);
    this.gp = now;
  }

  held(a: Action): boolean {
    return this.kb.has(a) || this.gp.has(a) || (this.touch.get(a)?.size ?? 0) > 0;
  }

  consume(a: Action): boolean {
    const had = this.edges.has(a);
    this.edges.delete(a);
    return had;
  }

  clearEdges() {
    this.edges.clear();
  }
}

export const controls = new Controls();
