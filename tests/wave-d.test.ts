import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { sampleProject } from '../src/project/sample.js';
import { prepareBlock } from '../src/shared/block-catalog.js';
import { parseCourse, type Block, type PortableProject } from '../src/shared/course.js';
import { exportProject, importProject, validateProject } from '../src/project/archive.js';
import { newId } from '../src/shared/outline.js';
import { CourseFlow } from '../src/player/state.js';
import { encodeResume, decodeResume } from '../src/player/scorm.js';
import { interactionsFor } from '../src/player/interactions.js';
import { cleanResponse, responseMeets, responseText } from '../src/shared/responses.js';
import { importOpenAssess } from '../src/project/openassess-import.js';
import { courseChecks } from '../src/project/checks.js';
import { pdfHtml } from '../src/project/pdf-html.js';
import { duplicateProject } from '../src/server/library-routes.js';
import { documentAssetIds } from '../src/shared/reuse.js';
import { parseCsv } from '../src/shared/csv.js';

const fingerprint = 'd'.repeat(64);
type Assessment = Extract<Block, { type: 'assessment' }>;
function project(keys: string[], bankSize = 4): PortableProject {
  const p = sampleProject(), course = p.document.course, lesson = course.sections[0]!.lessons[0]!;
  course.glossary = [{ id: newId(), term: 'Practice', definition: 'Doing something again to improve.', aliases: ['rehearsal'] }];
  course.banks = [{ id: 'bank-one', name: 'Starter bank', questions: Array.from({ length: bankSize }, (_, i) => { const q = prepareBlock('single-choice', p).block as Assessment; q.content.prompt = `Bank question ${i + 1}`; q.assessment.graded = true; return q; }) }];
  lesson.blocks = [];
  for (const key of keys) {
    const prepared = prepareBlock(key, p);
    if (prepared.asset) { p.document.assets.push(prepared.asset); p.files[`assets/${prepared.asset.id}.png`] = prepared.data!; }
    lesson.blocks.push(prepared.block);
  }
  return validateProject(p);
}
const blocks = (p: PortableProject) => p.document.course.sections[0]!.lessons[0]!.blocks;
const of = <T extends Block['type']>(p: PortableProject, type: T) => blocks(p).find((b): b is Extract<Block, { type: T }> => b.type === type)!;
const seeded = (seed: number) => () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

test('course resources and Wave D blocks validate and survive a project file round trip', async () => {
  const p = project(['glossary', 'action-plan', 'bank-draw', 'results']);
  p.document.course.certificate = { title: 'Certificate of completion', issuer: 'OpenScroll', signerName: 'Pat', signerTitle: 'Trainer', logoId: p.document.assets[0]!.id, signatureId: null, showScore: true };
  const valid = validateProject(p);
  assert.deepEqual((await importProject(await exportProject(valid))).document, valid.document);
  assert.equal(of(valid, 'bank-draw').content.bankId, 'bank-one');
  const broken = structuredClone(valid.document);
  broken.course.banks[0]!.questions[1]!.id = broken.course.banks[0]!.questions[0]!.id;
  assert.throws(() => parseCourse(broken), /Duplicate identifier/);
  const badLogo = structuredClone(valid.document); badLogo.course.certificate!.logoId = 'missing';
  assert.throws(() => parseCourse(badLogo), /Missing or incompatible image/);
  assert.ok(documentAssetIds(valid.document).has(valid.document.assets[0]!.id), 'the certificate logo is in use');
});

