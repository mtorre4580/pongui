// Grid and sizes (world units, in "logical px")
export const TILE = 32;
export const COLS = 20;
export const ROWS = 12;
export const HUD_H = 32;
export const GAME_W = COLS * TILE; // 640
export const GAME_H = ROWS * TILE + HUD_H; // 416

// The canvas renders at twice the size and the camera zooms 2× so everything stays sharp
export const ZOOM = 2;
export const CANVAS_W = GAME_W * ZOOM;
export const CANVAS_H = GAME_H * ZOOM;

// Ball
export const BALL_R = 10; // half side of the collision box

// Physics (px/s, px/s²)
export const GRAVITY = 1800;
export const H_LOW = 1.6 * TILE; // normal bounce: climbs 1 step
export const H_HIGH = 3.6 * TILE; // high bounce: climbs 3 steps
export const H_SPRING = 6.6 * TILE; // spring: climbs 6 steps
export const V_LOW = Math.sqrt(2 * GRAVITY * H_LOW);
export const V_HIGH = Math.sqrt(2 * GRAVITY * H_HIGH);
export const V_SPRING = Math.sqrt(2 * GRAVITY * H_SPRING);
export const MAX_FALL = 900;

export const AIR_ACCEL = 2400;
export const AIR_DECEL = 2400;
export const MAX_VX = 160;
export const RAMP_VX = 220;
export const PUSH_VX = 280; // pushers: a low bounce at this fixed sideways speed

// Water: gravity is scaled down and the fall speed is capped (px/s)
export const WATER_GRAVITY = 0.5;
export const WATER_MAX_FALL = 240;

// Updrafts replace gravity with a lift up to a top speed (px/s², px/s)
export const UPDRAFT_LIFT = 2200;
export const UPDRAFT_VMAX = 260;

export const JUMP_BUFFER = 0.12; // s: pressing jump a bit before landing still counts
export const BOUNCE_GRACE = 0.07; // s: pressing jump right after a bounce turns it into a high one

export const STEP = 1 / 120; // fixed simulation step

export const ITEM_RADIUS = 18;
export const EXIT_RADIUS = 16;

export const START_LIVES = 3;

// Ember Core: a crumbling block lasts this many steps after the first touch (0.6 s), and vents
// spend half of their cycle off (solid) and half lit (deadly), starting off
export const CRUMBLE_STEPS = 72;
export const VENT_CYCLE = 360; // steps (3 s)
