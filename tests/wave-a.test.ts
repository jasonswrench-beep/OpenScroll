import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleProject } from '../src/project/sample.js';
import { prepareBlock, duplicateBlock, switchVariant, BLOCK_TEMPLATES } from '../src/shared/block-catalog.js';
import { parseCourse, eachBlock, type Block, type PortableProject } from '../src/shared/course.js';
import { exportProject, importProject, validateProject } from '../src/project/archive.js';
import { compactProject, documentAssetIds } from '../src/shared/reuse.js';
import { duplicateProject } from '../src/server/library-routes.js';
import { CourseFlow } from '../src/player/state.js';
import { ScormSession, encodeResume, decodeResume, type ResponseStore } from '../src/player/scorm.js';
import { pdfHtml } from '../src/project/pdf-html.js';
import { selfAssessmentResult, cleanResponse } from '../src/shared/responses.js';
import { publicationProject } from '../src/project/readiness.js';

const WAVE_A = ['objectives', 'objective-cards', 'table', 'striped-table', 'reflection', 'journal', 'activity', 'interactive-checklist', 'self-assessment', 'true-false', 'columns', 'three-columns', 'columns-wide-left', 'columns-wide-right'];
const fingerprint = 'b'.repeat(64);

function waveProject(keys = WAVE_A): PortableProject {
  const project = sampleProject(), lesson = project.document.course.sections[0]!.lessons[0]!;
  lesson.blocks = [];
  for (const key of keys) {
    const prepared = prepareBlock(key, project);
    if (prepared.asset) { project.document.assets.push(prepared.asset); project.files[`assets/${prepared.asset.id}.png`] = prepared.data!; }
    lesson.blocks.push(prepared.block);
  }
  return validateProject(project);
}
const find = <T extends Block['type']>(project: PortableProject, type: T) => project.document.course.sections[0]!.lessons[0]!.blocks.find((b): b is Extract<Block, { type: T }> => b.type === type)!;
function harness(edition: '1.2' | '2004') {
  const values: Record<string, string> = {}, api: Record<string, unknown> = {};
  for (const name of ['Initialize', 'GetValue', 'SetValue', 'Commit', edition === '1.2' ? 'Finish' : 'Terminate', 'GetLastError'])
    api[(edition === '1.2' ? 'LMS' : '') + name] = (...args: string[]) => name === 'GetLastError' ? '0' : name === 'GetValue' ? values[args[0]!] ?? '' : (name === 'SetValue' && (values[args[0]!] = args[1]!), 'true');
  return { values, api };
}

test('every Wave A template is in the catalog, validates, and survives a project file round trip', async () => {
  for (const key of WAVE_A) assert.ok(BLOCK_TEMPLATES.some(t => t.key === key), key);
  const project = waveProject();
  const reopened = await importProject(await exportProject(project));
  assert.deepEqual(reopened.document, project.document);
  assert.equal(project.document.schemaVersion, 4);
  const columns = find(project, 'columns');
  assert.equal(columns.content.columns.length, 2);
  assert.ok(eachBlock(project.document.course.sections[0]!.lessons[0]!.blocks).length > WAVE_A.length, 'blocks inside columns are counted');
});

test('the format refuses tables, columns and true or false questions whose parts do not match', () => {
  const broken = (change: (blocks: Block[]) => void) => { const project = waveProject(); change(project.document.course.sections[0]!.lessons[0]!.blocks); return () => parseCourse(structuredClone(project.document)); };
  assert.throws(broken(blocks => { const table = blocks.find(b => b.type === 'table'); if (table?.type === 'table') table.content.rows[1]!.pop(); }), /same number of cells/);
  assert.throws(broken(blocks => { const columns = blocks.find(b => b.type === 'columns'); if (columns?.type === 'columns') columns.content.columns.push({ blocks: [] }); }), /column layout/);
  assert.throws(broken(blocks => { const tf = blocks.find(b => b.type === 'assessment'); if (tf?.type === 'assessment') tf.content.options.push('Maybe'); }), /exactly two choices/);
  assert.throws(broken(blocks => { const columns = blocks.find(b => b.type === 'columns'); if (columns?.type === 'columns') columns.content.columns[1]!.blocks[0]!.id = columns.content.columns[0]!.blocks[0]!.id; }), /Duplicate identifier/);
  assert.throws(broken(blocks => { const columns = blocks.find(b => b.type === 'columns'); if (columns?.type === 'columns') columns.content.columns[0]!.blocks.push({ id: 'item-pic', type: 'image', variant: 'centered', appearance: { width: 'reading', padding: 'medium', background: 'page' }, content: { assetId: 'missing', altText: '', decorative: true, caption: '' } }); }), /Missing or incompatible image/);
  assert.throws(broken(blocks => { const columns = blocks.find(b => b.type === 'columns'); if (columns?.type === 'columns') (columns.content.columns[0]!.blocks as unknown[]).push(structuredClone(blocks.find(b => b.type === 'reflection'))); }), /Invalid course/);
  assert.throws(broken(blocks => { const self = blocks.find(b => b.type === 'self-assessment'); if (self?.type === 'self-assessment') self.content.bands[0]!.min = 99; }), /lowest score/);
});

