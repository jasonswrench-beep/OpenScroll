/**
 * Learner views that draw on course resources: questions drawn from a bank, the results page with its printable
 * certificate, glossary search, and glossary term links in lesson text (a toggletip button on the first use of
 * each term in a lesson, so definitions work by keyboard and touch rather than hover).
 */
import type { Block, PortableProject } from '../shared/course.js';
import { isAssessment, correctAnswer } from '../shared/assessment.js';
import { richToPlain } from '../shared/rich-text.js';
import { renderAssessment } from './assessment-player.js';
import type { CourseFlow } from './state.js';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (cls) el.className = cls;
  return el;
}

/** A bank-draw block: this learner's questions, drawn once and kept. */
export function renderDraw(block: Extract<Block, { type: 'bank-draw' }>, flow: CourseFlow, persist: () => void, changed: (focus: string) => void, url: (id: string) => string) {
  const root = node('div', undefined, 'bank-draw');
  if (block.content.title) root.append(node('h3', block.content.title));
  const questions = flow.drawn(block.id);
  if (!questions.length) { root.append(node('p', 'These questions are not available.')); return root; }
  for (const question of questions) { const wrap = node('div', undefined, 'bank-question'); wrap.append(renderAssessment(question, flow, persist, changed, url)); root.append(wrap); }
  return root;
}

/** Every question in the course this learner can see, with its lesson: lesson questions and drawn bank questions. */
function courseQuestions(project: PortableProject, flow: CourseFlow) {
  return project.document.course.sections.flatMap(s => s.lessons).flatMap(lesson => lesson.blocks.flatMap(block =>
    isAssessment(block) ? [{ lesson, question: block }] : block.type === 'bank-draw' ? flow.drawn(block.id).map(question => ({ lesson, question })) : []));
}

