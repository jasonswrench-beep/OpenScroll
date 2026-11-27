/**
 * The learner preview: the real player in a frame, at desktop, tablet (768 px) or phone (375 px) width, starting at
 * the lesson being edited. Practice progress stays in the preview. Closing returns focus to where the author was.
 */
import { Monitor, Tablet, Smartphone, RotateCcw, X } from 'lucide';
import type { PortableProject } from '../shared/course.js';
import { h, icon, button } from './dom.js';

const DEVICES = [['desktop', 'Desktop', Monitor], ['tablet', 'Tablet, 768 px', Tablet], ['phone', 'Phone, 375 px', Smartphone]] as const;
let lastDevice: (typeof DEVICES)[number][0] = 'desktop';

export function previewDialog(project: PortableProject, opener: HTMLElement, lessonId?: string) {
  if (document.querySelector('dialog.preview')) return;
  const snapshot = structuredClone(project), lessons = snapshot.document.course.sections.flatMap(s => s.lessons);
  let current = lessonId ?? lessons[0]?.id;
  const frame = h('iframe', { attrs: { title: 'Learner preview', sandbox: 'allow-scripts allow-same-origin allow-forms', src: '/player.html?preview=1' } });
  const viewport = h('div', { class: 'preview-stage', attrs: { 'data-device': lastDevice } }, [h('div', { class: 'preview-frame' }, [frame])]);
  const send = () => frame.contentWindow?.postMessage({ type: 'openscroll:preview-project', project: snapshot, lessonId: current }, location.origin);
  const ready = (event: MessageEvent) => { if (event.source === frame.contentWindow && event.origin === location.origin && event.data?.type === 'openscroll:preview-ready') send(); };
  window.addEventListener('message', ready);
  const devices = h('div', { class: 'seg', attrs: { role: 'group', 'aria-label': 'Preview width' } }, DEVICES.map(([key, label, glyph]) => {
    const b = h('button', { class: 'seg-btn', attrs: { type: 'button', 'aria-pressed': String(key === lastDevice), title: label } }, [icon(glyph), h('span', { class: 'seg-text', text: label })]);
    b.addEventListener('click', () => { lastDevice = key; viewport.dataset.device = key; devices.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
    return b;
  }));
  const jump = h('select', { class: 'inp', attrs: { 'aria-label': 'Start the preview at lesson' } });
  lessons.forEach((l, i) => jump.add(new Option(`${i + 1}. ${l.title || 'Untitled lesson'}`, l.id, false, l.id === current)));
  jump.addEventListener('change', () => { current = jump.value; send(); });
  const dialog = h('dialog', { class: 'preview', attrs: { 'aria-labelledby': 'preview-heading' } });
  const close = button('Back to editing', () => dialog.close(), { icon: X, class: 'btn btn-primary' });
  dialog.append(
    h('div', { class: 'preview-bar' }, [
      h('h2', { text: 'Preview', attrs: { id: 'preview-heading' } }),
      devices, jump,
      button('Restart', () => send(), { icon: RotateCcw, class: 'btn', label: 'Restart the preview with fresh progress' }),
      h('span', { class: 'grow' }), close,
    ]),
    h('p', { class: 'hint preview-note', text: 'This is the learner view of your current edits, including My workbook. Progress here is practice only and is discarded when you close.' }),
    viewport,
  );
  document.body.append(dialog);
  dialog.addEventListener('close', () => { window.removeEventListener('message', ready); dialog.remove(); if (opener.isConnected) opener.focus(); }, { once: true });
  dialog.showModal();
  close.focus();
}
