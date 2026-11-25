/** The block picker: search and categories over every block template, with a short description of each. */
import {
  Heading, Pilcrow, Megaphone, StickyNote, Quote, List, ListOrdered, ListChecks, Target, Table, Image, PanelLeft, Minus, MoveVertical,
  Columns2, Columns3, Images, AudioLines, Video, Paperclip, Link, ChevronsUpDown, PanelTop, Layers, Workflow, GitCommitVertical, MapPin,
  NotebookPen, Timer, MonitorPlay, MousePointerClick, Clapperboard, ListTodo, Gauge, CircleDot, SquareCheck, ToggleLeft, TextCursorInput, Shuffle, ArrowDownUp, LayoutGrid, ChevronsDown, type IconNode,
} from 'lucide';
import { BLOCK_TEMPLATES, type BlockTemplate } from '../shared/block-catalog.js';
import type { Block } from '../shared/course.js';
import { h, icon, openDialog } from './dom.js';
import { features } from './features.js';

const BY_KEY: Record<string, IconNode> = {
  heading: Heading, subheading: Heading, paragraph: Pilcrow, 'paragraph-heading': Pilcrow, statement: Megaphone, note: StickyNote, quote: Quote,
  'bulleted-list': List, 'numbered-list': ListOrdered, checklist: ListChecks, objectives: Target, 'objective-cards': Target, table: Table, 'striped-table': Table,
  image: Image, 'full-image': Image, 'image-text': PanelLeft, 'text-image': PanelLeft, divider: Minus, 'numbered-divider': Minus,
  'small-spacer': MoveVertical, spacer: MoveVertical, 'large-spacer': MoveVertical, columns: Columns2, 'three-columns': Columns3, 'columns-wide-left': Columns2, 'columns-wide-right': Columns2,
  gallery: Images, audio: AudioLines, video: Video, 'interactive-video': Clapperboard, 'embed-video': MonitorPlay, 'software-practice': MousePointerClick, attachment: Paperclip, button: Link, accordion: ChevronsUpDown, tabs: PanelTop, flashcards: Layers,
  process: Workflow, timeline: GitCommitVertical, 'labeled-graphic': MapPin, reflection: NotebookPen, journal: NotebookPen, activity: Timer,
  'interactive-checklist': ListTodo, 'self-assessment': Gauge, 'single-choice': CircleDot, 'multiple-response': SquareCheck, 'true-false': ToggleLeft,
  'fill-blank': TextCursorInput, matching: Shuffle, ordering: ArrowDownUp, categorize: LayoutGrid, continue: ChevronsDown,
};
export function templateIcon(key: string): IconNode { return BY_KEY[key] ?? Pilcrow; }
export function blockIcon(block: Block): IconNode { return templateIcon(templateFor(block)?.key ?? block.type); }
export function templateFor(block: Block): BlockTemplate | undefined { return BLOCK_TEMPLATES.find(t => t.type === block.type && t.variant === block.variant); }
export function blockName(block: Block) { return templateFor(block)?.label ?? block.type; }

const CATEGORIES = ['All', 'Text', 'Images', 'Structure', 'Media', 'Interactive', 'Activities', 'Assessment'] as const;
let lastCategory: (typeof CATEGORIES)[number] = 'All';

/** Opens the picker. `allowed` narrows the templates (columns accept only some blocks). */
export function chooseBlock(opener: HTMLElement | null, options: { title?: string; allowed?: (template: BlockTemplate) => boolean; pick: (key: string) => void }) {
  let category = lastCategory, query = '';
  // Embedded YouTube and Vimeo video appears only where the server allows it.
  const allowed = BLOCK_TEMPLATES.filter(t => (!options.allowed || options.allowed(t)) && (t.type !== 'embed-video' || features.externalVideo));
  const search = h('input', { class: 'inp', attrs: { type: 'search', id: 'picker-search', placeholder: 'Search blocks', 'aria-label': 'Search blocks', autocomplete: 'off' } });
  const chips = h('div', { class: 'chips', attrs: { role: 'group', 'aria-label': 'Block categories' } });
  const grid = h('div', { class: 'picker-grid' });
  const count = h('p', { class: 'sr-only', attrs: { role: 'status' } });
  const present = new Set(allowed.map(t => t.category));
  const draw = () => {
    chips.replaceChildren(...CATEGORIES.filter(c => c === 'All' || present.has(c)).map(c => h('button', { class: 'chip-btn', text: c, attrs: { type: 'button', 'aria-pressed': String(c === category) }, on: { click: () => { category = c; lastCategory = c; draw(); chips.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus(); } } })));
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    // Each word must start a word in the name, description or category, so "table" does not match "editable".
    const escape = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tests = words.map(w => new RegExp(`(^|[^a-z0-9])${escape(w)}`));
    const shown = allowed.filter(t => (category === 'All' || t.category === category) && tests.every(test => test.test(`${t.label} ${t.description} ${t.category}`.toLowerCase())));
    grid.replaceChildren(...shown.map(t => h('button', { class: 'pick', attrs: { type: 'button', 'aria-describedby': `pick-${t.key}` }, on: { click: () => { dialog.close(); options.pick(t.key); } } }, [
      h('span', { class: 'pick-ico' }, [icon(templateIcon(t.key))]),
      h('span', { class: 'pick-txt' }, [h('b', { text: t.label }), h('small', { text: t.description, attrs: { id: `pick-${t.key}` } })]),
    ])));
    if (!shown.length) grid.append(h('p', { class: 'hint', text: 'No blocks match. Try another word or choose All.' }));
    count.textContent = `${shown.length} ${shown.length === 1 ? 'block' : 'blocks'}`;
  };
  search.addEventListener('input', () => { query = search.value; draw(); });
  const dialog = openDialog({ title: options.title ?? 'Add a block', opener, wide: true, body: [search, chips, count, grid] });
  dialog.dialog.classList.add('picker');
  draw();
  search.focus();
}
