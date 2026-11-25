/**
 * The course page: the cover edited where learners see it, lessons and sections, course details and theme, honest
 * saving with recovery and conflict handling, and the lesson editor. All saving goes through the shared
 * SaveController and revision-checked API.
 */
import { ArrowUp, ArrowDown, ArrowLeft, Ellipsis, Pencil, Copy, Trash2, Plus, Eye, Package, CircleCheck, LoaderCircle, TriangleAlert, OctagonAlert, Camera, Download, RotateCcw, Settings2, ImagePlus, X as XIcon, Globe, GraduationCap, FileText, FileArchive, FolderInput } from 'lucide';
import type { Account } from '../client/account-api.js';
import { SaveController, type RecoveryDraft } from '../client/save-controller.js';
import { readDraft, storeDraft } from '../client/recovery.js';
import { bindInline, bindRich } from '../client/inline-text.js';
import { readImage } from '../client/images.js';
import { openSnapshots } from '../client/snapshots.js';
import { previewCourse, publishHtml, publishPdf } from '../client/publishing.js';
import { assetPath, type PortableProject, type CourseDocument } from '../shared/course.js';
import { newLesson, newSection, copyLesson, moveItem, moveLesson, type Lesson, type Section } from '../shared/outline.js';
import { richToDom, RICH_TEXT_MAX } from '../shared/rich-text.js';
import { library, projects, fileName } from './api.js';
import { h, icon, button, openDialog, confirmAction, openMenu, toast, announce, saveBlob, pickFile } from './dom.js';
import { rememberOpened } from './memory.js';
import { LessonEditor } from './lesson-editor.js';
import LOGO from '../assets/openscroll.svg';

type Course = CourseDocument['course'];
interface Context { account: Account; id: string; lessonId?: string; toLibrary: () => void; go: (lessonId?: string) => void; }

const INTERACTIVE = new Set(['accordion', 'tabs', 'flashcards', 'process', 'timeline', 'labeled-graphic']);
const SAVE_TEXT = { saved: 'Saved', pending: 'Changes pending', saving: 'Saving…', error: 'Save not confirmed', conflict: 'Conflict: saving paused' } as const;

