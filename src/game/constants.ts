// Grilla y tamaños (unidades del mundo, en "px lógicos")
export const TILE = 32;
export const COLS = 20;
export const ROWS = 12;
export const HUD_H = 32;
export const GAME_W = COLS * TILE; // 640
export const GAME_H = ROWS * TILE + HUD_H; // 416

// El canvas se renderiza al doble y la cámara usa zoom 2 para que todo se vea nítido
export const ZOOM = 2;
export const CANVAS_W = GAME_W * ZOOM;
export const CANVAS_H = GAME_H * ZOOM;

// Pelota
export const BALL_R = 10; // medio lado de la caja de colisión

// Física (px/s, px/s²)
export const GRAVITY = 1800;
export const H_LOW = 1.6 * TILE; // rebote normal: sube 1 escalón
export const H_HIGH = 3.6 * TILE; // rebote alto: sube 3 escalones
export const H_SPRING = 6.6 * TILE; // resorte: sube 6 escalones
export const V_LOW = Math.sqrt(2 * GRAVITY * H_LOW);
export const V_HIGH = Math.sqrt(2 * GRAVITY * H_HIGH);
export const V_SPRING = Math.sqrt(2 * GRAVITY * H_SPRING);
export const MAX_FALL = 900;

export const AIR_ACCEL = 2400;
export const AIR_DECEL = 2400;
export const MAX_VX = 160;
export const RAMP_VX = 220;

export const JUMP_BUFFER = 0.12; // s: apretar saltar un poco antes de tocar el piso igual cuenta
export const BOUNCE_GRACE = 0.07; // s: apretar saltar justo después del rebote lo convierte en alto

export const STEP = 1 / 120; // paso fijo de simulación

export const ITEM_RADIUS = 18;
export const EXIT_RADIUS = 16;

export const START_LIVES = 3;
