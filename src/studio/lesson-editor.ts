/**
 * The studio lesson editor. The lesson is shown as learners see it, on the course's paper and theme, and its text
 * is edited in place. Each block has a small bar (select, move, duplicate, delete); "Add block" points sit between
 * blocks; the side panel shows the selected block's inspector, or the lesson's own settings when nothing is
 * selected. Every change goes through the course page's revision-checked saving, and block changes have undo.
 */
import { ArrowLeft, ArrowUp, ArrowDown, ArrowRight, Copy, Trash2, Plus, Undo2, Redo2, ImagePlus, X as XIcon } from 'lucide';
import { assetPath, COLUMN_CHILD_TYPES, OBJECTIVE_LEVELS, type Block, type PortableProject, type Lesson } from '../shared/course.js';
import { prepareBlock, duplicateBlock, switchVariant } from '../shared/block-catalog.js';
import { renderBlock, type TextField } from '../shared/block-renderer.js';
import { setBlockValue } from '../shared/block-values.js';
import { LessonHistory } from '../shared/lesson-history.js';
import { newId } from '../shared/outline.js';
import { OBJECTIVE_LEVEL_NAMES } from '../shared/objectives.js';
import { bindInline, bindRich, caretAtEnd } from '../client/inline-text.js';
import { readImage } from '../client/images.js';
import { readMedia } from '../client/media.js';
import { h, icon, button, toast, announce, pickFile } from './dom.js';
import { chooseBlock, blockName, blockIcon } from './block-picker.js';
import { inspectorPanel, type Tab, type UploadKind } from './inspector.js';

export interface LessonEditorHost {
  project: () => PortableProject;
  edit: (change: (project: PortableProject) => void, assetsChanged?: boolean) => boolean;
  go: (lessonId?: string) => void;
  assetSource: (assetId: string) => string;
  themeVars: (element: HTMLElement) => void;
  titleChanged: () => void;
}
interface Located { block: Block; list: Block[]; index: number; parent?: Extract<Block, { type: 'columns' }>; column?: number }
type Columns = Extract<Block, { type: 'columns' }>;

/** Finds a block by id at the top of a lesson or inside a column. */
function locate(blocks: Block[], id: string): Located | undefined {
  for (const [index, block] of blocks.entries()) {
    if (block.id === id) return { block, list: blocks, index };
    if (block.type === 'columns') for (const [column, cell] of block.content.columns.entries()) {
      const at = cell.blocks.findIndex(b => b.id === id);
      if (at >= 0) return { block: cell.blocks[at]!, list: cell.blocks as Block[], index: at, parent: block, column };
    }
  }
  return undefined;
}
const INTERACTIVE = new Set(['accordion', 'tabs', 'flashcards', 'process', 'timeline', 'labeled-graphic']);

export class LessonEditor {
  readonly canvas = h('div', { class: 'lesson-pane' });
  readonly panel = h('div', { class: 'lesson-side' });
  private lessonId = '';
  private selected: string | undefined;
  private tab: Tab = 'content';
  private marker = 0;
  private histories = new Map<string, LessonHistory>();
  private uploads = 0;
  private status = h('p', { class: 'sr-only', attrs: { role: 'status' } });
  private undoButton = button('Undo', () => this.travel('undo'), { iconOnly: true, icon: Undo2, label: 'Undo block change' });
  private redoButton = button('Redo', () => this.travel('redo'), { iconOnly: true, icon: Redo2, label: 'Redo block change' });

  constructor(private host: LessonEditorHost) {
    this.canvas.addEventListener('keydown', event => this.keys(event));
    this.panel.addEventListener('keydown', event => this.keys(event));
  }
  get busy() { return this.uploads > 0; }
  private get lesson(): Lesson | undefined { return this.host.project().document.course.sections.flatMap(s => s.lessons).find(l => l.id === this.lessonId); }
  private get blocks(): Block[] { return this.lesson?.blocks ?? []; }
  private history() { let value = this.histories.get(this.lessonId); if (!value) { value = new LessonHistory(); this.histories.set(this.lessonId, value); } return value; }
  private say(message: string) { this.status.textContent = ''; window.setTimeout(() => { this.status.textContent = message; }, 30); }

