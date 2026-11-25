import type { Block } from './course.js';
import { OBJECTIVE_LEVEL_NAMES } from './objectives.js';

type Field = (tag: string, value: string, key: string, label: string, max?: number, multiline?: boolean) => HTMLElement;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
}

/**
 * The reading view of the Wave A blocks. In the editor (editing) every text is an editable field; for learners
 * the response blocks show a read-only version that the player replaces with live controls.
 * Returns false for any other block type.
 */
export function renderWaveA(block: Block, root: HTMLElement, field: Field, rich: Field, editing: boolean, child: (block: Block, prefix: string) => HTMLElement): boolean {
  switch (block.type) {
    case 'objectives': {
      const c = block.content;
      if (editing || c.heading) root.append(field('h3', c.heading, 'heading', 'Objectives heading', 300, false));
      if (editing || c.intro) root.append(rich('div', c.intro, 'intro', 'Objectives introduction'));
      const list = el('ol', undefined, block.variant === 'cards' ? 'os-objectives os-objective-cards' : 'os-objectives');
      c.items.forEach((item, index) => {
        const li = el('li');
        li.append(field('span', item.text, `items.${index}.text`, `Objective ${index + 1}`, 300, false));
        if (item.level) li.append(el('span', OBJECTIVE_LEVEL_NAMES[item.level], 'os-level'));
        list.append(li);
      });
      root.append(list);
      return true;
    }
    case 'table': {
      const c = block.content, scroll = el('div', undefined, 'os-table-scroll'), table = el('table');
      // A wide table scrolls inside its own region, which keyboard users can focus and scroll.
      scroll.setAttribute('role', 'region'); scroll.tabIndex = 0;
      scroll.setAttribute('aria-label', c.caption || 'Table');
      if (editing || c.caption) { const caption = el('caption'); caption.append(field('span', c.caption, 'caption', 'Table caption', 300, false)); table.append(caption); }
      if (c.head.length) {
        const row = el('tr');
        c.head.forEach((value, index) => { const th = el('th'); th.scope = 'col'; th.append(field('span', value, `head.${index}`, `Column ${index + 1} heading`, 300, false)); row.append(th); });
        const thead = el('thead'); thead.append(row); table.append(thead);
      }
      const tbody = el('tbody');
      c.rows.forEach((cells, r) => {
        const row = el('tr');
        cells.forEach((cell, index) => {
          const header = index === 0 && c.headerColumn, td = el(header ? 'th' : 'td');
          if (header) (td as HTMLTableCellElement).scope = 'row';
          td.append(rich('div', cell, `rows.${r}.${index}`, `Row ${r + 1}, column ${index + 1}`));
          row.append(td);
        });
        tbody.append(row);
      });
      table.append(tbody); scroll.append(table); root.append(scroll);
      return true;
    }
    case 'reflection': {
      const c = block.content;
      root.append(rich('div', c.prompt, 'prompt', 'Reflection prompt'));
      if (c.minWords) root.append(el('p', `Write at least ${c.minWords} words.`, 'os-response-note'));
      const box = el('div', undefined, 'os-response-box');
      box.append(editing ? field('p', c.placeholder, 'placeholder', 'Hint shown in the empty answer box', 300, false) : el('p', c.placeholder || 'Your response'));
      root.append(box);
      if (editing) { root.append(el('h4', 'Sample response', 'os-sample-label')); root.append(rich('div', c.sample, 'sample', 'Sample response')); }
      return true;
    }
    case 'activity': {
      const c = block.content, header = el('div', undefined, 'os-activity-head');
      header.append(field('h3', c.title, 'title', 'Activity title', 300, false));
      if (c.minutes) header.append(el('span', `About ${c.minutes} ${c.minutes === 1 ? 'minute' : 'minutes'}`, 'os-minutes'));
      root.append(header);
      const steps = el('ol', undefined, 'os-steps');
      c.steps.forEach((step, index) => { const li = el('li'); li.append(rich('div', step, `steps.${index}`, `Step ${index + 1}`)); steps.append(li); });
      root.append(steps);
      if (editing || c.output) { root.append(field('h4', c.output, 'output', 'Writing box label (leave empty for no box)', 300, false)); if (editing || c.output) root.append(el('div', undefined, 'os-response-box')); }
      return true;
    }
    case 'checklist': {
      const c = block.content;
      if (editing || c.title) root.append(field('h3', c.title, 'title', 'Checklist title', 300, false));
      const list = el('ul', undefined, 'os-tick-list');
      c.items.forEach((item, index) => { const li = el('li'); li.append(el('span', undefined, 'os-box'), field('span', item, `items.${index}`, `Checklist item ${index + 1}`, 300, false)); list.append(li); });
      root.append(list);
      return true;
    }
    case 'self-assessment': {
      const c = block.content;
      if (editing || c.title) root.append(field('h3', c.title, 'title', 'Self-assessment title', 300, false));
      if (editing || c.intro) root.append(rich('div', c.intro, 'intro', 'Self-assessment introduction'));
      const scroll = el('div', undefined, 'os-table-scroll'), table = el('table', undefined, 'os-rating'), head = el('tr');
      scroll.setAttribute('role', 'region'); scroll.tabIndex = 0; scroll.setAttribute('aria-label', c.title || 'Self-assessment');
      const statement = el('th', 'Statement'); statement.scope = 'col'; head.append(statement);
      c.scale.forEach((label, index) => { const th = el('th'); th.scope = 'col'; th.append(field('span', label, `scale.${index}`, `Rating ${index + 1} label`, 300, false)); head.append(th); });
      const thead = el('thead'); thead.append(head); table.append(thead);
      const tbody = el('tbody');
      c.items.forEach((item, index) => {
        const row = el('tr'), th = el('th'); th.scope = 'row';
        th.append(field('span', item, `items.${index}`, `Statement ${index + 1}`, 300, false)); row.append(th);
        for (let i = 0; i < c.scale.length; i++) { const td = el('td'); td.append(el('span', undefined, 'os-dot')); row.append(td); }
        tbody.append(row);
      });
      table.append(tbody); scroll.append(table); root.append(scroll);
      if (editing || c.bands.length) {
        root.append(el('h4', 'What your total means'));
        const list = el('dl', undefined, 'os-bands');
        c.bands.forEach((band, index) => { list.append(el('dt', `${band.min}–${band.max}`), (() => { const dd = el('dd'); dd.append(rich('div', band.text, `bands.${index}.text`, `Meaning of totals ${band.min} to ${band.max}`)); return dd; })()); });
        root.append(list);
      }
      return true;
    }
    case 'columns': {
      const grid = el('div', undefined, `os-columns os-cols-${block.variant}`);
      block.content.columns.forEach((column, c) => {
        const cell = el('div', undefined, 'os-column');
        column.blocks.forEach((inner, index) => cell.append(child(inner, `columns.${c}.blocks.${index}.content.`)));
        if (!column.blocks.length && editing) cell.append(el('p', 'Empty column', 'os-empty-column'));
        grid.append(cell);
      });
      root.append(grid);
      return true;
    }
    default:
      return false;
  }
}
