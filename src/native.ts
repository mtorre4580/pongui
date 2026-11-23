// Native app (iOS / Android through Capacitor) integration.
// `IS_NATIVE` is a build-time constant (`vite build --mode native`): in the web build every branch
// below is dead code and the Capacitor plugins are never bundled.

export const IS_NATIVE = import.meta.env.MODE === 'native';

// Keys mirrored to native storage: iOS may clear a web view's localStorage when space runs low
const DURABLE_KEYS = ['boinky:save', 'boinky:locale', 'boinky:custom'];

/**
 * Prepares the native shell before the game starts: restores saved progress from native
 * storage into localStorage (the game reads it synchronously) and hides the status bar.
 */
export async function initNative() {
  if (!IS_NATIVE) return;
  const [{ Preferences }, { StatusBar }] = await Promise.all([
    import('@capacitor/preferences'),
    import('@capacitor/status-bar'),
  ]);
  for (const key of DURABLE_KEYS) {
    const { value } = await Preferences.get({ key });
    if (value !== null) {
      localStorage.setItem(key, value);
    } else {
      // First run after an update from a build without native storage: keep what we had
      const local = localStorage.getItem(key);
      if (local !== null) await Preferences.set({ key, value: local });
    }
  }
  await StatusBar.hide().catch(() => undefined);
}

/** Copies a durable value to native storage (no-op on the web). */
export function persistNative(key: string, value: string) {
  if (!IS_NATIVE || !DURABLE_KEYS.includes(key)) return;
  void import('@capacitor/preferences').then(({ Preferences }) => Preferences.set({ key, value }));
}

/** Hides the native splash screen once the first scene is drawn. */
export function hideSplash() {
  if (!IS_NATIVE) return;
  void import('@capacitor/splash-screen').then(({ SplashScreen }) =>
    SplashScreen.hide({ fadeOutDuration: 250 }),
  );
}

export type HapticKind = 'light' | 'medium' | 'heavy' | 'success' | 'error';

/** Short vibration on supported phones (no-op on the web). */
export function haptic(kind: HapticKind) {
  if (!IS_NATIVE) return;
  void import('@capacitor/haptics').then(({ Haptics, ImpactStyle, NotificationType }) => {
    if (kind === 'success') return Haptics.notification({ type: NotificationType.Success });
    if (kind === 'error') return Haptics.notification({ type: NotificationType.Error });
    const style = {
      light: ImpactStyle.Light,
      medium: ImpactStyle.Medium,
      heavy: ImpactStyle.Heavy,
    }[kind];
    return Haptics.impact({ style });
  });
}
