// Generates the PWA PNG icons with shape math and supersampling (no dependencies).
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const hex = (h) => [
  parseInt(h.slice(1, 3), 16),
  parseInt(h.slice(3, 5), 16),
  parseInt(h.slice(5, 7), 16),
];
const BG_TOP = hex('#2b3170'),
  BG_BOT = hex('#0d1024');
const BALL = hex('#ff6b6b'),
  BALL_DARK = hex('#d94f5c'),
  BALL_LIGHT = hex('#ffb3b3');
const WHITE = [255, 255, 255],
  INK = hex('#161a33'),
  FLOOR = hex('#2a9d8f'),
  FLOOR_TOP = hex('#5ee6d6');

function scene(u, v, { maskable, splash = false }) {
  // u,v in [0,1]. Returns [r,g,b,a]
  const pad = maskable ? 0 : 0.06;
  const rad = maskable ? 0 : 0.22;
  // background with rounded corners
  const qx = Math.max(Math.abs(u - 0.5) - (0.5 - pad - rad), 0);
  const qy = Math.max(Math.abs(v - 0.5) - (0.5 - pad - rad), 0);
  if (Math.hypot(qx, qy) > rad + 1e-9 && !maskable) return [0, 0, 0, 0];
  const mix = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
  // Splash screen: flat background and a small ball in the middle, no floor
  let col = splash ? BG_BOT : mix(BG_TOP, BG_BOT, v);
  const k = splash ? 0.3 : maskable ? 0.78 : 1; // maskable icon safe zone
  const X = (u - 0.5) / k + 0.5,
    Y = (v - 0.5) / k + 0.5;
  // floor
  if (!splash && Y > 0.76 && X > 0.14 && X < 0.86) col = Y < 0.8 ? FLOOR_TOP : FLOOR;
  // shadow
  const sh = ((X - 0.5) / 0.2) ** 2 + ((Y - 0.76) / 0.03) ** 2;
  if (!splash && sh < 1 && Y <= 0.76) col = mix(col, [0, 0, 0], 0.35);
  // ball (squashed)
  const bx = 0.5,
    by = 0.5,
    rx = 0.27,
    ry = 0.25;
  const d = ((X - bx) / rx) ** 2 + ((Y - by) / ry) ** 2;
  if (d < 1) {
    col = d > 0.8 && Y > by ? BALL_DARK : BALL;
    const hl = ((X - 0.41) / 0.09) ** 2 + ((Y - 0.38) / 0.055) ** 2;
    if (hl < 1) col = BALL_LIGHT;
    for (const ex of [0.44, 0.58]) {
      const e = ((X - ex) / 0.045) ** 2 + ((Y - 0.5) / 0.065) ** 2;
      if (e < 1) col = WHITE;
      const p = ((X - ex - 0.012) / 0.022) ** 2 + ((Y - 0.51) / 0.03) ** 2;
      if (p < 1) col = INK;
    }
  }
  return [...col, 255];
}

function render(size, opts, SS = 4) {
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const c = scene((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size, opts);
          r += c[0] * c[3];
          g += c[1] * c[3];
          b += c[2] * c[3];
          a += c[3];
        }
      const i = (y * size + x) * 4;
      px[i] = a ? r / a : 0;
      px[i + 1] = a ? g / a : 0;
      px[i + 2] = a ? b / a : 0;
      px[i + 3] = a / (SS * SS);
    }
  return png(size, size, px);
}

function crc32(buf) {
  let c,
    crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public/icons', { recursive: true });
const out = [
  ['icon-192.png', 192, { maskable: false }],
  ['icon-512.png', 512, { maskable: false }],
  ['maskable-512.png', 512, { maskable: true }],
  ['apple-touch-icon.png', 180, { maskable: true }],
  ['favicon-32.png', 32, { maskable: false }],
];
for (const [name, size, opts] of out) {
  writeFileSync(`public/icons/${name}`, render(size, opts));
  console.log('✓', name);
}

// Sources for the native apps: `pnpm native:assets` (@capacitor/assets) derives every iOS and
// Android icon and splash size from these. The icon is full-bleed: each platform masks it.
mkdirSync('assets', { recursive: true });
writeFileSync('assets/icon-only.png', render(1024, { maskable: true }));
console.log('✓ assets/icon-only.png');
const splash = render(2732, { maskable: true, splash: true }, 2);
writeFileSync('assets/splash.png', splash);
writeFileSync('assets/splash-dark.png', splash);
console.log('✓ assets/splash.png, assets/splash-dark.png');

writeFileSync(
  'public/icons/icon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b3170"/><stop offset="1" stop-color="#0d1024"/></linearGradient></defs>
<rect x="6" y="6" width="88" height="88" rx="22" fill="url(#g)"/>
<rect x="14" y="76" width="72" height="12" fill="#2a9d8f"/><rect x="14" y="76" width="72" height="4" fill="#5ee6d6"/>
<ellipse cx="50" cy="50" rx="27" ry="25" fill="#ff6b6b"/><ellipse cx="41" cy="38" rx="9" ry="5.5" fill="#ffb3b3"/>
<ellipse cx="44" cy="50" rx="4.5" ry="6.5" fill="#fff"/><ellipse cx="58" cy="50" rx="4.5" ry="6.5" fill="#fff"/>
<circle cx="45.2" cy="51" r="2.4" fill="#161a33"/><circle cx="59.2" cy="51" r="2.4" fill="#161a33"/>
</svg>
`,
);
console.log('✓ icon.svg');