  show(lessonId: string) {
    if (lessonId !== this.lessonId) { this.history().breakGroup(); this.selected = undefined; this.tab = 'content'; this.marker = 0; }
    this.lessonId = lessonId;
    this.render();
  }
  focusTitle() { this.canvas.querySelector<HTMLElement>('#lesson-title')?.focus(); }
  /** Go to issue: selects the block, opens the right inspector tab and focuses the field the issue names. */
  focusIssue(issue: { blockId?: string; field?: string; tab?: Tab }) {
    if (!issue.blockId) {
      this.select(undefined);
      const target = issue.field === 'banner-alt' ? this.panel.querySelector<HTMLElement>('#banner-alt') : issue.field === 'lesson-title' ? this.canvas.querySelector<HTMLElement>('#lesson-title') : undefined;
      (target ?? this.panel.querySelector<HTMLElement>('#lesson-panel-heading'))?.focus();
      return;
    }
    if (!locate(this.blocks, issue.blockId)) return;
    this.tab = issue.tab ?? 'content';
    this.selected = undefined;
    this.select(issue.blockId);
    const frame = this.canvas.querySelector<HTMLElement>(`[data-frame="${CSS.escape(issue.blockId)}"]`);
    frame?.scrollIntoView({ block: 'center' });
    const field = issue.field && issue.field !== 'altText' ? frame?.querySelector<HTMLElement>(`[data-field="${CSS.escape(issue.field)}"]`) : null;
    if (field) { field.focus(); caretAtEnd(field); return; }
    if (issue.field === 'altText') { this.panel.querySelector<HTMLElement>('.tabpanel textarea')?.focus(); return; }
    this.panel.querySelector<HTMLElement>('#insp-heading')?.focus();
  }

  /* ---------- changes ---------- */
  private mutate(change: (blocks: Block[], project: PortableProject) => void, group?: string, assetsChanged = false) {
    const before = structuredClone(this.blocks), lessonId = this.lessonId;
    const applied = this.host.edit(project => {
      const lesson = project.document.course.sections.flatMap(s => s.lessons).find(l => l.id === lessonId);
      if (!lesson) throw new Error('This lesson is no longer available.');
      change(lesson.blocks, project);
    }, assetsChanged);
    if (applied) { this.history().record(before, this.blocks, group); this.paintHistory(); }
    return applied;
  }
  private changeBlock(id: string, mutate: (block: Block) => void, group?: string) {
    return this.mutate(blocks => { const found = locate(blocks, id); if (!found) throw new Error('This block is no longer available.'); mutate(found.block); }, group ? `${id}:${group}` : undefined);
  }
  private paintHistory() { this.undoButton.disabled = !this.history().canUndo; this.redoButton.disabled = !this.history().canRedo; }
  private travel(direction: 'undo' | 'redo') {
    if (this.busy) { toast('Wait for the file to finish loading first.'); return; }
    const lessonId = this.lessonId;
    const value = this.history()[direction](this.blocks, blocks => this.host.edit(project => { project.document.course.sections.flatMap(s => s.lessons).find(l => l.id === lessonId)!.blocks = blocks; }));
    if (!value) return;
    if (this.selected && !locate(this.blocks, this.selected)) this.selected = undefined;
    this.render(direction === 'undo' ? 'undo' : 'redo');
    this.say(direction === 'undo' ? 'Change undone.' : 'Change redone.');
  }
  private keys(event: KeyboardEvent) {
    if (event.isComposing || !(event.ctrlKey || event.metaKey)) return;
    const target = event.target as HTMLElement;
    if (target.matches('input, textarea, select')) return; // native undo inside form fields
    const key = event.key.toLowerCase();
    if (key === 'z' || key === 'y') { event.preventDefault(); this.travel(key === 'y' || event.shiftKey ? 'redo' : 'undo'); }
  }

