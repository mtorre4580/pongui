import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import { loadEnv, type Plugin } from 'vite';

/**
 * vite-plugin-pwa links the manifest as `./manifest.webmanifest` on every page, after the HTML
 * transforms run. On nested pages (/play/) that resolves to /play/manifest.webmanifest, which does
 * not exist: point it back to the site root according to the page's depth.
 */
const rootManifestLink = (): Plugin => ({
  name: 'root-manifest-link',
  apply: 'build',
  enforce: 'post',
  // Runs after the HTML is written and before vite-plugin-pwa hashes files for the precache
  writeBundle(options, bundle) {
    for (const fileName of Object.keys(bundle)) {
      const depth = fileName.split('/').length - 1;
      if (!fileName.endsWith('.html') || depth === 0) continue;
      const file = join(options.dir!, fileName);
      const html = readFileSync(file, 'utf8');
      writeFileSync(
        file,
        html.replace(
          'href="./manifest.webmanifest"',
          `href="${'../'.repeat(depth)}manifest.webmanifest"`,
        ),
      );
    }
  },
});

const page = (path: string) => fileURLToPath(new URL(path, import.meta.url));

/**
 * Capacitor needs an index.html at the root of its web folder. The app opens /play/ directly
 * (`appStartPath`), so this page only redirects there as a fallback.
 */
const nativeEntry = (): Plugin => ({
  name: 'native-entry',
  apply: 'build',
  writeBundle(options) {
    writeFileSync(
      join(options.dir!, 'index.html'),
      '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/play/index.html"><title>Pongui</title>\n',
    );
  },
});

/**
 * robots.txt and sitemap.xml written from `VITE_SITE_URL`, so the public address lives in one
 * place (.env) and these files can never point at an old domain.
 */
const siteFiles = (site: string): Plugin => ({
  name: 'site-files',
  apply: 'build',
  generateBundle() {
    const urls = ['', 'play/', 'privacy/'].map(
      (path) => `  <url>\n    <loc>${site}${path}</loc>\n  </url>`,
    );
    this.emitFile({
      type: 'asset',
      fileName: 'robots.txt',
      source: `User-agent: *\nAllow: /\n\nSitemap: ${site}sitemap.xml\n`,
    });
    this.emitFile({
      type: 'asset',
      fileName: 'sitemap.xml',
      source:
        '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
        `${urls.join('\n')}\n</urlset>\n`,
    });
  },
});

/** The web build: landing page + game + PWA. */
const pwa = () =>
  VitePWA({
    registerType: 'autoUpdate',
    // Registered by src/pwa.ts: the injected script uses a page-relative path that breaks
    // on nested pages like /play/
    injectRegister: false,
    includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'],
    manifest: {
      name: 'Pongui',
      short_name: 'Pongui',
      description: 'A bouncing-ball puzzle game: collect every gem and find the exit.',
      lang: 'en',
      categories: ['games', 'entertainment'],
      // The installed app opens the game; the landing page lives at the root
      id: './play/',
      start_url: './play/',
      scope: './',
      display: 'fullscreen',
      orientation: 'landscape',
      background_color: '#0f1226',
      theme_color: '#1d2147',
      icons: [
        { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        {
          src: 'icons/maskable-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      // Landing media is only for the web page, never needed offline
      globIgnores: ['landing/**', 'og-image.jpg', '404.html'],
      // `?level=N` deep links and shared levels (`?c=CODE`) must still hit the precached game
      // page offline
      ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^level$/, /^c$/],
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
    },
  });

export default defineConfig(({ mode }) => {
  // `vite build --mode native`: only the game, for the iOS/Android apps (Capacitor). No PWA (the
  // app ships every file) and no public/ folder (landing media and web icons are not needed).
  const native = mode === 'native';
  const site = loadEnv(mode, process.cwd()).VITE_SITE_URL ?? '/';
  // Web: the landing page at / and the game at /play/. Native: the game only
  const input: Record<string, string> = native
    ? { play: page('./play/index.html') }
    : {
        main: page('./index.html'),
        play: page('./play/index.html'),
        privacy: page('./privacy/index.html'),
      };
  return {
    base: './',
    publicDir: native ? false : 'public',
    plugins: native ? [nativeEntry()] : [pwa(), rootManifestLink(), siteFiles(site)],
    build: {
      outDir: native ? 'dist-native' : 'dist',
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        input,
        output: {
          // Level maps in their own chunk: play.js is mostly Phaser and has little room left
          manualChunks: (id) => (/\/src\/levels\/[^/]+\.json$/.test(id) ? 'levels' : undefined),
        },
      },
    },
    test: { include: ['tests/**/*.test.ts'], testTimeout: 120000 },
  };
});
