/**
 * The block inspector. Text that learners read is edited on the page; the inspector holds everything else, in four
 * tabs: Content (items, rows, images, answers), Style (template, width, spacing, background), Behavior (what
 * learners must do) and Access (alternative text, narration, and what assistive technology announces).
 */
import { ArrowUp, ArrowDown, Trash2, Plus, ImagePlus, Pencil } from 'lucide';
import { OBJECTIVE_LEVELS, COLUMN_CHILD_TYPES, type Block, type PortableProject, type Asset } from '../shared/course.js';
import { plainToRich } from '../shared/rich-text.js';
import { cueEditor } from './cue-editor.js';
import { parseVideoAddress } from '../shared/video-address.js';
import { importCaptureTake } from './capture-import.js';
import { pickFolder, toast, announce } from './dom.js';
import { OBJECTIVE_LEVEL_NAMES } from '../shared/objectives.js';
import { templatesFor, prepareBlock } from '../shared/block-catalog.js';
import { newId } from '../shared/outline.js';
import { extendedSettings } from '../client/extended-settings.js';
import { richToPlain } from '../shared/rich-text.js';
import { h, button, icon, pickFile } from './dom.js';
import { blockName, blockIcon, chooseBlock } from './block-picker.js';
import { regionEditor } from './region-editor.js';
import { instanceLimits, sizeLabel } from '../shared/limits.js';

export type Tab = 'content' | 'style' | 'behavior' | 'access';
export type UploadKind = 'image' | 'audio' | 'video' | 'attachment';
export interface InspectorContext {
  block: Block;
  project: PortableProject;
  /** True for a block inside a column. */
  child: boolean;
  tab: Tab;
  setTab: (tab: Tab) => void;
  /** Applies a change to this block. `group` merges rapid typing into one undo step; `redraw` rebuilds the inspector. */
  change: (mutate: (block: Block) => void, options?: { group?: string; redraw?: boolean }) => boolean;
  variant: (variant: string) => void;
  upload: (file: File, kind: UploadKind, assign: (block: Block, assetId: string) => void, input: HTMLElement) => void;
  assetSource: (assetId: string) => string;
  /** Adds a block to a column of this columns block, after asking which. */
  addToColumn: (column: number, opener: HTMLElement) => void;
  selectChild: (id: string) => void;
  marker: number;
  setMarker: (index: number) => void;
  /** The blocks of the lesson being edited, for linking video checkpoints to questions. */
  lesson: Block[];
  /** Adds a multiple choice question right after the video (after its last checkpoint question) and returns its id. */
  addQuestionAfter: (videoId: string) => string | undefined;
  /** Adds files to the course and changes this block in one step, for imports. */
  changeWithAssets: (assets: { asset: Asset; data: string }[], mutate: (block: Block) => void) => boolean;
  /** Opens another place on the course page, such as `resources:glossary` or `bank:<id>`. */
  goTo?: (place: string) => void;
}

const TABS: [Tab, string][] = [['content', 'Content'], ['style', 'Style'], ['behavior', 'Behavior'], ['access', 'Access']];
let fieldCount = 0;
const uid = (base: string) => `${base}-${++fieldCount}`;

/* ---------- small form helpers ---------- */
function textField(label: string, value: string, commit: (value: string) => void, options: { max?: number; multiline?: boolean; hint?: string; placeholder?: string } = {}) {
  const id = uid('fld');
  const input = options.multiline ? h('textarea', { class: 'inp', attrs: { id, rows: 4, maxlength: options.max ?? 300, placeholder: options.placeholder } }) : h('input', { class: 'inp', attrs: { id, maxlength: options.max ?? 300, placeholder: options.placeholder } });
  input.value = value;
  input.addEventListener('input', () => commit(input.value));
  return h('div', { class: 'fld' }, [h('label', { text: label, attrs: { for: id } }), input, options.hint ? h('p', { class: 'hint', text: options.hint }) : null]);
}
function numberField(label: string, value: number, min: number, max: number, commit: (value: number) => void, hint?: string) {
  const id = uid('num'), input = h('input', { class: 'inp', attrs: { id, type: 'number', min, max, step: 1, value, inputmode: 'numeric' } });
  input.addEventListener('change', () => { const n = Math.round(Number(input.value)); if (Number.isFinite(n) && n >= min && n <= max) commit(n); else input.value = String(value); });
  return h('div', { class: 'fld fld-num' }, [h('label', { text: label, attrs: { for: id } }), input, hint ? h('p', { class: 'hint', text: hint }) : null]);
}
function checkField(label: string, checked: boolean, commit: (value: boolean) => void, hint?: string) {
  const id = uid('chk'), input = h('input', { attrs: { id, type: 'checkbox' } });
  input.checked = checked; input.addEventListener('change', () => commit(input.checked));
  return h('div', { class: 'chk' }, [input, h('label', { attrs: { for: id } }, [label, hint ? h('span', { class: 'hint', text: hint }) : null])]);
}
function selectField(label: string, options: [string, string][], value: string, commit: (value: string) => void) {
  const id = uid('sel'), select = h('select', { class: 'inp', attrs: { id } });
  for (const [key, name] of options) select.add(new Option(name, key, false, key === value));
  select.addEventListener('change', () => commit(select.value));
  return h('div', { class: 'fld' }, [h('label', { text: label, attrs: { for: id } }), select]);
}
const note = (text: string) => h('p', { class: 'hint', text });
const heading = (text: string) => h('h3', { class: 'insp-h', text });

/**
 * A list of items with move and remove controls and an Add button. `row` draws each item's own fields; when it
 * returns nothing, the item is named by `name` (its text is edited on the page).
 */
function itemList<T>(options: { title: string; items: T[]; noun: string; min: number; max: number; name: (item: T, index: number) => string; row?: (item: T, index: number) => HTMLElement[]; add: () => void; remove: (index: number) => void; move: (index: number, delta: -1 | 1) => void; }) {
  const { items, noun } = options;
  const list = h('ol', { class: 'items' });
  items.forEach((item, index) => {
    const label = `${noun} ${index + 1}`;
    list.append(h('li', { class: 'item' }, [
      h('div', { class: 'item-head' }, [
        h('span', { class: 'item-name', text: options.row ? label : `${index + 1}. ${options.name(item, index) || `(empty ${noun.toLowerCase()})`}` }),
        button(`Move ${label.toLowerCase()} up`, () => options.move(index, -1), { iconOnly: true, icon: ArrowUp, disabled: index === 0, attrs: { 'data-focus': `up-${index}` } }),
        button(`Move ${label.toLowerCase()} down`, () => options.move(index, 1), { iconOnly: true, icon: ArrowDown, disabled: index === items.length - 1, attrs: { 'data-focus': `down-${index}` } }),
        button(`Remove ${label.toLowerCase()}`, () => options.remove(index), { iconOnly: true, icon: Trash2, disabled: items.length <= options.min }),
      ]),
      ...(options.row ? options.row(item, index) : []),
    ]));
  });
  return h('section', { class: 'insp-sec' }, [heading(`${options.title} (${items.length})`), list,
    button(`Add ${noun.toLowerCase()}`, () => options.add(), { icon: Plus, disabled: items.length >= options.max, class: 'btn btn-sm' })]);
}
function moveIn<T>(items: T[], index: number, delta: -1 | 1) { const to = index + delta; if (to < 0 || to >= items.length) return; [items[index], items[to]] = [items[to]!, items[index]!]; }

