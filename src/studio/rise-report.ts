/** The import report shown before a Rise course is saved: every block type, what it became, and what needs review. */
import type { PortableProject } from '../shared/course.js';
import type { RiseReport } from '../project/rise-import.js';
import { projects, fileName } from './api.js';
import { h, openDialog, saveBlob } from './dom.js';

const RESULT = { exact: 'Exact', adjusted: 'Adjusted', review: 'Needs review' } as const;
export function riseReportDialog(result: { project: PortableProject; report: RiseReport }, opener: HTMLElement, save: () => Promise<void>) {
  const { report, project } = result;
  const rows = h('tbody', {}, report.rows.map(row => h('tr', {}, [
    h('th', { text: row.rise, attrs: { scope: 'row' } }),
    h('td', {}, [row.openscroll, row.note ? h('div', { class: 'hint', text: row.note }) : null]),
    h('td', { class: 'c', text: String(row.count) }),
    h('td', {}, [h('span', { class: `chip ${row.result === 'exact' ? 'chip-good' : row.result === 'review' ? 'chip-warn' : ''}`, text: RESULT[row.result] })]),
  ])));
  const items = [
    ...report.notImported.map(item => `Lesson ${item.lesson}, block ${item.block}: not imported (${item.rise}). Rebuild it in OpenScroll.`),
    ...report.review.map(item => item.lesson ? `Lesson ${item.lesson}, block ${item.block}: ${item.message}` : item.message),
  ];
  openDialog({
    title: `Import “${report.title || 'Rise course'}”`, opener, wide: true,
    body: [
      h('p', { text: `${report.importedBlocks} of ${report.sourceBlocks} blocks in ${report.lessons} lessons, with ${report.assets.count} files. Nothing is saved until you choose Save to library.` }),
      h('div', { class: 'tscroll' }, [h('table', { class: 'report-table' }, [
        h('caption', { class: 'sr-only', text: 'How each Rise block was imported' }),
        h('thead', {}, [h('tr', {}, [h('th', { text: 'In Rise', attrs: { scope: 'col' } }), h('th', { text: 'In OpenScroll', attrs: { scope: 'col' } }), h('th', { text: 'Blocks', attrs: { scope: 'col' } }), h('th', { text: 'Result', attrs: { scope: 'col' } })])]),
        rows,
      ])]),
      h('h3', { text: items.length ? `To review after import (${items.length})` : 'Nothing needs review' }),
      items.length ? h('ul', { class: 'review-list' }, items.slice(0, 300).map(text => h('li', { text }))) : null,
    ],
    actions: [
      { label: 'Cancel', run: () => true },
      { label: 'Download .openscroll', run: async () => { saveBlob(await projects.export(project), fileName(project.document.course.title, '.openscroll')); return false; } },
      { label: 'Save to library and open', kind: 'primary', run: async () => { await save(); return true; } },
    ],
  });
}
