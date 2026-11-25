/**
 * The theme studio: every course-wide look setting beside a live preview of the cover and a sample lesson, with
 * the accent's contrast worked out so authors can see what learners will read.
 */
import type { PortableProject, CourseDocument } from '../shared/course.js';
import { prepareBlock } from '../shared/block-catalog.js';
import { renderBlock } from '../shared/block-renderer.js';
import { richToDom } from '../shared/rich-text.js';
import { contrast, accentInk, textAccent, formatRatio } from '../shared/contrast.js';
import { h, openDialog } from './dom.js';

type Theme = CourseDocument['course']['theme'];
export interface ThemeHost { project: () => PortableProject; edit: (change: (project: PortableProject) => void) => boolean; themeVars: (element: HTMLElement) => void; assetSource: (assetId: string) => string; changed: () => void }

const LAYOUTS: [Theme['coverLayout'], string][] = [['stacked', 'Image beside text'], ['split-left', 'Split, image left'], ['split-right', 'Split, image right'], ['two-thirds-left', 'Two-thirds image'], ['overlay', 'Image behind text'], ['centered', 'Centered, no image']];

/** Plain-language contrast notes for an accent colour. */
export function accentReport(accent: string) {
  const ink = accentInk(accent), buttons = contrast(accent, ink), text = textAccent(accent), onWhite = contrast(accent, '#ffffff');
  return {
    buttons: `Buttons and accent bands use ${ink === '#ffffff' ? 'white' : 'dark'} text: ${formatRatio(buttons)}${buttons >= 4.5 ? ', which passes.' : buttons >= 3 ? ', enough for large text only.' : '. Choose a stronger accent.'}`,
    text: onWhite >= 4.5 ? `Accent text on white: ${formatRatio(onWhite)}, which passes.` : `The accent is too light for text on white (${formatRatio(onWhite)}), so headings and links use a darker shade (${text}).`,
    ok: buttons >= 4.5,
  };
}

