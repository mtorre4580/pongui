// Tiny typed i18n: English by default, Spanish and Brazilian Portuguese available.
import { en, type MessageKey, type Messages } from './messages/en';
import { es } from './messages/es';
import { ptBR } from './messages/pt-BR';
import { persistNative } from '../native';

export type Locale = 'en' | 'es' | 'pt-BR';
export type Localized<T> = Record<Locale, T>;

export const LOCALES: Locale[] = ['en', 'es', 'pt-BR'];
const MESSAGES: Record<Locale, Messages> = { en, es, 'pt-BR': ptBR };
const STORAGE_KEY = 'boinky:locale';

/** A saved choice wins; otherwise the browser language if supported; otherwise English. */
function detect(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (LOCALES as string[]).includes(saved)) return saved as Locale;
  } catch {
    /* storage blocked: fall back to detection */
  }
  for (const lang of navigator.languages ?? [navigator.language]) {
    const l = lang.toLowerCase();
    if (l.startsWith('es')) return 'es';
    if (l.startsWith('pt')) return 'pt-BR';
    if (l.startsWith('en')) return 'en';
  }
  return 'en';
}

let current: Locale = detect();

export const getLocale = () => current;

export function setLocale(locale: Locale) {
  current = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
    persistNative(STORAGE_KEY, locale);
  } catch {
    /* the choice just will not persist */
  }
  applyDomTexts();
}

export function nextLocale(): Locale {
  return LOCALES[(LOCALES.indexOf(current) + 1) % LOCALES.length];
}

/** Translates a key, replacing `{name}` placeholders with `params`. */
export function t(key: MessageKey, params: Record<string, string | number> = {}): string {
  const text = MESSAGES[current][key] ?? en[key];
  return text.replace(/\{(\w+)\}/g, (_, p: string) => String(params[p] ?? `{${p}}`));
}

/** Picks the current language from a localized value (level names, hints…). */
export function localized<T>(value: Localized<T>): T {
  return value[current] ?? value.en;
}

/** Texts that live in index.html (outside the canvas). */
export function applyDomTexts() {
  document.documentElement.lang = current;
  const set = (id: string, key: MessageKey, attr?: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (attr) el.setAttribute(attr, t(key));
    else el.textContent = t(key);
  };
  set('loading', 'dom.loading');
  set('rotate-text', 'dom.rotate');
  set('tc-l', 'dom.left', 'aria-label');
  set('tc-r', 'dom.right', 'aria-label');
  set('tc-j', 'dom.jump', 'aria-label');
}
