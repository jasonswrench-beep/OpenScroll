/**
 * The block inspector. Text that learners read is edited on the page; the inspector holds everything else, in four
 * tabs: Content (items, rows, images, answers), Style (template, width, spacing, background), Behavior (what
 * learners must do) and Access (alternative text, narration, and what assistive technology announces).
 */
import { ArrowUp, ArrowDown, Trash2, Plus, ImagePlus } from 'lucide';
import { OBJECTIVE_LEVELS, COLUMN_CHILD_TYPES, type Block, type PortableProject } from '../shared/course.js';
import { OBJECTIVE_LEVEL_NAMES } from '../shared/objectives.js';
import { templatesFor, prepareBlock } from '../shared/block-catalog.js';
import { newId } from '../shared/outline.js';
import { extendedSettings } from '../client/extended-settings.js';
import { richToPlain } from '../shared/rich-text.js';
import { h, button, icon, pickFile } from './dom.js';
import { blockName, blockIcon, chooseBlock } from './block-picker.js';
import { regionEditor } from './region-editor.js';

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
    note('PNG, JPEG or WebP, up to 16 MB. Large photos are fine; learners download them once.')]);
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
    case 'reflection': case 'activity': case 'checklist': case 'self-assessment': {
      const need = block.type === 'reflection' ? 'write at least the minimum number of words' : block.type === 'activity' ? (block.content.output ? 'write in the box' : 'mark it as done') : block.type === 'checklist' ? 'tick every item' : 'rate every statement';
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