export function themeStudio(opener: HTMLElement, host: ThemeHost) {
  const samples = ['subheading', 'paragraph', 'note', 'quote', 'single-choice', 'continue'].map(key => prepareBlock(key, host.project()).block);
  const preview = h('div', { class: 'theme-preview', attrs: { 'aria-label': 'Live preview', role: 'region', tabindex: 0 } });
  const report = h('div', { class: 'theme-report', attrs: { 'aria-live': 'polite' } });
  const theme = () => host.project().document.course.theme;
  const change = (apply: (theme: Theme, course: CourseDocument['course']) => void) => { if (host.edit(p => apply(p.document.course.theme, p.document.course))) { draw(); host.changed(); } };
  const radios = <T extends string>(name: string, legend: string, options: [T, string][], value: () => T, apply: (theme: Theme, value: T) => void) => {
    const set = h('fieldset', { class: 'theme-set' }, [h('legend', { text: legend })]);
    for (const [key, label] of options) {
      const id = `theme-${name}-${key}`, input = h('input', { attrs: { type: 'radio', name: `theme-${name}`, id, value: key } });
      input.checked = value() === key;
      input.addEventListener('change', () => { if (input.checked) change(t => apply(t, key)); });
      set.append(h('div', { class: 'theme-opt' }, [input, h('label', { attrs: { for: id }, text: label })]));
    }
    return set;
  };
  const color = h('input', { attrs: { id: 'theme-accent', type: 'color', value: theme().accentColor, 'aria-label': 'Pick the accent colour' } });
  const hex = h('input', { class: 'inp', attrs: { id: 'theme-accent-hex', value: theme().accentColor, maxlength: 7, spellcheck: 'false', 'aria-describedby': 'theme-accent-help' } });
  const setAccent = (value: string) => { if (/^#[0-9a-f]{6}$/i.test(value)) change(t => { t.accentColor = value.toLowerCase(); }); };
  color.addEventListener('input', () => { hex.value = color.value; setAccent(color.value); });
  hex.addEventListener('change', () => { const value = hex.value.trim().startsWith('#') ? hex.value.trim() : `#${hex.value.trim()}`; if (/^#[0-9a-f]{6}$/i.test(value)) { color.value = value.toLowerCase(); setAccent(value); } else hex.value = theme().accentColor; });
  const navigation = h('select', { class: 'inp', attrs: { id: 'theme-navigation' } });
  for (const [key, label] of [['free', 'Learners open lessons in any order'], ['sequential', 'Learners finish each lesson before the next']] as const) navigation.add(new Option(label, key, false, host.project().document.course.settings.navigation === key));
  navigation.addEventListener('change', () => change((_, course) => { course.settings.navigation = navigation.value as 'free' | 'sequential'; }));
  const controls = h('div', { class: 'theme-controls' }, [
    h('div', { class: 'fld' }, [h('label', { text: 'Accent colour', attrs: { for: 'theme-accent-hex' } }), h('div', { class: 'row' }, [color, hex]), h('p', { class: 'hint', text: 'Six-digit hex, for example #087a82.', attrs: { id: 'theme-accent-help' } })]),
    report,
    radios('layout', 'Cover layout', LAYOUTS, () => theme().coverLayout, (t, v) => { t.coverLayout = v; }),
    radios('header', 'Lesson header', [['plain', 'Plain title'], ['image', 'Banner image over the title'], ['accent', 'Title in the accent colour']], () => theme().lessonHeader, (t, v) => { t.lessonHeader = v; }),
    radios('font', 'Body text', [['sans', 'Sans serif'], ['serif', 'Serif']], () => theme().font, (t, v) => { t.font = v; }),
    radios('width', 'Reading width', [['standard', 'Standard'], ['wide', 'Wide']], () => theme().pageWidth, (t, v) => { t.pageWidth = v; }),
    h('div', { class: 'fld' }, [h('label', { text: 'Lesson order', attrs: { for: 'theme-navigation' } }), navigation]),
  ]);
  function draw() {
    const project = host.project(), c = project.document.course, accent = c.theme.accentColor, notes = accentReport(accent);
    report.replaceChildren(h('p', { class: notes.ok ? 'ok' : 'warn-note', text: notes.buttons }), h('p', { class: 'hint', text: notes.text }));
    const paper = h('article', { class: `paper theme-paper${c.theme.pageWidth === 'wide' ? ' is-wide' : ''}` });
    host.themeVars(paper);
    const cover = c.cover;
    paper.append(h('header', { class: `cover l-${c.theme.coverLayout}${cover ? '' : ' no-image'}` }, [
      h('div', { class: 'cimg' }, [cover ? h('img', { attrs: { src: host.assetSource(cover.assetId), alt: '' } }) : null]),
      h('div', { class: 'ctext' }, [h('div', { class: 'byline', text: c.author || 'Author name' }), h('h2', { class: 'ctitle', text: c.title || 'Untitled course' }), h('div', { class: 'cdesc' }, [richToDom(c.description)]), h('span', { class: 'start', text: 'Start course' })]),
    ]));
    const lesson = h('div', { class: 'theme-lesson' });
    if (c.theme.lessonHeader === 'image' && cover) lesson.append(h('figure', { class: 'lesson-banner' }, [h('img', { attrs: { src: host.assetSource(cover.assetId), alt: '' } })]));
    lesson.append(h('h2', { class: `lesson-h1${c.theme.lessonHeader === 'accent' ? ' is-accent' : ''}`, text: c.sections[0]?.lessons[0]?.title || 'A sample lesson' }));
    for (const block of samples) lesson.append(renderBlock(block, project));
    paper.append(lesson);
    preview.replaceChildren(paper);
  }
  draw();
  const dialog = openDialog({ title: 'Theme', opener, wide: true, body: [h('div', { class: 'theme-studio' }, [controls, preview])] });
  dialog.dialog.classList.add('theme-dialog');
  hex.focus();
}
