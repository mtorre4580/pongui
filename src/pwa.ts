// App install (PWA) and fullscreen.

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as BeforeInstallPromptEvent;
  notify();
});
window.addEventListener('appinstalled', () => {
  deferred = null;
  notify();
});

export const canInstall = () => deferred !== null;

export function onInstallChange(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function promptInstall() {
  if (!deferred) return;
  const d = deferred;
  deferred = null;
  await d.prompt();
  await d.userChoice.catch(() => undefined);
  notify();
}

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.matchMedia('(display-mode: fullscreen)').matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true;

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  // iPadOS reports itself as a Mac: tell them apart by touch support
  (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

export const canFullscreen = () => !!document.fullscreenEnabled && !isStandalone();

export async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      await o.lock?.('landscape').catch(() => undefined);
    }
  } catch {
    /* the browser does not allow it */
  }
}