  /* ---------- block operations ---------- */
  private insert(key: string, index: number, column?: { id: string; column: number }) {
    const project = this.host.project(), prepared = prepareBlock(key, project);
    const applied = this.mutate((blocks, target) => {
      if (prepared.asset) { target.document.assets.push(prepared.asset); target.files[assetPath(prepared.asset)] = prepared.data!; }
      if (column) { const parent = locate(blocks, column.id)?.block; if (parent?.type !== 'columns') throw new Error('The columns block is no longer available.'); (parent.content.columns[column.column]!.blocks as Block[]).splice(index, 0, prepared.block); }
      else blocks.splice(index, 0, prepared.block);
    }, undefined, !!prepared.asset);
    if (!applied) return;
    this.selected = prepared.block.id; this.tab = 'content';
    this.render();
    const field = this.canvas.querySelector<HTMLElement>(`[data-frame="${prepared.block.id}"] [data-field]`);
    if (field) { field.focus(); caretAtEnd(field); } else this.canvas.querySelector<HTMLElement>(`[data-focus="name-${prepared.block.id}"]`)?.focus();
    this.say(`${blockName(prepared.block)} added.`);
  }
  private openPicker(index: number, opener: HTMLElement) { chooseBlock(opener, { pick: key => this.insert(key, index) }); }
  private addToColumn(columnsId: string, column: number, opener: HTMLElement) {
    const parent = locate(this.blocks, columnsId)?.block as Columns | undefined;
    if (!parent) return;
    chooseBlock(opener, { title: `Add a block to column ${column + 1}`, allowed: t => (COLUMN_CHILD_TYPES as readonly string[]).includes(t.type), pick: key => this.insert(key, parent.content.columns[column]!.blocks.length, { id: columnsId, column }) });
  }
  private move(id: string, delta: -1 | 1) {
    if (this.mutate(blocks => { const found = locate(blocks, id); if (!found) return; const to = found.index + delta; if (to < 0 || to >= found.list.length) return; [found.list[found.index], found.list[to]] = [found.list[to]!, found.list[found.index]!]; })) {
      this.selected = id; this.render(`${delta < 0 ? 'up' : 'down'}-${id}`); this.say(`Moved ${delta < 0 ? 'up' : 'down'}.`);
    }
  }
  private moveColumn(id: string, delta: -1 | 1) {
    if (this.mutate(blocks => { const found = locate(blocks, id); if (!found?.parent || found.column === undefined) return; const to = found.column + delta; const target = found.parent.content.columns[to]; if (!target) return; found.list.splice(found.index, 1); (target.blocks as Block[]).push(found.block); })) {
      this.selected = id; this.render(`name-${id}`); this.say(`Moved to column ${(locate(this.blocks, id)?.column ?? 0) + 1}.`);
    }
  }
  private duplicate(id: string) {
    let copy: Block | undefined;
    if (this.mutate(blocks => { const found = locate(blocks, id); if (!found) return; copy = duplicateBlock(found.block); found.list.splice(found.index + 1, 0, copy); })) {
      this.selected = copy?.id; this.render(copy ? `name-${copy.id}` : undefined); this.say('Block duplicated.');
    }
  }
  private remove(id: string) {
    const found = locate(this.blocks, id); if (!found) return;
    const next = found.list[found.index + 1]?.id ?? found.list[found.index - 1]?.id ?? found.parent?.id;
    if (this.mutate(blocks => { const target = locate(blocks, id); target?.list.splice(target.index, 1); })) {
      this.selected = next; this.render(next ? `name-${next}` : 'add-end');
      toast(`${blockName(found.block)} deleted. Undo (Ctrl+Z) brings it back.`); this.say('Block deleted.');
    }
  }
  private variant(id: string, variant: string) {
    if (this.mutate(blocks => { const found = locate(blocks, id); if (found) found.list[found.index] = switchVariant(found.block, variant); })) { this.render(); this.say('Template changed. The content was kept.'); }
  }
  private select(id: string | undefined, redraw = true) {
    if (this.selected === id) return;
    this.selected = id; this.marker = 0;
    for (const frame of this.canvas.querySelectorAll<HTMLElement>('[data-frame]')) {
      const on = frame.dataset.frame === id;
      frame.classList.toggle('is-selected', on);
      frame.querySelector<HTMLElement>(':scope > .blk-bar .blk-name')?.setAttribute('aria-pressed', String(on));
    }
    if (redraw) this.drawPanel();
  }