/** The results block: progress, scores by lesson, pass status, missed questions, and the certificate. */
export function renderResults(block: Extract<Block, { type: 'results' }>, flow: CourseFlow, project: PortableProject, go: (lessonId: string, questionId: string) => void, url: (id: string) => string) {
  const course = project.document.course, root = node('div', undefined, 'results');
  root.append(node('h3', block.content.title || 'Your results'));
  const progress = flow.progress, score = flow.score;
  const done = node('p', `${progress.done} of ${progress.total} lessons complete.`); const meter = node('progress'); meter.max = Math.max(1, progress.total); meter.value = progress.done; meter.setAttribute('aria-label', 'Lessons complete');
  root.append(done, meter);
  if (score.possible || score.status === 'incomplete') {
    const status = score.status === 'passed' ? 'You passed.' : score.status === 'failed' ? 'You have not reached the passing score yet.' : score.status === 'incomplete' ? 'Answer every scored question to see whether you passed.' : '';
    root.append(node('p', `Score: ${score.earned} of ${score.possible} points${score.percent !== null ? ` (${score.percent}%)` : ''}. Passing score: ${score.passingScore}%. ${status}`.trim(), 'results-score'));
    const rows = course.sections.flatMap(s => s.lessons).map(lesson => {
      const qs = courseQuestions(project, flow).filter(q => q.lesson.id === lesson.id && q.question.assessment.graded).map(q => q.question);
      if (!qs.length) return undefined;
      const earned = qs.reduce((n, q) => { const r = flow.record(q.id); return n + (r?.best && correctAnswer(q, r.best) ? q.assessment.points : 0); }, 0), possible = qs.reduce((n, q) => n + q.assessment.points, 0);
      const answered = qs.filter(q => flow.record(q.id)?.last).length;
      return [lesson.title || 'Untitled lesson', `${answered} of ${qs.length}`, `${earned} of ${possible}`];
    }).filter((r): r is string[] => !!r);
    if (rows.length) {
      const table = node('table', undefined, 'results-table'), caption = node('caption', 'Scores by lesson'), head = node('tr');
      for (const label of ['Lesson', 'Questions answered', 'Points']) { const th = node('th', label); th.scope = 'col'; head.append(th); }
      const thead = node('thead'); thead.append(head);
      const tbody = node('tbody');
      for (const [lesson, answered, points] of rows) { const tr = node('tr'), th = node('th', lesson); th.scope = 'row'; tr.append(th, node('td', answered), node('td', points)); tbody.append(tr); }
      table.append(caption, thead, tbody); root.append(table);
    }
  }
  if (block.content.showReview) {
    const missed = courseQuestions(project, flow).filter(({ question }) => { const r = flow.record(question.id); return !!r?.last && !(question.variant === 'short-answer' && question.content.selfCheck) && !correctAnswer(question, r.best ?? r.last); });
    root.append(node('h4', 'Questions to review'));
    if (!missed.length) root.append(node('p', 'Nothing to review: every answered question is correct.'));
    else {
      const list = node('ul', undefined, 'results-missed');
      for (const { lesson, question } of missed) {
        const li = node('li'), b = node('button', 'Go to the question'); b.type = 'button';
        b.setAttribute('aria-label', `Go to the question: ${richToPlain(question.content.prompt).slice(0, 120)}`);
        b.addEventListener('click', () => go(lesson.id, question.id));
        li.append(node('span', `${lesson.title || 'Untitled lesson'}: ${richToPlain(question.content.prompt).slice(0, 160)} `), b); list.append(li);
      }
      root.append(list);
    }
  }
  if (block.content.showCertificate && course.certificate) {
    const complete = progress.total > 0 && progress.done === progress.total, earned = score.status === 'passed' || score.status === 'not-assessed';
    root.append(node('h4', 'Certificate'));
    if (!complete || !earned) root.append(node('p', `Your certificate is available once you have completed every lesson${score.possible ? ' and reached the passing score' : ''}.`));
    else {
      const label = node('label', 'Your name as it should appear on the certificate'), input = node('input'); input.type = 'text'; input.maxLength = 120; input.autocomplete = 'name'; label.append(input);
      const show = node('button', 'Show my certificate'); show.type = 'button';
      const holder = node('div');
      show.addEventListener('click', () => {
        if (!input.value.trim()) { input.focus(); input.setAttribute('aria-invalid', 'true'); return; }
        input.removeAttribute('aria-invalid');
        holder.replaceChildren(certificate(project, input.value.trim(), score, url));
        holder.querySelector<HTMLElement>('.certificate')?.focus();
      });
      root.append(label, show, holder, node('p', 'This certificate is printed from your browser. It is not verified by an online service.', 'results-note'));
    }
  }
  return root;
}

function certificate(project: PortableProject, name: string, score: CourseFlow['score'], url: (id: string) => string) {
  const course = project.document.course, c = course.certificate!;
  const sheet = node('section', undefined, 'certificate'); sheet.tabIndex = -1; sheet.setAttribute('aria-label', 'Certificate of completion');
  if (c.logoId) { const logo = node('img', undefined, 'certificate-logo'); logo.src = url(c.logoId); logo.alt = c.issuer ? `${c.issuer} logo` : ''; sheet.append(logo); }
  sheet.append(node('p', c.title || 'Certificate of completion', 'certificate-title'), node('p', 'This certifies that', 'certificate-small'), node('p', name, 'certificate-name'),
    node('p', 'has completed', 'certificate-small'), node('p', course.title || 'the course', 'certificate-course'));
  if (c.showScore && score.percent !== null) sheet.append(node('p', `with a score of ${score.percent}%`, 'certificate-small'));
  sheet.append(node('p', new Date().toLocaleDateString(course.language, { year: 'numeric', month: 'long', day: 'numeric' }), 'certificate-date'));
  const sign = node('div', undefined, 'certificate-sign');
  if (c.signatureId) { const img = node('img', undefined, 'certificate-signature'); img.src = url(c.signatureId); img.alt = c.signerName ? `Signature of ${c.signerName}` : 'Signature'; sign.append(img); }
  if (c.signerName) sign.append(node('p', c.signerName, 'certificate-signer'));
  if (c.signerTitle) sign.append(node('p', c.signerTitle, 'certificate-small'));
  if (c.issuer) sign.append(node('p', c.issuer, 'certificate-small'));
  sheet.append(sign);
  const print = node('button', 'Print or save as PDF'); print.type = 'button';
  print.addEventListener('click', () => { document.body.classList.add('print-certificate'); window.print(); });
  window.addEventListener('afterprint', () => document.body.classList.remove('print-certificate'));
  const wrap = node('div', undefined, 'certificate-wrap'); wrap.append(sheet, print);
  return wrap;
}