/* ---------- the panel ---------- */
export function inspectorPanel(ctx: InspectorContext): HTMLElement {
  const { block } = ctx;
  const tablist = h('div', { class: 'tabs', attrs: { role: 'tablist', 'aria-label': 'Block settings' } });
  const panel = h('div', { class: 'tabpanel', attrs: { role: 'tabpanel', id: 'insp-panel', tabindex: 0 } });
  const tabs = TABS.map(([key, label]) => {
    const tab = h('button', { class: 'tab', text: label, attrs: { type: 'button', role: 'tab', id: `insp-tab-${key}`, 'aria-selected': String(key === ctx.tab), 'aria-controls': 'insp-panel', tabindex: key === ctx.tab ? 0 : -1 } });
    tab.addEventListener('click', () => ctx.setTab(key));
    tab.addEventListener('keydown', event => {
      const at = TABS.findIndex(([k]) => k === key);
      const next = event.key === 'ArrowRight' ? (at + 1) % TABS.length : event.key === 'ArrowLeft' ? (at + TABS.length - 1) % TABS.length : event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : -1;
      if (next < 0) return;
      event.preventDefault(); ctx.setTab(TABS[next]![0]);
    });
    return tab;
  });
  tablist.append(...tabs);
  panel.setAttribute('aria-labelledby', `insp-tab-${ctx.tab}`);
  panel.append(...(ctx.tab === 'content' ? contentTab(ctx) : ctx.tab === 'style' ? styleTab(ctx) : ctx.tab === 'behavior' ? behaviorTab(ctx) : accessTab(ctx)));
  return h('div', { class: 'insp' }, [
    h('div', { class: 'insp-title' }, [icon(blockIcon(block)), h('h2', { text: blockName(block), attrs: { id: 'insp-heading', tabindex: -1 } }), ctx.child ? h('span', { class: 'chip', text: 'In a column' }) : null]),
    tablist, panel,
  ]);
}

