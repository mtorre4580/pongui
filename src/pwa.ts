// App install (PWA) and fullscreen.
import { track } from './analytics';
import { IS_NATIVE } from './native';

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
  track('install');
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

/** True when running as an installed app: a PWA window or the native iOS/Android app. */
export const isStandalone = () =>
  IS_NATIVE ||
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

/** The entry scripts an HTML page loads, as one comparable string (file names carry a hash). */
const entryScripts = (sources: Iterable<string>) =>
  [...sources]
    .map((src) => src.split('/').pop()!)
    .sort()
    .join(',');

const HEALED_KEY = 'pongui:sw-healed';

/**
 * Repairs a precache that holds an old page. The host takes some seconds to serve every file
 * of a new release: a worker installed in that window can store the new scripts next to the
 * previous HTML, under the new revision, and nothing replaces it until the next release. The
 * page served by the worker is compared with the one on the network; when they differ and no
 * update is on its way, the cache is dropped and the page reloads once from the network.
 */
async function healStalePrecache(registration: ServiceWorkerRegistration) {
  if (!navigator.serviceWorker.controller || !navigator.onLine) return;
  // An unknown parameter makes the worker's precache route skip this request
  const response = await fetch(`${location.pathname}?fresh=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) return;
  const html = await response.text();
  const live = entryScripts(
    [...html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g)].map((m) => m[1]),
  );
  const mine = entryScripts(
    [...document.querySelectorAll<HTMLScriptElement>('script[type="module"][src]')].map(
      (el) => el.src,
    ),
  );
  if (!live || live === mine) return;
  // A regular release: the new worker takes over the next time the game is opened
  await registration.update();
  if (registration.installing || registration.waiting) return;
  // Once per visit: never a reload loop if the network itself keeps answering with old files
  if (sessionStorage.getItem(HEALED_KEY)) return;
  sessionStorage.setItem(HEALED_KEY, '1');
  const names = await caches.keys();
  await Promise.all(
    names.filter((n) => n.startsWith('workbox-precache')).map((n) => caches.delete(n)),
  );
  await registration.unregister();
  location.reload();
}

/**
 * Registers the service worker. The URL is resolved from this bundle (`assets/…`), so it points
 * to the site root from any page (/, /play/) and under any base folder.
 */
export function registerServiceWorker() {
  // The native app ships every file inside the package: no service worker needed
  if (!import.meta.env.PROD || IS_NATIVE || !('serviceWorker' in navigator)) return;
  // Resolved at runtime on purpose (it is the site root, not a file to bundle)
  const root = new URL(/* @vite-ignore */ '../', import.meta.url);
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(new URL('sw.js', root), { scope: root.pathname })
      .then((registration) => {
        // After start-up, so the check never competes with loading the game
        window.setTimeout(() => void healStalePrecache(registration).catch(() => undefined), 3000);
      })
      .catch(() => undefined);
  });
}
