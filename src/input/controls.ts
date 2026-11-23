// Unified input: keyboard, touch gestures and gamepad.
// Scenes poll it every frame: `held` for continuous actions and `consume()` for presses.

import { Gestures, type GestureEvent } from './gestures';

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

// A double tap keeps the jump "held" until the next landing, or this long at most
const ARMED_JUMP_MS = 900;

class Controls {
  private kb = new Set<Action>();
  private gp = new Set<Action>();
  private edges = new Set<Action>();
  private gestures = new Gestures();
  private gesturesOn = false;
  private jumpArmedAt = -Infinity;
  private stickEl: HTMLElement | null = null;
  private knobEl: HTMLElement | null = null;
  touchMode = false;

  init() {
    window.addEventListener('keydown', (e) => {
      const acts = KEYMAP[e.code];
      if (!acts) return;
      // Typing in a dialog (a level name, a pasted link) is not playing
      if (e.target instanceof Element && e.target.closest('dialog, input, textarea')) return;
      e.preventDefault();
      this.touchMode = false;
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
      this.resetGestures();
    });

    this.touchMode = !!window.matchMedia?.('(pointer: coarse)').matches;
    window.addEventListener('touchstart', () => (this.touchMode = true), { passive: true });

    this.stickEl = document.getElementById('stick');
    this.knobEl = document.getElementById('stick-knob');
    this.bindGestures(document.getElementById('game'));
  }

  /** Touch gestures over the game (see gestures.ts). Mouse and pen input are ignored here. */
  private bindGestures(el: HTMLElement | null) {
    if (!el) return;
    const now = () => performance.now();
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || !this.gesturesOn) return;
      this.handle(this.gestures.down(e.pointerId, e.clientX, e.clientY, now()));
      this.drawStick();
    });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'touch' || !this.gesturesOn) return;
      this.gestures.move(e.pointerId, e.clientX, e.clientY);
      this.drawStick();
    });
    const up = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return;
      this.handle(this.gestures.up(e.pointerId, e.clientX, e.clientY, now()));
      this.drawStick();
    };
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', (e) => {
      this.gestures.cancel(e.pointerId);
      this.drawStick();
    });
  }

  private handle(events: GestureEvent[]) {
    for (const ev of events) {
      this.edges.add('jump');
      if (ev === 'doubleTap') this.jumpArmedAt = performance.now();
    }
  }

  /** Shows a faint ring where the steering finger landed and a knob where it is now. */
  private drawStick() {
    if (!this.stickEl || !this.knobEl) return;
    const stick = this.gesturesOn ? this.gestures.stick : null;
    this.stickEl.hidden = !stick;
    if (!stick) return;
    this.stickEl.style.transform = `translate(${stick.anchor.x}px, ${stick.anchor.y}px)`;
    const dx = Math.max(-56, Math.min(56, stick.finger.x - stick.anchor.x));
    this.knobEl.style.transform = `translateX(${dx}px)`;
  }

  private resetGestures() {
    this.gestures.reset();
    this.jumpArmedAt = -Infinity;
    this.drawStick();
  }

  /** The game scene turns gestures on while a level is being played (not in menus or pause). */
  enableGestures(on: boolean) {
    if (this.gesturesOn === on) return;
    this.gesturesOn = on;
    this.resetGestures();
  }

  /** The queued high bounce of a double tap was used (the ball landed). */
  disarmJump() {
    this.jumpArmedAt = -Infinity;
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
    if (this.kb.has(a) || this.gp.has(a)) return true;
    if (!this.gesturesOn) return false;
    if (a === 'left') return this.gestures.dir < 0;
    if (a === 'right') return this.gestures.dir > 0;
    if (a === 'jump') {
      return this.gestures.jumpHeld || performance.now() - this.jumpArmedAt < ARMED_JUMP_MS;
    }
    return false;
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
