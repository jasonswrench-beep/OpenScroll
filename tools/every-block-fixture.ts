/**
 * Writes tests/fixtures/every-block-v4.openscroll: one of every block template plus every course resource, with
 * links between them, using only original starter content and the original test media. Used as the version 4
 * compatibility fixture. Run with: npx tsx tools/every-block-fixture.ts OUTPUT
 */
import { readFile, writeFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { sampleProject } from '../src/project/sample.js';
import { BLOCK_TEMPLATES, prepareBlock } from '../src/shared/block-catalog.js';
import { assetPath, type Block } from '../src/shared/course.js';
import { newId } from '../src/shared/outline.js';
import { exportProject, validateProject } from '../src/project/archive.js';

const output = process.argv[2];
if (!output) throw new Error('Usage: tsx tools/every-block-fixture.ts OUTPUT');
if (await access(output).then(() => true, () => false)) throw new Error(`${output} exists. Remove it first.`);
const project = sampleProject(), course = project.document.course, lesson = course.sections[0]!.lessons[0]!;
course.title = 'Every block, version 4';
const clip = await readFile('tests/fixtures/original-clip.mp4');
const video = { id: 'fixture-clip', fileName: 'original-clip.mp4', mediaType: 'video/mp4' as const, byteLength: clip.length, sha256: createHash('sha256').update(clip).digest('hex') };
project.document.assets.push(video); project.files[assetPath(video)] = clip.toString('base64');
const image = project.document.assets.find(a => a.mediaType.startsWith('image/'))!.id;
course.characters = [{ id: newId(), name: 'Sam', role: 'Team lead', poses: [{ id: newId(), name: 'Calm', imageId: image, alt: 'Sam listening calmly.' }] }];
course.glossary = [{ id: newId(), term: 'Practice', definition: 'Doing something again to improve.', aliases: ['rehearsal'] }];
course.settings.glossaryLinks = true;
course.banks = [{ id: newId(), name: 'Fixture bank', questions: ['single-choice', 'true-false', 'numeric'].map(key => prepareBlock(key, project).block as Extract<Block, { type: 'assessment' }>) }];
course.certificate = { title: 'Certificate of completion', issuer: 'OpenScroll', signerName: 'Sam', signerTitle: 'Team lead', logoId: image, signatureId: null, showScore: true };
lesson.blocks = [];
for (const template of BLOCK_TEMPLATES) {
  const prepared = prepareBlock(template.key, project);
  if (prepared.asset && !project.document.assets.some(a => a.id === prepared.asset!.id)) { project.document.assets.push(prepared.asset); project.files[assetPath(prepared.asset)] = prepared.data!; }
  lesson.blocks.push(prepared.block);
}
for (const block of lesson.blocks) {
  if (block.type === 'video') { block.content.assetId = video.id; block.content.transcript = 'A two-second test clip with a tone.'; block.content.captions = [{ start: 0, end: 1.5, text: 'A tone plays.' }]; }
  if (block.type === 'video' && block.variant === 'interactive') { const question = lesson.blocks.find(b => b.type === 'assessment')!; block.content.checkpoints = [{ id: newId(), time: 1, kind: 'question', questionId: question.id, title: '', note: '' }]; block.content.chapters = [{ time: 0, title: 'Start' }]; block.content.descriptions = [{ start: 0, end: 2, text: 'A dark green screen.' }]; }
  if (block.type === 'embed-video') block.content.videoId = 'aqz-KE-bpKQ';
}
// The interactive video's question must come after it.
const ivideo = lesson.blocks.findIndex(b => b.type === 'video' && b.variant === 'interactive'), question = lesson.blocks.findIndex(b => b.type === 'assessment');
if (question < ivideo) { const [q] = lesson.blocks.splice(question, 1); lesson.blocks.splice(ivideo, 0, q!); }
await writeFile(output, await exportProject(validateProject(project)), { flag: 'wx' });
console.log(`Wrote ${output} with ${lesson.blocks.length} blocks.`);
