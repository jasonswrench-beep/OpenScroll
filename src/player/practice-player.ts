/**
 * Software practice: Watch shows each step with its target outlined; Try asks the learner to select the target (a
 * hint appears after the second miss); Test is the same without hints and records whether each step was right the
 * first time. Keyboard users reach the target as a labeled button, so no step depends on pointing precisely.
 */
import type { Block } from '../shared/course.js';
import { richToDom, richIsEmpty } from '../shared/rich-text.js';
import type { CourseFlow } from './state.js';

type Practice = Extract<Block, { type: 'software-practice' }>;
type Mode = 'watch' | 'try' | 'test';
function node<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (cls) el.className = cls;
  return el;
}
const same = (a: string, b: string) => a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase();

export function renderPractice(block: Practice, flow: CourseFlow, persist: () => void, refresh: () => void, url: (assetId: string) => string): HTMLElement {
  const c = block.content, modes = (['watch', 'try', 'test'] as Mode[]).filter(m => c.modes[m]);
  const root = node('div', undefined, 'practice');
  let mode: Mode = modes[0] ?? 'watch', step = 0, misses = 0, results: number[] = [], firstTry = true;
  const status = node('p', undefined, 'practice-status'); status.setAttribute('role', 'status');
  const stage = node('div', undefined, 'practice-stage');
  const switcher = node('div', undefined, 'practice-modes'); switcher.setAttribute('role', 'group'); switcher.setAttribute('aria-label', 'Practice mode');
  const names: Record<Mode, string> = { watch: 'Watch', try: 'Try', test: 'Test' };
  for (const m of modes) {
    const b = node('button', names[m]); b.type = 'button'; b.setAttribute('aria-pressed', String(m === mode));
    b.addEventListener('click', () => { mode = m; switcher.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); start(); });
    switcher.append(b);
  }
  root.append(node('h3', c.title || 'Software practice'));
  if (!richIsEmpty(c.intro)) { const intro = node('div', undefined, 'os-rich'); intro.append(richToDom(c.intro)); root.append(intro); }
  const saved = flow.response(block.id);
  if (saved?.test) root.append(node('p', `Your last test: ${saved.test.filter(Boolean).length} of ${saved.test.length} steps right the first time.`, 'practice-last'));
  if (modes.length > 1) root.append(switcher);
  root.append(stage, status);

  const keep = (value: { done?: boolean; test?: number[] }) => { const current = flow.response(block.id) ?? {}; if (flow.respond(block.id, { ...current, ...value })) { persist(); refresh(); } };
  function start() { step = 0; misses = 0; results = []; firstTry = true; draw(); status.textContent = `${names[mode]}: step 1 of ${c.steps.length}.`; }
  function finish() {
    stage.replaceChildren();
    if (mode === 'test') { keep({ test: results, done: true }); const right = results.filter(Boolean).length; stage.append(node('p', `Test finished: ${right} of ${results.length} steps right the first time.`, 'practice-done')); }
    else { keep({ done: true }); stage.append(node('p', mode === 'watch' ? 'You have watched every step.' : 'You have practised every step.', 'practice-done')); }
    const again = node('button', mode === 'test' ? 'Take the test again' : 'Start again'); again.type = 'button'; again.addEventListener('click', start);
    stage.append(again); again.focus();
  }
  function advance() {
    if (mode === 'test') results.push(firstTry ? 1 : 0);
    step++; misses = 0; firstTry = true;
    if (step >= c.steps.length) { finish(); return; }
    draw(); status.textContent = `Step ${step + 1} of ${c.steps.length}.`;
    stage.querySelector<HTMLElement>('.practice-instruction')?.focus();
  }
  function draw() {
    const s = c.steps[step]!, picture = node('div', undefined, 'practice-picture'), img = node('img');
    img.src = url(s.imageId); img.alt = s.alt; picture.append(img);
    const instruction = node('p', `Step ${step + 1} of ${c.steps.length}: ${s.instruction}`, 'practice-instruction'); instruction.tabIndex = -1;
    const hint = node('p', undefined, 'practice-hint'); hint.hidden = true;
    const place = (el: HTMLElement) => { el.style.left = `${s.target.x}%`; el.style.top = `${s.target.y}%`; el.style.width = `${s.target.w}%`; el.style.height = `${s.target.h}%`; };
    const controls = node('div', undefined, 'practice-controls');
    stage.replaceChildren(instruction, picture, hint, controls);
    if (mode === 'watch') {
      const outline = node('div', undefined, 'practice-target is-shown'); outline.setAttribute('aria-hidden', 'true'); place(outline); picture.append(outline);
      if (s.typed) stage.insertBefore(node('p', `Then type: ${s.typed}`, 'practice-typed'), picture);
      const back = node('button', 'Previous step'); back.type = 'button'; back.disabled = step === 0; back.addEventListener('click', () => { step--; draw(); status.textContent = `Step ${step + 1} of ${c.steps.length}.`; });
      const next = node('button', step === c.steps.length - 1 ? 'Finish' : 'Next step'); next.type = 'button'; next.addEventListener('click', () => advance());
      controls.append(back, next);
      return;
    }
    const target = node('button', undefined, 'practice-target'); target.type = 'button';
    target.setAttribute('aria-label', `Select here: ${s.instruction}`); place(target); picture.append(target);
    const miss = () => {
      misses++; firstTry = false;
      status.textContent = 'Not quite. Try again.';
      if (mode === 'try' && misses >= 2) { hint.hidden = false; hint.textContent = s.hint || 'Look for the highlighted area.'; target.classList.add('is-shown'); }
    };
    picture.addEventListener('click', event => { if (event.target === img) miss(); });
    target.addEventListener('click', () => {
      if (!s.typed) { status.textContent = 'Right.'; advance(); return; }
      target.disabled = true;
      const label = node('label', 'Type the text'), input = node('input'); input.type = 'text'; input.autocomplete = 'off'; label.append(input);
      const check = node('button', 'Check'); check.type = 'button';
      const test = () => { if (same(input.value, s.typed)) { status.textContent = 'Right.'; advance(); } else { firstTry = false; status.textContent = mode === 'try' ? `Not quite. Type exactly: ${s.typed}` : 'Not quite. Try again.'; input.focus(); } };
      check.addEventListener('click', test); input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); test(); } });
      controls.replaceChildren(label, check); input.focus();
    });
    const skip = node('button', mode === 'try' ? 'Show me' : 'Skip this step'); skip.type = 'button';
    skip.addEventListener('click', () => { if (mode === 'try') { misses = Math.max(misses, 2); firstTry = false; hint.hidden = false; hint.textContent = s.hint || 'The highlighted area is the place to select.'; target.classList.add('is-shown'); target.focus(); } else { firstTry = false; advance(); } });
    controls.append(skip);
  }
  start();
  return root;
}
