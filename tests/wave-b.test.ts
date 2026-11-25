import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleProject } from '../src/project/sample.js';
import { prepareBlock, BLOCK_TEMPLATES } from '../src/shared/block-catalog.js';
import { parseCourse, type Block, type PortableProject } from '../src/shared/course.js';
import { exportProject, importProject, validateProject } from '../src/project/archive.js';
import { assessmentIssue, correctAnswer, parseNumeric, validAnswer, type AssessmentBlock } from '../src/shared/assessment.js';
import { cleanResponse, responseMeets, responseText } from '../src/shared/responses.js';
import { CourseFlow } from '../src/player/state.js';
import { ScormSession } from '../src/player/scorm.js';
import { interactionsFor } from '../src/player/interactions.js';
import { pdfHtml } from '../src/project/pdf-html.js';
import { courseChecks } from '../src/project/checks.js';
import { publicationProject } from '../src/project/readiness.js';
import { duplicateProject } from '../src/server/library-routes.js';
import { contrast, accentInk, textAccent } from '../src/shared/contrast.js';

const fingerprint = 'c'.repeat(64);
function project(keys: string[]): PortableProject {
  const p = sampleProject(), lesson = p.document.course.sections[0]!.lessons[0]!;
  lesson.blocks = [];
  for (const key of keys) {
    const prepared = prepareBlock(key, p);
    if (prepared.asset) { p.document.assets.push(prepared.asset); p.files[`assets/${prepared.asset.id}.png`] = prepared.data!; }
    lesson.blocks.push(prepared.block);
  }
  return validateProject(p);
}
const blocks = (p: PortableProject) => p.document.course.sections[0]!.lessons[0]!.blocks;
const question = (p: PortableProject, variant: string) => blocks(p).find((b): b is AssessmentBlock => b.type === 'assessment' && b.variant === variant)!;
function harness(edition: '1.2' | '2004', supported = true) {
  const values: Record<string, string> = supported ? { 'cmi.interactions._count': '0' } : {}, api: Record<string, unknown> = {};
  let error = '0';
  for (const name of ['Initialize', 'GetValue', 'SetValue', 'Commit', edition === '1.2' ? 'Finish' : 'Terminate', 'GetLastError'])
    api[(edition === '1.2' ? 'LMS' : '') + name] = (...args: string[]) => {
      if (name === 'GetLastError') return error;
      error = '0';
      if (name === 'GetValue') { if (args[0] === 'cmi.interactions._count' && !supported) { error = '401'; return ''; } return values[args[0]!] ?? ''; }
      if (name === 'SetValue') {
        if (args[0]!.startsWith('cmi.interactions.') && !supported) { error = '401'; return 'false'; }
        values[args[0]!] = args[1]!;
        const slot = /^cmi\.interactions\.(\d+)\.id$/.exec(args[0]!);
        if (slot) values['cmi.interactions._count'] = String(Math.max(Number(values['cmi.interactions._count'] ?? 0), Number(slot[1]) + 1));
      }
      return 'true';
    };
  return { values, api };
}

test('Wave B templates validate and survive a project file round trip', async () => {
  for (const key of ['short-answer', 'numeric', 'hotspot', 'survey']) assert.ok(BLOCK_TEMPLATES.some(t => t.key === key), key);
  const p = project(['short-answer', 'numeric', 'hotspot', 'survey']);
  assert.deepEqual((await importProject(await exportProject(p))).document, p.document);
  for (const b of blocks(p)) if (b.type === 'assessment') assert.equal(assessmentIssue(b), undefined, b.variant);
  const hotspot = question(p, 'hotspot');
  hotspot.content.correct = [5];
  assert.throws(() => parseCourse(structuredClone(p.document)), /match existing choices/);
  hotspot.content.correct = [0]; hotspot.content.areas[0]!.x = 90;
  assert.throws(() => parseCourse(structuredClone(p.document)), /inside the image/);
});

test('numbers accept tolerance, ranges, units and a decimal comma', () => {
  assert.equal(parseNumeric('14 days', 'days'), 14);
  assert.equal(parseNumeric('3,5'), 3.5);
  assert.equal(parseNumeric(' -0.25 '), -0.25);
  assert.equal(parseNumeric('1,234'), 1.234, 'a lone comma is a decimal mark');
  assert.equal(parseNumeric('twelve'), undefined);
  const p = project(['numeric']), q = question(p, 'numeric');
  assert.ok(correctAnswer(q, { text: '14' }));
  assert.ok(!correctAnswer(q, { text: '15' }));
  q.content.numeric.tolerance = 1;
  assert.ok(correctAnswer(q, { text: '15 days' }));
  q.content.numeric = { ...q.content.numeric, mode: 'range', min: 10, max: 12 };
  assert.ok(correctAnswer(q, { text: '11' })); assert.ok(!correctAnswer(q, { text: '14' }));
  assert.equal(validAnswer(q, { text: 'soon' }), false);
  assert.equal(validAnswer(q, { text: 'soon' }, false), true, 'a draft may be unfinished');
});

