/** Library: every course the author owns, with resume, search, sort, grid or list, and per-course actions. */
import { Plus, Search, LayoutGrid, List, Ellipsis, FolderOpen, Upload, FilePlus, LayoutTemplate, Pencil, Copy, Download, Trash2, Play, RotateCcw } from 'lucide';
import type { Account } from '../client/account-api.js';
import { chooseCourseTemplate } from '../client/reusable-content.js';
import { library, projects, fileName, type CourseSummary, type SortKey } from './api.js';
import { h, icon, button, openDialog, confirmAction, openMenu, toast, announce, saveBlob, pickFile } from './dom.js';
import { riseReportDialog } from './rise-report.js';
import { lastOpened, forgetLastOpened } from './memory.js';

interface Context { account: Account; open: (id: string, lessonId?: string) => void; rail: () => HTMLElement; }
const VIEW_KEY = 'openscroll-studio:library-view';
const readView = () => { try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'; } catch { return 'grid'; } };

export function libraryView(root: HTMLElement, context: Context) {
  let search = '', sort: SortKey = 'updated', view = readView(), generation = 0, courses: CourseSummary[] = [], timer: number | undefined;
  const main = h('main', { class: 'lib', attrs: { id: 'studio-main', tabindex: -1 } });
  root.replaceChildren(h('div', { class: 'shell' }, [context.rail(), main]));
  const heading = h('h1', { text: 'Library', attrs: { tabindex: -1 } });
  const subtitle = h('p', { class: 'sub' });
  const status = h('p', { class: 'hint', attrs: { role: 'status' } });
  const list = h('ul', { class: `cards${view === 'list' ? ' list' : ''}`, attrs: { 'aria-label': 'Courses' } });
  const resume = h('div');
  const searchInput = h('input', { attrs: { id: 'library-search', type: 'search', placeholder: 'Search course titles', 'aria-label': 'Search courses', maxlength: 200 } });
  searchInput.addEventListener('input', () => { window.clearTimeout(timer); timer = window.setTimeout(() => { search = searchInput.value; void refresh(); }, 250); });
  const sortSelect = h('select', { class: 'inp', attrs: { id: 'library-sort', 'aria-label': 'Sort courses' } });
  for (const [value, label] of [['updated', 'Last edited'], ['created', 'Newest'], ['title', 'Title']] as const) sortSelect.add(new Option(label, value, false, value === sort));
  sortSelect.addEventListener('change', () => { sort = sortSelect.value as SortKey; void refresh(); });
  const viewButtons = (['grid', 'list'] as const).map(kind => button(kind === 'grid' ? 'Grid' : 'List', () => {
    view = kind; try { localStorage.setItem(VIEW_KEY, kind); } catch { /* the choice lasts for this visit */ }
    list.classList.toggle('list', kind === 'list'); for (const b of viewButtons) b.setAttribute('aria-pressed', String(b.dataset.kind === kind));
  }, { iconOnly: true, icon: kind === 'grid' ? LayoutGrid : List, class: '', attrs: { 'data-kind': kind, 'aria-pressed': String(view === kind) } }));
  const openOrImport = button('Open or import', event => openMenu(event.currentTarget as HTMLElement, [
    { label: 'Open an .openscroll project', icon: FolderOpen, run: () => void openProjectFile(openOrImport) },
    { label: 'Import a Rise 360 web export', icon: Upload, run: () => void importRise(openOrImport) },
  ]), { icon: FolderOpen, attrs: { 'aria-haspopup': 'menu' } });
  const newCourse = button('New course', () => newCourseDialog(newCourse), { icon: Plus, class: 'btn btn-primary' });
  main.append(h('div', { class: 'lib-in' }, [
    h('header', { class: 'lib-head' }, [h('div', {}, [heading, subtitle]), h('div', { class: 'row' }, [openOrImport, newCourse])]),
    resume,
    h('div', { class: 'lib-tools' }, [h('label', { class: 'search' }, [icon(Search), searchInput]), sortSelect, h('div', { class: 'seg', attrs: { role: 'group', 'aria-label': 'Layout' } }, viewButtons)]),
    status, list,
  ]));

  async function refresh() {
    const current = ++generation;
    status.textContent = 'Loading your courses…';
    try {
      const result = await library.list(search, sort);
      if (current !== generation) return;
      courses = result.courses;
      draw();
      status.textContent = courses.length ? '' : search ? `No courses match “${search}”.` : '';
      subtitle.textContent = `${courses.length} ${courses.length === 1 ? 'course' : 'courses'}${search ? ' found' : ''} · private to you`;
    } catch (error) {
      if (current !== generation) return;
      status.replaceChildren(document.createTextNode(`${error instanceof Error ? error.message : 'Your courses could not be loaded.'} `), button('Retry', () => void refresh(), { icon: RotateCcw }));
    }
  }
  function draw() {
    list.replaceChildren(h('li', {}, [h('button', { class: 'newtile', attrs: { type: 'button' }, on: { click: event => newCourseDialog(event.currentTarget as HTMLElement) } }, [icon(Plus), 'New course', h('small', { text: 'Blank, template, or import' })])]));
    for (const course of courses) list.append(card(course));
    drawResume();
  }
  function thumb(course: CourseSummary) {
    const box = h('span', { class: 'thumb' });
    if (course.accent) box.style.setProperty('--course-accent', course.accent);
    if (course.cover_asset) box.append(h('img', { attrs: { src: library.assetUrl(course.id, course.cover_asset), alt: '', loading: 'lazy', decoding: 'async' } }));
    else box.append(h('span', { class: 'initial', text: (course.title.trim()[0] ?? '?').toUpperCase(), attrs: { 'aria-hidden': 'true' } }));
    return box;
  }
  function card(course: CourseSummary) {
    const title = course.title || 'Untitled course';
    const more = button(`More actions for ${title}`, event => openMenu(event.currentTarget as HTMLElement, [
      { label: 'Open', icon: FolderOpen, run: () => context.open(course.id) },
      { label: 'Rename', icon: Pencil, run: () => renameDialog(course, more) },
      { label: 'Duplicate', icon: Copy, run: () => void duplicate(course) },
      { label: 'Download project', icon: Download, run: () => void download(course) },
      { label: 'Delete', icon: Trash2, danger: true, run: () => void remove(course, more) },
    ]), { iconOnly: true, icon: Ellipsis, class: 'ibtn more', attrs: { 'aria-haspopup': 'menu' } });
    // The title button is the keyboard and screen reader target; the cover repeats it for pointer users.
    const cover = h('button', { class: 'thumb-button', attrs: { type: 'button', tabindex: -1, 'aria-hidden': 'true' }, on: { click: () => context.open(course.id) } }, [thumb(course)]);
    const swatch = h('span', { class: 'swatch', attrs: { 'aria-hidden': 'true' } });
    if (course.accent) swatch.style.setProperty('--course-accent', course.accent);
    return h('li', { class: 'card' }, [
      cover,
      h('div', { class: 'card-body' }, [
        h('h2', {}, [h('button', { text: title, attrs: { type: 'button' }, on: { click: () => context.open(course.id) } })]),
        h('div', { class: 'meta' }, [course.lessons !== undefined ? `${course.lessons} ${course.lessons === 1 ? 'lesson' : 'lessons'}` : `${course.sections} sections`, course.blocks !== undefined ? h('span', { text: `· ${course.blocks} blocks` }) : null]),
        h('div', { class: 'meta' }, [swatch, h('span', { text: `Edited ${new Date(course.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` })]),
      ]),
      more,
    ]);
  }
  function drawResume() {
    const last = lastOpened(context.account.id);
    const course = last ? courses.find(c => c.id === last.id) : undefined;
    resume.replaceChildren();
    if (!last || !course || search) return;
    resume.append(h('section', { class: 'resume', attrs: { 'aria-label': 'Pick up where you left off' } }, [
      thumb(course),
      h('div', {}, [h('span', { class: 'eyebrow', text: 'Pick up where you left off' }), h('b', { text: last.lessonTitle || course.title || 'Untitled course' }), h('span', { class: 'meta', text: last.lessonTitle ? course.title : 'Course page' })]),
      button('Resume', () => context.open(course.id, last.lessonId), { icon: Play, class: 'btn btn-primary' }),
    ]));
  }
  function newCourseDialog(opener: HTMLElement) {
    const dialog = openDialog({ title: 'New course', opener, body: [h('div', { class: 'starts' }, [
      start(FilePlus, 'Blank course', 'A cover page and one empty lesson.', () => { dialog.close(); blankCourseDialog(opener); }),
      start(LayoutTemplate, 'From a template', 'OpenScroll starter courses you can adapt.', () => { dialog.close(); chooseCourseTemplate(opener); }),
      start(FolderOpen, 'Open a project', 'An .openscroll file from this or another installation.', () => { dialog.close(); void openProjectFile(opener); }),
      start(Upload, 'Import from Rise', 'A Rise 360 web export ZIP.', () => { dialog.close(); void importRise(opener); }),
    ])] });
  }
  function start(glyph: Parameters<typeof icon>[0], title: string, text: string, run: () => void) {
    return h('button', { class: 'start', attrs: { type: 'button' }, on: { click: run } }, [icon(glyph), h('b', { text: title }), h('small', { text })]);
  }
  function blankCourseDialog(opener: HTMLElement) {
    const input = h('input', { attrs: { id: 'new-course-title', required: true, maxlength: 300, value: 'Untitled course' } });
    const dialog = openDialog({ title: 'Blank course', opener, body: [h('label', { class: 'fld' }, [h('span', { text: 'Course title' }), input])], actions: [
      { label: 'Cancel', run: () => true },
      { label: 'Create course', kind: 'primary', run: async () => {
        const title = input.value.trim();
        if (!title) { dialog.status.textContent = 'Enter a course title.'; input.focus(); return false; }
        const created = await library.create(title); toast('Course created'); context.open(created.id); return true;
      } },
    ] });
    input.select();
  }
  async function openProjectFile(opener: HTMLElement) {
    const file = await pickFile('.openscroll');
    if (!file) return;
    status.textContent = 'Checking the project…';
    try {
      const project = await projects.open(file);
      const created = await library.importProject(project);
      toast(`${created.title || 'Project'} added to your library`); context.open(created.id);
    } catch (error) { status.textContent = `${error instanceof Error ? error.message : 'The project could not be opened.'} Your library is unchanged.`; opener.focus(); }
  }
  async function importRise(opener: HTMLElement) {
    const file = await pickFile('.zip,application/zip');
    if (!file) return;
    status.textContent = 'Importing the Rise course…';
    try {
      const result = await projects.importRise(file);
      status.textContent = '';
      riseReportDialog(result, opener, async () => { const created = await library.importProject(result.project); toast('Imported course saved to your library'); context.open(created.id); });
    } catch (error) { status.textContent = `${error instanceof Error ? error.message : 'The Rise export could not be imported.'} Your library is unchanged.`; opener.focus(); }
  }
  function renameDialog(course: CourseSummary, opener: HTMLElement) {
    const input = h('input', { attrs: { id: 'rename-course-title', required: true, maxlength: 300, value: course.title } });
    const dialog = openDialog({ title: 'Rename course', opener, body: [h('label', { class: 'fld' }, [h('span', { text: 'Course title' }), input])], actions: [
      { label: 'Cancel', run: () => true },
      { label: 'Rename', kind: 'primary', run: async () => {
        const title = input.value.trim();
        if (!title) { dialog.status.textContent = 'Enter a course title.'; return false; }
        await library.rename(course.id, title, course.revision); toast('Course renamed'); await refresh(); return true;
      } },
    ] });
    input.select();
  }
  async function duplicate(course: CourseSummary) {
    try { await library.duplicate(course.id); toast('Copy created'); announce(`A copy of ${course.title} was created.`); await refresh(); }
    catch (error) { toast(error instanceof Error ? error.message : 'The course could not be copied.'); }
  }
  async function download(course: CourseSummary) {
    try { saveBlob(await library.download(course.id), fileName(course.title, '.openscroll')); toast('Project download started'); }
    catch (error) { toast(error instanceof Error ? error.message : 'The project could not be downloaded.'); }
  }
  async function remove(course: CourseSummary, opener: HTMLElement) {
    const title = course.title || 'Untitled course';
    if (!await confirmAction('Delete course?', `“${title}” and its files and snapshots will be deleted permanently. Download the project first if you might want it later.`, 'Delete permanently', opener, true)) return;
    try {
      await library.remove(course.id, course.revision);
      forgetLastOpened(context.account.id, course.id);
      toast('Course deleted'); await refresh(); heading.focus();
    } catch (error) { toast(error instanceof Error ? error.message : 'The course could not be deleted.'); }
  }
  void refresh();
  heading.focus();
  return { id: undefined as string | undefined, leave: async () => true, update: () => {}, refresh };
}
