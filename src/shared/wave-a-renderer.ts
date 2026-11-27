import type { Block, CourseDocument } from './course.js';
import { richToDom } from './rich-text.js';
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
type Picture = (assetId: string, alt: string, decorative: boolean) => HTMLImageElement;
export const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
type Course = CourseDocument['course'];
export function renderWaveA(block: Block, root: HTMLElement, field: Field, rich: Field, editing: boolean, child: (block: Block, prefix: string) => HTMLElement, picture?: Picture, course?: Course): boolean {
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
    case 'embed-video': {
      const c = block.content, host = c.provider === 'youtube' ? 'YouTube' : 'Vimeo';
      root.append(field('h3', c.title, 'title', 'Video title', 300, false));
      const facade = el('div', undefined, 'os-embed'); facade.dataset.embed = block.id;
      facade.append(el('p', c.videoId ? `Plays from ${host} when you press play.${editing ? '' : ` ${host} may set cookies once it plays.`}` : editing ? 'Paste the YouTube or Vimeo address in the block settings.' : 'This video is not available. Read the transcript below.', 'os-embed-note'));
      root.append(facade, el('h4', 'Transcript'), field('p', c.transcript, 'transcript', 'Video transcript'));
      return true;
    }
    case 'software-practice': {
      const c = block.content;
      root.append(field('h3', c.title, 'title', 'Practice title', 300, false));
      if (editing || c.intro) root.append(rich('div', c.intro, 'intro', 'Practice introduction'));
      const list = el('ol', undefined, 'os-practice-steps');
      c.steps.forEach((step, index) => {
        const li = el('li');
        li.append(field('p', step.instruction, `steps.${index}.instruction`, `Step ${index + 1} instruction`, 300, false));
        if (step.typed) li.append(el('p', `Type: ${step.typed}`, 'os-practice-typed'));
        if (picture) {
          const stage = el('div', undefined, 'os-hotspot-stage'); stage.append(picture(step.imageId, step.alt, false));
          const mark = el('span', undefined, 'os-area'); mark.setAttribute('aria-hidden', 'true');
          mark.style.left = `${step.target.x}%`; mark.style.top = `${step.target.y}%`; mark.style.width = `${step.target.w}%`; mark.style.height = `${step.target.h}%`;
          stage.append(mark); li.append(stage);
        }
        list.append(li);
      });
      root.append(list);
      return true;
    }
    case 'scenario': {
      const c = block.content, steps = c.scenes.flatMap(s => s.nodes), endings = steps.filter(n => n.kind === 'ending').length;
      root.append(field('h3', c.title, 'title', 'Scenario title', 300, false));
      if (editing || c.intro) root.append(rich('div', c.intro, 'intro', 'Scenario introduction'));
      root.append(el('p', `${steps.length} ${steps.length === 1 ? 'step' : 'steps'} in ${c.scenes.length} ${c.scenes.length === 1 ? 'scene' : 'scenes'}, with ${endings} ${endings === 1 ? 'ending' : 'endings'}.${editing ? ' Open the scenario editor from the block settings.' : ''}`, 'os-response-note'));
      return true;
    }
    case 'glossary': {
      const c = block.content, terms = [...(course?.glossary ?? [])].sort((a, b) => a.term.localeCompare(b.term, course?.language));
      if (editing || c.title) root.append(field('h3', c.title, 'title', 'Glossary title', 300, false));
      if (!terms.length) { root.append(el('p', editing ? 'The course glossary is empty. Add terms in Course resources.' : 'There are no terms yet.', 'os-glossary-empty')); return true; }
      const letter = (term: string) => { const first = term.trim().charAt(0).toLocaleUpperCase(course?.language); return /\p{L}/u.test(first) ? first : '#'; };
      const letters = [...new Set(terms.map(t => letter(t.term)))];
      if (c.showLetters && block.variant === 'a-z') {
        const nav = el('nav', undefined, 'os-glossary-letters'); nav.setAttribute('aria-label', 'Glossary letters');
        for (const l of letters) { const a = el('a', l); a.href = `#gl-${block.id}-${l === '#' ? 'other' : l}`; nav.append(a); }
        root.append(nav);
      }
      const body = el('div', undefined, 'os-glossary-body');
      for (const l of letters) {
        if (block.variant === 'a-z') { const heading = el('h4', l); heading.id = `gl-${block.id}-${l === '#' ? 'other' : l}`; heading.tabIndex = -1; body.append(heading); }
        const list = el('dl', undefined, 'os-glossary');
        for (const term of terms.filter(t => letter(t.term) === l)) {
          const dt = el('dt', term.term); dt.dataset.term = `${term.term} ${term.aliases.join(' ')}`.toLowerCase();
          if (term.aliases.length) dt.append(el('span', ` (also ${term.aliases.join(', ')})`, 'os-level-plain'));
          const dd = el('dd'); const body2 = el('div', undefined, 'os-rich'); body2.append(richToDom(term.definition)); dd.append(body2);
          list.append(dt, dd);
        }
        body.append(list);
      }
      root.append(body);
      if (editing) root.append(el('p', 'Terms are edited in Course resources, Glossary.', 'os-response-note'));
      return true;
    }
    case 'action-plan': {
      const c = block.content;
      if (editing || c.title) root.append(field('h3', c.title, 'title', 'Action plan title', 300, false));
      if (editing || c.intro) root.append(rich('div', c.intro, 'intro', 'Action plan introduction'));
      const scroll = el('div', undefined, 'os-table-scroll'), table = el('table', undefined, 'os-plan'), head = el('tr');
      scroll.setAttribute('role', 'region'); scroll.tabIndex = 0; scroll.setAttribute('aria-label', c.title || 'Action plan');
      c.columns.forEach((column, index) => { const th = el('th'); th.scope = 'col'; th.append(field('span', column.label, `columns.${index}.label`, `Column ${index + 1} heading`, 300, false)); head.append(th); });
      const thead = el('thead'); thead.append(head); table.append(thead);
      const tbody = el('tbody');
      for (let r = 0; r < c.starterRows; r++) { const row = el('tr'); for (let i = 0; i < c.columns.length; i++) row.append(el('td')); tbody.append(row); }
      table.append(tbody); scroll.append(table); root.append(scroll);
      return true;
    }
    case 'results': {
      root.append(field('h3', block.content.title, 'title', 'Results title', 300, false));
      root.append(el('p', 'Learners see their progress, their scores by lesson, whether they passed' + (block.content.showReview ? ', the questions they missed' : '') + (block.content.showCertificate ? ', and a certificate to print once the course is complete' : '') + '.', 'os-response-note'));
      return true;
    }
    case 'bank-draw': {
      const bank = course?.banks.find(b => b.id === block.content.bankId);
      if (editing || block.content.title) root.append(field('h3', block.content.title, 'title', 'Title above the questions (optional)', 300, false));
      root.append(el('p', bank ? `${Math.min(block.content.count, bank.questions.length)} of the ${bank.questions.length} questions in “${bank.name || 'Untitled bank'}”, drawn at random for each learner.` : 'Choose a question bank in the block settings.', 'os-response-note'));
      return true;
    }
    case 'survey': {
      const c = block.content;
      if (editing || c.title) root.append(field('h3', c.title, 'title', 'Survey title', 300, false));
      if (editing || c.intro) root.append(rich('div', c.intro, 'intro', 'Survey introduction'));
      const list = el('ol', undefined, 'os-survey');
      c.items.forEach((item, index) => {
        const li = el('li');
        li.append(field('p', item.prompt, `items.${index}.prompt`, `Survey question ${index + 1}`, 300, false));
        if (item.kind === 'comment') li.append(el('div', undefined, 'os-response-box'));
        else if (item.kind === 'differential') li.append(el('p', `${item.options[0] ?? ''} · 1 to ${c.scale.length} · ${item.options[1] ?? ''}`, 'os-scale-preview'));
        else li.append(el('p', (item.kind === 'choice' ? item.options : c.scale).join(' · '), 'os-scale-preview'));
        list.append(li);
      });
      root.append(list);
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
