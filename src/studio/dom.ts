/** Small DOM helpers for the studio. Text is always set as text; authored HTML never reaches innerHTML. */
import { createElement, X, type IconNode } from 'lucide';

export type Child = Node | string | false | null | undefined;
type Attribute = string | number | boolean | null | undefined;
export interface Props {
  class?: string;
  text?: string;
  attrs?: Record<string, Attribute>;
  on?: Record<string, (event: Event) => void>;
}
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, children: Child[] = []): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (props.class) element.className = props.class;
  if (props.text !== undefined) element.textContent = props.text;
  for (const [name, value] of Object.entries(props.attrs ?? {})) {
    if (value === false || value === null || value === undefined) continue;
    element.setAttribute(name, value === true ? '' : String(value));
  }
  for (const [name, handler] of Object.entries(props.on ?? {})) element.addEventListener(name, handler);
  for (const child of children) if (child !== false && child !== null && child !== undefined && child !== '') element.append(child);
  return element;
}
export function icon(node: IconNode, extra = ''): SVGElement {
  return createElement(node, { class: `icon ${extra}`.trim(), 'aria-hidden': 'true', 'stroke-width': '1.8', width: '18', height: '18' });
}
export interface ButtonOptions { icon?: IconNode; class?: string; label?: string; title?: string; disabled?: boolean; iconOnly?: boolean; attrs?: Record<string, Attribute>; }
/** A real button. Icon-only buttons carry their label as the accessible name and a tooltip. */
export function button(text: string, run: (event: Event) => void, options: ButtonOptions = {}): HTMLButtonElement {
  const label = options.label ?? text;
  const element = h('button', {
    class: options.class ?? (options.iconOnly ? 'ibtn' : 'btn'),
    attrs: { type: 'button', 'aria-label': options.iconOnly || options.label ? label : null, title: options.title ?? (options.iconOnly ? label : null), disabled: options.disabled, ...options.attrs },
    on: { click: run },
  }, [options.icon ? icon(options.icon) : null, options.iconOnly ? null : options.class?.includes('lbl') ? h('span', { class: 'lbl-text', text }) : text]);
  return element;
}

/* Announcements for screen readers, without interrupting typing. */
export function announce(message: string) {
  const live = document.getElementById('studio-live');
  if (!live) return;
  live.textContent = '';
  window.setTimeout(() => { live.textContent = message; }, 40);
}
let toastTimer: number | undefined;
export function toast(message: string) {
  let element = document.getElementById('studio-toast');
  if (!element) { element = h('div', { class: 'toast', attrs: { id: 'studio-toast', role: 'status' } }); document.body.append(element); }
  element.textContent = message; element.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { element!.hidden = true; }, 3200);
}

