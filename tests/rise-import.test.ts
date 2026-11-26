import { test } from 'node:test';
import assert from 'node:assert/strict';
import yazl from 'yazl';
import { importRiseExport, decodeRuntimeData } from '../src/project/rise-import.js';
import { exportProject, importProject } from '../src/project/archive.js';
import { isCanonicalRich } from '../src/shared/rich-text.js';
import { buildApprovedProjectApp } from './helpers/project-app.js';

// Synthetic content only: the shape follows a Rise web export, the words are original to this test.
const PNG = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from('synthetic image one')]);
const AVATAR = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from('synthetic avatar')]);
const PDF = Buffer.from('%PDF-1.4\n% synthetic workbook\n');
const block = (type: string, variant: string, items: unknown[], extra: Record<string, unknown> = {}) => ({ id: `${type}-${variant}-${Math.random()}`, type, variant, items, ...extra });
function riseCourse() {
  return {
    course: {
      id: 'synthetic-course', title: 'Planning a Garden', description: '<div data-editor-id="d"><p>Plan a <strong>small</strong> garden.</p><p>Second paragraph.</p></div>',
      color: '#2f6b3a', theme: { colorAccent: '#2F6B3A', coverPageType: 'SPLIT_LEFT_IMAGE', navigationRestricted: false }, headingTypeface: 'Lato', bodyTypeface: 'Merriweather',
      authors: [{ authorName: 'Sample Author', avatar: 'avatar.png' }], coverImage: { media: { image: { crushedKey: 'cover.png' } } },
      lessons: [
        { id: 'lesson-one', type: 'blocks', title: 'Choosing a site', items: [
          block('text', 'heading paragraph', [{ heading: '<p>Sun and soil</p>', paragraph: '<div><h2>Light</h2><p>Most vegetables need <em>six hours</em> of sun. See <a href="https://example.org/sun" target="_blank">the guide</a>.</p><ol start="2"><li><p>Test the soil.</p></li></ol><script>alert(1)</script></div>' }]),
          block('text', 'b', [{ paragraph: '<p><strong>Tip:</strong> Start small.</p>' }]),
          block('list', 'numbered', [{ number: '1', paragraph: '<p>Measure the bed.</p>' }, { number: '2', paragraph: '<p>Mark the corners.</p>' }]),
          block('image', 'hero', [{ media: { image: { crushedKey: 'figure%201.png' } }, caption: '<p>A raised bed</p>' }]),
          block('interactive', 'accordion', [{ title: 'Water', description: '<p>Water deeply.</p>' }, { title: 'Mulch', description: '<p>Mulch keeps soil moist.</p>' }]),
          block('interactive', 'tabs', [{ title: 'Spring', description: '<p>Plant peas.</p>' }, { title: 'Summer', description: '<p>Plant beans.</p>' }]),
          block('interactive', 'process', [{ type: 'intro', title: 'Before you dig', description: '<p>Gather tools.</p>' }, { type: 'summary', title: 'Done', description: '<p>Ready to plant.</p>' }, { type: 'step', title: 'Dig', description: '<p>Loosen the soil.</p>' }, { type: 'step', title: 'Feed', description: '<p>Add compost.</p>' }]),
          block('interactive', 'flashcard', [{ front: { type: 'description', description: '<strong>Compost</strong>' }, back: { type: 'description', description: '<span>Decayed plant matter.</span>' } }]),
          block('interactive', 'timeline', [{ date: 'Week 1', title: 'Sow', description: '<p>Sow seeds.</p>' }]),
          block('interactive', 'sorting', [{ title: 'Peas', pileId: 'cool' }, { title: 'Tomatoes', pileId: 'warm' }, { title: 'Lettuce', pileId: 'cool' }], { piles: [{ id: 'cool', title: 'Cool season' }, { id: 'warm', title: 'Warm season' }] }),
          block('knowledgeCheck', 'multiple choice', [{ type: 'MULTIPLE_CHOICE', title: '<p>How many hours of sun do most vegetables need?</p>', feedbackType: 'CHOICE', answers: [{ title: 'Two', correct: false, feedback: 'Too few.' }, { title: 'Six', correct: true, feedback: 'Right.' }] }]),
          block('knowledgeCheck', 'multiple response', [{ type: 'MULTIPLE_RESPONSE', title: 'Which keep soil moist?', feedbackType: 'CORRECT_INCORRECT', feedbackCorrect: '<p>Yes.</p>', feedbackIncorrect: '<p>Look again.</p>', answers: [{ title: 'Mulch', correct: true }, { title: 'Compost', correct: true }, { title: 'Sand', correct: false }] }]),
          block('divider', 'continue', [{ title: 'Continue', completeHint: 'Finish the questions first.' }]),
          block('multimedia', 'attachment', [{ media: { attachment: { key: 'workbook.pdf', originalUrl: 'Garden Workbook.pdf' } } }]),
        ] },
        { id: 'section-two', type: 'section', title: 'Growing', items: [] },
        { id: 'lesson-two', type: 'blocks', title: 'Care', items: [block('mystery', 'unknown', [])] },
      ],
    },
  };
}
function riseZip(entries: Record<string, Buffer | string>) {
  const zip = new yazl.ZipFile();
  for (const [path, data] of Object.entries(entries)) zip.addBuffer(Buffer.isBuffer(data) ? data : Buffer.from(data), path);
  zip.end();
  return new Promise<Buffer>((resolve, reject) => { const chunks: Buffer[] = []; zip.outputStream.on('data', c => chunks.push(c)); zip.outputStream.on('end', () => resolve(Buffer.concat(chunks))); zip.outputStream.on('error', reject); });
}
const runtime = (data: unknown) => `window.__jsonp("runtime-data.js","${Buffer.from(JSON.stringify(data)).toString('base64')}")`;