export function courseView(root: HTMLElement, context: Context) {
  const owner = context.account.id, id = context.id;
  let controller: SaveController | undefined, candidate: RecoveryDraft | undefined, candidateConflict = false;
  let lessonId = context.lessonId, editor: LessonEditor | undefined, disposed = false;
  root.replaceChildren(h('div', { class: 'studio-loading', attrs: { role: 'status' } }, ['Opening course…']));

  const crumbs = h('nav', { class: 'crumbs', attrs: { 'aria-label': 'Location' } });
  const saveButton = h('button', { class: 'savebtn', attrs: { type: 'button', 'data-state': 'saved', 'aria-label': 'Save status, snapshots, and recovery' } });
  saveButton.addEventListener('click', () => saveSheet());
  const live = h('span', { class: 'sr-only', attrs: { role: 'status' } });
  const preview = button('Preview', () => { if (controller) previewCourse(controller.project, preview, lessonId); }, { icon: Eye, class: 'btn btn-ghost has-label' });
  const exporter = button('Export', () => exportDialog(exporter), { icon: Package, class: 'btn btn-primary has-label' });
  const top = h('header', { class: 'top' }, [
    h('div', { class: 'top-l' }, [h('button', { class: 'logo-btn', attrs: { type: 'button', 'aria-label': 'Back to library' }, on: { click: () => context.toLibrary() } }, [h('img', { attrs: { src: LOGO, alt: '' } })]), crumbs]),
    h('div', { class: 'top-r' }, [saveButton, live, h('span', { class: 'vsep' }), preview, exporter]),
  ]);
  const banners = h('div');
  const canvas = h('div');
  const desk = h('main', { class: 'desk', attrs: { id: 'studio-main', tabindex: -1 } }, [banners, canvas]);
  const side = h('aside', { class: 'side', attrs: { 'aria-label': 'Course details' } });
  const body = h('div', { class: 'ed-body' }, [desk, side]);
  const project = () => controller!.project;
  const course = () => project().document.course;
  const editable = () => !!controller && !candidate && controller.state !== 'conflict';
  const lessons = () => course().sections.flatMap(section => section.lessons);

  /* ---------- editing ---------- */
  function edit(change: (project: PortableProject) => void, assetsChanged = false): boolean {
    if (!controller || !editable()) { toast(candidate ? 'Restore or discard the recovered edits first.' : 'Saving is paused until the conflict is resolved.'); return false; }
    try { controller.edit(change, assetsChanged); return true; }
    catch (error) { toast(error instanceof Error ? error.message : 'That change could not be made.'); return false; }
  }
  function paintSave() {
    if (!controller) return;
    const state = controller.state;
    saveButton.dataset.state = state;
    saveButton.replaceChildren(icon(state === 'saved' ? CircleCheck : state === 'conflict' ? OctagonAlert : state === 'error' ? TriangleAlert : LoaderCircle), SAVE_TEXT[state]);
    if (live.textContent !== SAVE_TEXT[state] && (state === 'saved' || state === 'error' || state === 'conflict')) live.textContent = SAVE_TEXT[state];
    drawBanners();
  }
  function drawBanners() {
    if (!controller) return;
    banners.replaceChildren();
    if (candidate) banners.append(h('div', { class: 'banner warn', attrs: { role: 'region', 'aria-label': 'Recovered edits' } }, [
      icon(TriangleAlert),
      h('p', { text: candidateConflict ? 'This browser kept edits from an earlier visit, but the saved course has changed since. Restoring them puts the page in conflict so you can choose what to keep.' : 'This browser kept unsaved edits from an earlier visit.' }),
      button('Restore my edits', () => { if (!controller || !candidate) return; controller.restore(candidate, candidateConflict); candidate = undefined; redraw(); announce('Recovered edits restored.'); }, { class: 'btn btn-primary' }),
      button('Discard and use the saved course', async event => {
        if (!await confirmAction('Discard recovered edits?', 'The edits kept in this browser will be removed. The saved course stays as it is.', 'Discard edits', event.currentTarget as HTMLElement, true)) return;
        await storeDraft(owner, id, null).catch(() => undefined); candidate = undefined; redraw(); announce('Recovered edits discarded.');
      }),
    ]));
    if (controller.state === 'conflict') banners.append(h('div', { class: 'banner bad', attrs: { role: 'alert' } }, [
      icon(OctagonAlert),
      h('p', {}, [h('b', { text: 'This course changed in another tab or browser. ' }), 'Saving is paused so neither version is lost. Your edits are kept in this browser.']),
      button('Download my edits', () => void downloadEdits(), { icon: Download }),
      button('Save as a separate copy', () => void saveCopy(), { icon: Copy }),
      button('Reload saved course', async event => {
        if (!await confirmAction('Reload the saved course?', 'Your unsaved edits on this page will be replaced by the saved course. Download them first if you want to keep them.', 'Reload saved course', event.currentTarget as HTMLElement, true)) return;
        await storeDraft(owner, id, null).catch(() => undefined); controller?.dispose(); controller = undefined; await open(true);
      }, { icon: RotateCcw }),
    ]));
    else if (controller.state === 'error') banners.append(h('div', { class: 'banner warn', attrs: { role: 'region', 'aria-label': 'Save not confirmed' } }, [
      icon(TriangleAlert),
      h('p', { text: `${controller.error || 'Your latest changes are not confirmed yet.'} They are kept in this browser until the save succeeds.` }),
      button('Retry save', () => void controller?.save(), { icon: RotateCcw, class: 'btn btn-primary' }),
    ]));
    if (controller.recoveryWarning) banners.append(h('div', { class: 'banner warn' }, [icon(TriangleAlert), h('p', { text: 'This browser could not keep a recovery copy of your edits. Keep this page open until the course shows Saved.' })]));
    desk.inert = false;
    canvas.inert = !!candidate;
    side.inert = !!candidate || controller.state === 'conflict';
  }
  async function downloadEdits() {
    if (!controller) return;
    try { saveBlob(await projects.export(controller.project), fileName(course().title, '-my-edits.openscroll')); toast('Your edits are downloading'); }
    catch (error) { toast(error instanceof Error ? error.message : 'Your edits could not be downloaded.'); }
  }
  async function saveCopy() {
    if (!controller) return;
    try {
      const copy = structuredClone(controller.project);
      copy.document.course.title = `${course().title} (my copy)`.slice(0, 300);
      const created = await library.importProject(copy);
      toast('Saved as a separate copy');
      await storeDraft(owner, id, null).catch(() => undefined);
      controller.dispose(); controller = undefined;
      location.hash = `course=${created.id}`;
    } catch (error) { toast(error instanceof Error ? error.message : 'The copy could not be saved.'); }
  }

  /* ---------- top bar and save sheet ---------- */
  function drawCrumbs() {
    const lesson = lessonId ? lessons().find(l => l.id === lessonId) : undefined;
    const parts: Node[] = [button('Library', () => context.toLibrary(), { class: '' }), h('span', { class: 'sep', text: '/', attrs: { 'aria-hidden': 'true' } })];
    if (lesson) parts.push(button(course().title || 'Untitled course', () => context.go(undefined), { class: '' }), h('span', { class: 'sep', text: '/', attrs: { 'aria-hidden': 'true' } }), h('span', { class: 'here', text: lesson.title || 'Untitled lesson', attrs: { 'aria-current': 'page' } }));
    else parts.push(h('span', { class: 'here', text: course().title || 'Untitled course', attrs: { 'aria-current': 'page' } }));
    crumbs.replaceChildren(...parts);
  }
  function saveSheet() {
    if (!controller) return;
    const state = controller.state;
    const sheet = openDialog({ title: 'Saving and snapshots', opener: saveButton, body: [
      h('p', {}, [h('b', { text: `${SAVE_TEXT[state]}. ` }), state === 'saved' ? 'The server confirmed your latest change.' : state === 'conflict' ? 'Another tab or browser changed this course. Choose what to keep from the banner on the page.' : state === 'error' ? 'The server has not confirmed your latest change. Your edits stay in this browser.' : 'Your change is on its way to the server.']),
      h('ul', { class: 'notes' }, [
        h('li', {}, [h('b', { text: 'Changes pending' }), 'You edited something; it saves in a moment.']),
        h('li', {}, [h('b', { text: 'Saving' }), 'Your change is on its way to the server.']),
        h('li', {}, [h('b', { text: 'Saved' }), 'The server confirmed it. The label never says Saved before that.']),
        h('li', {}, [h('b', { text: 'Save not confirmed' }), 'The connection dropped or the server refused the change. A copy stays in this browser and Retry save appears.']),
        h('li', {}, [h('b', { text: 'Conflict' }), 'Another tab or browser changed the course. Saving pauses until you choose what to keep.']),
      ]),
      h('p', { class: 'hint', text: 'A snapshot is a named copy of the saved course and its files. It does not include changes still waiting to save.' }),
    ], actions: [
      { label: 'Download my edits', run: async () => { await downloadEdits(); return false; } },
      { label: 'Snapshots', run: () => { sheet.close(); openSnapshotsFor(saveButton); return true; } },
      { label: 'Save now', kind: 'primary', run: async () => { await controller?.save(); return true; } },
    ] });
  }
  function openSnapshotsFor(opener: HTMLElement) {
    if (!controller) return;
    const current = controller;
    openSnapshots(opener, { id, owner, controller: current, valid: () => controller === current && !disposed, changed: message => { redraw(); toast(message); } });
  }
  function exportDialog(opener: HTMLElement) {
    if (!controller) return;
    const status = h('p', { class: 'hint', attrs: { role: 'status' } });
    const option = (glyph: Parameters<typeof icon>[0], title: string, text: string, run: (button: HTMLButtonElement) => void) => {
      const element: HTMLButtonElement = h('button', { class: 'start', attrs: { type: 'button' }, on: { click: () => run(element) } }, [icon(glyph), h('b', { text: title }), h('small', { text })]);
      return element;
    };
    const snapshot = () => structuredClone(controller!.project);
    openDialog({ title: 'Export', opener, body: [
      h('p', { text: 'Exports use your current edits. Where will learners take this course?' }),
      h('div', { class: 'starts' }, [
        option(GraduationCap, 'LMS package: SCORM 1.2', 'Works in nearly every LMS, including Brightspace. Upload the ZIP as it is.', b => void publishHtml(snapshot(), status, b, 'scorm-12')),
        option(GraduationCap, 'LMS package: SCORM 2004', '4th edition. Reports completion and success separately where your LMS supports it.', b => void publishHtml(snapshot(), status, b, 'scorm-2004')),
        option(Globe, 'Website files', 'A ZIP you can put on any web server. No OpenScroll account needed to run it.', b => void publishHtml(snapshot(), status, b, 'html')),
        option(FileText, 'PDF document', 'A static reading copy, with an optional answer key.', b => publishPdf(snapshot(), status, b)),
        option(FileArchive, 'Editable project', 'An .openscroll file for backup or another OpenScroll installation.', () => void (async () => { try { saveBlob(await projects.export(snapshot()), fileName(course().title, '.openscroll')); status.textContent = 'Project download started.'; } catch (error) { status.textContent = error instanceof Error ? error.message : 'The project could not be exported.'; } })()),
      ]),
      status,
    ] });
  }

  /* ---------- the cover ---------- */
  function themeVars(element: HTMLElement) {
    const theme = course().theme, accent = theme.accentColor;
    const channel = (start: number) => { const c = parseInt(accent.slice(start, start + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
    element.style.setProperty('--c-accent', accent);
    element.style.setProperty('--c-ink', luminance > 0.179 ? '#1B1A1F' : '#ffffff');
    element.style.setProperty('--c-text-accent', luminance > 0.25 ? '#3d3d45' : accent);
    element.classList.toggle('serif', theme.font === 'serif');
  }
  function coverHtml(): HTMLElement {
    const c = course(), cover = c.cover;
    const layout = c.theme.coverLayout;
    const title = h('h1', { class: 'ctitle', text: c.title });
    bindInline(title, { key: 'title', label: 'Course title', max: 300, multiline: false }, text => { if (edit(p => { p.document.course.title = text; })) drawCrumbs(); }, () => {});
    const description = h('div', { class: 'cdesc' }, [richToDom(c.description, document, { editable: true })]);
    bindRich(description, { key: 'description', label: 'Course description', max: RICH_TEXT_MAX, multiline: true, rich: true }, html => { edit(p => { p.document.course.description = html; }); }, () => {});
    const byline = h('div', { class: 'byline' }, [c.authorImage ? h('img', { attrs: { src: library.assetUrl(id, c.authorImage.assetId), alt: '' } }) : null, c.author || 'Add an author name in Course details']);
    return h('header', { class: `cover l-${layout}${cover ? '' : ' no-image'}` }, [
      h('div', { class: 'cimg' }, [cover ? h('img', { attrs: { src: assetSource(cover.assetId), alt: cover.decorative ? '' : cover.altText } }) : null]),
      h('div', { class: 'ctext' }, [byline, title, description, h('button', { class: 'start', text: 'Start course', attrs: { type: 'button', disabled: true, title: 'Learners use this button. Try it in Preview.' } })]),
    ]);
  }
  /** New uploads exist only in the open project until saved, so they draw from memory; saved files load by URL. */
  function assetSource(assetId: string) {
    const asset = project().document.assets.find(a => a.id === assetId);
    const data = asset ? project().files[assetPath(asset)] : undefined;
    return asset && data ? `data:${asset.mediaType};base64,${data}` : library.assetUrl(id, assetId);
  }

  /* ---------- lessons and sections ---------- */
  function lessonMeta(lesson: Lesson) {
    const blocks = lesson.blocks.length, interactions = lesson.blocks.filter(b => INTERACTIVE.has(b.type)).length, questions = lesson.blocks.filter(b => b.type === 'assessment').length;
    return [`${blocks} ${blocks === 1 ? 'block' : 'blocks'}`, interactions ? `${interactions} ${interactions === 1 ? 'interaction' : 'interactions'}` : '', questions ? `${questions} ${questions === 1 ? 'question' : 'questions'}` : ''].filter(Boolean).join(' · ');
  }
  function outlineHtml(): HTMLElement {
    const c = course(), outline = h('section', { class: 'outline', attrs: { 'aria-labelledby': 'outline-heading' } }, [h('h2', { text: 'Lessons', attrs: { id: 'outline-heading', tabindex: -1 } })]);
    let number = 0;
    c.sections.forEach((section, sectionIndex) => {
      const showSection = c.sections.length > 1 || !!section.title;
      if (showSection) outline.append(sectionRow(section, sectionIndex));
      if (!section.lessons.length) outline.append(h('p', { class: 'hint', text: 'No lessons in this section yet.' }));
      section.lessons.forEach((lesson, lessonIndex) => outline.append(lessonRow(section, sectionIndex, lesson, lessonIndex, ++number)));
    });
    outline.append(h('div', { class: 'outline-add' }, [
      button('Add lesson', () => addLesson(c.sections.length - 1), { icon: Plus }),
      button('Add section', () => addSection(), { icon: Plus }),
    ]));
    return outline;
  }
  function sectionRow(section: Section, index: number) {
    const input = h('input', { attrs: { value: section.title, maxlength: 300, 'aria-label': `Section ${index + 1} title`, placeholder: 'Section title (optional)', 'data-focus': `section-${section.id}` } });
    input.addEventListener('input', () => { edit(p => { p.document.course.sections[index]!.title = input.value; }); });
    const total = course().sections.length;
    return h('div', { class: 'sec-row' }, [input,
      button(`Move section ${index + 1} up`, () => moveSection(index, -1), { iconOnly: true, icon: ArrowUp, disabled: index === 0, attrs: { 'data-focus': `section-up-${section.id}` } }),
      button(`Move section ${index + 1} down`, () => moveSection(index, 1), { iconOnly: true, icon: ArrowDown, disabled: index === total - 1, attrs: { 'data-focus': `section-down-${section.id}` } }),
      button(`Add a lesson to section ${index + 1}`, () => addLesson(index), { iconOnly: true, icon: Plus }),
      button(`Delete section ${index + 1}`, event => void deleteSection(index, event.currentTarget as HTMLElement), { iconOnly: true, icon: Trash2, disabled: total <= 1 }),
    ]);
  }
  function lessonRow(section: Section, sectionIndex: number, lesson: Lesson, lessonIndex: number, number: number) {
    const input = h('input', { attrs: { value: lesson.title, maxlength: 300, 'aria-label': `Lesson ${number} title`, 'data-focus': `lesson-${lesson.id}` } });
    input.addEventListener('input', () => { edit(p => { const target = p.document.course.sections[sectionIndex]!.lessons[lessonIndex]!; target.title = input.value; }); });
    const sections = course().sections;
    const more = button(`More actions for lesson ${number}`, event => openMenu(event.currentTarget as HTMLElement, [
      { label: 'Duplicate', icon: Copy, run: () => duplicateLesson(sectionIndex, lessonIndex) },
      ...(sections.length > 1 ? [{ label: 'Move to section…', icon: FolderInput, run: () => moveToSectionDialog(lesson, more) }] : []),
      { label: 'Delete', icon: Trash2, danger: true, run: () => void deleteLesson(sectionIndex, lessonIndex, more) },
    ]), { iconOnly: true, icon: Ellipsis, attrs: { 'aria-haspopup': 'menu', 'data-focus': `lesson-more-${lesson.id}` } });
    return h('div', { class: 'lesson-row' }, [
      h('span', { class: 'n', text: String(number), attrs: { 'aria-hidden': 'true' } }),
      h('div', {}, [input, h('div', { class: 'mm', text: lessonMeta(lesson) })]),
      h('div', { class: 'acts' }, [
        button('Edit lesson', () => context.go(lesson.id), { icon: Pencil, attrs: { 'data-focus': `lesson-edit-${lesson.id}`, 'aria-label': `Edit lesson ${number}: ${lesson.title || 'Untitled lesson'}` } }),
        button(`Move lesson ${number} up`, () => moveLessonBy(sectionIndex, lessonIndex, -1), { iconOnly: true, icon: ArrowUp, disabled: lessonIndex === 0, attrs: { 'data-focus': `lesson-up-${lesson.id}` } }),
        button(`Move lesson ${number} down`, () => moveLessonBy(sectionIndex, lessonIndex, 1), { iconOnly: true, icon: ArrowDown, disabled: lessonIndex === section.lessons.length - 1, attrs: { 'data-focus': `lesson-down-${lesson.id}` } }),
        more,
      ]),
    ]);
  }
  function redrawOutline(focus?: string) {
    const current = canvas.querySelector('.outline');
    if (current) current.replaceWith(outlineHtml());
    drawCrumbs();
    if (focus) {
      const target = canvas.querySelector<HTMLElement>(`[data-focus="${focus}"]`);
      if (target && !(target as HTMLButtonElement).disabled) target.focus();
      else canvas.querySelector<HTMLElement>(`[data-focus="${focus.replace(/-(up|down)-/, '-edit-')}"]`)?.focus();
    }
  }
  function addLesson(sectionIndex: number) {
    const lesson = newLesson();
    if (edit(p => { if (!p.document.course.sections.length) p.document.course.sections.push({ ...newSection(), title: '' }); p.document.course.sections[Math.max(0, sectionIndex)]!.lessons.push(lesson); })) {
      redrawOutline(`lesson-${lesson.id}`); canvas.querySelector<HTMLInputElement>(`[data-focus="lesson-${lesson.id}"]`)?.select(); announce('Lesson added.');
    }
  }
  function addSection() {
    const section = newSection();
    if (edit(p => { p.document.course.sections.push(section); })) { redrawOutline(`section-${section.id}`); canvas.querySelector<HTMLInputElement>(`[data-focus="section-${section.id}"]`)?.select(); announce('Section added.'); }
  }
  function moveSection(index: number, delta: -1 | 1) {
    const section = course().sections[index]!;
    if (edit(p => moveItem(p.document.course.sections, index, delta))) { redrawOutline(`section-${delta < 0 ? 'up' : 'down'}-${section.id}`); announce(`Section moved to position ${index + delta + 1}.`); }
  }
  function moveLessonBy(sectionIndex: number, lessonIndex: number, delta: -1 | 1) {
    const lesson = course().sections[sectionIndex]!.lessons[lessonIndex]!;
    if (edit(p => moveItem(p.document.course.sections[sectionIndex]!.lessons, lessonIndex, delta))) { redrawOutline(`lesson-${delta < 0 ? 'up' : 'down'}-${lesson.id}`); announce(`Lesson moved to position ${lessonIndex + delta + 1} in its section.`); }
  }
  function duplicateLesson(sectionIndex: number, lessonIndex: number) {
    const copy = copyLesson(course().sections[sectionIndex]!.lessons[lessonIndex]!);
    if (edit(p => { p.document.course.sections[sectionIndex]!.lessons.splice(lessonIndex + 1, 0, copy); })) { redrawOutline(`lesson-${copy.id}`); announce('Lesson duplicated.'); }
  }
  function moveToSectionDialog(lesson: Lesson, opener: HTMLElement) {
    const select = h('select', { attrs: { id: 'move-to-section' } });
    course().sections.forEach((section, i) => { if (!section.lessons.some(l => l.id === lesson.id)) select.add(new Option(section.title || `Section ${i + 1}`, section.id)); });
    openDialog({ title: 'Move lesson to section', opener, body: [h('label', { class: 'fld' }, [h('span', { text: 'Section' }), select])], actions: [
      { label: 'Cancel', run: () => true },
      { label: 'Move lesson', kind: 'primary', run: () => { if (edit(p => moveLesson(p.document, lesson.id, select.value))) { redrawOutline(`lesson-${lesson.id}`); announce('Lesson moved to the end of that section.'); } return true; } },
    ] });
  }
  async function deleteLesson(sectionIndex: number, lessonIndex: number, opener: HTMLElement) {
    const lesson = course().sections[sectionIndex]!.lessons[lessonIndex]!;
    if (!await confirmAction('Delete lesson?', `“${lesson.title || 'Untitled lesson'}” and its ${lesson.blocks.length} blocks will be removed from this course. Snapshots keep earlier saved versions.`, 'Delete lesson', opener, true)) return;
    if (edit(p => { p.document.course.sections[sectionIndex]!.lessons.splice(lessonIndex, 1); })) { redrawOutline(); canvas.querySelector<HTMLElement>('#outline-heading')?.focus(); announce('Lesson deleted.'); }
  }
  async function deleteSection(index: number, opener: HTMLElement) {
    const section = course().sections[index]!;
    const count = section.lessons.length;
    if (!await confirmAction('Delete section?', count ? `This section and its ${count} ${count === 1 ? 'lesson' : 'lessons'} will be removed from this course.` : 'This empty section will be removed.', 'Delete section', opener, true)) return;
    if (edit(p => { p.document.course.sections.splice(index, 1); })) { redrawOutline(); canvas.querySelector<HTMLElement>('#outline-heading')?.focus(); announce('Section deleted.'); }
  }

  /* ---------- course details ---------- */
  function field(label: string, control: HTMLElement) { return h('label', { class: 'fld' }, [h('span', { text: label }), control]); }
  function detailsHtml(): HTMLElement[] {
    const c = course();
    const text = (key: 'author' | 'language', label: string, max: number) => {
      const input = h('input', { attrs: { id: `course-${key}`, value: c[key], maxlength: max } });
      input.addEventListener('input', () => { if (key === 'language' && input.value.trim().length < 2) return; edit(p => { p.document.course[key] = key === 'language' ? input.value.trim() : input.value; }); if (key === 'author') redrawCover(); });
      return field(label, input);
    };
    const select = <T extends string>(idName: string, label: string, value: T, options: [T, string][], apply: (value: T, course: Course) => void, after?: () => void) => {
      const element = h('select', { attrs: { id: idName } });
      for (const [key, name] of options) element.add(new Option(name, key, false, key === value));
      element.addEventListener('change', () => { if (edit(p => apply(element.value as T, p.document.course))) after?.(); });
      return field(label, element);
    };
    const score = h('input', { attrs: { id: 'course-passing', type: 'number', min: 0, max: 100, step: 1, value: c.settings.passingScore } });
    score.addEventListener('change', () => { const value = Number(score.value); if (Number.isInteger(value) && value >= 0 && value <= 100) edit(p => { p.document.course.settings.passingScore = value; }); else score.value = String(course().settings.passingScore); });
    const accent = h('input', { attrs: { id: 'course-accent', type: 'color', value: c.theme.accentColor, 'aria-label': 'Accent color' } });
    accent.addEventListener('change', () => { if (edit(p => { p.document.course.theme.accentColor = accent.value.toLowerCase(); })) redrawCover(); });
    const cover = c.cover;
    const alt = h('input', { attrs: { id: 'cover-alt', value: cover?.altText ?? '', maxlength: 2000, disabled: !cover || cover.decorative, placeholder: 'Describe the image if it carries information' } });
    alt.addEventListener('input', () => { edit(p => { if (p.document.course.cover) p.document.course.cover.altText = alt.value; }); });
    const decorative = h('input', { class: 'tog', attrs: { id: 'cover-decorative', type: 'checkbox', checked: cover?.decorative ?? false, disabled: !cover } });
    decorative.addEventListener('change', () => { if (edit(p => { if (p.document.course.cover) p.document.course.cover.decorative = decorative.checked; })) { alt.disabled = decorative.checked; redrawCover(); } });
    const pick = button(cover ? 'Replace cover image' : 'Add a cover image', () => void chooseCover(pick), { icon: ImagePlus });
    return [
      h('div', { class: 'side-head' }, [h('span', { class: 'ico' }, [icon(Settings2)]), h('div', {}, [h('h2', { text: 'Course details' }), h('small', { text: 'Changes save automatically' })])]),
      h('div', { class: 'side-body' }, [
        text('author', 'Displayed author', 300), text('language', 'Language code (for example en or es)', 35),
        select('course-navigation', 'Lesson order', c.settings.navigation, [['free', 'Any order'], ['sequential', 'In sequence']], (value, target) => { target.settings.navigation = value; }),
        field('Pass mark for scored questions (%)', score),
        h('section', { class: 'side-sec' }, [h('h3', { text: 'Cover image' }),
          h('div', { class: 'thumbpick' }, [cover ? h('img', { attrs: { src: assetSource(cover.assetId), alt: '' } }) : h('span', { text: 'No cover image' })]),
          h('div', { class: 'row' }, [pick, cover ? button('Remove', () => { if (edit(p => { p.document.course.cover = null; })) { redraw(); toast('Cover image removed'); } }, { icon: XIcon }) : null]),
          field('Alternative text', alt),
          h('label', { class: 'switch' }, [h('span', {}, [h('b', { text: 'Decorative image' }), h('small', { text: 'Screen readers skip it.' })]), decorative]),
        ]),
        h('section', { class: 'side-sec' }, [h('h3', { text: 'Theme' }),
          field('Accent color', accent),
          select('course-cover-layout', 'Cover layout', c.theme.coverLayout, [['stacked', 'Image beside text'], ['split-left', 'Split, image left'], ['split-right', 'Split, image right'], ['two-thirds-left', 'Two-thirds image'], ['overlay', 'Image behind text'], ['centered', 'Centered, no image']], (value, target) => { target.theme.coverLayout = value; }, redrawCover),
          select('course-lesson-header', 'Lesson header', c.theme.lessonHeader, [['plain', 'Plain'], ['image', 'Image banner'], ['accent', 'Accent band']], (value, target) => { target.theme.lessonHeader = value; }),
          select('course-font', 'Body text', c.theme.font, [['sans', 'Sans serif'], ['serif', 'Serif']], (value, target) => { target.theme.font = value; }, redrawCover),
          select('course-width', 'Reading width', c.theme.pageWidth, [['standard', 'Standard'], ['wide', 'Wide']], (value, target) => { target.theme.pageWidth = value; }),
          h('p', { class: 'hint', text: 'The full theme studio, with font pairings and live preview, arrives with the new lesson editor.' }),
        ]),
      ]),
    ];
  }
  async function chooseCover(opener: HTMLElement) {
    const file = await pickFile('.png,.jpg,.jpeg,.webp');
    if (!file || !controller) return;
    try {
      const { asset, data } = await readImage(file, controller.project);
      if (edit(p => { p.document.assets.push(asset); p.files[assetPath(asset)] = data; p.document.course.cover = { assetId: asset.id, altText: '', decorative: false }; }, true)) { redraw(); toast('Cover image added. Add alternative text or mark it decorative.'); side.querySelector<HTMLElement>('#cover-alt')?.focus(); }
    } catch (error) { toast(error instanceof Error ? error.message : 'The image could not be added.'); opener.focus(); }
  }

  /* ---------- lesson editing ---------- */
  function lessonEditor() {
    editor ??= new LessonEditor({
      project: () => controller!.project,
      edit: (change, assetsChanged) => edit(change, assetsChanged),
      go: next => context.go(next),
      assetSource: assetId => assetSource(assetId),
      themeVars: element => themeVars(element),
      titleChanged: () => drawCrumbs(),
    });
    return editor;
  }

  /* ---------- drawing ---------- */
  function redrawCover() { const cover = canvas.querySelector('.cover'); if (cover) cover.replaceWith(coverHtml()); const paper = canvas.querySelector<HTMLElement>('.paper'); if (paper) themeVars(paper); }
  function redraw() {
    if (!controller || disposed) return;
    drawCrumbs();
    const lesson = lessonId ? lessons().find(l => l.id === lessonId) : undefined;
    if (lessonId && !lesson) { toast('That lesson no longer exists.'); lessonId = undefined; context.go(undefined); return; }
    if (lesson) {
      const lessons = lessonEditor();
      body.classList.add('lesson-mode'); side.hidden = false; side.setAttribute('aria-label', 'Lesson and block settings');
      lessons.show(lesson.id);
      canvas.replaceChildren(lessons.canvas);
      side.replaceChildren(lessons.panel);
      rememberOpened(owner, { id, title: course().title, lessonId: lesson.id, lessonTitle: lesson.title });
    } else {
      body.classList.remove('lesson-mode'); side.hidden = false; side.setAttribute('aria-label', 'Course details');
      const paper = h('article', { class: 'paper' }, [coverHtml(), outlineHtml()]);
      themeVars(paper);
      canvas.replaceChildren(paper);
      side.replaceChildren(...detailsHtml());
      rememberOpened(owner, { id, title: course().title });
    }
    paintSave();
  }
  async function open(discard = false) {
    try {
      const snapshot = await library.edit(id);
      const draft = discard ? undefined : await readDraft(owner, id).catch(() => undefined);
      if (disposed) return;
      candidate = draft;
      candidateConflict = !!draft && draft.revision !== snapshot.revision && !(draft.pending && draft.pending.payload.mutationId === snapshot.lastMutationId && draft.pending.payload.revision + 1 === snapshot.revision);
      controller = new SaveController({ project: snapshot.project, revision: snapshot.revision, send: payload => library.save(id, payload), persist: value => storeDraft(owner, id, value), changed: paintSave });
      root.replaceChildren(h('div', { class: 'ed' }, [top, body]));
      redraw();
      (lessonId ? canvas.querySelector<HTMLElement>('#lesson-title') : canvas.querySelector<HTMLElement>('.ctitle'))?.focus();
      if (candidate) announce('This browser kept unsaved edits from an earlier visit. Choose whether to restore them.');
    } catch (error) {
      if (disposed) return;
      root.replaceChildren(h('div', { class: 'studio-error', attrs: { role: 'alert' } }, [h('p', { text: error instanceof Error ? error.message : 'The course could not be opened.' }), h('div', { class: 'row' }, [button('Try again', () => void open(discard), { icon: RotateCcw, class: 'btn btn-primary' }), button('Back to library', () => context.toLibrary())])]));
    }
  }
  const beforeUnload = (event: BeforeUnloadEvent) => { if (controller?.dirty) { event.preventDefault(); event.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);
  void open();

  return {
    id,
    /** Same course, different lesson (or the course page): keep the open project and its saving. */
    update(next: { lessonId?: string }) {
      if (next.lessonId === lessonId) return;
      if (editor?.busy) { toast('Wait for the upload to finish first.'); context.go(lessonId); return; }
      lessonId = next.lessonId;
      redraw();
      (lessonId ? canvas.querySelector<HTMLElement>('#lesson-title') : canvas.querySelector<HTMLElement>(`[data-focus="lesson-edit-${lessons()[0]?.id}"]`) ?? canvas.querySelector<HTMLElement>('.ctitle'))?.focus();
      desk.scrollTop = 0;
    },
    async leave(): Promise<boolean> {
      if (editor?.busy) { toast('Wait for the upload to finish before leaving.'); return false; }
      if (controller?.dirty) {
        await controller.save().catch(() => undefined);
        if (controller.dirty && !await confirmAction('Leave this course?', 'Some changes are not confirmed yet. A recovery copy stays in this browser and is offered the next time you open the course.', 'Leave course', saveButton)) return false;
        await controller.keepDraft();
      }
      disposed = true; controller?.dispose();
      window.removeEventListener('beforeunload', beforeUnload);
      return true;
    },
  };
}