/* Modal dialogs use <dialog>, which traps focus, closes on Escape and returns focus to the opener. */
export interface DialogAction { label: string; kind?: 'primary' | 'danger' | 'plain'; run: () => void | boolean | Promise<void | boolean>; }
export interface DialogHandle { dialog: HTMLDialogElement; body: HTMLElement; status: HTMLElement; close: () => void; live: () => boolean; }
export function openDialog(options: { title: string; body?: Child[]; actions?: DialogAction[]; opener?: HTMLElement | null; wide?: boolean; onClose?: () => void }): DialogHandle {
  const titleId = `dlg-${crypto.randomUUID()}`;
  const status = h('p', { class: 'hint', attrs: { role: 'status' } });
  const body = h('div', { class: 'dlg-body' }, [...(options.body ?? []), status]);
  const dialog = h('dialog', { class: `studio-dialog${options.wide ? ' wide' : ''}`, attrs: { 'aria-labelledby': titleId } });
  const close = () => { if (dialog.open) dialog.close(); };
  const foot = h('div', { class: 'dlg-foot' });
  for (const action of options.actions ?? []) {
    const element = button(action.label, async () => {
      element.disabled = true;
      try { const result = await action.run(); if (result !== false) close(); }
      catch (error) { status.textContent = error instanceof Error ? error.message : 'That did not work. Try again.'; }
      finally { element.disabled = false; }
    }, { class: action.kind === 'primary' ? 'btn btn-primary' : action.kind === 'danger' ? 'btn btn-danger' : 'btn' });
    foot.append(element);
  }
  dialog.append(h('div', { class: 'dlg-head' }, [h('h2', { text: options.title, attrs: { id: titleId } }), button('Close', close, { iconOnly: true, icon: X })]), body, ...(options.actions?.length ? [foot] : []));
  document.body.append(dialog);
  dialog.addEventListener('close', () => { dialog.remove(); options.onClose?.(); if (options.opener?.isConnected) options.opener.focus(); }, { once: true });
  dialog.showModal();
  (dialog.querySelector<HTMLElement>('.dlg-body input, .dlg-body select, .dlg-body textarea, .dlg-body button, .dlg-foot .btn-primary') ?? dialog.querySelector<HTMLElement>('.dlg-head button'))?.focus();
  return { dialog, body, status, close, live: () => dialog.open && dialog.isConnected };
}
/** In-page confirmation. Resolves true only when the person chooses the confirming action. */
export function confirmAction(title: string, message: string, confirmLabel: string, opener?: HTMLElement | null, danger = false): Promise<boolean> {
  return new Promise(resolve => {
    let chosen = false;
    openDialog({ title, opener, body: [h('p', { text: message })], onClose: () => resolve(chosen), actions: [
      { label: 'Cancel', run: () => true },
      { label: confirmLabel, kind: danger ? 'danger' : 'primary', run: () => { chosen = true; return true; } },
    ] });
  });
}

/* A simple popup menu that closes on Escape, outside click, or choice, and returns focus to its button. */
export function openMenu(anchor: HTMLElement, items: { label: string; icon?: IconNode; danger?: boolean; run: () => void }[]) {
  document.querySelectorAll('.menu').forEach(menu => menu.remove());
  const menu = h('div', { class: 'menu', attrs: { role: 'menu' } });
  const close = (focus = true) => { menu.remove(); document.removeEventListener('pointerdown', outside, true); if (focus) anchor.focus(); };
  const outside = (event: Event) => { if (!menu.contains(event.target as Node) && event.target !== anchor) close(false); };
  for (const item of items) menu.append(h('button', { class: item.danger ? 'danger' : '', attrs: { type: 'button', role: 'menuitem' }, on: { click: () => { close(); item.run(); } } }, [item.icon ? icon(item.icon) : null, item.label]));
  menu.addEventListener('keydown', event => {
    const keys = event as KeyboardEvent, buttons = [...menu.querySelectorAll('button')], at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (keys.key === 'Escape') { keys.preventDefault(); close(); }
    else if (keys.key === 'ArrowDown') { keys.preventDefault(); buttons[(at + 1) % buttons.length]?.focus(); }
    else if (keys.key === 'ArrowUp') { keys.preventDefault(); buttons[(at - 1 + buttons.length) % buttons.length]?.focus(); }
    else if (keys.key === 'Tab') close(false);
  });
  document.body.append(menu);
  const rect = anchor.getBoundingClientRect();
  menu.style.top = `${Math.min(rect.bottom + 4, window.innerHeight - menu.offsetHeight - 8)}px`;
  menu.style.left = `${Math.max(8, Math.min(rect.right - menu.offsetWidth, window.innerWidth - menu.offsetWidth - 8))}px`;
  document.addEventListener('pointerdown', outside, true);
  menu.querySelector('button')?.focus();
}

/** Ask the browser to save a blob. */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = h('a', { attrs: { href: url, download: name } });
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
/** Choose a file with a temporary input, so file pickers work from any button. */
export function pickFile(accept: string): Promise<File | undefined> {
  return new Promise(resolve => {
    const input = h('input', { attrs: { type: 'file', accept, hidden: true } });
    input.addEventListener('change', () => { resolve(input.files?.[0]); input.remove(); }, { once: true });
    input.addEventListener('cancel', () => { resolve(undefined); input.remove(); }, { once: true });
    document.body.append(input); input.click();
  });
}
