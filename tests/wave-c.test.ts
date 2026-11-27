import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { sampleProject } from '../src/project/sample.js';
import { prepareBlock } from '../src/shared/block-catalog.js';
import { parseCourse, type Block, type PortableProject } from '../src/shared/course.js';
import { exportProject, importProject, validateProject } from '../src/project/archive.js';
import { copyLesson, newId } from '../src/shared/outline.js';
import { duplicateProject } from '../src/server/library-routes.js';
import { documentAssetIds } from '../src/shared/reuse.js';
import { courseChecks } from '../src/project/checks.js';
import { htmlFiles } from '../src/project/html-export.js';
import { pdfHtml } from '../src/project/pdf-html.js';
import { CourseFlow } from '../src/player/state.js';
import { interactionsFor } from '../src/player/interactions.js';
import { cleanResponse, responseMeets } from '../src/shared/responses.js';
import { parseVideoAddress } from '../src/shared/video-address.js';
import { externalVideoEnabled } from '../src/server/config.js';

const CLIP = readFileSync('tests/fixtures/original-clip.mp4');
function project(keys: string[]): PortableProject {
  const p = sampleProject(), lesson = p.document.course.sections[0]!.lessons[0]!;
  lesson.blocks = [];
  const clip = CLIP, asset = { id: 'clip', fileName: 'clip.mp4', mediaType: 'video/mp4' as const, byteLength: clip.length, sha256: createHash('sha256').update(clip).digest('hex') };
  p.document.assets.push(asset); p.files['assets/clip.mp4'] = clip.toString('base64');
  for (const key of keys) {
    const prepared = prepareBlock(key, p);
    if (prepared.asset) { p.document.assets.push(prepared.asset); p.files[`assets/${prepared.asset.id}.png`] = prepared.data!; }
    lesson.blocks.push(prepared.block);
  }
  return validateProject(p);
}
const blocks = (p: PortableProject) => p.document.course.sections[0]!.lessons[0]!.blocks;
const of = <T extends Block['type']>(p: PortableProject, type: T) => blocks(p).find((b): b is Extract<Block, { type: T }> => b.type === type)!;
function interactive(p: PortableProject) {
  const video = of(p, 'video'), question = of(p, 'assessment');
  video.content.assetId = 'clip'; video.content.transcript = 'Transcript.'; video.content.captions = [{ start: 0, end: 1, text: 'Hi' }];
  video.content.descriptions = [{ start: 0, end: 2, text: 'A test pattern.' }];
  video.content.chapters = [{ time: 0, title: 'Start' }];
  video.content.checkpoints = [{ id: newId(), time: 3, kind: 'question', questionId: question.id, title: '', note: '' }, { id: newId(), time: 5, kind: 'note', questionId: null, title: 'Notice', note: 'Look closely.' }];
  return { video, question };
}

test('Wave C blocks validate and survive a project file round trip', async () => {
  const p = project(['interactive-video', 'true-false', 'embed-video', 'software-practice']);
  interactive(p); of(p, 'embed-video').content.videoId = 'aqz-KE-bpKQ';
  const valid = validateProject(p);
  assert.deepEqual((await importProject(await exportProject(valid))).document, valid.document);
  const broken = (change: (p: PortableProject) => void) => { const copy = structuredClone(valid); change(copy); return () => parseCourse(copy.document); };
  assert.throws(broken(c => { of(c, 'embed-video').content.videoId = 'not a video'; }), /not a YouTube or Vimeo video/);
  assert.throws(broken(c => { of(c, 'embed-video').content.provider = 'vimeo'; }), /not a YouTube or Vimeo video/);
  assert.throws(broken(c => { of(c, 'software-practice').content.steps[0]!.target.x = 90; }), /inside its screenshot/);
  assert.throws(broken(c => { of(c, 'software-practice').content.modes = { watch: false, try: false, test: false }; }), /at least one/);
  assert.throws(broken(c => { of(c, 'video').content.describedAssetId = c.document.assets.find(a => a.mediaType.startsWith('image/'))!.id; }), /described video/);
});

test('video addresses from YouTube and Vimeo are read, and others refused', () => {
  assert.deepEqual(parseVideoAddress('https://www.youtube.com/watch?v=aqz-KE-bpKQ&t=30'), { provider: 'youtube', id: 'aqz-KE-bpKQ', start: 30 });
  assert.deepEqual(parseVideoAddress('https://youtu.be/aqz-KE-bpKQ'), { provider: 'youtube', id: 'aqz-KE-bpKQ' });
  assert.deepEqual(parseVideoAddress('https://www.youtube.com/shorts/aqz-KE-bpKQ'), { provider: 'youtube', id: 'aqz-KE-bpKQ' });
  assert.deepEqual(parseVideoAddress('https://vimeo.com/76979871'), { provider: 'vimeo', id: '76979871' });
  assert.equal(parseVideoAddress('https://example.com/watch?v=aqz-KE-bpKQ'), undefined);
  assert.equal(parseVideoAddress('javascript:alert(1)'), undefined);
});

test('checkpoints keep pointing at their questions when lessons and courses are copied', () => {
  const p = project(['interactive-video', 'true-false']); interactive(p);
  const lesson = p.document.course.sections[0]!.lessons[0]!, copy = copyLesson(lesson);
  const video = copy.blocks.find(b => b.type === 'video'), question = copy.blocks.find(b => b.type === 'assessment')!;
  assert.ok(video?.type === 'video' && video.content.checkpoints[0]!.questionId === question.id && question.id !== of(p, 'assessment').id);
  const duplicate = duplicateProject(validateProject(p)), dv = of(duplicate, 'video');
  assert.equal(dv.content.checkpoints[0]!.questionId, of(duplicate, 'assessment').id);
  assert.ok(documentAssetIds(duplicate.document).has(dv.content.assetId!));
});