test('a Rise web export imports every supported block with formatting, files, and theme', async () => {
  const bytes = await riseZip({ 'content/index.html': '<html></html>', 'content/lib/rise/player.js': 'console.log(1)', 'content/runtime-data.js': runtime(riseCourse()), 'content/assets/cover.png': PNG, 'content/assets/figure 1.png': PNG, 'content/assets/avatar.png': AVATAR, 'content/assets/workbook.pdf': PDF });
  const { project, report } = await importRiseExport(bytes);
  const course = project.document.course;
  assert.equal(report.sourceBlocks, 15);
  assert.equal(report.importedBlocks, 14);
  assert.deepEqual(report.notImported, [{ lesson: 2, block: 1, rise: 'mystery · unknown' }]);
  assert.equal(course.title, 'Planning a Garden');
  assert.equal(course.description, '<p>Plan a <strong>small</strong> garden.</p><p>Second paragraph.</p>');
  assert.equal(course.author, 'Sample Author');
  assert.deepEqual(course.sections.map(s => [s.title, s.lessons.map(l => l.title)]), [['', ['Choosing a site']], ['Growing', ['Care']]]);
  assert.equal(project.document.assets.length, 3, 'identical cover and figure bytes share one asset');
  assert.deepEqual({ ...course.theme }, { accentColor: '#2f6b3a', font: 'serif', pageWidth: 'standard', coverLayout: 'split-left', lessonHeader: 'image', fontPairing: 'lato-merriweather' });
  assert.ok(course.cover?.decorative && course.authorImage);
  const blocks = course.sections[0]!.lessons[0]!.blocks;
  assert.deepEqual(course.sections[0]!.lessons[0]!.banner, { source: 'cover', assetId: null, altText: '', decorative: true });
  const [paragraph, note, list, image, accordion, tabs, process, cards, timeline, sorting, single, multiple, gate, attachment] = blocks;
  assert.ok(paragraph?.type === 'paragraph' && paragraph.variant === 'with-heading');
  if (paragraph?.type === 'paragraph') {
    assert.equal(paragraph.content.heading, 'Sun and soil');
    assert.equal(paragraph.content.text, '<h3>Light</h3><p>Most vegetables need <em>six hours</em> of sun. See <a href="https://example.org/sun">the guide</a>.</p><ol start="2"><li>Test the soil.</li></ol>');
  }
  assert.ok(note?.type === 'statement' && note.variant === 'note' && note.content.text === '<strong>Tip:</strong> Start small.');
  assert.ok(list?.type === 'list' && list.content.items.join('|') === 'Measure the bed.|Mark the corners.');
  assert.ok(image?.type === 'image' && image.content.caption === 'A raised bed' && image.content.altText === '' && !image.content.decorative);
  assert.ok(accordion?.type === 'accordion' && accordion.content.items.length === 2 && tabs?.type === 'tabs');
  assert.ok(process?.type === 'process' && process.content.intro?.title === 'Before you dig' && process.content.summary?.title === 'Done' && process.content.items.map(i => i.title).join() === 'Dig,Feed');
  assert.ok(cards?.type === 'flashcards' && cards.content.cards[0]!.front === '<strong>Compost</strong>' && cards.content.cards[0]!.back === 'Decayed plant matter.');
  assert.ok(timeline?.type === 'timeline' && timeline.content.items[0]!.date === 'Week 1');
  assert.ok(sorting?.type === 'assessment' && sorting.variant === 'categorize');
  if (sorting?.type === 'assessment') { assert.deepEqual(sorting.content.groups, ['Cool season', 'Warm season']); assert.deepEqual(sorting.content.placements, [0, 1, 0]); }
  assert.ok(single?.type === 'assessment' && single.variant === 'single-choice');
  if (single?.type === 'assessment') { assert.deepEqual(single.content.correct, [1]); assert.equal(single.content.feedbackMode, 'per-choice'); assert.deepEqual(single.content.choiceFeedback, ['Too few.', 'Right.']); assert.equal(single.assessment.graded, false); }
  assert.ok(multiple?.type === 'assessment' && multiple.variant === 'multiple-response');
  if (multiple?.type === 'assessment') { assert.deepEqual(multiple.content.correct, [0, 1]); assert.equal(multiple.content.feedbackIncorrect, 'Look again.'); }
  assert.ok(gate?.type === 'continue' && gate.content.hint === 'Finish the questions first.');
  assert.ok(attachment?.type === 'attachment' && attachment.content.label === 'Garden Workbook');
  // Rise shortens names inside its export; learners save the file under the name the author gave it.
  if (attachment?.type === 'attachment') assert.equal(project.document.assets.find(a => a.id === attachment.content.assetId)?.fileName, 'Garden Workbook.pdf');
  const all = JSON.stringify(project.document);
  assert.doesNotMatch(all, /<script|alert\(|data-editor-id|target=/);
  for (const value of [paragraph, note].flatMap(b => b && 'text' in b.content ? [b.content.text] : [])) assert.ok(isCanonicalRich(value as string));
  assert.ok(report.review.some(r => r.message.includes('Describe this image')) && report.review.some(r => r.message.includes('description of this file')));
  assert.deepEqual(await importProject(await exportProject(project)), project, 'the imported project round-trips as an .openscroll file');
});

test('Rise imports refuse other ZIPs, unsafe paths, and unreadable course data', async () => {
  await assert.rejects(importRiseExport(await riseZip({ 'course.json': '{}' })), /not a Rise web export/);
  await assert.rejects(importRiseExport(await riseZip({ 'content/runtime-data.js': 'nothing here' })), /could not be found/);
  await assert.rejects(importRiseExport(await riseZip({ 'content/runtime-data.js': 'window.__jsonp("runtime-data.js","bm90IGpzb24=")' })), /not readable/);
  // yazl refuses to write a traversal path, so write a same-length safe name and patch it in both ZIP headers.
  const traversal = await riseZip({ 'content/runtime-data.js': runtime(riseCourse()), 'content/assets/AA/AA/escape.png': PNG });
  const patched = Buffer.from(traversal.toString('latin1').replaceAll('content/assets/AA/AA/', 'content/assets/../../'), 'latin1');
  await assert.rejects(importRiseExport(patched), /unsafe path|corrupt/);
  await assert.rejects(importRiseExport(Buffer.from('not a zip')), /not a readable ZIP/);
  assert.throws(() => decodeRuntimeData('__jsonp("runtime-data.js","e30=")'), /unexpected shape/);
});

test('the project API imports a Rise export into an unsaved project and report, and explains rejections', async () => {
  const app = await buildApprovedProjectApp();
  try {
    const bytes = await riseZip({ 'content/runtime-data.js': runtime(riseCourse()), 'content/assets/cover.png': PNG, 'content/assets/figure 1.png': PNG, 'content/assets/avatar.png': AVATAR, 'content/assets/workbook.pdf': PDF });
    const response = await app.inject({ method: 'POST', url: '/api/projects/import-rise', headers: { 'content-type': 'application/zip' }, payload: bytes });
    assert.equal(response.statusCode, 200);
    const body = response.json() as { project: { document: { course: { title: string } } }; report: { importedBlocks: number } };
    assert.equal(body.project.document.course.title, 'Planning a Garden');
    assert.equal(body.report.importedBlocks, 14);
    const wrong = await app.inject({ method: 'POST', url: '/api/projects/import-rise', headers: { 'content-type': 'application/zip' }, payload: await riseZip({ 'course.json': '{}' }) });
    assert.equal(wrong.statusCode, 422);
    assert.match((wrong.json() as { error: string }).error, /not a Rise web export/);
  } finally { await app.close(); }
});
