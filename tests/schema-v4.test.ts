import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCourse, SCHEMA_VERSION, type Block } from '../src/shared/course.js';
import { sampleProject } from '../src/project/sample.js';
import { prepareBlock } from '../src/shared/block-catalog.js';
import { correctAnswer, emptyAnswer, feedbackMessages, assessmentIssue, validAnswer } from '../src/shared/assessment.js';

function v3Document() {
  const document = structuredClone(sampleProject().document) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  document.schemaVersion = 3;
  const course = document.course;
  delete course.authorImage;
  for (const key of ['coverLayout', 'lessonHeader', 'fontPairing']) delete course.theme[key];
  course.description = 'Fish & chips\n\nSecond paragraph';
  const lesson = course.sections[0].lessons[0];
  delete lesson.banner; delete lesson.objectives;
  const id = (n: number) => `legacy-${n}`;
  lesson.blocks = [
    { id: id(1), type: 'paragraph', variant: 'plain', appearance: { width: 'reading', padding: 'medium', background: 'page' }, content: { heading: '', text: 'Line one\nLine two < three' } },
    { id: id(2), type: 'list', variant: 'numbered', appearance: { width: 'reading', padding: 'medium', background: 'page' }, content: { items: ['A & B', 'Plain'] } },
    { id: id(3), type: 'process', variant: 'steps', appearance: { width: 'reading', padding: 'medium', background: 'page' }, content: { items: [{ title: 'Step', text: 'Do it' }] } },
    { id: id(4), type: 'timeline', variant: 'vertical', appearance: { width: 'reading', padding: 'medium', background: 'page' }, content: { items: [{ title: 'Then', text: 'Now' }] } },
    { id: id(5), type: 'assessment', variant: 'sorting', appearance: { width: 'reading', padding: 'medium', background: 'page' }, content: { prompt: 'Order these', options: [], correct: [], accepted: [], caseSensitive: false, pairs: [], items: ['first', 'second'], feedbackCorrect: 'Yes & well done', feedbackIncorrect: '' }, assessment: { graded: false, points: 1, required: false, completion: 'submitted', maxAttempts: 0 } },
    { id: id(6), type: 'continue', variant: 'button', appearance: { width: 'reading', padding: 'medium', background: 'page' }, content: { label: 'Continue' }, completion: 'none' },
  ];
  return document;
}

test('version 3 documents migrate to version 4 on a copy, escaping text and renaming ordering questions', () => {
  const legacy = v3Document(), before = structuredClone(legacy);
  const doc = parseCourse(legacy);
  assert.deepEqual(legacy, before, 'the original document is not changed');
  assert.equal(doc.schemaVersion, SCHEMA_VERSION);
  assert.equal(doc.course.description, '<p>Fish &amp; chips</p><p>Second paragraph</p>');
  assert.deepEqual(doc.course.theme, { ...legacy.course.theme, coverLayout: 'stacked', lessonHeader: 'plain', fontPairing: null });
  assert.equal(doc.course.authorImage, null);
  const lesson = doc.course.sections[0]!.lessons[0]!;
  assert.equal(lesson.banner, null);
  assert.deepEqual(lesson.objectives, []);
  const [paragraph, list, process, timeline, question, gate] = lesson.blocks as Block[];
  assert.equal(paragraph?.type === 'paragraph' && paragraph.content.text, 'Line one<br>Line two &lt; three');
  assert.deepEqual(list?.type === 'list' && list.content.items, ['A &amp; B', 'Plain']);
  assert.ok(process?.type === 'process' && process.content.intro === null && process.content.summary === null);
  assert.equal(timeline?.type === 'timeline' && timeline.content.items[0]!.date, '');
  assert.ok(question?.type === 'assessment');
  if (question?.type === 'assessment') {
    assert.equal(question.variant, 'ordering');
    assert.equal(question.content.feedbackCorrect, 'Yes &amp; well done');
    assert.equal(question.content.feedbackMode, 'correct-incorrect');
  }
  assert.equal(gate?.type === 'continue' && gate.content.hint, '');
  assert.deepEqual(parseCourse(doc), doc, 'a migrated document is a valid version 4 document');
});

test('version 4 rejects non-canonical formatting and inconsistent new fields', () => {
  const valid = parseCourse(sampleProject().document);
  const broken = (change: (document: Record<string, any>) => void) => { const copy = structuredClone(valid) as Record<string, any>; change(copy); return copy; }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const lesson = (d: Record<string, any>) => d.course.sections[0].lessons[0]; // eslint-disable-line @typescript-eslint/no-explicit-any
  assert.throws(() => parseCourse(broken(d => { d.course.description = '<script>alert(1)</script>'; })), /supported formatting/);
  assert.throws(() => parseCourse(broken(d => { d.course.description = 'a < b'; })), /supported formatting/);
  assert.throws(() => parseCourse(broken(d => { lesson(d).banner = { source: 'image', assetId: null, altText: '', decorative: true }; })), /banner image is missing/);
  assert.throws(() => parseCourse(broken(d => { lesson(d).banner = { source: 'cover', assetId: 'other-image', altText: '', decorative: true }; })), /cannot name another image/);
  assert.throws(() => parseCourse(broken(d => { lesson(d).objectives = [{ id: d.course.id, text: 'Duplicate id', level: null }]; })), /Duplicate identifier/);
  assert.throws(() => parseCourse(broken(d => { d.course.authorImage = { assetId: 'missing-image' }; })), /incompatible image/);
  const ok = parseCourse(broken(d => { lesson(d).objectives = [{ id: 'objective-one', text: 'Explain the idea', level: 'understand' }]; d.course.description = '<h3>About</h3><p>Two <strong>parts</strong>.</p>'; }));
  assert.equal(ok.course.sections[0]!.lessons[0]!.objectives[0]!.level, 'understand');
});

test('sort-into-groups questions score placements and per-choice feedback is chosen by selection', () => {
  const project = sampleProject();
  const groups = prepareBlock('categorize', project).block;
  assert.ok(groups.type === 'assessment' && groups.variant === 'categorize');
  if (groups.type !== 'assessment') return;
  assert.equal(assessmentIssue(groups), undefined);
  assert.deepEqual(emptyAnswer(groups), { groups: [-1, -1, -1] });
  assert.equal(validAnswer(groups, { groups: [0, -1, 1] }, false), true);
  assert.equal(validAnswer(groups, { groups: [0, -1, 1] }), false);
  assert.equal(correctAnswer(groups, { groups: [0, 0, 1] }), true);
  assert.equal(correctAnswer(groups, { groups: [1, 0, 1] }), false);
  const choice = prepareBlock('single-choice', project).block;
  if (choice.type !== 'assessment') return;
  choice.content.feedbackMode = 'per-choice';
  choice.content.choiceFeedback = ['Right: small steps work.', '', 'Reflection matters.'];
  assert.deepEqual(feedbackMessages(choice, { selection: [0] }, true), ['Right: small steps work.']);
  assert.deepEqual(feedbackMessages(choice, { selection: [1] }, false), [choice.content.feedbackIncorrect], 'falls back when a choice has no message');
  choice.content.feedbackMode = 'none';
  assert.deepEqual(feedbackMessages(choice, { selection: [0] }, true), []);
});