test('Checks: embedded video needs the server setting, an address and a transcript; checkpoints must be reachable', () => {
  const p = project(['embed-video', 'interactive-video', 'continue', 'true-false']); interactive(p);
  let codes = courseChecks(p).map(i => `${i.effect}:${i.code}`);
  assert.ok(codes.includes('blocks:external-video-off') && codes.includes('blocks:embed-address'));
  assert.ok(codes.includes('warning:checkpoint-gated'));
  of(p, 'embed-video').content.videoId = 'aqz-KE-bpKQ';
  codes = courseChecks(p, { externalVideo: true }).map(i => `${i.effect}:${i.code}`);
  assert.ok(!codes.some(c => c.startsWith('blocks:')), codes.join());
  assert.ok(codes.includes('review:external-content'));
  of(p, 'video').content.checkpoints[0]!.questionId = 'item-gone';
  assert.ok(courseChecks(p).some(i => i.code === 'checkpoint-missing'));
  assert.equal(externalVideoEnabled({}), true, 'on unless the operator turns it off');
  assert.equal(externalVideoEnabled({ OPENSCROLL_EXTERNAL_VIDEO: 'off' }), false);
  assert.equal(externalVideoEnabled({ OPENSCROLL_EXTERNAL_VIDEO: 'on' }), true);
  assert.throws(() => externalVideoEnabled({ OPENSCROLL_EXTERNAL_VIDEO: 'yes' }), /on or off/);
});

test('an export lets the player frame YouTube and Vimeo only when the course embeds a video', async () => {
  const root = await mkdtemp(join(tmpdir(), 'openscroll-wave-c-')), playerRoot = join(root, 'dist/client');
  const before = process.env.OPENSCROLL_EXTERNAL_VIDEO;
  try {
    await mkdir(join(playerRoot, '.vite'), { recursive: true }); await mkdir(join(playerRoot, 'assets'));
    await writeFile(join(playerRoot, '.vite/manifest.json'), JSON.stringify({ 'player.html': { file: 'assets/player-abc.js' } }));
    await writeFile(join(playerRoot, 'player.html'), `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; object-src 'none'"><script type="module" src="/assets/player-abc.js"></script>`);
    await writeFile(join(playerRoot, 'assets/player-abc.js'), 'trusted fixture'); await writeFile(join(playerRoot, 'player-notices.txt'), 'notices');
    await writeFile(join(root, 'LICENSE'), 'License'); await writeFile(join(root, 'NOTICE'), 'Notice');
    process.env.OPENSCROLL_EXTERNAL_VIDEO = 'on';
    const plain = (await htmlFiles(project(['paragraph']), playerRoot)).get('index.html')!.toString();
    assert.doesNotMatch(plain, /youtube/);
    const p = project(['embed-video']); of(p, 'embed-video').content.videoId = 'aqz-KE-bpKQ';
    const embedded = (await htmlFiles(p, playerRoot)).get('index.html')!.toString();
    assert.match(embedded, /frame-src https:\/\/www\.youtube-nocookie\.com https:\/\/player\.vimeo\.com; object-src 'none'/);
    process.env.OPENSCROLL_EXTERNAL_VIDEO = 'off';
    await assert.rejects(htmlFiles(p, playerRoot), /does not allow YouTube or Vimeo/);
  } finally {
    if (before === undefined) delete process.env.OPENSCROLL_EXTERNAL_VIDEO; else process.env.OPENSCROLL_EXTERNAL_VIDEO = before;
    await rm(root, { recursive: true, force: true });
  }
});

test('software practice keeps test results per step and reports them', () => {
  const p = project(['software-practice']), practice = of(p, 'software-practice');
  practice.content.steps.push({ ...structuredClone(practice.content.steps[0]!), id: newId() });
  practice.content.modes.test = true; practice.content.required = true;
  assert.equal(cleanResponse(practice, { test: [1] }), undefined, 'one result per step');
  assert.equal(cleanResponse(practice, { test: [1, 2] }), undefined);
  assert.ok(!responseMeets(practice, { done: true }), 'with Test on, the test must be finished');
  const flow = new CourseFlow(p.document);
  assert.equal(flow.canComplete(), false);
  assert.ok(flow.respond(practice.id, { done: true, test: [1, 0] }));
  assert.equal(flow.canComplete(), true);
  const [r12] = interactionsFor(p.document, flow.snapshot(), '1.2'), [r2004] = interactionsFor(p.document, flow.snapshot(), '2004');
  assert.equal(r12!.type, 'performance'); assert.equal(r2004!.type, 'other');
  assert.equal(r2004!.result, 'incorrect'); assert.match(r2004!.response, /1 of 2 steps/);
});

test('the PDF lists descriptions, chapters and checkpoints, the embedded address, and practice steps', () => {
  const p = project(['interactive-video', 'true-false', 'embed-video', 'software-practice']); interactive(p); of(p, 'embed-video').content.videoId = 'aqz-KE-bpKQ';
  const before = process.env.OPENSCROLL_EXTERNAL_VIDEO; process.env.OPENSCROLL_EXTERNAL_VIDEO = 'on';
  try {
    const html = pdfHtml(p).html;
    assert.match(html, /Audio description/); assert.match(html, /0:00: A test pattern\./);
    assert.match(html, /Chapters/); assert.match(html, /Checkpoints/); assert.match(html, /which follows the video/);
    assert.match(html, /https:\/\/www\.youtube\.com\/watch\?v=aqz-KE-bpKQ/);
    assert.match(html, /class="practice"/);
  } finally { if (before === undefined) delete process.env.OPENSCROLL_EXTERNAL_VIDEO; else process.env.OPENSCROLL_EXTERNAL_VIDEO = before; }
});
