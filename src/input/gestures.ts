// Touch gestures for the game, as pure logic (no DOM) so they can be unit tested.
//
// - Move: the first finger anywhere on the screen is an invisible joystick anchored where it
//   lands. Sliding left or right past a small dead zone steers the ball that way. If the finger
//   goes further than `maxOffset`, the anchor follows it, so reversing direction is immediate.
// - High bounce: a second finger held down acts like holding the jump button, and a quick
//   double tap queues one high bounce for the next landing.

export interface GestureConfig {
  /** Horizontal distance (CSS px) before the finger steers. */
  deadZone: number;
  /** The anchor trails the finger at most this far (CSS px). */
  maxOffset: number;
  /** A touch shorter than this (ms) that barely moved is a tap. */
  tapMaxMs: number;
  /** Maximum movement (CSS px) for a touch to still count as a tap. */
  tapMaxMove: number;
  /** Maximum time (ms) between two taps of a double tap. */
  doubleTapMs: number;
  /** Maximum distance (CSS px) between the two taps of a double tap. */
  doubleTapRadius: number;
}

export const GESTURE_DEFAULTS: GestureConfig = {
  deadZone: 14,
  maxOffset: 56,
  tapMaxMs: 250,
  tapMaxMove: 12,
  doubleTapMs: 320,
  doubleTapRadius: 48,
};

export type GestureEvent = 'jump' | 'doubleTap';

export interface Point {
  x: number;
  y: number;
}

interface Touch {
  x0: number;
  y0: number;
  t0: number;
  moved: number;
}

export class Gestures {
  private touches = new Map<number, Touch>();
  private steerId: number | null = null;
  private anchor: Point = { x: 0, y: 0 };
  private finger: Point = { x: 0, y: 0 };
  private lastTap: (Point & { t: number }) | null = null;

  constructor(private readonly cfg: GestureConfig = GESTURE_DEFAULTS) {}

  /** -1 left, 1 right, 0 none. */
  get dir(): -1 | 0 | 1 {
    if (this.steerId === null) return 0;
    const dx = this.finger.x - this.anchor.x;
    if (dx > this.cfg.deadZone) return 1;
    if (dx < -this.cfg.deadZone) return -1;
    return 0;
  }

  /** True while a second finger rests on the screen. */
  get jumpHeld(): boolean {
    for (const id of this.touches.keys()) if (id !== this.steerId) return true;
    return false;
  }

  /** Where the steering finger landed and where it is now (for the on-screen indicator). */
  get stick(): { anchor: Point; finger: Point } | null {
    return this.steerId === null
      ? null
      : { anchor: { ...this.anchor }, finger: { ...this.finger } };
  }

  down(id: number, x: number, y: number, t: number): GestureEvent[] {
    this.touches.set(id, { x0: x, y0: y, t0: t, moved: 0 });
    if (this.steerId === null) {
      this.steerId = id;
      this.anchor = { x, y };
      this.finger = { x, y };
      return [];
    }
    // Any extra finger is the jump button
    return ['jump'];
  }

  move(id: number, x: number, y: number) {
    const touch = this.touches.get(id);
    if (!touch) return;
    touch.moved = Math.max(touch.moved, Math.hypot(x - touch.x0, y - touch.y0));
    if (id !== this.steerId) return;
    this.finger = { x, y };
    const dx = x - this.anchor.x;
    if (Math.abs(dx) > this.cfg.maxOffset) {
      // Rubber band: drag the anchor along so the way back is always short
      this.anchor.x = x - Math.sign(dx) * this.cfg.maxOffset;
    }
    this.anchor.y = y;
  }

  up(id: number, x: number, y: number, t: number): GestureEvent[] {
    const touch = this.touches.get(id);
    if (!touch) return [];
    this.touches.delete(id);
    const events: GestureEvent[] = [];
    const isTap =
      t - touch.t0 <= this.cfg.tapMaxMs &&
      Math.max(touch.moved, Math.hypot(x - touch.x0, y - touch.y0)) <= this.cfg.tapMaxMove;
    if (isTap && this.touches.size === 0) {
      const prev = this.lastTap;
      if (
        prev &&
        t - prev.t <= this.cfg.doubleTapMs &&
        Math.hypot(x - prev.x, y - prev.y) <= this.cfg.doubleTapRadius
      ) {
        events.push('doubleTap');
        this.lastTap = null;
      } else {
        this.lastTap = { x, y, t };
      }
    } else if (!isTap) {
      this.lastTap = null;
    }
    if (id === this.steerId) this.steerId = null;
    return events;
  }

  cancel(id: number) {
    this.touches.delete(id);
    if (id === this.steerId) this.steerId = null;
  }

  reset() {
    this.touches.clear();
    this.steerId = null;
    this.lastTap = null;
  }
}