test('short answers match accepted answers, and a self-check is never scored', () => {
  const p = project(['short-answer']), q = question(p, 'short-answer');
  assert.ok(correctAnswer(q, { text: ' Practice ' }));
  assert.ok(!correctAnswer(q, { text: 'luck' }));
  q.content.selfCheck = true; q.assessment.graded = true;
  assert.match(assessmentIssue(q) ?? '', /cannot count toward the score/);
  q.assessment.graded = false;
  assert.equal(assessmentIssue(q), undefined);
  assert.ok(correctAnswer(q, { text: 'Anything I wrote' }));
});

test('a hotspot takes one area when one is correct, and several when several are', () => {
  const p = project(['hotspot']), q = question(p, 'hotspot');
  assert.ok(correctAnswer(q, { selection: [0] }));
  assert.equal(validAnswer(q, { selection: [0, 1] }), false);
  q.content.correct = [0, 2];
  assert.ok(validAnswer(q, { selection: [0, 2] }));
  assert.ok(correctAnswer(q, { selection: [2, 0] }));
  assert.ok(!correctAnswer(q, { selection: [0] }));
  q.content.areas[1]!.label = ' ';
  assert.match(assessmentIssue(q) ?? '', /each with a label/);
});

test('survey responses are checked per question and count when required', () => {
  const p = project(['survey']), survey = blocks(p)[0] as Extract<Block, { type: 'survey' }>;
  assert.equal(cleanResponse(survey, { answers: [4, 0, 2, 'A clearer example'] })?.answers?.length, 4);
  assert.equal(cleanResponse(survey, { answers: [5, 0, 2, null] }), undefined, 'rating beyond the scale');
  assert.equal(cleanResponse(survey, { answers: [0, 0, 3, null] }), undefined, 'choice beyond the options');
  assert.equal(cleanResponse(survey, { answers: [0, 0] }), undefined, 'one answer per question');
  assert.deepEqual(cleanResponse(survey, { answers: [null, null, null, '  '] }), {});
  assert.ok(responseMeets(survey, { answers: [1, 2, 0, null] }), 'comments are optional');
  assert.ok(!responseMeets(survey, { answers: [1, null, 0, 'x'] }));
  survey.content.required = true;
  const flow = new CourseFlow(p.document);
  assert.equal(flow.canComplete(), false);
  assert.ok(flow.respond(survey.id, { answers: [3, 4, 1, 'More examples'] }));
  assert.equal(flow.canComplete(), true);
  assert.match(responseText(survey, flow.response(survey.id)), /The examples were useful\. — Agree/);
});

test('both SCORM editions report each question and response as an interaction, once per change', () => {
  for (const edition of ['1.2', '2004'] as const) {
    const p = project(['true-false', 'multiple-response', 'fill-blank', 'numeric', 'matching', 'ordering', 'categorize', 'short-answer', 'reflection', 'interactive-checklist', 'survey']);
    const self = question(p, 'short-answer'); self.content.selfCheck = true; self.assessment.graded = false;
    const doc = p.document, h = harness(edition), session = new ScormSession(h.api, edition, doc, fingerprint, () => 0);
    const flow = session.flow, all = blocks(p);
    const byVariant = (v: string) => question(p, v).id;
    flow.submit(byVariant('true-false'), { selection: [0] });
    flow.submit(byVariant('multiple-response'), { selection: [1] });
    flow.submit(byVariant('fill-blank'), { text: 'Practice' });
    flow.submit(byVariant('numeric'), { text: '14 days' });
    flow.submit(byVariant('matching'), { matches: [0, 1] });
    flow.submit(byVariant('ordering'), { order: [0, 1, 2] });
    flow.submit(byVariant('categorize'), { groups: [0, 0, 1] });
    flow.submit(byVariant('short-answer'), { text: 'My own words [,] here' });
    flow.respond(all.find(b => b.type === 'reflection')!.id, { text: 'A thoughtful reflection.' });
    flow.respond(all.find(b => b.type === 'checklist')!.id, { ticks: [0, 2] });
    flow.respond(all.find(b => b.type === 'survey')!.id, { answers: [3, 1, 2, 'Shorter videos'] });
    session.update(flow.snapshot()); session.save();
    const v = h.values, modern = edition === '2004', response = modern ? 'learner_response' : 'student_response';
    const records = interactionsFor(doc, flow.snapshot(), edition);
    assert.equal(v['cmi.interactions._count'], String(records.length));
    const find = (type: string) => { for (let n = 0; n < records.length; n++) if (v[`cmi.interactions.${n}.type`] === type) return n; return -1; };
    const tf = find('true-false');
    assert.equal(v[`cmi.interactions.${tf}.${response}`], modern ? 'true' : 't');
    assert.equal(v[`cmi.interactions.${tf}.result`], 'correct');
    assert.equal(v[`cmi.interactions.${tf}.id`], modern ? `urn:openscroll:${byVariant('true-false')}` : byVariant('true-false'));
    const choice = find('choice');
    assert.equal(v[`cmi.interactions.${choice}.result`], modern ? 'incorrect' : 'wrong');
    assert.equal(v[`cmi.interactions.${find('numeric')}.${response}`], '14');
    if (modern) assert.equal(v[`cmi.interactions.${find('numeric')}.correct_responses.0.pattern`], '14[:]14');
    assert.equal(v[`cmi.interactions.${find('sequencing')}.${response}`], modern ? 'a[,]b[,]c' : 'a,b,c');
    assert.equal(v[`cmi.interactions.${find('matching')}.${response}`], modern ? '1[.]a[,]2[.]b' : '1.a,2.b');
    assert.equal(v[`cmi.interactions.${find('likert')}.${response}`], '4');
    const long = find(modern ? 'long-fill-in' : 'fill-in');
    assert.ok(long >= 0);
    assert.ok(!Object.entries(v).some(([key, value]) => key.endsWith(response) && value.includes('[,] here')), 'free text never carries a 2004 delimiter');
    assert.ok(Object.entries(v).some(([key, value]) => key.endsWith('.result') && value === 'neutral'), 'responses are neutral');
    const count = v['cmi.interactions._count'];
    session.save();
    assert.equal(v['cmi.interactions._count'], count, 'an unchanged answer is not reported again');
    session.terminate();
  }
});

