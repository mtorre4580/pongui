// HTML dialogs over the game for what a canvas does poorly: typing a name, pasting a link,
// copying a link and showing a QR code. Native <dialog> elements: focus stays inside, Escape
// closes them, and screen readers announce them.
import { decodeLevel, encodeLevel, NAME_MAX, type CustomLevelData } from '../game/custom';
import { t } from '../i18n';
import { IS_NATIVE } from '../native';

/** True while a dialog is open: game keys must not act behind it. */
export const dialogOpen = () => !!document.querySelector('dialog.ui-dialog[open]');

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...children);
  return e;
}

/** Opens a modal dialog; resolves when it closes, with `returnValue`. */
function modal(title: string, body: (Node | string)[], buttons: HTMLElement[]): HTMLDialogElement {
  const id = `dlg-${Math.random().toString(36).slice(2)}`;
  const dialog = el('dialog', { className: 'ui-dialog' });
  dialog.setAttribute('aria-labelledby', id);
  const form = el('form', { method: 'dialog' }, [
    el('h2', { id }, [title]),
    ...body,
    el('div', { className: 'ui-actions' }, buttons),
  ]);
  dialog.append(form);
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove());
  // A click on the backdrop (outside the panel) closes it
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close('');
  });
  dialog.showModal();
  return dialog;
}

const closed = (d: HTMLDialogElement) =>
  new Promise<string>((resolve) => d.addEventListener('close', () => resolve(d.returnValue)));

function button(label: string, value: string, primary = false): HTMLButtonElement {
  const b = el('button', { type: 'submit', value, className: primary ? 'primary' : '' }, [label]);
  return b;
}

/** Asks for a level name. Resolves with the new name, or null when cancelled. */
export async function askName(current: string): Promise<string | null> {
  const input = el('input', {
    type: 'text',
    value: current,
    maxLength: NAME_MAX,
    autocomplete: 'off',
    spellcheck: false,
    name: 'name',
  });
  const label = el('label', { className: 'ui-field' }, [t('dialog.nameLabel'), input]);
  const d = modal(
    t('dialog.renameTitle'),
    [label],
    [button(t('dialog.cancel'), 'cancel'), button(t('dialog.save'), 'save', true)],
  );
  input.select();
  const v = await closed(d);
  return v === 'save' ? input.value : null;
}

/** Asks for a link or code someone shared. Resolves with the level, or null when cancelled. */
export async function askCode(): Promise<CustomLevelData | null> {
  const input = el('textarea', { rows: 3, spellcheck: false, name: 'code' });
  input.setAttribute('autocapitalize', 'off');
  const error = el('p', { className: 'ui-error', hidden: true }, [t('dialog.badCode')]);
  error.setAttribute('role', 'alert');
  const label = el('label', { className: 'ui-field' }, [t('dialog.codeLabel'), input]);
  const open = button(t('dialog.open'), 'open', true);
  const d = modal(
    t('dialog.codeTitle'),
    [label, error],
    [button(t('dialog.cancel'), 'cancel'), open],
  );
  let level: CustomLevelData | null = null;
  // Keep the dialog open while the text is not a valid level
  open.addEventListener('click', (e) => {
    level = decodeLevel(input.value);
    if (!level) {
      e.preventDefault();
      error.hidden = false;
      input.focus();
    }
  });
  input.addEventListener('input', () => (error.hidden = true));
  input.focus();
  const v = await closed(d);
  return v === 'open' ? level : null;
}

/** Asks to confirm a deletion. */
export async function confirmDelete(name: string): Promise<boolean> {
  const d = modal(
    t('dialog.deleteTitle'),
    [el('p', {}, [t('dialog.deleteText', { name })])],
    [button(t('dialog.cancel'), 'cancel'), button(t('dialog.delete'), 'delete', true)],
  );
  return (await closed(d)) === 'delete';
}

/** The page that opens a shared level: this game's page, or the public site in the apps. */
export function shareUrl(level: CustomLevelData): string {
  const code = encodeLevel(level);
  const base = IS_NATIVE
    ? new URL('play/', import.meta.env.VITE_SITE_URL as string)
    : new URL('./', location.href);
  return `${base.origin}${base.pathname}?c=${code}`;
}

/** Draws a QR code on a canvas (dark modules on white, with the standard quiet zone). */
async function drawQr(url: string): Promise<HTMLCanvasElement> {
  const { default: qrcode } = await import('qrcode-generator');
  const qr = qrcode(0, 'M');
  qr.addData(url, 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  const cell = 8;
  const margin = 4;
  const size = (n + margin * 2) * cell;
  const canvas = el('canvas', { width: size, height: size, className: 'ui-qr' });
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#0d1024';
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (qr.isDark(r, c)) ctx.fillRect((c + margin) * cell, (r + margin) * cell, cell, cell);
  return canvas;
}

/** Link, WhatsApp, the system share sheet and a QR code to scan with a phone. */
export async function showShare(level: CustomLevelData): Promise<void> {
  const url = shareUrl(level);
  const message = t('share.message', { name: level.name, url });

  const qr = await drawQr(url);
  qr.setAttribute('role', 'img');
  qr.setAttribute('aria-label', t('share.qrLabel'));

  const link = el('input', { type: 'text', value: url, readOnly: true, name: 'link' });
  const copy = el('button', { type: 'button' }, [t('share.copy')]);
  copy.addEventListener('click', () => {
    const done = () => (copy.textContent = t('share.copied'));
    // Without clipboard access (an insecure origin), the link is selected to copy by hand
    if (navigator.clipboard)
      void navigator.clipboard.writeText(url).then(done, () => link.select());
    else link.select();
  });

  const whatsapp = el(
    'a',
    {
      href: `https://wa.me/?text=${encodeURIComponent(message)}`,
      target: '_blank',
      rel: 'noopener noreferrer',
      className: 'ui-button whatsapp',
    },
    [t('share.whatsapp')],
  );

  const download = el('button', { type: 'button' }, [t('share.download')]);
  download.addEventListener('click', () => {
    const a = el('a', { href: qr.toDataURL('image/png'), download: 'pongui-level-qr.png' });
    a.click();
  });

  const row = el('div', { className: 'ui-row' }, [whatsapp, download]);
  if (typeof navigator.share === 'function') {
    const more = el('button', { type: 'button' }, [t('share.more')]);
    more.addEventListener('click', () => {
      void navigator.share({ title: level.name, text: message, url }).catch(() => undefined);
    });
    row.append(more);
  }

  const body: (Node | string)[] = [
    el('div', { className: 'ui-share' }, [
      qr,
      el('div', { className: 'ui-share-side' }, [
        el('p', {}, [t('share.scan')]),
        el('label', { className: 'ui-field' }, [
          t('share.link'),
          el('div', { className: 'ui-row' }, [link, copy]),
        ]),
        row,
      ]),
    ]),
  ];
  // A phone cannot open a link to this computer's localhost
  if (['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && !IS_NATIVE)
    body.push(el('p', { className: 'ui-note' }, [t('share.localhost')]));
  body.push(el('p', { className: 'ui-soon' }, [t('share.soon')]));

  const d = modal(t('share.title', { name: level.name }), body, [
    button(t('dialog.close'), 'close', true),
  ]);
  await closed(d);
}
