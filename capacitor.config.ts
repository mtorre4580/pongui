import type { CapacitorConfig } from '@capacitor/cli';

// iOS and Android apps. Build the web files first: `pnpm build:native` (see package.json).
const config: CapacitorConfig = {
  // Reverse-domain id tied to the GitHub account; it cannot change after the first store upload
  appId: 'io.github.mtorre4580.pongui',
  appName: 'Pongui',
  webDir: 'dist-native',
  backgroundColor: '#0d1024',
  // The app opens the game directly (the landing page is web-only)
  // Explicit file: Capacitor's server answers a bare /play/ with the root index.html
  server: { appStartPath: 'play/index.html' },
  ios: {
    contentInset: 'never',
    // The game is a canvas: no rubber-band scrolling of the web view
    scrollEnabled: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#0d1024',
      showSpinner: false,
    },
  },
};

export default config;
