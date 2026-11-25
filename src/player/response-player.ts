import { richToDom, richIsEmpty } from '../shared/rich-text.js';
import { RESPONSE_TEXT_MAX, SURVEY_COMMENT_MAX, wordCount, selfAssessmentResult, responseMeets, type ResponseBlock, type LearnerResponse } from '../shared/responses.js';
import type { CourseFlow } from './state.js';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (cls) el.className = cls;
  return el;
}
function rich(value: string, cls = '') { const div = node('div', undefined, `os-rich ${cls}`.trim()); div.append(richToDom(value)); return div; }

/**
 * Live learner controls for reflection, activity, checklist and self-assessment blocks. Every change is kept in
 * learner progress at once (text after a short pause), and the block reports when its requirement is met.
 */
export function renderResponse(block: ResponseBlock, flow: CourseFlow, persist: () => void, refresh: () => void): HTMLElement {
  const root = node('div', undefined, 'response'), status = node('p', undefined, 'response-status');
  status.setAttribute('role', 'status');
  let saved = flow.response(block.id) ?? {};
  const store = (next: LearnerResponse, quiet = false) => {
    if (!flow.respond(block.id, next)) { status.textContent = 'This response could not be kept. Check its length and try again.'; return; }
    saved = flow.response(block.id) ?? {};
    persist(); refresh();
    if (!quiet) status.textContent = 'Kept in your progress.';
  };
  const required = block.content.required ? node('p', undefined, 'response-required') : undefined;
  const requirement = () => {
    if (!required) return;
    const met = responseMeets(block, saved);
    required.textContent = met ? 'Required · Done' : block.type === 'reflection' ? `Required · Write at least ${Math.max(1, block.content.minWords)} ${Math.max(1, block.content.minWords) === 1 ? 'word' : 'words'}` : block.type === 'checklist' ? 'Required · Tick every item' : block.type === 'self-assessment' ? 'Required · Rate every statement' : block.type === 'survey' ? 'Required · Answer every rating and choice' : block.type === 'software-practice' ? (block.content.modes.test ? 'Required · Finish the test' : 'Required · Practise every step') : block.type === 'action-plan' ? 'Required · Fill in at least one complete row' : block.type === 'scenario' ? 'Required · Reach an ending' : block.content.output ? 'Required · Write your response' : 'Required · Mark the activity as done';
    required.classList.toggle('is-met', met);
  };
  /** A text box that keeps what is typed after a short pause, and immediately when focus leaves it. */
  const writer = (label: string, placeholder: string, onWords?: (count: number) => void) => {
    const wrap = node('label', undefined, 'response-field'), caption = node('span', label), area = node('textarea');
    area.rows = 6; area.maxLength = RESPONSE_TEXT_MAX; area.value = saved.text ?? ''; if (placeholder) area.placeholder = placeholder;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const keep = (quiet: boolean) => { clearTimeout(timer); timer = undefined; if ((saved.text ?? '') !== area.value) store({ ...saved, text: area.value }, quiet); requirement(); };
    area.addEventListener('input', () => { onWords?.(wordCount(area.value)); clearTimeout(timer); timer = setTimeout(() => keep(true), 700); });
    area.addEventListener('blur', () => keep(false));
    wrap.append(caption, area);
    return wrap;
  };

  switch (block.type) {
    case 'reflection': {
      const c = block.content, prompt = rich(c.prompt, 'response-prompt');
      prompt.id = `prompt-${block.id}`;
      root.append(prompt);
      if (required) root.append(required);
      const count = node('p', undefined, 'response-count');
      const words = (n: number) => { count.textContent = `${n} ${n === 1 ? 'word' : 'words'}${c.minWords ? ` · at least ${c.minWords}` : ''}`; };
      const field = writer('Your response', c.placeholder, words);
      field.querySelector('textarea')!.setAttribute('aria-describedby', `prompt-${block.id}`);
      if (block.variant === 'journal') field.classList.add('response-journal');
      words(wordCount(saved.text ?? ''));
      root.append(field, count);
      if (!richIsEmpty(c.sample)) {
        const sample = rich(c.sample, 'response-sample'); sample.id = `sample-${block.id}`; sample.hidden = true;
        const toggle = node('button', 'Show a sample response'); toggle.type = 'button';
        toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', sample.id);
        toggle.addEventListener('click', () => { sample.hidden = !sample.hidden; toggle.setAttribute('aria-expanded', String(!sample.hidden)); toggle.textContent = sample.hidden ? 'Show a sample response' : 'Hide the sample response'; });
        root.append(toggle, sample);
      }
      break;
    }
    case 'activity': {
      const c = block.content, head = node('div', undefined, 'os-activity-head');
      head.append(node('h3', c.title || 'Activity'));
      if (c.minutes) head.append(node('span', `About ${c.minutes} ${c.minutes === 1 ? 'minute' : 'minutes'}`, 'os-minutes'));
      root.append(head);
      if (required) root.append(required);
      const steps = node('ol', undefined, 'os-steps');
      for (const step of c.steps) { const li = node('li'); li.append(rich(step)); steps.append(li); }
      root.append(steps);
      if (c.output) root.append(writer(c.output, ''));
      else {
        const done = node('button', saved.done ? 'Done' : 'Mark as done'); done.type = 'button';
        done.setAttribute('aria-pressed', String(!!saved.done));
        done.addEventListener('click', () => { store({ done: !saved.done }); done.textContent = saved.done ? 'Done' : 'Mark as done'; done.setAttribute('aria-pressed', String(!!saved.done)); requirement(); });
        root.append(done);
      }
      break;
    }
    case 'checklist': {
      const c = block.content, set = node('fieldset', undefined, 'response-checklist'), legend = node('legend', c.title || 'Checklist');
      set.append(legend);
      if (required) set.append(required);
      const count = node('p', undefined, 'response-count');
      const update = () => { count.textContent = `${saved.ticks?.length ?? 0} of ${c.items.length} done`; };
      c.items.forEach((item, index) => {
        const label = node('label'), input = node('input'); input.type = 'checkbox'; input.checked = !!saved.ticks?.includes(index);
        input.addEventListener('change', () => {
          const ticks = new Set(saved.ticks ?? []); if (input.checked) ticks.add(index); else ticks.delete(index);
          store({ ticks: [...ticks] }, true); update(); requirement();
        });
        label.append(input, document.createTextNode(` ${item}`)); set.append(label);
      });
      update(); set.append(count); root.append(set);
      break;
    }
    case 'self-assessment': {
      const c = block.content;
      if (c.title) root.append(node('h3', c.title));
      if (!richIsEmpty(c.intro)) root.append(rich(c.intro));
      if (required) root.append(required);
      const result = node('div', undefined, 'response-result'); result.setAttribute('aria-live', 'polite');
      const show = () => {
        const r = selfAssessmentResult(block, saved); result.replaceChildren();
        if (!r.complete) { result.append(node('p', `Rated ${r.rated} of ${c.items.length} statements. Rate them all to see your total.`)); return; }
        result.append(node('p', `Your total: ${r.total} of ${r.max}.`, 'response-total'));
        if (r.band) result.append(rich(r.band.text));
      };
      c.items.forEach((item, index) => {
        const set = node('fieldset', undefined, 'response-rating'); set.append(node('legend', item));
        const options = node('div', undefined, 'response-scale');
        c.scale.forEach((label, value) => {
          const choice = node('label'), input = node('input'); input.type = 'radio'; input.name = `rate-${block.id}-${index}`; input.value = String(value);
          input.checked = saved.ratings?.[index] === value;
          input.addEventListener('change', () => {
            const ratings = saved.ratings ? [...saved.ratings] : c.items.map(() => null as number | null);
            ratings[index] = value; store({ ratings }, true); show(); requirement();
          });
          choice.append(input, document.createTextNode(` ${label}`)); options.append(choice);
        });
        set.append(options); root.append(set);
      });
      show(); root.append(result);
      break;
    }
    case 'action-plan': {
      const c = block.content, blank = () => c.columns.map(() => '');
      if (c.title) root.append(node('h3', c.title));
      if (!richIsEmpty(c.intro)) root.append(rich(c.intro));
      if (required) root.append(required);
      let rows = saved.rows ? saved.rows.map(r => [...r]) : [];
      while (rows.length < c.starterRows) rows.push(blank());
      const scroll = node('div', undefined, 'os-table-scroll'), table = node('table', undefined, 'plan-table'), head = node('tr'), body = node('tbody');
      scroll.setAttribute('role', 'region'); scroll.tabIndex = 0; scroll.setAttribute('aria-label', c.title || 'Action plan');
      for (const column of c.columns) { const th = node('th', column.label); th.scope = 'col'; head.append(th); }
      const thead = node('thead'); thead.append(head); table.append(thead, body); scroll.append(table);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const keep = (quiet: boolean) => { clearTimeout(timer); store({ rows }, quiet); requirement(); };
      const add = node('button', 'Add a row'); add.type = 'button';
      const draw = () => {
        body.replaceChildren(...rows.map((row, r) => {
          const tr = node('tr');
          c.columns.forEach((column, i) => {
            const td = node('td'), input = node('input'); input.type = column.kind === 'date' ? 'date' : 'text'; input.maxLength = 1000; input.value = row[i] ?? '';
            input.setAttribute('aria-label', `${column.label}, row ${r + 1}`);
            input.addEventListener('input', () => { row[i] = input.value; clearTimeout(timer); timer = setTimeout(() => keep(true), 700); });
            input.addEventListener('change', () => { row[i] = input.value; keep(false); });
            td.append(input); tr.append(td);
          });
          return tr;
        }));
        add.disabled = rows.length >= c.maxRows;
      };
      add.addEventListener('click', () => { if (rows.length >= c.maxRows) return; rows.push(blank()); draw(); body.lastElementChild?.querySelector('input')?.focus(); status.textContent = `Row ${rows.length} added.`; });
      draw(); root.append(scroll, add);
      break;
    }
    case 'survey': {
      const c = block.content, blank = () => c.items.map(() => null as number | string | null);
      if (c.title) root.append(node('h3', c.title));
      if (!richIsEmpty(c.intro)) root.append(rich(c.intro));
      if (required) root.append(required);
      const answers = () => saved.answers ? [...saved.answers] : blank();
      c.items.forEach((item, index) => {
        if (item.kind === 'comment') {
          const wrap = node('label', undefined, 'response-field'), area = node('textarea');
          area.rows = 3; area.maxLength = SURVEY_COMMENT_MAX;
          const current = saved.answers?.[index]; area.value = typeof current === 'string' ? current : '';
          let timer: ReturnType<typeof setTimeout> | undefined;
          const keep = (quiet: boolean) => { clearTimeout(timer); const next = answers(); if ((next[index] ?? '') === area.value) return; next[index] = area.value; store({ answers: next }, quiet); requirement(); };
          area.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => keep(true), 700); });
          area.addEventListener('blur', () => keep(false));
          wrap.append(node('span', item.prompt), area); root.append(wrap);
          return;
        }
        const set = node('fieldset', undefined, 'response-rating'); set.append(node('legend', item.prompt));
        if (item.kind === 'differential') set.append(node('p', `1 means ${item.options[0] ?? 'the first end'}; ${c.scale.length} means ${item.options[1] ?? 'the other end'}.`, 'response-ends'));
        const labels = item.kind === 'choice' ? item.options : item.kind === 'differential' ? c.scale.map((_, i) => String(i + 1)) : c.scale;
        const options = node('div', undefined, 'response-scale');
        labels.forEach((label, value) => {
          const choice = node('label'), input = node('input'); input.type = 'radio'; input.name = `survey-${block.id}-${index}`; input.value = String(value);
          input.checked = saved.answers?.[index] === value;
          input.addEventListener('change', () => { const next = answers(); next[index] = value; store({ answers: next }, true); requirement(); });
          choice.append(input, document.createTextNode(` ${label}`)); options.append(choice);
        });
        set.append(options); root.append(set);
      });
      break;
    }
  }
  requirement();
  root.append(status);
  return root;
}