test('an LMS without interaction support still saves progress', () => {
  const p = project(['true-false']), h = harness('2004', false), session = new ScormSession(h.api, '2004', p.document, fingerprint, () => 0);
  session.flow.submit(question(p, 'true-false').id, { selection: [0] });
  session.update(session.flow.snapshot()); session.save();
  assert.ok(h.values['cmi.suspend_data']?.startsWith('OS1:'));
  assert.equal(session.reportedInteractions, 0);
  session.terminate();
});

test('the PDF shows the new questions and the survey, and the key gives their answers', () => {
  const p = project(['short-answer', 'numeric', 'hotspot', 'survey']);
  const learner = pdfHtml(p).html, key = pdfHtml(p, { includeAnswers: true }).html;
  assert.match(learner, /Answer: ____________ days/);
  assert.match(learner, /class="area"/);
  assert.match(learner, /Circle the letter of the correct area/);
  assert.match(learner, /class="survey"/);
  assert.match(key, /14 days/);
  assert.match(key, /A\. The person/);
  assert.match(key, /practice/);
});

test('Checks group issues by effect, and publishing stops at the first blocking one', () => {
  const p = project(['image', 'hotspot', 'reflection', 'table']);
  const image = blocks(p).find(b => b.type === 'image'); if (image?.type === 'image') { image.content.altText = ''; image.content.decorative = false; }
  const table = blocks(p).find(b => b.type === 'table'); if (table?.type === 'table') { table.content.head = []; table.content.headerColumn = false; }
  let issues = courseChecks(p);
  assert.ok(issues.some(i => i.code === 'alt-missing' && i.effect === 'warning' && i.field === 'altText' && i.tab === 'access'));
  assert.ok(issues.some(i => i.code === 'table-headers'));
  assert.ok(issues.some(i => i.code === 'scorm-12-responses' && i.outputs.join() === 'scorm'));
  assert.ok(!issues.some(i => i.effect === 'blocks'));
  publicationProject(p);
  const hotspot = question(p, 'hotspot'); hotspot.content.areas = hotspot.content.areas.slice(0, 1);
  issues = courseChecks(p);
  assert.ok(issues.some(i => i.effect === 'blocks' && i.code === 'question'));
  assert.throws(() => publicationProject(p), /Assessment is not ready: Add at least two areas/);
});

test('duplicating a course carries a hotspot picture', () => {
  const p = project(['hotspot']), copy = duplicateProject(p), q = question(copy, 'hotspot');
  assert.ok(q.content.image && copy.document.assets.some(a => a.id === q.content.image!.assetId));
  assert.notEqual(q.content.image!.assetId, question(p, 'hotspot').content.image!.assetId);
});

test('theme contrast picks readable ink and darkens light accents for text', () => {
  assert.equal(accentInk('#087a82'), '#ffffff');
  assert.equal(accentInk('#f7c05b'), '#1b1a1f');
  assert.ok(contrast(textAccent('#f7c05b'), '#ffffff') >= 4.5);
  assert.equal(textAccent('#193c35'), '#193c35');
});
