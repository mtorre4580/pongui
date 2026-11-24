// Landing page: plain DOM, no game engine. Texts, videos, world names and install button.
import { initAnalytics, track } from '../analytics';
import { getLocale, LOCALES, setLocale, t, type Locale, type MessageKey } from '../i18n';
import {
  canInstall,
  isIOS,
  isStandalone,
  onInstallChange,
  promptInstall,
  registerServiceWorker,
} from '../pwa';
import { en, type LandingKey, type LandingMessages } from './messages/en';
import { es } from './messages/es';
import { ptBR } from './messages/pt-BR';

const MESSAGES: Record<Locale, LandingMessages> = { en, es, 'pt-BR': ptBR };
const lt = (key: LandingKey) => MESSAGES[getLocale()][key] ?? en[key];

/** Applies the current language to every `data-i18n` text and `data-i18n-attr` attribute. */
function translate() {
  document.documentElement.lang = getLocale();
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => {
    el.textContent = lt(el.dataset.i18n as LandingKey);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-attr]').forEach((el) => {
    for (const pair of el.dataset.i18nAttr!.split(',')) {
      const [attr, key] = pair.split(':');
      el.setAttribute(attr.trim(), lt(key.trim() as LandingKey));
    }
  });
  renderWorlds();
  videos.forEach((v) => v.refreshLabel());
}

/** World and boss names come from the game's own dictionary, so both always agree. */
function renderWorlds() {
  document.querySelectorAll<HTMLElement>('[data-world]').forEach((el) => {
    el.textContent = t(`world.${el.dataset.world}` as MessageKey);
  });
  document.querySelectorAll<HTMLElement>('[data-boss]').forEach((el) => {
    el.textContent = t(`boss.${el.dataset.boss}` as MessageKey);
  });
}

// --- Videos: load when visible, play only while on screen, always pausable (WCAG 2.2.2) ---

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

interface Clip {
  refreshLabel(): void;
}

const videos: Clip[] = [];

function setupClip(figure: HTMLElement) {
  const video = figure.querySelector('video')!;
  let button = figure.querySelector<HTMLButtonElement>('.clip-toggle');
  if (!button) {
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'clip-toggle';
    button.append(Object.assign(document.createElement('span'), { className: 'sr-only' }));
    figure.append(button);
  }
  const label = button.querySelector('span')!;
  // Respect the visitor: no autoplay with reduced motion, and a manual pause sticks
  let wanted = !reducedMotion.matches;
  let visible = false;

  const load = () => {
    // Relative to this page (it lives at the site root), so it works under any base folder
    if (!video.src && video.dataset.src) video.src = video.dataset.src.replace(/^\//, '');
  };
  const sync = () => {
    if (wanted && visible) {
      load();
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
    clip.refreshLabel();
  };
  const clip: Clip = {
    refreshLabel() {
      const playing = wanted;
      label.textContent = lt(playing ? 'video.pause' : 'video.play');
      button!.classList.toggle('is-paused', !playing);
    },
  };
  button.addEventListener('click', () => {
    wanted = !wanted;
    sync();
  });
  new IntersectionObserver(
    (entries) => {
      visible = entries.some((e) => e.isIntersecting);
      sync();
    },
    { threshold: 0.35 },
  ).observe(figure);
  clip.refreshLabel();
  videos.push(clip);
}

// --- Install button: native prompt where available, instructions on iOS ---

function setupInstall() {
  const button = document.getElementById('install') as HTMLButtonElement | null;
  if (!button) return;
  const refresh = () => {
    button.hidden = isStandalone() || !(canInstall() || isIOS());
  };
  button.addEventListener('click', () => {
    if (canInstall()) void promptInstall();
    else document.getElementById('install-help')?.scrollIntoView({ behavior: 'smooth' });
  });
  onInstallChange(refresh);
  refresh();
}

function setupLanguage() {
  const select = document.getElementById('lang') as HTMLSelectElement | null;
  if (!select) return;
  select.value = getLocale();
  select.addEventListener('change', () => {
    const value = select.value as Locale;
    if (LOCALES.includes(value)) setLocale(value);
    translate();
  });
}

registerServiceWorker();
initAnalytics();
// Which button sends people to the game: the hero, the menu, a world card or the last call
document.querySelectorAll<HTMLAnchorElement>('a[href^="./play/"]').forEach((link) => {
  const from = link.closest('section, header')?.id || link.closest('section, header')?.className;
  link.addEventListener('click', () => track('play_click', { from: from ?? 'page' }));
});
// (some screens hold a still picture: only the ones with a video are clips)
document.querySelectorAll<HTMLElement>('.screen').forEach((figure) => {
  if (figure.querySelector('video')) setupClip(figure);
});
setupInstall();
setupLanguage();
translate();
const year = document.getElementById('year');
if (year) year.textContent = String(new Date().getFullYear());
