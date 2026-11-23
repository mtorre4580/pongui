// Anonymous usage statistics (Umami: no cookies, no personal data). This is the only file that
// knows the provider. Off in development, in the native apps and portal builds, when `VITE_UMAMI_ID` is not set
// and for visitors whose browser sends "Do Not Track".
import { OFF_SITE } from './build';

/** Everything the site reports. Keep it short: each event counts against the plan's quota. */
export type AnalyticsEvent =
  | 'play_click' // landing page: a link to the game
  | 'level_start' // first attempt at a level in this visit
  | 'level_complete'
  | 'install' // the browser installed the app
  | 'editor_open'
  | 'level_shared' // the share dialog was opened for a verified level
  | 'result_shared' // "share my time" after finishing a level
  | 'bot_watched' // "watch the bot" after running out of lives
  | 'shared_level_opened'; // a level arrived through a link

type EventData = Record<string, string | number | boolean>;

interface Umami {
  track(event: string, data?: EventData): void;
}

const SCRIPT = 'https://cloud.umami.is/script.js';
const ID: string | undefined = import.meta.env.VITE_UMAMI_ID;
const ENABLED = import.meta.env.PROD && !OFF_SITE && !!ID;

/** Events sent before the script arrives wait here (dropped if it never loads, e.g. offline). */
let queue: [AnalyticsEvent, EventData | undefined][] | null = [];
const umami = () => (window as unknown as { umami?: Umami }).umami;

/** Loads the tracker without blocking the page. Page views are counted by the script itself. */
export function initAnalytics() {
  if (!ENABLED) return;
  const script = document.createElement('script');
  script.defer = true;
  script.src = SCRIPT;
  script.dataset.websiteId = ID;
  script.dataset.doNotTrack = 'true';
  // Only the public site counts: not previews, not a copy served from somewhere else
  const site = import.meta.env.VITE_SITE_URL;
  if (site) script.dataset.domains = new URL(site).hostname;
  script.addEventListener('load', () => {
    queue?.forEach(([event, data]) => umami()?.track(event, data));
    queue = null;
  });
  script.addEventListener('error', () => (queue = null));
  document.head.append(script);
}

export function track(event: AnalyticsEvent, data?: EventData) {
  if (!ENABLED) return;
  if (queue) queue.push([event, data]);
  else umami()?.track(event, data);
}

const started = new Set<string>();
/** Restarts and retries would flood the statistics: a level counts as started once per visit. */
export function trackLevelStart(level: string) {
  if (started.has(level)) return;
  started.add(level);
  track('level_start', { level });
}