/** Search for the glossary block. */
export function enhanceGlossary(block: Extract<Block, { type: 'glossary' }>, root: HTMLElement) {
  if (!block.content.search) return;
  const body = root.querySelector<HTMLElement>('.os-glossary-body');
  if (!body) return;
  const label = node('label', 'Search the glossary', 'glossary-search'), input = node('input'); input.type = 'search'; input.autocomplete = 'off'; label.append(input);
  const status = node('p', undefined, 'sr-only'); status.setAttribute('role', 'status');
  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase(); let shown = 0;
    for (const dt of body.querySelectorAll<HTMLElement>('dt')) { const match = !query || (dt.dataset.term ?? '').includes(query); dt.hidden = !match; const dd = dt.nextElementSibling as HTMLElement | null; if (dd) dd.hidden = !match; if (match) shown++; }
    for (const list of body.querySelectorAll<HTMLElement>('dl')) { const empty = ![...list.querySelectorAll('dt')].some(dt => !dt.hidden); list.hidden = empty; const heading = list.previousElementSibling; if (heading?.tagName === 'H4') (heading as HTMLElement).hidden = empty; }
    status.textContent = query ? `${shown} ${shown === 1 ? 'term' : 'terms'} found.` : '';
  });
  body.before(label, status);
}

/**
 * Links the first use of each glossary term (or its alias) in the lesson's formatted text to its definition, with a
 * toggletip: a button that shows the definition below it and announces it.
 */
export function linkGlossaryTerms(container: HTMLElement, project: PortableProject) {
  const course = project.document.course;
  if (!course.settings.glossaryLinks || !course.glossary.length) return;
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pending = course.glossary.map(term => ({ term, pattern: new RegExp(`(?<![\\p{L}\\p{N}])(${[term.term, ...term.aliases].filter(Boolean).map(escape).join('|')})(?![\\p{L}\\p{N}])`, 'iu') }));
  let count = 0;
  for (const rich of container.querySelectorAll<HTMLElement>('.os-rich')) {
    if (rich.closest('.os-glossary-body, form, button, a, .term')) continue;
    const walker = document.createTreeWalker(rich, NodeFilter.SHOW_TEXT);
    const texts: Text[] = []; for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text);
    for (const text of texts) {
      for (let i = 0; i < pending.length; i++) {
        const entry = pending[i]!, value = text.nodeValue ?? '', match = entry.pattern.exec(value);
        if (!match || text.parentElement?.closest('a, button, .term')) continue;
        const after = text.splitText(match.index), rest = after.splitText(match[0].length), id = `term-tip-${++count}`;
        const wrap = node('span', undefined, 'term'), button = node('button', match[0], 'term-button'); button.type = 'button';
        button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', id); button.setAttribute('aria-label', `${match[0]}: show the definition`);
        const tip = node('span', undefined, 'term-tip'); tip.id = id; tip.setAttribute('role', 'status'); tip.hidden = true;
        button.addEventListener('click', () => { const open = tip.hidden; tip.hidden = !open; tip.textContent = open ? `${entry.term.term}: ${richToPlain(entry.term.definition)}` : ''; button.setAttribute('aria-expanded', String(open)); });
        button.addEventListener('keydown', event => { if (event.key === 'Escape' && !tip.hidden) { tip.hidden = true; tip.textContent = ''; button.setAttribute('aria-expanded', 'false'); } });
        wrap.append(button, tip); after.replaceWith(wrap);
        pending.splice(i, 1); i--;
        texts.push(rest);
        break;
      }
    }
  }
}