test('copies get new identifiers inside columns and objectives, and changing the column count keeps every block', () => {
  const project = waveProject(), columns = project.document.course.sections[0]!.lessons[0]!.blocks.filter(b => b.type === 'columns')[1]!;
  assert.equal(columns.type, 'columns');
  const copy = duplicateBlock(columns);
  const ids = (block: Block) => eachBlock([block]).map(b => b.id);
  assert.equal(ids(copy).filter(id => ids(columns).includes(id)).length, 0);
  const objectives = find(project, 'objectives'), objectivesCopy = duplicateBlock(objectives);
  assert.ok(objectivesCopy.type === 'objectives' && objectivesCopy.content.items.every((item, i) => item.id !== objectives.content.items[i]!.id));
  if (columns.type !== 'columns') return;
  const two = switchVariant(columns, '1-1');
  assert.ok(two.type === 'columns' && two.content.columns.length === 2 && two.content.columns.flatMap(c => c.blocks).length === columns.content.columns.flatMap(c => c.blocks).length);
  const question = prepareBlock('single-choice', project).block, tf = switchVariant(question, 'true-false');
  assert.ok(tf.type === 'assessment' && tf.content.options.length === 2 && tf.content.correct.length === 1);
});

test('duplicating a course carries the cover, author photo, lesson banners and images inside columns', () => {
  const project = waveProject(['columns']), course = project.document.course, image = project.document.assets[0]!;
  course.cover = { assetId: image.id, altText: 'Cover', decorative: false };
  course.authorImage = { assetId: image.id };
  course.sections[0]!.lessons[0]!.banner = { source: 'image', assetId: image.id, altText: 'Banner', decorative: false };
  const columns = find(project, 'columns');
  columns.content.columns[0]!.blocks.push({ id: 'item-column-picture', type: 'image', variant: 'centered', appearance: { width: 'reading', padding: 'medium', background: 'page' }, content: { assetId: image.id, altText: 'A picture', decorative: false, caption: '' } });
  const valid = validateProject(project);
  assert.deepEqual([...documentAssetIds(valid.document)], [image.id]);
  const copy = duplicateProject(valid), newId = copy.document.assets[0]!.id;
  assert.notEqual(newId, image.id);
  assert.equal(copy.document.course.authorImage?.assetId, newId);
  assert.equal(copy.document.course.sections[0]!.lessons[0]!.banner?.assetId, newId);
  assert.deepEqual([...documentAssetIds(copy.document)], [newId]);
  const compact = compactProject({ ...valid, document: { ...valid.document, course: { ...valid.document.course, cover: null } } });
  assert.equal(compact.document.assets.length, 1, 'banner, author photo and column images keep their asset');
});