  /* ---------- uploads ---------- */
  private async upload(file: File, kind: UploadKind, assign: (block: Block, assetId: string) => void, input: HTMLElement, id: string) {
    const lessonId = this.lessonId; this.uploads++; (input as HTMLButtonElement).disabled = true; this.say(kind === 'image' ? 'Reading the image…' : 'Reading the file…');
    try {
      const project = this.host.project(), result = kind === 'image' ? await readImage(file, project) : await readMedia(file, project, kind);
      if (this.lessonId !== lessonId) return;
      if (this.mutate((blocks, target) => { const found = locate(blocks, id); if (!found) throw new Error('This block is no longer available.'); assign(found.block, result.asset.id); target.document.assets.push(result.asset); target.files[assetPath(result.asset)] = result.data; }, undefined, true)) {
        this.render(); this.panel.querySelector<HTMLElement>('#insp-heading')?.focus();
        toast(kind === 'image' ? 'Image added. Check its alternative text on the Access tab.' : 'File added. Check its transcript and captions.');
      }
    } catch (error) { toast(error instanceof Error ? error.message : 'The file could not be added.'); }
    finally { this.uploads--; if (input.isConnected) (input as HTMLButtonElement).disabled = false; }
  }

  /* ---------- drawing ---------- */
  private render(focus?: string) {
    const lesson = this.lesson;
    if (!lesson) return;
    const scroller = this.canvas.closest('.desk');
    const top = scroller?.scrollTop ?? 0;
    this.drawCanvas(lesson);
    this.drawPanel();
    this.paintHistory();
    if (scroller) scroller.scrollTop = top;
    if (focus) {
      const target = focus === 'undo' ? this.undoButton : focus === 'redo' ? this.redoButton : this.canvas.querySelector<HTMLElement>(`[data-focus="${focus}"]`);
      if (target && !(target as HTMLButtonElement).disabled) target.focus();
      else this.canvas.querySelector<HTMLElement>(`[data-focus="${focus.replace(/^(up|down)-/, 'name-')}"]`)?.focus();
    }
  }
  private drawCanvas(lesson: Lesson) {
    const project = this.host.project(), all = project.document.course.sections.flatMap(s => s.lessons);
    const title = h('input', { class: 'inp lesson-title-input', attrs: { id: 'lesson-title', value: lesson.title, maxlength: 300, 'aria-label': 'Lesson title' } });
    title.addEventListener('input', () => { if (this.host.edit(p => { const target = p.document.course.sections.flatMap(s => s.lessons).find(l => l.id === lesson.id); if (target) target.title = title.value; })) { this.host.titleChanged(); const shown = this.canvas.querySelector('.lesson-h1'); if (shown) shown.textContent = title.value || 'Untitled lesson'; } });
    const switcher = h('select', { class: 'inp', attrs: { id: 'lesson-switch', 'aria-label': 'Go to lesson' } });
    all.forEach((l, i) => switcher.add(new Option(`${i + 1}. ${l.title || 'Untitled lesson'}`, l.id, false, l.id === lesson.id)));
    switcher.addEventListener('change', () => { if (this.busy) { switcher.value = lesson.id; toast('Wait for the file to finish loading first.'); return; } this.host.go(switcher.value); });
    const position = all.findIndex(l => l.id === lesson.id), previous = all[position - 1], next = all[position + 1];
    const addTop = button('Add block', event => { const at = this.selected ? (locate(this.blocks, this.selected)?.parent ? this.blocks.findIndex(b => b.id === locate(this.blocks, this.selected!)!.parent!.id) : this.blocks.findIndex(b => b.id === this.selected)) + 1 : this.blocks.length; this.openPicker(Math.max(0, at), event.currentTarget as HTMLElement); }, { icon: Plus, class: 'btn btn-primary' });
    const head = h('div', { class: 'lesson-head' }, [
      button('Back to course', () => { if (this.busy) { toast('Wait for the file to finish loading first.'); return; } this.host.go(undefined); }, { icon: ArrowLeft, class: 'btn btn-ghost' }),
      title,
      h('div', { class: 'lesson-nav' }, [
        button('Previous lesson', () => previous && this.host.go(previous.id), { iconOnly: true, icon: ArrowUp, disabled: !previous }),
        switcher,
        button('Next lesson', () => next && this.host.go(next.id), { iconOnly: true, icon: ArrowDown, disabled: !next }),
      ]),
      h('div', { class: 'lesson-tools' }, [this.undoButton, this.redoButton, addTop]),
    ]);

    const paper = h('article', { class: 'paper lesson-paper', attrs: { 'aria-label': 'Lesson page' } });
    this.host.themeVars(paper);
    const banner = this.bannerFigure(lesson);
    if (banner) paper.append(banner);
    paper.append(h('h1', { class: `lesson-h1${project.document.course.theme.lessonHeader === 'accent' ? ' is-accent' : ''}`, text: lesson.title || 'Untitled lesson' }));
    if (lesson.objectives.length && !lesson.blocks.some(b => b.type === 'objectives')) paper.append(h('section', { class: 'lesson-objectives' }, [h('h2', { text: 'In this lesson, you will' }), h('ul', {}, lesson.objectives.map(o => h('li', { text: o.text })))]));
    const list = h('ol', { class: 'blk-list', attrs: { 'aria-label': 'Blocks in this lesson' } });
    lesson.blocks.forEach((block, index) => { list.append(this.insertPoint(index)); list.append(this.frame(block, index, lesson.blocks.length, project)); });
    paper.append(list);
    if (!lesson.blocks.length) paper.append(h('div', { class: 'empty-lesson' }, [h('p', { text: 'This lesson is empty. Add a first block to start writing.' })]));
    paper.append(h('div', { class: 'add-end' }, [button('Add block', event => this.openPicker(this.blocks.length, event.currentTarget as HTMLElement), { icon: Plus, class: 'btn', attrs: { 'data-focus': 'add-end' } })]));
    this.canvas.replaceChildren(head, this.status, paper);
  }
  private insertPoint(index: number) {
    return h('li', { class: 'ins' }, [button(`Add a block at position ${index + 1}`, event => this.openPicker(index, event.currentTarget as HTMLElement), { iconOnly: true, icon: Plus, class: 'ins-btn' })]);
  }
  private bar(block: Block, label: string, index: number, count: number, extra: HTMLElement[] = [], shown = label) {
    const name = h('button', { class: 'blk-name', attrs: { type: 'button', 'aria-pressed': String(this.selected === block.id), 'data-focus': `name-${block.id}`, 'aria-label': shown === label ? null : label, title: `${label}. Select to see its settings.` }, on: { click: () => { this.select(block.id); this.panel.querySelector<HTMLElement>('#insp-heading')?.focus(); } } }, [icon(blockIcon(block)), h('span', { text: shown })]);
    return h('div', { class: 'blk-bar' }, [name, h('span', { class: 'grow' }), ...extra,
      button(`Move ${label} up`, () => this.move(block.id, -1), { iconOnly: true, icon: ArrowUp, disabled: index === 0, attrs: { 'data-focus': `up-${block.id}` } }),
      button(`Move ${label} down`, () => this.move(block.id, 1), { iconOnly: true, icon: ArrowDown, disabled: index === count - 1, attrs: { 'data-focus': `down-${block.id}` } }),
      button(`Duplicate ${label}`, () => this.duplicate(block.id), { iconOnly: true, icon: Copy }),
      button(`Delete ${label}`, () => this.remove(block.id), { iconOnly: true, icon: Trash2 }),
    ]);
  }
  private binder(block: Block) {
    return (element: HTMLElement, field: TextField) => {
      (field.rich ? bindRich : bindInline)(element, field, text => { this.changeBlock(block.id, target => setBlockValue(target, field.key, text), field.key); }, () => this.select(block.id));
      // Refresh the inspector after typing on the page, but never while focus is moving into the inspector itself:
      // redrawing then would replace the control being clicked.
      element.addEventListener('blur', event => {
        const next = (event as FocusEvent).relatedTarget as Node | null;
        if (this.selected !== block.id || (next && this.panel.contains(next))) return;
        window.setTimeout(() => { if (this.selected === block.id && !this.panel.contains(document.activeElement)) this.drawPanel(); }, 0);
      });
    };
  }
  private frame(block: Block, index: number, count: number, project: PortableProject): HTMLElement {
    const label = `${index + 1}. ${blockName(block)}`;
    const frame = h('li', { class: `blk${this.selected === block.id ? ' is-selected' : ''}`, attrs: { 'data-frame': block.id, 'data-block-id': block.id } });
    frame.addEventListener('pointerdown', event => { if (!(event.target as HTMLElement).closest('.blk-bar, [data-frame] [data-frame]') && !(event.target as HTMLElement).closest('.os-column')) this.select(block.id); });
    const body = renderBlock(block, project, block.type === 'columns' ? undefined : this.binder(block), id => this.host.assetSource(id));
    if (block.type === 'columns') this.columnsBody(block, body, project);
    if (block.type === 'spacer') body.append(h('p', { class: 'blk-note', text: `${block.variant[0]!.toUpperCase()}${block.variant.slice(1)} space` }));
    if (block.type === 'continue') body.append(h('p', { class: 'blk-note', text: block.completion === 'none' ? 'Learners can always continue.' : block.completion === 'previous' ? 'Unlocks when the block above is finished.' : 'Unlocks when every block above is finished.' }));
    const flags: HTMLElement[] = [];
    if ((block.type === 'reflection' || block.type === 'activity' || block.type === 'checklist' || block.type === 'self-assessment' || block.type === 'survey') && block.content.required) flags.push(h('span', { class: 'chip', text: 'Required' }));
    if (block.requiredInteraction) flags.push(h('span', { class: 'chip', text: 'Open every item' }));
    if (block.type === 'assessment' && block.assessment.graded) flags.push(h('span', { class: 'chip', text: `${block.assessment.points} pt` }));
    if ((block.type === 'image' || block.type === 'image-text' || block.type === 'labeled-graphic') && !block.content.decorative && !block.content.altText.trim()) flags.push(h('span', { class: 'chip chip-warn', text: 'No alt text' }));
    frame.append(this.bar(block, label, index, count, flags), h('div', { class: 'blk-body' }, [body]));
    return frame;
  }
  /** Columns get their child blocks drawn with their own small bars, plus an Add button per column. */
  private columnsBody(block: Columns, body: HTMLElement, project: PortableProject) {
    const cells = [...body.querySelectorAll<HTMLElement>(':scope > .os-columns > .os-column')];
    block.content.columns.forEach((column, c) => {
      const cell = cells[c]; if (!cell) return;
      const children = column.blocks.map((child, i) => {
        const label = `Column ${c + 1}, ${i + 1}. ${blockName(child)}`;
        const frame = h('div', { class: `blk blk-child${this.selected === child.id ? ' is-selected' : ''}`, attrs: { 'data-frame': child.id } });
        frame.addEventListener('pointerdown', event => { if (!(event.target as HTMLElement).closest('.blk-bar')) this.select(child.id); });
        const extra = [
          button(`Move ${label} to the column on the left`, () => this.moveColumn(child.id, -1), { iconOnly: true, icon: ArrowLeft, disabled: c === 0 }),
          button(`Move ${label} to the column on the right`, () => this.moveColumn(child.id, 1), { iconOnly: true, icon: ArrowRight, disabled: c === block.content.columns.length - 1 }),
        ];
        frame.append(this.bar(child, label, i, column.blocks.length, extra, blockName(child)), renderBlock(child, project, this.binder(child), id => this.host.assetSource(id)));
        return frame;
      });
      cell.replaceChildren(...children, button(`Add a block to column ${c + 1}`, event => this.addToColumn(block.id, c, event.currentTarget as HTMLElement), { icon: Plus, class: 'btn btn-sm col-add', disabled: column.blocks.length >= 20 }));
    });
  }
  private bannerFigure(lesson: Lesson) {
    const banner = lesson.banner, project = this.host.project();
    const id = banner ? (banner.source === 'cover' ? project.document.course.cover?.assetId : banner.assetId) : undefined;
    if (!banner || !id) return undefined;
    return h('figure', { class: 'lesson-banner' }, [h('img', { attrs: { src: this.host.assetSource(id), alt: banner.decorative ? '' : banner.altText } })]);
  }

