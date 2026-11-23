import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import type { Plugin } from 'vite';

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
      '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/play/index.html"><title>Boinky</title>\n',
    );
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
      name: 'Boinky',
      short_name: 'Boinky',
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
      globIgnores: ['landing/**', 'og-image.jpg'],
      // `?level=N` deep links must still hit the precached game page offline
      ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^level$/],
      maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
    },
  });

export default defineConfig(({ mode }) => {
  // `vite build --mode native`: only the game, for the iOS/Android apps (Capacitor). No PWA (the
  // app ships every file) and no public/ folder (landing media and web icons are not needed).
  const native = mode === 'native';
  // Web: the landing page at / and the game at /play/. Native: the game only
  const input: Record<string, string> = native
    ? { play: page('./play/index.html') }
    : { main: page('./index.html'), play: page('./play/index.html') };
  return {
    base: './',
    publicDir: native ? false : 'public',
    plugins: native ? [nativeEntry()] : [pwa(), rootManifestLink()],
    build: {
      outDir: native ? 'dist-native' : 'dist',
      chunkSizeWarningLimit: 2000,
      rollupOptions: {
        input,
      },
    },
    test: { include: ['tests/**/*.test.ts'], testTimeout: 120000 },
  };
});
