import type { PortableProject } from '../shared/course.js';
import { isResponseBlock, responseText, responseTitle, selfAssessmentResult, type ResponseBlock } from '../shared/responses.js';
import { richToDom } from '../shared/rich-text.js';
import type { CourseFlow } from './state.js';

function node<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (cls) el.className = cls;
  return el;
}

/** The blocks that appear in My workbook, with the lesson each belongs to, in course order. */
export function workbookEntries(project: PortableProject) {
  return project.document.course.sections.flatMap(section => section.lessons).flatMap(lesson =>
    lesson.blocks.filter((block): block is ResponseBlock => isResponseBlock(block) && block.content.workbook).map(block => ({ lesson, block })));
}

/** My workbook: every written answer, tick and rating in one printable page. */
export function renderWorkbook(project: PortableProject, flow: CourseFlow, close: () => void): HTMLElement {
  const course = project.document.course, root = node('section', undefined, 'player-workbook');
  root.setAttribute('aria-labelledby', 'workbook-title');
  const heading = node('h2', 'My workbook'); heading.id = 'workbook-title'; heading.tabIndex = -1; heading.dataset.focus = 'workbook';
  root.append(heading, node('p', `Your responses in ${course.title || 'this course'}. They are kept with your progress in this browser or your LMS, not sent anywhere else.`, 'workbook-intro'));
  const actions = node('div', undefined, 'workbook-actions');
  const button = (label: string, run: () => void) => { const b = node('button', label); b.type = 'button'; b.addEventListener('click', run); actions.append(b); return b; };
  button('Back to the course', close).dataset.focus = 'workbook-close';
  button('Print or save as PDF', () => window.print());
  button('Download as a text file', () => {
    const text = workbookText(project, flow), url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = 'my-workbook.txt'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  root.append(actions);
  const entries = workbookEntries(project);
  if (!entries.length) { root.append(node('p', 'This course has no workbook activities.')); return root; }
  let lessonId = '';
  for (const { lesson, block } of entries) {
    if (lesson.id !== lessonId) { lessonId = lesson.id; root.append(node('h3', lesson.title || 'Untitled lesson')); }
    const item = node('article', undefined, 'workbook-entry'), response = flow.response(block.id);
    item.append(node('h4', responseTitle(block)));
    if (block.type === 'checklist') {
      const list = node('ul', undefined, 'workbook-ticks');
      block.content.items.forEach((text, i) => list.append(node('li', `${response?.ticks?.includes(i) ? 'Done' : 'Not done'}: ${text}`)));
      item.append(list);
    } else if (block.type === 'self-assessment') {
      const list = node('ul');
      block.content.items.forEach((text, i) => { const r = response?.ratings?.[i]; list.append(node('li', `${text} — ${r === null || r === undefined ? 'not rated' : block.content.scale[r]}`)); });
      item.append(list);
      const result = selfAssessmentResult(block, response);
      if (result.complete) { item.append(node('p', `Total: ${result.total} of ${result.max}.`)); if (result.band) { const meaning = node('div', undefined, 'os-rich'); meaning.append(richToDom(result.band.text)); item.append(meaning); } }
    } else {
      const text = responseText(block, response);
      item.append(text ? node('p', text, 'workbook-text') : node('p', 'Not answered yet.', 'workbook-empty'));
    }
    root.append(item);
  }
  return root;
}

export function workbookText(project: PortableProject, flow: CourseFlow) {
  const lines = [`My workbook: ${project.document.course.title || 'Untitled course'}`, ''];
  let lessonId = '';
  for (const { lesson, block } of workbookEntries(project)) {
    if (lesson.id !== lessonId) { lessonId = lesson.id; lines.push(`== ${lesson.title || 'Untitled lesson'} ==`, ''); }
    lines.push(responseTitle(block), responseText(block, flow.response(block.id)) || 'Not answered yet.', '');
  }
  return lines.join('\n');
}
