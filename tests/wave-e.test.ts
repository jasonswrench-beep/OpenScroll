import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sampleProject } from '../src/project/sample.js';
import { prepareBlock, duplicateBlock } from '../src/shared/block-catalog.js';
import { parseCourse, type Block, type PortableProject } from '../src/shared/course.js';
import { exportProject, importProject, validateProject } from '../src/project/archive.js';
import { copyLesson } from '../src/shared/outline.js';
import { CourseFlow } from '../src/player/state.js';
import { interactionsFor } from '../src/player/interactions.js';
import { cleanResponse, responseMeets, scenarioResult } from '../src/shared/responses.js';
import { courseChecks } from '../src/project/checks.js';
import { pdfHtml } from '../src/project/pdf-html.js';
import { duplicateProject } from '../src/server/library-routes.js';
import { documentAssetIds } from '../src/shared/reuse.js';

type Scenario = Extract<Block, { type: 'scenario' }>;
function project(keys = ['scenario']): PortableProject {
  const p = sampleProject(), course = p.document.course, lesson = course.sections[0]!.lessons[0]!, image = p.document.assets[0]!.id;
  course.characters = [{ id: 'char-sam', name: 'Sam', role: 'Team lead', poses: [{ id: 'pose-calm', name: 'Calm', imageId: image, alt: 'Sam listening calmly.' }] }];
  lesson.blocks = keys.map(key => { const prepared = prepareBlock(key, p); if (prepared.asset) { p.document.assets.push(prepared.asset); p.files[`assets/${prepared.asset.id}.png`] = prepared.data!; } return prepared.block; });
  return validateProject(p);
}
const scenario = (p: PortableProject) => p.document.course.sections[0]!.lessons[0]!.blocks.find((b): b is Scenario => b.type === 'scenario')!;
const steps = (s: Scenario) => s.content.scenes.flatMap(x => x.nodes);

test('characters and scenarios validate, round-trip, and keep their pictures', async () => {
  const p = project(), s = scenario(p);
  assert.equal(steps(s).find(n => n.kind === 'line')?.characterId, 'char-sam', 'the starter speaks with the first character');
  s.content.scenes[0]!.backgroundId = p.document.assets[0]!.id;
  const valid = validateProject(p);
  assert.deepEqual((await importProject(await exportProject(valid))).document, valid.document);
  const bad = structuredClone(valid.document); bad.course.characters[0]!.poses[0]!.imageId = 'missing';
  assert.throws(() => parseCourse(bad), /Missing or incompatible image/);
  const dup = structuredClone(valid.document); scenario({ document: dup, files: {} }).content.scenes[0]!.nodes[1]!.id = scenario({ document: dup, files: {} }).content.scenes[0]!.nodes[0]!.id;
  assert.throws(() => parseCourse(dup), /Duplicate identifier/);
  assert.ok(documentAssetIds(valid.document).has(valid.document.assets[0]!.id));
  const copy = duplicateProject(valid);
  assert.equal(copy.document.course.characters[0]!.poses[0]!.imageId, copy.document.assets[0]!.id);
  assert.equal(scenario(copy).content.scenes[0]!.backgroundId, copy.document.assets[0]!.id);
});

test('copies give every step a new id and keep the links between steps', () => {
  const p = project(['scenario', 'survey', 'software-practice', 'interactive-video']), s = scenario(p);
  const copy = duplicateBlock(s) as Scenario;
  const oldIds = new Set(steps(s).map(n => n.id));
  assert.ok(steps(copy).every(n => !oldIds.has(n.id)));
  const ids = new Set(steps(copy).map(n => n.id));
  assert.ok(ids.has(copy.content.start));
  for (const n of steps(copy)) { if (n.next) assert.ok(ids.has(n.next)); for (const c of n.choices) if (c.next) assert.ok(ids.has(c.next)); }
  const lesson = p.document.course.sections[0]!.lessons[0]!;
  p.document.course.sections[0]!.lessons.push(copyLesson(lesson));
  validateProject(p);
});

test('a scenario path must follow its links, and an ending finishes it', () => {
  const p = project(), s = scenario(p), [narration, line, choice, good, other] = steps(s);
  assert.equal(cleanResponse(s, { trail: [line!.id], picks: [] }), undefined, 'starts at the start');
  assert.equal(cleanResponse(s, { trail: [narration!.id, choice!.id], picks: [] }), undefined, 'follows the next link');
  assert.equal(cleanResponse(s, { trail: [narration!.id, line!.id, choice!.id, good!.id], picks: [1] }), undefined, 'the pick must lead to the next step');
  const finished = cleanResponse(s, { trail: [narration!.id, line!.id, choice!.id, good!.id], picks: [0] })!;
  assert.ok(responseMeets(s, finished));
  assert.ok(!responseMeets(s, cleanResponse(s, { trail: [narration!.id, line!.id, choice!.id], picks: [] })!));
  s.content.scoring = true; s.content.passPoints = 2; s.content.required = true;
  const result = scenarioResult(s, finished);
  assert.equal(result.points, 2); assert.ok(result.passed); assert.equal(result.ending?.id, good!.id);
  const flow = new CourseFlow(p.document);
  assert.equal(flow.canComplete(), false);
  assert.ok(flow.respond(s.id, finished));
  assert.equal(flow.canComplete(), true);
  const [r12] = interactionsFor(p.document, flow.snapshot(), '1.2'), [r2004] = interactionsFor(p.document, flow.snapshot(), '2004');
  assert.equal(r12!.type, 'performance'); assert.equal(r2004!.type, 'other'); assert.equal(r2004!.result, 'correct');
  assert.ok(flow.respond(s.id, { trail: [narration!.id, line!.id, choice!.id, other!.id], picks: [1] }));
  assert.equal(interactionsFor(p.document, flow.snapshot(), '2004')[0]!.result, 'incorrect');
});

test('Checks find missing starts, dead ends, unreachable steps, missing endings and speakers', () => {
  const p = project(), s = scenario(p), list = s.content.scenes[0]!.nodes;
  assert.ok(!courseChecks(p).some(i => i.code.startsWith('scenario')), 'the starter scenario is complete');
  list[1]!.next = null;
  let codes = courseChecks(p).map(i => `${i.effect}:${i.code}`);
  assert.ok(codes.includes('blocks:scenario-dead-end'));
  assert.ok(codes.includes('warning:scenario-unreachable'));
  assert.ok(codes.includes('blocks:scenario-no-ending'));
  list[1]!.next = list[2]!.id; list[1]!.characterId = 'char-gone';
  codes = courseChecks(p).map(i => i.code);
  assert.ok(codes.includes('scenario-speaker'));
  s.content.start = 'item-nowhere';
  assert.ok(courseChecks(p).some(i => i.code === 'scenario-start' && i.effect === 'blocks'));
  p.document.course.characters[0]!.poses[0]!.alt = '';
  assert.ok(courseChecks(p).some(i => i.code === 'pose-alt' && i.place === 'resources:characters'));
});

test('the PDF prints the scenario as a numbered script', () => {
  const html = pdfHtml(project()).html;
  assert.match(html, /Start at step 1\. Follow the step numbers\./);
  assert.match(html, /<b>Sam:<\/b>/);
  assert.match(html, /If you choose “Ask what part of the report they need help with\.”, go to 4\./);
  assert.match(html, /Ending \(positive\)/);
});