  /* ---------- side panel ---------- */
  private drawPanel() {
    const found = this.selected ? locate(this.blocks, this.selected) : undefined;
    if (!found) { this.selected = undefined; this.panel.replaceChildren(...this.lessonPanel()); return; }
    const id = found.block.id;
    this.panel.replaceChildren(
      h('div', { class: 'insp-back' }, [button('Lesson settings', () => { this.select(undefined); this.panel.querySelector<HTMLElement>('#lesson-panel-heading')?.focus(); }, { icon: XIcon, class: 'btn btn-ghost btn-sm', label: 'Close block settings and show lesson settings' })]),
      inspectorPanel({
        block: found.block, project: this.host.project(), child: !!found.parent, tab: this.tab, marker: this.marker,
        setTab: tab => { this.tab = tab; this.drawPanel(); this.panel.querySelector<HTMLElement>(`#insp-tab-${tab}`)?.focus(); },
        setMarker: index => { this.marker = index; },
        change: (mutate, options = {}) => {
          const applied = this.changeBlock(id, mutate, options.group);
          if (applied) { this.refreshFrame(id); if (options.redraw) this.redrawPanelKeepingFocus(); }
          return applied;
        },
        variant: variant => { this.variant(id, variant); this.panel.querySelector<HTMLElement>(`input[value="${CSS.escape(variant)}"]`)?.focus(); },
        upload: (file, kind, assign, input) => void this.upload(file, kind, assign, input, id),
        assetSource: assetId => this.host.assetSource(assetId),
        addToColumn: (column, opener) => this.addToColumn(id, column, opener),
        selectChild: child => { this.select(child); this.canvas.querySelector<HTMLElement>(`[data-focus="name-${child}"]`)?.scrollIntoView({ block: 'center' }); this.panel.querySelector<HTMLElement>('#insp-heading')?.focus(); },
      }),
    );
  }
  /** Redraws the panel and puts focus back on the same control (by its focus key, name or text), else on the tab panel. */
  private redrawPanelKeepingFocus() {
    const focused = document.activeElement as HTMLElement | null, key = focused?.dataset.focus, name = focused?.getAttribute('aria-label') ?? focused?.textContent?.trim(), id = focused?.id;
    this.drawPanel();
    const controls = [...this.panel.querySelectorAll<HTMLElement>('button, input, select, textarea')];
    const target = (key && this.panel.querySelector<HTMLElement>(`[data-focus="${CSS.escape(key)}"]`)) || (id && this.panel.querySelector<HTMLElement>(`#${CSS.escape(id)}`)) || controls.find(el => (el.getAttribute('aria-label') ?? el.textContent?.trim()) === name);
    if (target && !(target as HTMLButtonElement).disabled) target.focus(); else this.panel.querySelector<HTMLElement>('[role=tabpanel]')?.focus();
  }
  /** Redraws one block on the page after a setting changed, keeping the rest of the page and the focus as they are. */
  private refreshFrame(id: string) {
    const found = locate(this.blocks, id), top = found?.parent ?? found?.block;
    if (!top) return;
    const index = this.blocks.findIndex(b => b.id === top.id), old = this.canvas.querySelector(`.blk-list > [data-frame="${top.id}"]`);
    if (old && index >= 0) old.replaceWith(this.frame(top, index, this.blocks.length, this.host.project()));
  }
  private lessonPanel(): HTMLElement[] {
    const lesson = this.lesson!, project = this.host.project(), cover = project.document.course.cover;
    const editLesson = (change: (lesson: Lesson) => void, redraw = true) => {
      const applied = this.host.edit(p => { const target = p.document.course.sections.flatMap(s => s.lessons).find(l => l.id === lesson.id); if (target) change(target); });
      if (applied && redraw) this.render();
      return applied;
    };
    const counts = { blocks: lesson.blocks.length, interactions: lesson.blocks.filter(b => INTERACTIVE.has(b.type)).length, questions: lesson.blocks.filter(b => b.type === 'assessment').length };
    const source = lesson.banner ? lesson.banner.source : 'none';
    const sourceSelect = h('select', { class: 'inp', attrs: { id: 'banner-source' } });
    for (const [value, label] of [['none', 'No banner'], ['cover', cover ? 'The course cover' : 'The course cover (none set yet)'], ['image', 'An image for this lesson']] as const) sourceSelect.add(new Option(label, value, false, value === source));
    sourceSelect.addEventListener('change', () => {
      const value = sourceSelect.value;
      editLesson(l => { l.banner = value === 'none' ? null : { source: value as 'cover' | 'image', assetId: value === 'image' ? l.banner?.assetId ?? null : null, altText: l.banner?.altText ?? '', decorative: l.banner?.decorative ?? true }; });
      this.panel.querySelector<HTMLElement>('#banner-source')?.focus();
    });
    const bannerUpload = button(lesson.banner?.assetId ? 'Replace banner image' : 'Upload banner image', async () => {
      const file = await pickFile('.png,.jpg,.jpeg,.webp'); if (!file) return;
      try {
        const { asset, data } = await readImage(file, this.host.project());
        if (this.host.edit(p => { p.document.assets.push(asset); p.files[assetPath(asset)] = data; const target = p.document.course.sections.flatMap(s => s.lessons).find(l => l.id === lesson.id); if (target) target.banner = { source: 'image', assetId: asset.id, altText: '', decorative: false }; }, true)) { this.render(); this.panel.querySelector<HTMLElement>('#banner-alt')?.focus(); toast('Banner added. Describe it or mark it decorative.'); }
      } catch (error) { toast(error instanceof Error ? error.message : 'The image could not be added.'); }
    }, { icon: ImagePlus, class: 'btn btn-sm' });
    const alt = h('textarea', { class: 'inp', attrs: { id: 'banner-alt', rows: 2, maxlength: 2000 } }); alt.value = lesson.banner?.altText ?? '';
    alt.addEventListener('input', () => editLesson(l => { if (l.banner) l.banner.altText = alt.value; }, false));
    const decorative = h('input', { attrs: { id: 'banner-decorative', type: 'checkbox' } }); decorative.checked = lesson.banner?.decorative ?? false;
    decorative.addEventListener('change', () => { editLesson(l => { if (l.banner) l.banner.decorative = decorative.checked; }); this.panel.querySelector<HTMLElement>('#banner-decorative')?.focus(); });

    const objectives = h('ol', { class: 'items' }, lesson.objectives.map((objective, i) => {
      const text = h('input', { class: 'inp', attrs: { id: `lo-${i}`, maxlength: 300 } }); text.value = objective.text;
      text.addEventListener('input', () => editLesson(l => { l.objectives[i]!.text = text.value; }, false));
      const level = h('select', { class: 'inp', attrs: { id: `lo-level-${i}`, 'aria-label': `Thinking level for objective ${i + 1}` } });
      level.add(new Option('No level', '', false, !objective.level));
      for (const l of OBJECTIVE_LEVELS) level.add(new Option(OBJECTIVE_LEVEL_NAMES[l], l, false, objective.level === l));
      level.addEventListener('change', () => editLesson(l => { l.objectives[i]!.level = (level.value || null) as typeof objective.level; }, false));
      return h('li', { class: 'item' }, [h('label', { text: `Objective ${i + 1}`, attrs: { for: `lo-${i}` } }), text, level,
        button(`Remove objective ${i + 1}`, () => { editLesson(l => { l.objectives.splice(i, 1); }); this.panel.querySelector<HTMLElement>('#lo-add')?.focus(); }, { iconOnly: true, icon: Trash2 })]);
    }));
    return [
      h('h2', { class: 'side-h', text: 'Lesson', attrs: { id: 'lesson-panel-heading', tabindex: -1 } }),
      h('p', { class: 'hint', text: `${counts.blocks} ${counts.blocks === 1 ? 'block' : 'blocks'}${counts.interactions ? ` · ${counts.interactions} interactive` : ''}${counts.questions ? ` · ${counts.questions} ${counts.questions === 1 ? 'question' : 'questions'}` : ''}. Select a block's name to see its settings.` }),
      h('section', { class: 'insp-sec' }, [h('h3', { class: 'insp-h', text: 'Banner' }),
        h('div', { class: 'fld' }, [h('label', { text: 'Show at the top of the lesson', attrs: { for: 'banner-source' } }), sourceSelect]),
        lesson.banner?.source === 'image' ? h('div', { class: 'row' }, [bannerUpload]) : null,
        lesson.banner ? h('div', { class: 'fld' }, [h('label', { text: 'Banner alternative text', attrs: { for: 'banner-alt' } }), alt]) : null,
        lesson.banner ? h('div', { class: 'chk' }, [decorative, h('label', { text: 'The banner is decorative', attrs: { for: 'banner-decorative' } })]) : null,
        lesson.banner?.source === 'cover' && !cover ? h('p', { class: 'warn-note', text: 'Add a course cover on the course page, or choose an image for this lesson.' }) : null]),
      h('section', { class: 'insp-sec' }, [h('h3', { class: 'insp-h', text: `Lesson objectives (${lesson.objectives.length})` }),
        h('p', { class: 'hint', text: 'Shown under the lesson title, unless the lesson has a Learning objectives block.' }),
        objectives,
        button('Add objective', () => { editLesson(l => { l.objectives.push({ id: newId(), text: '', level: null }); }); this.panel.querySelector<HTMLElement>(`#lo-${lesson.objectives.length}`)?.focus(); }, { icon: Plus, class: 'btn btn-sm', disabled: lesson.objectives.length >= 30, attrs: { id: 'lo-add' } })]),
    ];
  }
}