test('a bank draw gives each learner a set that is kept, scored, and restored', () => {
  const p = project(['bank-draw']), draw = of(p, 'bank-draw'); draw.content.count = 2;
  const flow = new CourseFlow(p.document);
  assert.equal(flow.score.status, 'incomplete', 'an undrawn bank keeps the result open');
  assert.equal(flow.canComplete(), false);
  assert.ok(flow.draw(draw.id, seeded(7)));
  assert.equal(flow.draw(draw.id, seeded(8)), false, 'a set is drawn once');
  const drawn = flow.drawn(draw.id);
  assert.equal(drawn.length, 2); assert.equal(new Set(drawn.map(q => q.id)).size, 2);
  for (const q of drawn) assert.ok(flow.submit(q.id, { selection: [0] }));
  assert.equal(flow.canComplete(), true);
  assert.equal(flow.score.possible, 2); assert.equal(flow.score.status, 'passed');
  const state = flow.snapshot(), again = new CourseFlow(p.document); again.restore(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(again.snapshot(), state);
  const tampered = { ...state, draws: { [draw.id]: [drawn[0]!.id, 'item-not-in-the-bank'] } };
  again.restore(tampered); assert.deepEqual(again.drawn(draw.id), [], 'a drawn set must come from the bank');
  for (const edition of ['1.2', '2004'] as const) assert.deepEqual(decodeResume(p.document, encodeResume(p.document, state, fingerprint, edition), fingerprint, edition), state);
  const old = [3, 0, [], [], [], [], [], []], bytes = new TextEncoder().encode(JSON.stringify(old)); let binary = ''; for (const b of bytes) binary += String.fromCharCode(b);
  assert.deepEqual(decodeResume(p.document, `OS1:${fingerprint}:${btoa(binary)}`, fingerprint, '2004').draws, {}, 'checkpoint 3 opens without draws');
  const records = interactionsFor(p.document, state, '2004');
  assert.deepEqual(records.map(r => r.id).sort(), drawn.map(q => q.id).sort(), 'drawn questions are reported');
});

test('action plans keep rows and dates, and count when a row is complete', () => {
  const p = project(['action-plan']), plan = of(p, 'action-plan');
  assert.equal(cleanResponse(plan, { rows: [['Call Sam', 'Sam', 'next week']] }), undefined, 'dates are YYYY-MM-DD');
  assert.equal(cleanResponse(plan, { rows: [['Too', 'few']] }), undefined, 'one cell per column');
  const value = cleanResponse(plan, { rows: [['Call Sam', '', '2026-12-01'], ['', '', ''], ['', '', '']] })!;
  assert.deepEqual(value.rows, [['Call Sam', '', '2026-12-01']], 'empty rows at the end are dropped');
  assert.ok(!responseMeets(plan, value));
  assert.ok(responseMeets(plan, { rows: [['Call Sam', 'Sam', '2026-12-01']] }));
  assert.match(responseText(plan, value), /What I will do: Call Sam; Who can help: —; By when: 2026-12-01/);
  assert.equal(cleanResponse(plan, { rows: Array.from({ length: 11 }, () => ['a', 'b', '']) }), undefined, 'no more rows than allowed');
});

test('OpenAssess banks become OpenScroll questions, and other files are refused plainly', async () => {
  const printing = await importOpenAssess(await readFile('tests/fixtures/openassess/printing.openassess'));
  assert.equal(printing.report.total, 9); assert.equal(printing.questions.length, 9);
  assert.deepEqual([...new Set(printing.questions.map(q => q.variant))].sort(), ['fill-blank', 'matching', 'multiple-response', 'numeric', 'short-answer', 'single-choice', 'true-false']);
  const course = await importOpenAssess(await readFile('tests/fixtures/openassess/course.openassess'));
  assert.equal(course.name, 'Introduction to Printing'); assert.ok(course.report.notes.some(n => /picture/.test(n)));
  const p = project([]); p.document.course.banks.push({ id: 'bank-imported', name: printing.name, questions: printing.questions });
  validateProject(p);
  await assert.rejects(importOpenAssess(await readFile('tests/fixtures/openassess/newer.openassess')), /newer OpenAssess/);
  await assert.rejects(importOpenAssess(await readFile('tests/fixtures/openassess/other.openassess')), /not an OpenAssess question bank/);
  await assert.rejects(importOpenAssess(Buffer.alloc(0)), /no larger than 32 MiB/);
});

test('Checks cover banks, bank questions, the certificate and the glossary', () => {
  const p = project(['bank-draw', 'results', 'glossary']);
  of(p, 'bank-draw').content.count = 9;
  p.document.course.glossary.push({ id: newId(), term: 'Routine', definition: '', aliases: [] });
  p.document.course.banks[0]!.questions[2]!.content.options = ['Only one'];
  const issues = courseChecks(p), codes = issues.map(i => `${i.effect}:${i.code}`);
  assert.ok(codes.includes('warning:bank-small'));
  assert.ok(codes.includes('warning:certificate-missing'));
  assert.ok(codes.includes('warning:glossary-term'));
  const unready = issues.find(i => i.code === 'bank-question')!;
  assert.equal(unready.effect, 'blocks'); assert.equal(unready.bankId, 'bank-one'); assert.equal(unready.blockId, p.document.course.banks[0]!.questions[2]!.id);
  of(p, 'bank-draw').content.bankId = 'bank-gone';
  assert.ok(courseChecks(p).some(i => i.code === 'bank-missing' && i.effect === 'blocks'));
});

test('the PDF shows the glossary, a blank action plan and the whole bank, and copies keep course resources', () => {
  const p = project(['glossary', 'action-plan', 'bank-draw', 'results']);
  of(p, 'bank-draw').content.count = 2;
  const html = pdfHtml(p).html;
  assert.match(html, /<dl class="glossary"><dt>Practice <span class="level">\(also rehearsal\)<\/span><\/dt>/);
  assert.match(html, /<table class="plan">/);
  assert.match(html, /Answer 2 of these 4 questions\./);
  assert.match(html, /Bank question 4/);
  assert.match(html, /results and certificate appear here/);
  const copy = duplicateProject(p);
  assert.equal(copy.document.course.banks[0]!.questions.length, 4);
  assert.equal(of(copy, 'bank-draw').content.bankId, copy.document.course.banks[0]!.id);
});

test('glossary CSV files read quoted fields and either separator', () => {
  assert.deepEqual(parseCsv('term,definition,aliases\n"Practice","Doing it, again",rehearsal;drill\n'), [['term', 'definition', 'aliases'], ['Practice', 'Doing it, again', 'rehearsal;drill']]);
  assert.deepEqual(parseCsv('term;definition\r\nRoutine;"A ""fixed"" habit"'), [['term', 'definition'], ['Routine', 'A "fixed" habit']]);
});