test('learner responses are checked, count toward completion only when required, and restore', () => {
  const project = waveProject(['reflection', 'interactive-checklist', 'self-assessment', 'activity']);
  const lesson = project.document.course.sections[0]!.lessons[0]!;
  for (const block of lesson.blocks) if (block.type === 'reflection' || block.type === 'checklist' || block.type === 'self-assessment' || block.type === 'activity') block.content.required = true;
  const reflection = find(project, 'reflection'); reflection.content.minWords = 3;
  const checklist = find(project, 'checklist'), self = find(project, 'self-assessment'), activity = find(project, 'activity');
  const flow = new CourseFlow(project.document);
  assert.equal(flow.canComplete(), false);
  assert.equal(flow.respond(reflection.id, { ticks: [0] }), false, 'a reflection keeps text only');
  assert.equal(flow.respond(checklist.id, { ticks: [0, 0] }), false, 'ticks are unique');
  assert.equal(flow.respond(self.id, { ratings: [0] }), false, 'one rating per statement');
  assert.ok(flow.respond(reflection.id, { text: 'Two words' }));
  assert.equal(flow.isComplete(reflection), false);
  assert.ok(flow.respond(reflection.id, { text: 'Now it has enough words.' }));
  assert.ok(flow.respond(checklist.id, { ticks: [2, 0, 1] }));
  assert.deepEqual(flow.response(checklist.id), { ticks: [0, 1, 2] });
  assert.ok(flow.respond(self.id, { ratings: [3, 3, 2] }));
  assert.ok(flow.respond(activity.id, { text: 'It went well.' }));
  assert.equal(flow.canComplete(), true);
  const result = selfAssessmentResult(self, flow.response(self.id));
  assert.equal(result.total, 11); assert.match(result.band!.text, /confident/);
  const state = flow.snapshot(), again = new CourseFlow(project.document);
  again.restore(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(again.snapshot(), state);
  const older = { ...state, version: 2 } as Record<string, unknown>; delete older.responses;
  again.restore(older); assert.equal(again.response(reflection.id), undefined, 'a version 2 snapshot has no responses');
  assert.ok(flow.respond(checklist.id, { ticks: [] })); assert.equal(flow.response(checklist.id), undefined, 'clearing removes the response');
  assert.equal(cleanResponse(reflection, { text: 'x'.repeat(20_001) }), undefined);
});

test('responses travel in SCORM resume data, and older checkpoints still open', () => {
  const project = waveProject(['reflection', 'interactive-checklist']), doc = project.document, flow = new CourseFlow(doc);
  const reflection = find(project, 'reflection'), checklist = find(project, 'checklist');
  flow.respond(reflection.id, { text: 'Café notes 🌱' }); flow.respond(checklist.id, { ticks: [1] });
  for (const edition of ['1.2', '2004'] as const) {
    const state = flow.snapshot();
    assert.deepEqual(decodeResume(doc, encodeResume(doc, state, fingerprint, edition), fingerprint, edition), state);
  }
  const old = [2, 0, [], [], [], [], []], bytes = new TextEncoder().encode(JSON.stringify(old));
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  assert.deepEqual(decodeResume(doc, `OS1:${fingerprint}:${btoa(binary)}`, fingerprint, '1.2').responses, {});
});

test('SCORM 1.2 keeps oversized written responses on the device and restores them', () => {
  const project = waveProject(['reflection']), doc = project.document, reflection = find(project, 'reflection');
  let kept: Record<string, unknown> | null = null;
  const device: ResponseStore = { read: () => kept ?? undefined, write: value => { kept = value; } };
  const h = harness('1.2'), session = new ScormSession(h.api, '1.2', doc, fingerprint, () => 0, device);
  session.flow.respond(reflection.id, { text: 'word '.repeat(2000) });
  session.update(session.flow.snapshot()); session.save();
  assert.equal(session.responsesOnDevice, true);
  assert.ok(h.values['cmi.suspend_data']!.length <= 4096);
  assert.ok(kept && Object.hasOwn(kept, reflection.id));
  session.terminate();
  h.values['cmi.core.entry'] = 'resume';
  const resumed = new ScormSession(h.api, '1.2', doc, fingerprint, () => 0, device);
  assert.match(resumed.flow.response(reflection.id)?.text ?? '', /^word word/);
  resumed.terminate();
});

test('the PDF reading copy shows each new block, and the answer key adds sample responses', () => {
  const project = waveProject(), lesson = project.document.course.sections[0]!.lessons[0]!;
  lesson.objectives = [{ id: 'item-lesson-objective', text: 'A lesson-level objective that the block replaces.', level: null }];
  const learner = pdfHtml(project).html, key = pdfHtml(project, { includeAnswers: true }).html;
  assert.match(learner, /<th scope="col">Stage<\/th>/);
  assert.doesNotMatch(learner, /A lesson-level objective/);
  assert.match(learner, /\(Apply\)/);
  assert.match(learner, /class="lines"/);
  assert.match(learner, /class="boxes"/);
  assert.match(learner, /class="columns cols-1-1"/);
  assert.match(learner, /Circle one\./);
  assert.match(learner, /Your total is between 3 and 12/);
  assert.doesNotMatch(learner, /Sample response:/);
  assert.match(key, /Sample responses/);
  assert.match(key, /A colleague showed me a short example/);
});

test('publishing is blocked until response blocks have their essential text', () => {
  const project = waveProject(['interactive-checklist']);
  find(project, 'checklist').content.items.push(' ');
  assert.throws(() => publicationProject(project), /empty checklist item/);
});