/* ---------- Content ---------- */
function contentTab(ctx: InspectorContext): HTMLElement[] {
  const { block, change } = ctx;
  const out: HTMLElement[] = [];
  const set = <T extends Block['type']>(mutate: (b: Extract<Block, { type: T }>) => void, redraw = false, group?: string) => change(b => mutate(b as Extract<Block, { type: T }>), { redraw, ...(group ? { group } : {}) });
  const inline = note('Edit the text directly on the page. Select text and press Ctrl+B or Ctrl+I for bold or italic.');
  switch (block.type) {
    case 'heading': case 'paragraph': case 'statement': case 'quote': case 'divider': case 'spacer':
      out.push(note(block.type === 'spacer' ? 'A spacer adds room between blocks. Choose its size on the Style tab.' : 'Edit the text directly on the page. Select text and press Ctrl+B or Ctrl+I for bold or italic where formatting is allowed.'));
      break;
    case 'list':
      out.push(inline, itemList({ title: 'Items', items: block.content.items, noun: 'Item', min: 1, max: 100, name: v => richToPlain(v).slice(0, 60),
        add: () => set<'list'>(b => { b.content.items.push('A new point.'); }, true), remove: i => set<'list'>(b => { b.content.items.splice(i, 1); }, true), move: (i, d) => set<'list'>(b => moveIn(b.content.items, i, d), true) }));
      break;
    case 'objectives':
      out.push(note('Write each objective as something learners will be able to do. A thinking level is optional; it shows as a small label.'),
        itemList({ title: 'Objectives', items: block.content.items, noun: 'Objective', min: 1, max: 30, name: o => o.text,
          row: (o, i) => [textField(`Objective ${i + 1}`, o.text, value => set<'objectives'>(b => { b.content.items[i]!.text = value; }, false, `obj-${i}`)),
            selectField(`Thinking level for objective ${i + 1}`, [['', 'No level'], ...OBJECTIVE_LEVELS.map(l => [l, OBJECTIVE_LEVEL_NAMES[l]] as [string, string])], o.level ?? '', value => set<'objectives'>(b => { b.content.items[i]!.level = (value || null) as typeof o.level; }))],
          add: () => set<'objectives'>(b => { b.content.items.push({ id: newId(), text: 'Do something useful with the idea.', level: null }); }, true),
          remove: i => set<'objectives'>(b => { b.content.items.splice(i, 1); }, true), move: (i, d) => set<'objectives'>(b => moveIn(b.content.items, i, d), true) }));
      break;
    case 'table': {
      const c = block.content, width = c.rows[0]!.length;
      out.push(textField('Caption', c.caption, value => set<'table'>(b => { b.content.caption = value; }, false, 'caption'), { hint: 'A caption names the table for everyone, including screen reader users.' }),
        checkField('First row is column headings', c.head.length > 0, on => set<'table'>(b => { b.content.head = on ? Array.from({ length: width }, (_, i) => `Heading ${i + 1}`) : []; }, true)),
        checkField('First column is row headings', c.headerColumn, on => set<'table'>(b => { b.content.headerColumn = on; })),
        h('section', { class: 'insp-sec' }, [heading(`Columns (${width})`), h('div', { class: 'row' }, [
          button('Add column', () => set<'table'>(b => { b.content.rows.forEach(r => r.push('')); if (b.content.head.length) b.content.head.push(`Heading ${b.content.head.length + 1}`); }, true), { icon: Plus, disabled: width >= 8, class: 'btn btn-sm' }),
          button('Remove last column', () => set<'table'>(b => { b.content.rows.forEach(r => r.pop()); b.content.head.pop(); }, true), { icon: Trash2, disabled: width <= 1, class: 'btn btn-sm' }),
        ])]),
        itemList({ title: 'Rows', items: c.rows, noun: 'Row', min: 1, max: 60, name: r => richToPlain(r[0] ?? '').slice(0, 50),
          add: () => set<'table'>(b => { b.content.rows.push(Array.from({ length: width }, () => '')); }, true),
          remove: i => set<'table'>(b => { b.content.rows.splice(i, 1); }, true), move: (i, d) => set<'table'>(b => moveIn(b.content.rows, i, d), true) }),
        note('Cells are edited on the page. Keep tables for data that has rows and columns, not for layout; use Columns for layout.'));
      break;
    }
    case 'reflection':
      out.push(note('Write the prompt and the sample response on the page.'),
        textField('Hint in the empty answer box', block.content.placeholder, value => set<'reflection'>(b => { b.content.placeholder = value; }, false, 'placeholder')),
        numberField('Minimum words', block.content.minWords, 0, 1000, value => set<'reflection'>(b => { b.content.minWords = value; }), 'Used when the reflection is required. 0 means any response.'));
      break;
    case 'activity':
      out.push(textField('Title', block.content.title, value => set<'activity'>(b => { b.content.title = value; }, false, 'title')),
        numberField('Time in minutes', block.content.minutes, 0, 600, value => set<'activity'>(b => { b.content.minutes = value; }), '0 hides the time.'),
        textField('Writing box label', block.content.output, value => set<'activity'>(b => { b.content.output = value; }, false, 'output'), { hint: 'Leave empty for no writing box; learners then mark the activity as done.' }),
        itemList({ title: 'Steps', items: block.content.steps, noun: 'Step', min: 1, max: 20, name: s => richToPlain(s).slice(0, 60),
          add: () => set<'activity'>(b => { b.content.steps.push('Describe the next step.'); }, true), remove: i => set<'activity'>(b => { b.content.steps.splice(i, 1); }, true), move: (i, d) => set<'activity'>(b => moveIn(b.content.steps, i, d), true) }));
      break;
    case 'checklist':
      out.push(textField('Title', block.content.title, value => set<'checklist'>(b => { b.content.title = value; }, false, 'title')),
        itemList({ title: 'Items', items: block.content.items, noun: 'Item', min: 1, max: 50, name: v => v,
          row: (v, i) => [textField(`Item ${i + 1}`, v, value => set<'checklist'>(b => { b.content.items[i] = value; }, false, `item-${i}`))],
          add: () => set<'checklist'>(b => { b.content.items.push('Another thing to check.'); }, true), remove: i => set<'checklist'>(b => { b.content.items.splice(i, 1); }, true), move: (i, d) => set<'checklist'>(b => moveIn(b.content.items, i, d), true) }));
      break;
    case 'self-assessment': {
      const c = block.content, low = c.items.length, high = c.items.length * c.scale.length;
      out.push(textField('Title', c.title, value => set<'self-assessment'>(b => { b.content.title = value; }, false, 'title')),
        itemList({ title: 'Rating scale', items: c.scale, noun: 'Rating', min: 2, max: 7, name: v => v,
          row: (v, i) => [textField(`Rating ${i + 1} (counts ${i + 1})`, v, value => set<'self-assessment'>(b => { b.content.scale[i] = value; }, false, `scale-${i}`))],
          add: () => set<'self-assessment'>(b => { b.content.scale.push('Another rating'); }, true), remove: i => set<'self-assessment'>(b => { b.content.scale.splice(i, 1); }, true), move: (i, d) => set<'self-assessment'>(b => moveIn(b.content.scale, i, d), true) }),
        itemList({ title: 'Statements', items: c.items, noun: 'Statement', min: 1, max: 30, name: v => v,
          row: (v, i) => [textField(`Statement ${i + 1}`, v, value => set<'self-assessment'>(b => { b.content.items[i] = value; }, false, `item-${i}`))],
          add: () => set<'self-assessment'>(b => { b.content.items.push('I can do this confidently.'); }, true), remove: i => set<'self-assessment'>(b => { b.content.items.splice(i, 1); }, true), move: (i, d) => set<'self-assessment'>(b => moveIn(b.content.items, i, d), true) }),
        note(`Totals run from ${low} to ${high}. Each band's message is edited on the page.`),
        itemList({ title: 'Score bands', items: c.bands, noun: 'Band', min: 0, max: 8, name: band => `${band.min}–${band.max}`,
          row: (band, i) => [h('div', { class: 'row' }, [numberField('Lowest total', band.min, 0, 1000, value => set<'self-assessment'>(b => { b.content.bands[i]!.min = Math.min(value, b.content.bands[i]!.max); }, true)), numberField('Highest total', band.max, 0, 1000, value => set<'self-assessment'>(b => { b.content.bands[i]!.max = Math.max(value, b.content.bands[i]!.min); }, true))])],
          add: () => set<'self-assessment'>(b => { b.content.bands.push({ min: low, max: high, text: 'Describe what this total means.' }); }, true), remove: i => set<'self-assessment'>(b => { b.content.bands.splice(i, 1); }, true), move: (i, d) => set<'self-assessment'>(b => moveIn(b.content.bands, i, d), true) }));
      break;
    }
    case 'columns': {
      const allowed = new Set<string>(COLUMN_CHILD_TYPES);
      out.push(note('Columns sit side by side on wide screens and stack in order on phones. They hold text, images, lists, notes, quotes and link buttons.'));
      block.content.columns.forEach((column, c) => {
        const list = h('ol', { class: 'items' }, column.blocks.map((inner, i) => h('li', { class: 'item' }, [h('div', { class: 'item-head' }, [
          h('button', { class: 'linkish', text: `${i + 1}. ${blockName(inner)}`, attrs: { type: 'button' }, on: { click: () => ctx.selectChild(inner.id) } }),
        ])])));
        out.push(h('section', { class: 'insp-sec' }, [heading(`Column ${c + 1} (${column.blocks.length})`), column.blocks.length ? list : note('This column is empty.'),
          button(`Add a block to column ${c + 1}`, event => ctx.addToColumn(c, event.currentTarget as HTMLElement), { icon: Plus, class: 'btn btn-sm', disabled: column.blocks.length >= 20 })]));
      });
      void allowed;
      break;
    }
    case 'image': case 'image-text':
      out.push(imageChooser(ctx, block.content.assetId, (b, id) => { if (b.type === 'image' || b.type === 'image-text') b.content.assetId = id; }), note('Write the caption on the page. Alternative text is on the Access tab.'));
      break;
    case 'labeled-graphic': {
      const c = block.content;
      out.push(imageChooser(ctx, c.assetId, (b, id) => { if (b.type === 'labeled-graphic') b.content.assetId = id; }),
        h('section', { class: 'insp-sec' }, [heading('Marker positions'), regionEditor({ src: ctx.assetSource(c.assetId), alt: '', name: block.id, shape: 'point', selected: ctx.marker,
          regions: c.markers.map(m => ({ x: m.x, y: m.y, label: m.label })),
          select: index => ctx.setMarker(index),
          change: (index, region) => set<'labeled-graphic'>(b => { const m = b.content.markers[index]; if (m) { m.x = region.x; m.y = region.y; } }) })]),
        itemList({ title: 'Markers', items: c.markers, noun: 'Marker', min: 1, max: 30, name: m => m.label,
          row: (m, i) => [textField(`Marker ${i + 1} label`, m.label, value => set<'labeled-graphic'>(b => { b.content.markers[i]!.label = value; }, false, `marker-${i}`))],
          add: () => set<'labeled-graphic'>(b => { b.content.markers.push({ label: 'A new detail', text: 'Explain this part of the image.', x: 50, y: 50 }); }, true),
          remove: i => set<'labeled-graphic'>(b => { b.content.markers.splice(i, 1); }, true), move: (i, d) => set<'labeled-graphic'>(b => moveIn(b.content.markers, i, d), true) }),
        note('Each marker opens its text for learners. Marker text is edited on the page.'));
      break;
    }
    case 'scenario': {
      const c = block.content, steps = c.scenes.flatMap(s => s.nodes);
      out.push(note(`${steps.length} steps in ${c.scenes.length} ${c.scenes.length === 1 ? 'scene' : 'scenes'}, ${steps.filter(n => n.kind === 'ending').length} endings. Write and link the steps in the scenario editor.`),
        button('Open the scenario editor', () => ctx.goTo?.(`scenario:${block.id}`), { icon: Pencil, class: 'btn btn-sm btn-primary' }),
        checkField('Learners can take back their last choice', c.allowTakeBack, value => set<'scenario'>(b => { b.content.allowTakeBack = value; })),
        checkField('Show "Your path" at the end', c.showPathReview, value => set<'scenario'>(b => { b.content.showPathReview = value; }), 'Lists each choice with its feedback.'),
        checkField('Score the choices', c.scoring, value => set<'scenario'>(b => { b.content.scoring = value; }, true), 'Each option can add or take away points. The total is reported to the LMS.'),
        ...(c.scoring ? [numberField('Points needed to pass', c.passPoints, -1000, 1000, value => set<'scenario'>(b => { b.content.passPoints = value; }))] : []),
        button('Manage characters', () => ctx.goTo?.('resources:characters'), { class: 'btn btn-sm' }));
      break;
    }
    case 'glossary': {
      const terms = ctx.project.document.course.glossary.length;
      out.push(note(`The course glossary has ${terms} ${terms === 1 ? 'term' : 'terms'}. Terms are edited in Course resources so every glossary block and term link stays the same.`),
        button('Edit the glossary', () => ctx.goTo?.('resources:glossary'), { icon: Pencil, class: 'btn btn-sm' }),
        checkField('Show letters to jump to', block.content.showLetters, value => set<'glossary'>(b => { b.content.showLetters = value; })),
        checkField('Show a search box', block.content.search, value => set<'glossary'>(b => { b.content.search = value; })));
      break;
    }
    case 'action-plan': {
      const c = block.content;
      out.push(note('Learners fill in the table and can add rows up to the limit. Their plan is kept with their progress and appears in My workbook.'),
        itemList({ title: 'Columns', items: c.columns, noun: 'Column', min: 1, max: 6, name: col => col.label,
          row: (col, i) => [textField(`Column ${i + 1} heading`, col.label, value => set<'action-plan'>(b => { b.content.columns[i]!.label = value; }, false, `col-${i}`)),
            selectField(`Column ${i + 1} holds`, [['text', 'Text'], ['date', 'A date']], col.kind, value => set<'action-plan'>(b => { b.content.columns[i]!.kind = value as 'text' | 'date'; }))],
          add: () => set<'action-plan'>(b => { b.content.columns.push({ label: 'Another column', kind: 'text' }); }, true), remove: i => set<'action-plan'>(b => { b.content.columns.splice(i, 1); }, true), move: (i, d) => set<'action-plan'>(b => moveIn(b.content.columns, i, d), true) }),
        numberField('Rows to start with', c.starterRows, 1, 20, value => set<'action-plan'>(b => { b.content.starterRows = value; b.content.maxRows = Math.max(b.content.maxRows, value); }, true)),
        numberField('Most rows learners can add', c.maxRows, 1, 50, value => set<'action-plan'>(b => { b.content.maxRows = Math.max(value, b.content.starterRows); }, true)));
      break;
    }
    case 'results': {
      const certificate = ctx.project.document.course.certificate;
      out.push(textField('Title', block.content.title, value => set<'results'>(b => { b.content.title = value; }, false, 'title')),
        checkField('List the questions learners missed', block.content.showReview, value => set<'results'>(b => { b.content.showReview = value; }), 'Each one links back to its question.'),
        checkField('Offer the certificate', block.content.showCertificate, value => set<'results'>(b => { b.content.showCertificate = value; }, true)),
        ...(block.content.showCertificate && !certificate ? [h('p', { class: 'warn-note', text: 'The course has no certificate yet. Set one up in Course resources.' })] : []),
        button('Certificate settings', () => ctx.goTo?.('resources:certificate'), { icon: Pencil, class: 'btn btn-sm' }),
        note('Learners always see their progress, their scores by lesson and whether they passed.'));
      break;
    }
    case 'bank-draw': {
      const banks = ctx.project.document.course.banks, bank = banks.find(b => b.id === block.content.bankId);
      if (!banks.length) { out.push(note('There are no question banks yet.'), button('Create a question bank', () => ctx.goTo?.('resources:banks'), { icon: Plus, class: 'btn btn-sm' })); break; }
      out.push(selectField('Question bank', [...(bank ? [] : [['', 'Choose a bank'] as [string, string]]), ...banks.map(b => [b.id, `${b.name || 'Untitled bank'} (${b.questions.length})`] as [string, string])], bank?.id ?? '', value => { if (value) set<'bank-draw'>(b => { b.content.bankId = value; const chosen = banks.find(x => x.id === value); if (chosen && chosen.questions.length) b.content.count = Math.min(b.content.count, chosen.questions.length); }, true); }),
        numberField('Questions to draw', block.content.count, 1, Math.max(1, Math.min(50, bank?.questions.length ?? 50)), value => set<'bank-draw'>(b => { b.content.count = value; }), bank ? `Each learner gets ${Math.min(block.content.count, bank.questions.length)} of the ${bank.questions.length} questions, and keeps the same ones on resume.` : undefined),
        textField('Title above the questions (optional)', block.content.title, value => set<'bank-draw'>(b => { b.content.title = value; }, false, 'title')),
        ...(bank ? [button(`Edit the questions in ${bank.name || 'this bank'}`, () => ctx.goTo?.(`bank:${bank.id}`), { icon: Pencil, class: 'btn btn-sm' })] : []),
        note('Scoring, attempts and feedback are set on each question in the bank.'));
      break;
    }
    case 'survey': {
      const c = block.content;
      out.push(textField('Title', c.title, value => set<'survey'>(b => { b.content.title = value; }, false, 'title')),
        note('Surveys are not scored. Answers are kept with the learner’s progress and reported to the LMS as unscored records.'),
        itemList({ title: 'Rating scale', items: c.scale, noun: 'Rating', min: 2, max: 7, name: v => v,
          row: (v, i) => [textField(`Rating ${i + 1}`, v, value => set<'survey'>(b => { b.content.scale[i] = value; }, false, `scale-${i}`))],
          add: () => set<'survey'>(b => { b.content.scale.push('Another rating'); }, true), remove: i => set<'survey'>(b => { b.content.scale.splice(i, 1); }, true), move: (i, d) => set<'survey'>(b => moveIn(b.content.scale, i, d), true) }),
        itemList({ title: 'Questions', items: c.items, noun: 'Question', min: 1, max: 30, name: item => item.prompt,
          row: (item, i) => [
            textField(`Question ${i + 1}`, item.prompt, value => set<'survey'>(b => { b.content.items[i]!.prompt = value; }, false, `prompt-${i}`)),
            selectField(`Answer type for question ${i + 1}`, [['rating', 'Rating on the scale'], ['differential', 'Between two opposites'], ['choice', 'One choice from a list'], ['comment', 'Written comment']], item.kind, value => set<'survey'>(b => { const target = b.content.items[i]!; target.kind = value as typeof target.kind; target.options = value === 'differential' ? [target.options[0] ?? 'Not at all', target.options[1] ?? 'Completely'] : value === 'choice' ? (target.options.length ? target.options : ['First option', 'Second option']) : []; }, true)),
            ...(item.kind === 'differential' ? [h('div', { class: 'row' }, [textField('Left end', item.options[0] ?? '', value => set<'survey'>(b => { b.content.items[i]!.options[0] = value; }, false, `left-${i}`)), textField('Right end', item.options[1] ?? '', value => set<'survey'>(b => { b.content.items[i]!.options[1] = value; }, false, `right-${i}`))])] : []),
            ...(item.kind === 'choice' ? [...item.options.map((option, o) => textField(`Question ${i + 1}, option ${o + 1}`, option, value => set<'survey'>(b => { b.content.items[i]!.options[o] = value; }, false, `option-${i}-${o}`))),
              h('div', { class: 'row' }, [button(`Add option to question ${i + 1}`, () => set<'survey'>(b => { b.content.items[i]!.options.push('Another option'); }, true), { icon: Plus, class: 'btn btn-sm', disabled: item.options.length >= 10 }),
                button(`Remove last option from question ${i + 1}`, () => set<'survey'>(b => { b.content.items[i]!.options.pop(); }, true), { icon: Trash2, class: 'btn btn-sm', disabled: item.options.length <= 2 })])] : []),
          ],
          add: () => set<'survey'>(b => { b.content.items.push({ id: newId(), kind: 'rating', prompt: 'Another statement to rate.', options: [] }); }, true),
          remove: i => set<'survey'>(b => { b.content.items.splice(i, 1); }, true), move: (i, d) => set<'survey'>(b => moveIn(b.content.items, i, d), true) }));
      break;
    }
    case 'assessment': {
      const c = block.content;
      if (block.variant === 'short-answer') {
        out.push(checkField('Self-check against a model answer', c.selfCheck, value => set<'assessment'>(b => { b.content.selfCheck = value; if (value) b.assessment.graded = false; }, true), 'Learners compare their own answer with yours. It is never scored.'));
        if (c.selfCheck) out.push(note('Write the model answer on the page, under the question.'));
        else out.push(checkField('Case-sensitive answers', c.caseSensitive, value => set<'assessment'>(b => { b.content.caseSensitive = value; })),
          itemList({ title: 'Accepted answers', items: c.accepted, noun: 'Answer', min: 1, max: 20, name: v => v,
            row: (v, i) => [textField(`Accepted answer ${i + 1}`, v, value => set<'assessment'>(b => { b.content.accepted[i] = value; }, false, `accepted-${i}`))],
            add: () => set<'assessment'>(b => { b.content.accepted.push('Another answer'); }, true), remove: i => set<'assessment'>(b => { b.content.accepted.splice(i, 1); }, true), move: (i, d) => set<'assessment'>(b => moveIn(b.content.accepted, i, d), true) }),
          note('Spaces and letter case are ignored unless case-sensitive answers is on.'));
      }
      if (block.variant === 'numeric') {
        const q = c.numeric, decimal = (label: string, value: number, apply: (n: number) => void, hint?: string) => {
          const id = `num-${label.replace(/\W+/g, '-').toLowerCase()}`, input = h('input', { class: 'inp', attrs: { id, type: 'text', inputmode: 'decimal', value: String(value) } });
          input.addEventListener('change', () => { const n = Number(input.value.replace(',', '.')); if (Number.isFinite(n)) set<'assessment'>(b => apply(n)); else input.value = String(value); });
          return h('div', { class: 'fld fld-num' }, [h('label', { text: label, attrs: { for: id } }), input, hint ? note(hint) : null]);
        };
        out.push(selectField('Accept', [['exact', 'A value, with an optional tolerance'], ['range', 'Any number in a range']], q.mode, value => set<'assessment'>(b => { b.content.numeric.mode = value as 'exact' | 'range'; }, true)));
        if (q.mode === 'exact') out.push(decimal('Correct value', q.value, n => set<'assessment'>(b => { b.content.numeric.value = n; })), decimal('Tolerance (±)', q.tolerance, n => set<'assessment'>(b => { b.content.numeric.tolerance = Math.abs(n); }), '0 means the exact value only.'));
        else out.push(decimal('Lowest accepted', q.min, n => set<'assessment'>(b => { b.content.numeric.min = n; })), decimal('Highest accepted', q.max, n => set<'assessment'>(b => { b.content.numeric.max = n; })));
        out.push(textField('Unit (optional)', q.unit, value => set<'assessment'>(b => { b.content.numeric.unit = value; }, false, 'unit'), { max: 40, hint: 'Shown beside the answer box. Learners may type it after the number.' }));
      }
      if (block.variant === 'hotspot') {
        out.push(imageChooser(ctx, c.image?.assetId ?? '', (b, id) => { if (b.type === 'assessment') b.content.image = { assetId: id, altText: b.content.image?.altText ?? '' }; }));
        if (c.image) out.push(h('section', { class: 'insp-sec' }, [heading('Areas on the picture'), regionEditor({ src: ctx.assetSource(c.image.assetId), alt: '', name: block.id, shape: 'rect', selected: ctx.marker,
          regions: c.areas.map(a => ({ x: a.x, y: a.y, w: a.w, h: a.h, label: a.label })), select: index => ctx.setMarker(index),
          change: (index, region) => set<'assessment'>(b => { const a = b.content.areas[index]; if (a) { a.x = region.x; a.y = region.y; a.w = region.w ?? a.w; a.h = region.h ?? a.h; } }) })]));
        out.push(itemList({ title: 'Areas', items: c.areas, noun: 'Area', min: 0, max: 20, name: a => a.label,
          row: (a, i) => [textField(`Area ${i + 1} label`, a.label, value => set<'assessment'>(b => { b.content.areas[i]!.label = value; }, false, `area-${i}`)),
            checkField(`Area ${i + 1} is correct`, c.correct.includes(i), on => set<'assessment'>(b => { b.content.correct = on ? [...new Set([...b.content.correct, i])].sort((x, y) => x - y) : b.content.correct.filter(x => x !== i); }, true))],
          add: () => set<'assessment'>(b => { b.content.areas.push({ x: 40, y: 40, w: 20, h: 20, label: 'Another area' }); }, true),
          remove: i => set<'assessment'>(b => { b.content.areas.splice(i, 1); b.content.correct = b.content.correct.filter(x => x !== i).map(x => x > i ? x - 1 : x); b.content.choiceFeedback = b.content.choiceFeedback.filter((_, x) => x !== i); }, true),
          move: (i, d) => set<'assessment'>(b => { const to = i + d; moveIn(b.content.areas, i, d); b.content.correct = b.content.correct.map(x => x === i ? to : x === to ? i : x).sort((x, y) => x - y); }, true) }),
          note('Every area needs a label: keyboard and screen reader users choose from the labeled list. Add at least two wrong areas so the list does not give the answer away.'));
      }
      const host = h('div', { class: 'classic-settings' });
      extendedSettings(host, block, ctx.project, (mutate, key, redraw) => change(mutate, { ...(key ? { group: key } : {}), redraw: !!redraw }), (file, kind, assign, input) => ctx.upload(file, kind, assign, input));
      out.push(h('section', { class: 'insp-sec' }, [heading('Scoring and feedback'), host]));
      break;
    }
    case 'video': {
      const c = block.content, src = c.assetId ? ctx.assetSource(c.assetId) : undefined;
      const host = h('div', { class: 'classic-settings' });
      extendedSettings(host, block, ctx.project, (mutate, key, redraw) => change(mutate, { ...(key ? { group: key } : {}), redraw: !!redraw }), (file, kind, assign, input) => ctx.upload(file, kind, assign, input));
      out.push(h('section', { class: 'insp-sec' }, [heading('Video file, transcript and caption file'), host]));
      out.push(h('section', { class: 'insp-sec' }, [heading(`Captions (${c.captions.length})`), cueEditor({ ...(src ? { src } : {}), cues: c.captions, withEnd: true, noun: 'Caption', textLabel: 'Text', multiline: true, max: 500, textMax: 5000,
        make: start => ({ start, end: Math.round((start + 3) * 10) / 10, text: '' }), change: cues => set<'video'>(b => { b.content.captions = cues.map(q => ({ start: q.start, end: q.end ?? q.start + 3, text: q.text })); }) })]));
      const describedUpload = button(c.describedAssetId ? 'Replace the described version' : 'Upload a described version', async () => { const file = await pickFile('.mp4'); if (file) ctx.upload(file, 'video', (b, id) => { if (b.type === 'video') b.content.describedAssetId = id; }, describedUpload); }, { icon: Plus, class: 'btn btn-sm' });
      out.push(h('section', { class: 'insp-sec' }, [heading('Audio description'),
        note('Give learners who are blind or have low vision the visual information: a second MP4 with description narrated in, or timed description text that is announced and shown as the video plays.'),
        h('div', { class: 'row' }, [describedUpload, c.describedAssetId ? button('Remove the described version', () => set<'video'>(b => { b.content.describedAssetId = null; }, true), { icon: Trash2, class: 'btn btn-sm' }) : null]),
        checkField('Pause the video while a description is read', c.pauseForDescriptions, value => set<'video'>(b => { b.content.pauseForDescriptions = value; }), 'Extended description: learners press Continue when they are ready.'),
        cueEditor({ ...(src ? { src } : {}), cues: c.descriptions, withEnd: true, noun: 'Description', textLabel: 'Text', multiline: true, max: 500, textMax: 5000,
          make: start => ({ start, end: Math.round((start + 4) * 10) / 10, text: '' }), change: cues => set<'video'>(b => { b.content.descriptions = cues.map(q => ({ start: q.start, end: q.end ?? q.start + 4, text: q.text })); }) })]));
      if (block.variant === 'interactive') {
        const questions = (after: number) => ctx.lesson.slice(after + 1).filter((b): b is Extract<Block, { type: 'assessment' }> => b.type === 'assessment');
        const position = ctx.lesson.findIndex(b => b.id === block.id);
        out.push(h('section', { class: 'insp-sec' }, [heading(`Chapters (${c.chapters.length})`), cueEditor({ ...(src ? { src } : {}), cues: c.chapters.map(ch => ({ start: ch.time, text: ch.title })), withEnd: false, noun: 'Chapter', textLabel: 'Title', max: 50,
          make: start => ({ start, text: 'A new chapter' }), change: cues => set<'video'>(b => { b.content.chapters = cues.map(q => ({ time: q.start, title: q.text })); }) })]),
          h('section', { class: 'insp-sec' }, [heading(`Checkpoints (${c.checkpoints.length})`),
            note('At each checkpoint the video pauses. A question checkpoint sends learners to a question placed after the video; a note shows its text. Every checkpoint is also listed under the video.'),
            cueEditor({ ...(src ? { src } : {}), cues: c.checkpoints.map(cp => ({ ...cp, start: cp.time, text: cp.title })), withEnd: false, noun: 'Checkpoint', textLabel: 'Title', max: 50,
              make: start => ({ id: newId(), start, time: start, kind: 'question' as const, questionId: null, title: '', note: '', text: '' }),
              change: cues => set<'video'>(b => { b.content.checkpoints = cues.map(q => ({ id: q.id, time: q.start, kind: q.kind, questionId: q.questionId, title: q.text, note: q.note })); }, true),
              extra: (cue, index, update) => [
                selectField(`Checkpoint ${index + 1} shows`, [['question', 'A question'], ['note', 'A note']], cue.kind, value => update({ kind: value as 'question' | 'note' })),
                ...(cue.kind === 'question' ? [
                  selectField(`Question for checkpoint ${index + 1}`, [['', 'Choose a question after the video'], ...questions(position).map(q => [q.id, `${ctx.lesson.indexOf(q) + 1}. ${richToPlain(q.content.prompt).slice(0, 60) || 'Question'}`] as [string, string])], cue.questionId ?? '', value => update({ questionId: value || null })),
                  button(`Add a new question for checkpoint ${index + 1}`, () => { const id = ctx.addQuestionAfter(block.id); if (id) update({ questionId: id }); }, { icon: Plus, class: 'btn btn-sm' }),
                ] : [textField(`Checkpoint ${index + 1} note`, richToPlain(cue.note), value => update({ note: plainToRich(value) }), { multiline: true, max: 2000 })]),
              ] }),
            checkField('Learners cannot skip ahead', c.noSkipAhead, value => set<'video'>(b => { b.content.noSkipAhead = value; }), 'They can go back, but not past the furthest point they have watched.')]));
      } else out.push(note('For chapters and checkpoints, choose the Interactive video template on the Style tab.'));
      break;
    }
    case 'embed-video': {
      const c = block.content, current = c.videoId ? (c.provider === 'youtube' ? `https://www.youtube.com/watch?v=${c.videoId}` : `https://vimeo.com/${c.videoId}`) : '';
      const status = h('p', { class: 'hint', attrs: { role: 'status' } });
      out.push(textField('YouTube or Vimeo address', current, value => {
        const parsed = parseVideoAddress(value);
        if (!value.trim()) { set<'embed-video'>(b => { b.content.videoId = ''; }, false, 'address'); status.textContent = ''; return; }
        if (!parsed) { status.textContent = 'Paste a YouTube or Vimeo video address, such as https://www.youtube.com/watch?v=…'; return; }
        set<'embed-video'>(b => { b.content.provider = parsed.provider; b.content.videoId = parsed.id; if (parsed.start !== undefined) b.content.start = parsed.start; }, false, 'address');
        status.textContent = `${parsed.provider === 'youtube' ? 'YouTube' : 'Vimeo'} video ${parsed.id} set.`;
      }, { max: 300 }), status,
        numberField('Start at (seconds)', c.start, 0, 86400, value => set<'embed-video'>(b => { b.content.start = value; })),
        note('Learners load nothing from the video service until they press play, and YouTube videos use its privacy-enhanced player. Write the transcript on the page: it is required, and it is what learners read when their network blocks the service.'));
      break;
    }
    case 'software-practice': {
      const c = block.content, step = Math.min(ctx.marker, c.steps.length - 1), current = c.steps[step]!;
      const importButton = button('Import from an OpenStage Capture take', async () => {
        const files = await pickFolder(); if (!files.length) return;
        importButton.disabled = true; importStatus.textContent = 'Reading the recording…';
        try {
          const result = await importCaptureTake(files, ctx.project);
          // The panel redraws after the import, so the outcome is told in a toast and announced.
          if (ctx.changeWithAssets(result.assets, b => { if (b.type === 'software-practice') b.content.steps = result.steps.slice(0, 60); })) { const message = `${result.steps.length} steps imported. ${result.notes.join(' ')}`; toast(message); announce(message); }
        } catch (error) { importStatus.textContent = error instanceof Error ? error.message : 'The take could not be imported.'; }
        finally { if (importButton.isConnected) importButton.disabled = false; }
      }, { icon: Plus, class: 'btn btn-sm' });
      const importStatus = h('p', { class: 'hint', attrs: { role: 'status' } });
      out.push(h('section', { class: 'insp-sec' }, [heading('Modes'),
        checkField('Watch: show each step with its target outlined', c.modes.watch, value => set<'software-practice'>(b => { b.content.modes.watch = value; if (!value && !b.content.modes.try && !b.content.modes.test) b.content.modes.try = true; }, true)),
        checkField('Try: learners select each target, with hints', c.modes.try, value => set<'software-practice'>(b => { b.content.modes.try = value; if (!value && !b.content.modes.watch && !b.content.modes.test) b.content.modes.watch = true; }, true)),
        checkField('Test: no hints; records each step right the first time', c.modes.test, value => set<'software-practice'>(b => { b.content.modes.test = value; if (!value && !b.content.modes.watch && !b.content.modes.try) b.content.modes.try = true; }, true))]),
        h('section', { class: 'insp-sec' }, [heading('Import'), importButton, importStatus, note('Choose the take folder of a recording made with interaction recording on. Each click becomes a step with a screenshot, a target and an instruction you can edit.')]),
        itemList({ title: 'Steps', items: c.steps, noun: 'Step', min: 1, max: 60, name: s2 => s2.instruction,
          row: (s2, i) => i === step ? [
            textField(`Step ${i + 1} instruction`, s2.instruction, value => set<'software-practice'>(b => { b.content.steps[i]!.instruction = value; }, false, `instruction-${i}`)),
            textField(`Step ${i + 1} screenshot description`, s2.alt, value => set<'software-practice'>(b => { b.content.steps[i]!.alt = value; }, false, `alt-${i}`), { multiline: true, max: 2000 }),
            textField(`Step ${i + 1} text to type (optional)`, s2.typed, value => set<'software-practice'>(b => { b.content.steps[i]!.typed = value; }, false, `typed-${i}`)),
            textField(`Step ${i + 1} hint`, s2.hint, value => set<'software-practice'>(b => { b.content.steps[i]!.hint = value; }, false, `hint-${i}`)),
            imageChooser(ctx, s2.imageId, (b, id) => { if (b.type === 'software-practice') b.content.steps[i]!.imageId = id; }),
          ] : [button(`Edit step ${i + 1}`, () => ctx.setMarker(i), { class: 'btn btn-sm' })],
          add: () => set<'software-practice'>(b => { const last = b.content.steps.at(-1)!; b.content.steps.push({ ...structuredClone(last), id: newId(), instruction: 'Describe the next action.', typed: '', hint: '' }); }, true),
          remove: i => set<'software-practice'>(b => { b.content.steps.splice(i, 1); }, true), move: (i, d) => set<'software-practice'>(b => moveIn(b.content.steps, i, d), true) }),
        h('section', { class: 'insp-sec' }, [heading(`Target for step ${step + 1}`), regionEditor({ src: ctx.assetSource(current.imageId), alt: '', name: `${block.id}-${step}`, shape: 'rect', selected: 0,
          regions: [{ ...current.target, label: current.instruction }], select: () => undefined,
          change: (_index, region) => set<'software-practice'>(b => { const target = b.content.steps[step]?.target; if (target) { target.x = region.x; target.y = region.y; target.w = region.w ?? target.w; target.h = region.h ?? target.h; } }) })]));
      break;
    }
    default: {
      // Media, interactions and questions keep their established settings until each gets a redesigned panel.
      const host = h('div', { class: 'classic-settings' });
      extendedSettings(host, block, ctx.project, (mutate, key, redraw) => change(mutate, { ...(key ? { group: key } : {}), redraw: !!redraw }), (file, kind, assign, input) => ctx.upload(file, kind, assign, input));
      if (!host.childElementCount) host.append(note('Edit this block directly on the page.'));
      out.push(host);
    }
  }
  return out;
}
function imageChooser(ctx: InspectorContext, assetId: string, assign: (block: Block, id: string) => void) {
  const asset = ctx.project.document.assets.find(a => a.id === assetId);
  const images = ctx.project.document.assets.filter(a => a.mediaType.startsWith('image/'));
  const upload = button(asset ? 'Replace image' : 'Upload image', async () => { const file = await pickFile('.png,.jpg,.jpeg,.webp'); if (file) ctx.upload(file, 'image', assign, upload); }, { icon: ImagePlus, class: 'btn btn-sm' });
  return h('section', { class: 'insp-sec' }, [heading('Image'),
    asset ? h('img', { class: 'insp-thumb', attrs: { src: ctx.assetSource(asset.id), alt: '' } }) : null,
    h('div', { class: 'row' }, [upload]),
    images.length > 1 ? selectField('Or use an image already in this course', images.map(a => [a.id, a.fileName] as [string, string]), assetId, value => ctx.change(b => assign(b, value), { redraw: true })) : null,
    note(`PNG, JPEG or WebP, up to ${sizeLabel(instanceLimits.fileBytes).replace('MiB', 'MB')}. Large photos are fine; learners download them once.`)]);
}

