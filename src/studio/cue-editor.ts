/**
 * The timed cue editor (foundation F5): a list of times kept in step with a video preview. Each cue's time can be
 * typed (1:23.5 or 83.5) or taken from the video's current position; "Play from here" jumps the preview to it.
 * Used for captions, audio descriptions, chapters and checkpoints. Cues are kept in time order.
 */
import { Plus, Trash2, Play, Clock } from 'lucide';
import { h, button } from './dom.js';

export interface Cue { start: number; end?: number; text: string }
export interface CueEditorOptions<T extends Cue> {
  src?: string; cues: T[]; withEnd: boolean; noun: string; textLabel: string; multiline?: boolean; max: number; textMax?: number;
  make: (start: number) => T; change: (cues: T[]) => void; extra?: (cue: T, index: number, update: (patch: Partial<T>) => void) => HTMLElement[];
}
export const formatTime = (seconds: number) => { const m = Math.floor(seconds / 60), s = seconds - m * 60; return `${m}:${s.toFixed(1).padStart(4, '0')}`; };
export function parseTime(text: string): number | undefined {
  const value = text.trim();
  const match = /^(?:(\d+):)?(\d+(?:\.\d+)?)$/.exec(value);
  if (!match) return undefined;
  const seconds = (match[1] ? Number(match[1]) * 60 : 0) + Number(match[2]);
  return Number.isFinite(seconds) && seconds <= 86400 ? Math.round(seconds * 10) / 10 : undefined;
}
let counter = 0;

export function cueEditor<T extends Cue>(options: CueEditorOptions<T>): HTMLElement {
  const name = `cue-${++counter}`;
  let cues = options.cues.map(c => ({ ...c }));
  const video = options.src ? h('video', { attrs: { src: options.src, controls: true, preload: 'metadata', 'aria-label': `Video preview for ${options.noun.toLowerCase()} times` } }) : undefined;
  const now = () => Math.round((video?.currentTime ?? 0) * 10) / 10;
  const list = h('ol', { class: 'cues' });
  const status = h('p', { class: 'sr-only', attrs: { role: 'status' } });
  const commit = (message?: string) => { cues.sort((a, b) => a.start - b.start); options.change(cues.map(c => ({ ...c }))); draw(); if (message) status.textContent = message; };
  const timeField = (label: string, value: number, set: (seconds: number) => void) => {
    const id = `${name}-${label.replace(/\W+/g, '-')}`, input = h('input', { class: 'inp cue-time', attrs: { id, value: formatTime(value), inputmode: 'decimal', 'aria-describedby': `${name}-help` } });
    input.addEventListener('change', () => { const seconds = parseTime(input.value); if (seconds === undefined) { input.value = formatTime(value); status.textContent = 'Type a time such as 1:23.5 or 83.5.'; return; } set(seconds); });
    const fill = video ? button(`Use the video's current time for ${label.toLowerCase()}`, () => set(now()), { iconOnly: true, icon: Clock }) : null;
    return h('div', { class: 'fld cue-fld' }, [h('label', { text: label.replace(/^.*?(Start|End|Time)/, '$1'), attrs: { for: id } }), h('div', { class: 'row' }, [input, fill])]);
  };
  function draw() {
    list.replaceChildren(...cues.map((cue, index) => {
      const label = `${options.noun} ${index + 1}`;
      const update = (patch: Partial<T>) => { Object.assign(cue, patch); if (cue.end !== undefined && cue.end <= cue.start) cue.end = Math.round((cue.start + 2) * 10) / 10; commit(); };
      const text = options.multiline ? h('textarea', { class: 'inp', attrs: { rows: 2, maxlength: options.textMax ?? 5000, 'aria-label': `${label} ${options.textLabel.toLowerCase()}` } }) : h('input', { class: 'inp', attrs: { maxlength: options.textMax ?? 300, 'aria-label': `${label} ${options.textLabel.toLowerCase()}` } });
      text.value = cue.text;
      text.addEventListener('change', () => { cue.text = text.value; commit(); });
      return h('li', { class: 'item cue' }, [
        h('div', { class: 'item-head' }, [h('span', { class: 'item-name', text: `${label} · ${formatTime(cue.start)}` }),
          video ? button(`Play ${label.toLowerCase()}`, () => { video.currentTime = cue.start; void video.play().catch(() => undefined); }, { iconOnly: true, icon: Play }) : null,
          button(`Remove ${label.toLowerCase()}`, () => { cues.splice(index, 1); commit(`${label} removed.`); }, { iconOnly: true, icon: Trash2 })]),
        h('div', { class: 'row' }, [timeField(`${label} Start`, cue.start, seconds => update({ start: seconds } as Partial<T>)), ...(options.withEnd && cue.end !== undefined ? [timeField(`${label} End`, cue.end, seconds => update({ end: seconds } as Partial<T>))] : [])]),
        text,
        ...(options.extra ? options.extra(cue, index, update) : []),
      ]);
    }));
  }
  draw();
  const add = button(`Add ${options.noun.toLowerCase()}${video ? ' at the current time' : ''}`, () => {
    if (cues.length >= options.max) return;
    cues.push(options.make(now())); commit(`${options.noun} added at ${formatTime(now())}.`);
    list.querySelector<HTMLElement>(`li:nth-child(${cues.findIndex(c => c.start === now()) + 1}) input:not(.cue-time), li:nth-child(${cues.findIndex(c => c.start === now()) + 1}) textarea`)?.focus();
  }, { icon: Plus, class: 'btn btn-sm' });
  return h('div', { class: 'cue-editor' }, [video ?? null, h('p', { class: 'hint', attrs: { id: `${name}-help` }, text: video ? 'Play or scrub the preview, then add a cue or use the clock button to take the current time. Times look like 1:23.5.' : 'Upload the video to set times from it. Times look like 1:23.5.' }), list, add, status]);
}
