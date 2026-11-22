import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'],
      manifest: {
        name: 'Boinky',
        short_name: 'Boinky',
        description: 'A bouncing-ball puzzle game: collect every gem and find the exit.',
        lang: 'en',
        categories: ['games', 'entertainment'],
        start_url: './',
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
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 2000 },
  test: { include: ['tests/**/*.test.ts'], testTimeout: 120000 },
});
