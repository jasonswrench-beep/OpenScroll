/** The Checks dialog: issues grouped by effect, each naming its lesson and block, with Go to issue. */
import { OctagonAlert, TriangleAlert, Eye, CircleCheck } from 'lucide';
import { eachBlock, type PortableProject } from '../shared/course.js';
import { blockSummary, type CheckIssue, type CheckEffect } from '../project/checks.js';
import { h, icon, button, openDialog } from './dom.js';
import { blockName } from './block-picker.js';

const GROUPS: { effect: CheckEffect; title: string; help: string; glyph: typeof OctagonAlert }[] = [
  { effect: 'blocks', title: 'Blocks export', help: 'Fix these before exporting a website, SCORM package or PDF.', glyph: OctagonAlert },
  { effect: 'warning', title: 'Warnings', help: 'Exports still work, but learners may miss something.', glyph: TriangleAlert },
  { effect: 'review', title: 'Needs a person’s review', help: 'Software cannot judge these. Look at each one yourself.', glyph: Eye },
];
const OUTPUT_NAMES = { website: 'Website', scorm: 'SCORM', pdf: 'PDF' } as const;

export function checksDialog(opener: HTMLElement | null, issues: CheckIssue[], project: PortableProject, go: (issue: CheckIssue) => void) {
  const lessons = project.document.course.sections.flatMap(s => s.lessons);
  const where = (issue: CheckIssue) => {
    const index = lessons.findIndex(l => l.id === issue.lessonId), lesson = lessons[index];
    if (!lesson) return 'Course';
    const blocks = lesson.blocks, position = issue.blockId ? blocks.findIndex(b => b.id === issue.blockId || (b.type === 'columns' && b.content.columns.some(c => c.blocks.some(x => x.id === issue.blockId)))) : -1;
    const block = issue.blockId ? eachBlock(blocks).find(b => b.id === issue.blockId) : undefined;
    return `Lesson ${index + 1}: ${lesson.title || 'Untitled lesson'}${block ? ` · Block ${position + 1}, ${blockName(block)}${blockSummary(block) && blockSummary(block) !== block.type ? ` (“${blockSummary(block).slice(0, 50)}”)` : ''}` : ''}`;
  };
  const body = issues.length ? GROUPS.map(group => {
    const items = issues.filter(i => i.effect === group.effect);
    if (!items.length) return null;
    return h('section', { class: `checks-group checks-${group.effect}` }, [
      h('h3', {}, [icon(group.glyph), `${group.title} (${items.length})`]),
      h('p', { class: 'hint', text: group.help }),
      h('ul', { class: 'checks-list' }, items.map(issue => h('li', {}, [
        h('div', { class: 'checks-where', text: where(issue) }),
        h('p', { text: issue.message }),
        h('div', { class: 'row' }, [
          ...issue.outputs.map(o => h('span', { class: 'chip', text: OUTPUT_NAMES[o] })),
          button('Go to issue', () => { dialog.dialog.addEventListener('close', () => go(issue), { once: true }); dialog.close(); }, { class: 'btn btn-sm', label: `Go to issue: ${issue.message}` }),
        ]),
      ]))),
    ]);
  }) : [h('p', { class: 'checks-clear' }, [icon(CircleCheck), 'No issues found. Every output can be exported.'])];
  const dialog = openDialog({ title: 'Checks', opener, wide: true, body: [h('p', { class: 'hint', text: 'Checks look at your current edits. They never stop saving.' }), ...body] });
  dialog.dialog.classList.add('checks-dialog');
  return dialog;
}

/** The count shown on the Checks button: issues that block export plus warnings. */
export function checksBadge(issues: CheckIssue[]) {
  const blocking = issues.filter(i => i.effect === 'blocks').length, warnings = issues.filter(i => i.effect === 'warning').length;
  return { blocking, warnings, label: blocking ? `Checks: ${blocking} ${blocking === 1 ? 'issue blocks' : 'issues block'} export, ${warnings} ${warnings === 1 ? 'warning' : 'warnings'}` : warnings ? `Checks: ${warnings} ${warnings === 1 ? 'warning' : 'warnings'}` : 'Checks: no issues' };
}