/* ---------- Style ---------- */
function styleTab(ctx: InspectorContext): HTMLElement[] {
  const { block, change } = ctx;
  const templates = templatesFor(block);
  const out: HTMLElement[] = [];
  if (templates.length > 1) {
    const group = h('div', { class: 'variants', attrs: { role: 'radiogroup', 'aria-labelledby': 'variant-heading' } });
    for (const template of templates) {
      const id = uid('var'), input = h('input', { attrs: { type: 'radio', name: `variant-${block.id}`, id, value: template.variant } });
      input.checked = template.variant === block.variant;
      input.addEventListener('change', () => { if (input.checked) ctx.variant(template.variant); });
      group.append(h('div', { class: 'variant' }, [input, h('label', { attrs: { for: id } }, [h('b', { text: template.label }), h('small', { text: template.description })])]));
    }
    out.push(h('section', { class: 'insp-sec' }, [h('h3', { class: 'insp-h', text: 'Template', attrs: { id: 'variant-heading' } }), group, note('Changing the template keeps the content.')]));
  }
  if (!ctx.child) {
    out.push(
      selectField('Width', [['reading', 'Reading column'], ['wide', 'Wide'], ['full', 'Full width']], block.appearance.width, value => change(b => { b.appearance.width = value as Block['appearance']['width']; })),
      selectField('Spacing', [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']], block.appearance.padding, value => change(b => { b.appearance.padding = value as Block['appearance']['padding']; })),
      selectField('Background', [['page', 'Page'], ['surface', 'Soft surface'], ['accent', 'Course accent']], block.appearance.background, value => change(b => { b.appearance.background = value as Block['appearance']['background']; })));
  } else out.push(note('Blocks inside a column take the column’s width. Style the columns block to change spacing and background.'));
  return out;
}

/* ---------- Behavior ---------- */
function behaviorTab(ctx: InspectorContext): HTMLElement[] {
  const { block, change } = ctx;
  switch (block.type) {
    case 'reflection': case 'activity': case 'checklist': case 'self-assessment': case 'survey': case 'action-plan': case 'scenario': {
      const need = block.type === 'scenario' ? 'reach an ending' : block.type === 'action-plan' ? 'fill in at least one complete row' : block.type === 'reflection' ? 'write at least the minimum number of words' : block.type === 'activity' ? (block.content.output ? 'write in the box' : 'mark it as done') : block.type === 'checklist' ? 'tick every item' : block.type === 'survey' ? 'answer every rating and choice' : 'rate every statement';
      return [
        checkField('Required to finish the lesson', block.content.required, value => change(b => { if ('required' in b.content) (b.content as { required: boolean }).required = value; }, { redraw: true }), `Learners must ${need}.`),
        checkField('Show in My workbook', block.content.workbook, value => change(b => { if ('workbook' in b.content) (b.content as { workbook: boolean }).workbook = value; }), 'My workbook gathers every response in one page learners can print or download.'),
        note('Responses are saved with the learner’s progress in their browser or LMS. They are never added to the course file. In SCORM 1.2, long written responses may be kept on the learner’s device only; SCORM 2004 has more room.'),
      ];
    }
    case 'accordion': case 'tabs': case 'flashcards': case 'process': case 'labeled-graphic':
      return [checkField('Learners must open every item', !!block.requiredInteraction, value => change(b => { if (value) b.requiredInteraction = true; else delete b.requiredInteraction; }), 'The lesson cannot be finished until each item has been opened.')];
    case 'continue':
      return [selectField('Before learners can continue', [['none', 'Nothing is required'], ['previous', 'Finish the block just above'], ['all-previous', 'Finish every block above']], block.completion, value => change(b => { if (b.type === 'continue') b.completion = value as typeof b.completion; })),
        textField('Message while the button is locked', block.content.hint, value => change(b => { if (b.type === 'continue') b.content.hint = value; }, { group: 'hint' }), { hint: 'Tells learners what to do first. Leave empty for the standard message.' })];
    case 'assessment':
      return [note('Scoring, attempts and completion for this question are on the Content tab.')];
    default:
      return [note('Learners read this block. It has no completion settings.')];
  }
}

/* ---------- Access ---------- */
const ANNOUNCES: Partial<Record<Block['type'], string>> = {
  heading: 'Announced as a heading, so screen reader users can jump to it.',
  list: 'Announced as a list with the number of items.',
  objectives: 'Announced as a numbered list. Thinking levels are read after each objective.',
  table: 'Announced as a table with its caption. Each cell is read with its column and row headings, so keep the heading options on when the first row or column names the data.',
  image: 'The alternative text is read in place of the picture. A decorative image is skipped.',
  'image-text': 'The picture’s alternative text is read, then the heading and text.',
  reflection: 'The prompt is the text box’s description. The word count and the sample button are announced; the sample opens below the button.',
  activity: 'Steps are read as a numbered list. The time is read with the title.',
  checklist: 'Read as a group of checkboxes named by the title, with a running count of ticked items.',
  'self-assessment': 'Each statement is a group of radio buttons. The total and its meaning are announced when every statement is rated.',
  columns: 'Columns are read in order, left to right, then top to bottom, exactly as they stack on a phone.',
  accordion: 'Each item is a button that expands its text.',
  tabs: 'Read as tabs. Arrow keys move between them.',
  flashcards: 'Each card has a button that reveals its back.',
  'labeled-graphic': 'Each marker is a numbered button named by its label, and it opens the marker’s text.',
  assessment: 'Read as a group of answers with the question as its name. Feedback is announced after submitting.',
  continue: 'A button. When it is locked, the message explains what to finish first.',
  survey: 'Each rating or choice is a group of radio buttons named by its question; comments are text boxes named by theirs.',
  glossary: 'Read as headings by letter and a description list of terms. The search box filters terms and announces how many match.',
  'action-plan': 'A table whose cells are text and date fields, each named by its column and row.',
  results: 'Read as text, a progress bar and a table of scores by lesson; each missed question has a button that goes to it.',
  'bank-draw': 'Each drawn question is read like any other question.',
  scenario: 'Read as a list of lines, each with the speaker\'s name and the pose description. Choices are buttons; focus moves to the newest line.',
};
function accessTab(ctx: InspectorContext): HTMLElement[] {
  const { block, change } = ctx;
  const out: HTMLElement[] = [h('section', { class: 'insp-sec' }, [heading('What assistive technology announces'), note(ANNOUNCES[block.type] ?? 'Read in order with the rest of the lesson.')])];
  if (block.type === 'image' || block.type === 'image-text' || block.type === 'labeled-graphic') {
    const c = block.content;
    out.push(h('section', { class: 'insp-sec' }, [heading('Alternative text'),
      textField('Describe the image', c.altText, value => change(b => { if (b.type === 'image' || b.type === 'image-text' || b.type === 'labeled-graphic') b.content.altText = value; }, { group: 'alt' }), { multiline: true, max: 2000, hint: 'Say what the picture shows that matters to the lesson, in a sentence or two.' }),
      checkField('This image is decorative', c.decorative, value => change(b => { if (b.type === 'image' || b.type === 'image-text' || b.type === 'labeled-graphic') b.content.decorative = value; }, { redraw: true }), 'Decorative images are skipped by screen readers.'),
      !c.decorative && !c.altText.trim() ? h('p', { class: 'warn-note', text: 'This image has no alternative text yet.' }) : null]));
  }
  if (block.type === 'gallery' || block.type === 'audio' || block.type === 'video') out.push(note(block.type === 'gallery' ? 'Each gallery image’s alternative text is on the Content tab.' : 'Transcripts and captions are on the Content tab. A transcript is required before publishing.'));
  // Narration scripts are saved with the block for future text-to-speech; nothing plays yet.
  out.push(h('section', { class: 'insp-sec' }, [heading('Narration script'),
    checkField('Keep a narration script for this block', !!block.narration, value => change(b => { if (value) b.narration = { script: '', language: ctx.project.document.course.language, speed: 1 }; else delete b.narration; }, { redraw: true })),
    ...(block.narration ? [textField('Script', block.narration.script, value => change(b => { if (b.narration) b.narration.script = value; }, { group: 'narration' }), { multiline: true, max: 100_000, hint: 'Saved with the block. Audio is not generated or played yet.' })] : [])]));
  return out;
}

/** Starter content for a block added to a column. */
export function columnChild(key: string, project: PortableProject) { return prepareBlock(key, project); }
