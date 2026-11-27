import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { exportProject, importProject } from '../src/project/archive.js';
import { BLOCK_TEMPLATES } from '../src/shared/block-catalog.js';
import { eachBlock, SCHEMA_VERSION } from '../src/shared/course.js';
import { isCanonicalRich } from '../src/shared/rich-text.js';
import { courseChecks } from '../src/project/checks.js';
import { pdfHtml } from '../src/project/pdf-html.js';
import { CourseFlow } from '../src/player/state.js';
import { encodeResume, decodeResume } from '../src/player/scorm.js';
import { interactionsFor } from '../src/player/interactions.js';
import { emptyAnswer, isAssessment } from '../src/shared/assessment.js';

const fingerprint = 'e'.repeat(64);

test('original version 1, 2 and 3 starters open as version 4 without losing blocks', async () => {
  for (const [file, version] of [['welcome-v1.openscroll', 1], ['welcome-v2.openscroll', 2], ['welcome-v3.openscroll', 3]] as const) {
    const bytes = await readFile(`tests/fixtures/${file}`), raw = bytes.toString('latin1');
    assert.ok(raw.length > 0);
    const project = await importProject(bytes), blocks = project.document.course.sections.flatMap(s => s.lessons).flatMap(l => l.blocks);
    assert.equal(project.document.schemaVersion, SCHEMA_VERSION, file);
    assert.ok(blocks.length > 0, `${file} keeps its blocks`);
    assert.ok(isCanonicalRich(project.document.course.description), `${file} description is migrated rich text`);
    for (const block of blocks) if (block.type === 'paragraph') assert.ok(isCanonicalRich(block.content.text));
    void version;
  }
});

test('the version 4 fixture holds every block template and every course resource, and re-exports unchanged', async () => {
  const bytes = await readFile('tests/fixtures/every-block-v4.openscroll'), project = await importProject(bytes);
  const blocks = eachBlock(project.document.course.sections.flatMap(s => s.lessons).flatMap(l => l.blocks));
  for (const t of BLOCK_TEMPLATES) assert.ok(blocks.some(b => b.type === t.type && b.variant === t.variant), `${t.key} is in the fixture`);
  const course = project.document.course;
  assert.ok(course.glossary.length && course.banks.length && course.characters.length && course.certificate);
  assert.deepEqual(await exportProject(project), bytes, 'export is stable: a format change must regenerate the fixture on purpose');
});

test('the version 4 fixture passes Checks, builds a PDF, and keeps a learner\'s answers through SCORM resume', async () => {
  const before = process.env.OPENSCROLL_EXTERNAL_VIDEO; process.env.OPENSCROLL_EXTERNAL_VIDEO = 'on';
  try {
    const project = await importProject(await readFile('tests/fixtures/every-block-v4.openscroll')), doc = project.document;
    const blocking = courseChecks(project, { externalVideo: true }).filter(i => i.effect === 'blocks');
    assert.deepEqual(blocking.map(i => i.message), []);
    assert.match(pdfHtml(project, { includeAnswers: true }).html, /Answer key/);
    const flow = new CourseFlow(doc), lesson = flow.lessons[0]!;
    for (const block of flow.visible()) {
      if (block.type === 'bank-draw') flow.draw(block.id, () => 0.5);
      if (isAssessment(block)) flow.submit(block.id, emptyAnswer(block).hasOwnProperty('text') ? { text: '14' } : emptyAnswer(block));
      if (block.type === 'reflection') flow.respond(block.id, { text: 'A short reflection.' });
      if (block.type === 'checklist') flow.respond(block.id, { ticks: [0] });
    }
    void lesson;
    const state = flow.snapshot();
    for (const edition of ['1.2', '2004'] as const) assert.deepEqual(decodeResume(doc, encodeResume(doc, state, fingerprint, edition), fingerprint, edition), state);
    assert.ok(interactionsFor(doc, state, '2004').length > 0);
  } finally { if (before === undefined) delete process.env.OPENSCROLL_EXTERNAL_VIDEO; else process.env.OPENSCROLL_EXTERNAL_VIDEO = before; }
});

test('the migration rehearsal opens stored documents of every version and names failures by id only', async () => {
  const { rehearse } = await import('../tools/rehearse-migration.js');
  const v1 = (await importProject(await readFile('tests/fixtures/welcome-v1.openscroll'))).document;
  const report = rehearse([
    { id: 'a', document: JSON.parse(JSON.stringify(v1)) },
    { id: 'b', document: { schemaVersion: 9 } },
    { id: 'c', document: null },
  ]);
  assert.equal(report.total, 3); assert.equal(report.opened, 1);
  assert.deepEqual(report.byVersion, { '4': 1, '9': 1, missing: 1 });
  assert.deepEqual(report.failed.map(f => f.id), ['b', 'c']);
  assert.ok(!report.failed.some(f => f.message.includes('Welcome')), 'messages carry no course content');
});
