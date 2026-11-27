/**
 * Release condition from the security review of 2026-11-26 (M1): at the default limits, two authors save a course
 * near the 160 MiB course limit at the same moment, and one exports it as SCORM while the other saves. The app must
 * stay up inside its container memory limit, turn the overlapping request away with "try again" (429 with
 * Retry-After) instead of reading both at once, and keep both saves once the turned-away author tries again.
 * Run by tools/deployment-smoke.ts against the production Compose file and the final images.
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { sampleProject } from '../src/project/sample.js';
import { prepareBlock } from '../src/shared/block-catalog.js';
import { newId } from '../src/shared/outline.js';
import { assetPath, type Asset, type PortableProject } from '../src/shared/course.js';

type Auth = { cookie: string; csrf: string };
export interface LargeSaveContext {
  api: (path: string, method?: string, payload?: unknown, auth?: Auth) => Promise<Response>;
  /** Runs `docker` and returns its standard output. */
  docker: (args: string[]) => Promise<string>;
  appContainer: () => Promise<string>;
  createApprovedAuthor: (email: string, name: string) => Promise<Auth>;
  owner: Auth;
}
const MiB = 1024 * 1024;
const BUSY = /try again/i;

/** A sample course with incompressible PDF attachments adding up to `total` bytes, in files of at most 60 MiB. */
function largeProject(title: string, total: number): PortableProject {
  const project = sampleProject();
  project.document.course.title = title;
  const lesson = project.document.course.sections[0]!.lessons[0]!;
  for (let left = total, i = 1; left > 0; left -= 60 * MiB, i++) {
    const bytes = Buffer.concat([Buffer.from('%PDF-1.7\n'), randomBytes(Math.min(60 * MiB, left) - 9)]);
    const asset: Asset = { id: newId(), fileName: `large-${i}.pdf`, mediaType: 'application/pdf', byteLength: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    project.document.assets.push(asset);
    project.files[assetPath(asset)] = bytes.toString('base64');
    const { block } = prepareBlock('attachment', project);
    if (block.type !== 'attachment') throw new Error('The attachment template changed.');
    block.content.assetId = asset.id; block.content.label = `Large file ${i} (PDF)`;
    lesson.blocks.push(block);
  }
  return project;
}

/** Sends a request and, while the server answers 429, waits for Retry-After and sends it again. */
async function untilAccepted(send: () => Promise<Response>, turnedAway: string[], who: string) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const response = await send();
    if (response.status !== 429) return response;
    const body = await response.json() as { error: string };
    assert.match(body.error, BUSY, 'A turned-away request must ask the author to try again.');
    assert.ok(Number(response.headers.get('retry-after')) > 0, 'A turned-away request must say when to try again.');
    turnedAway.push(who);
    await new Promise(r => setTimeout(r, Number(response.headers.get('retry-after')) * 1000));
  }
  throw new Error(`${who} was still turned away after 60 tries.`);
}

export async function largeConcurrentSaves(context: LargeSaveContext) {
  const { api, docker } = context;
  const second = await context.createApprovedAuthor('large-save@example.invalid', 'Large save author');
  const authors = [{ who: 'first author', auth: context.owner }, { who: 'second author', auth: second }];
  const total = 150 * MiB; // near the 160 MiB default, leaving room for the course document
  const courses = await Promise.all(authors.map(async ({ who, auth }) => {
    const created = await api('/api/library/courses/import', 'POST', sampleProject(), auth);
    assert.equal(created.status, 200, `${who} could not create a course`);
    const { id } = await created.json() as { id: string };
    const edit = await (await api(`/api/library/courses/${id}/edit`, 'GET', undefined, auth)).json() as { revision: number };
    return { id, revision: edit.revision, project: largeProject(`Large course for the ${who}`, total) };
  }));
  const id = await context.appContainer();
  const startedAt = (await docker(['inspect', '--format', '{{.State.StartedAt}}', id])).trim();
  // Sample the app container's memory while the large requests run.
  let peak = 0, sampling = true;
  const sampler = (async () => {
    while (sampling) {
      const usage = (await docker(['stats', '--no-stream', '--format', '{{.MemUsage}}', id]).catch(() => '')).split('/')[0]!.trim();
      const match = usage.match(/^([\d.]+)\s*([KMG]i?B)$/);
      if (match) peak = Math.max(peak, Number(match[1]) * ({ KiB: 1 / 1024, KB: 1 / 1024, MiB: 1, MB: 1, GiB: 1024, GB: 1024 }[match[2]!] ?? 1));
    }
  })();
  const save = (index: number) => () => api(`/api/library/courses/${courses[index]!.id}/document`, 'PUT', { revision: courses[index]!.revision, mutationId: randomUUID(), document: courses[index]!.project.document, files: courses[index]!.project.files }, authors[index]!.auth);
  const turnedAway: string[] = [];
  const started = Date.now();
  // 1. Both authors save their large course at the same moment.
  const saves = await Promise.all([0, 1].map(index => untilAccepted(save(index), turnedAway, authors[index]!.who)));
  // Read a failed reply for the message only; a successful reply's body is read once, below.
  for (const [index, response] of saves.entries()) if (response.status !== 200) throw new Error(`${authors[index]!.who}'s large save failed: ${response.status} ${(await response.text()).slice(0, 300)}`);
  const firstRound = turnedAway.length;
  assert.ok(firstRound >= 1, 'Two large saves at the same moment must not be read side by side.');
  // 2. The first author exports SCORM while the second saves again.
  for (const [index, response] of saves.entries()) courses[index]!.revision = (await response.json() as { revision: number }).revision;
  courses[1]!.project.document.course.title += ' (saved again)';
  const [exported, again] = await Promise.all([
    untilAccepted(() => api('/api/projects/scorm-2004', 'POST', courses[0]!.project, authors[0]!.auth), turnedAway, 'SCORM export'),
    untilAccepted(save(1), turnedAway, 'second author (second save)'),
  ]);
  assert.equal(exported.status, 200, `SCORM export failed: ${exported.status}`);
  const zip = Buffer.from(await exported.arrayBuffer());
  assert.equal(zip.subarray(0, 2).toString('latin1'), 'PK', 'The SCORM export must be a zip file.');
  assert.equal(again.status, 200, `The second save failed: ${again.status}`);
  assert.ok(turnedAway.length > firstRound, 'An export and a large save at the same moment must not be read side by side.');
  sampling = false; await sampler;
  // 3. Both saves landed, and the app neither restarted nor ran out of memory.
  for (const [index, course] of courses.entries()) {
    const stored = await (await api(`/api/library/courses/${course.id}`, 'GET', undefined, authors[index]!.auth)).json() as PortableProject;
    assert.equal(stored.document.course.title, course.project.document.course.title, `${authors[index]!.who}'s saved title`);
    assert.equal(stored.document.assets.filter(a => a.fileName.startsWith('large-')).length, course.project.document.assets.filter(a => a.fileName.startsWith('large-')).length, `${authors[index]!.who}'s saved files`);
  }
  const state = JSON.parse(await docker(['inspect', '--format', '{{json .State}}', id])) as { Running: boolean; OOMKilled: boolean; StartedAt: string; Health?: { Status: string } };
  const restarts = (await docker(['inspect', '--format', '{{.RestartCount}}', id])).trim();
  const limit = Number((await docker(['inspect', '--format', '{{.HostConfig.Memory}}', id])).trim()) / MiB;
  assert.equal(state.Running, true); assert.equal(state.OOMKilled, false); assert.equal(state.StartedAt, startedAt, 'The app restarted during the large requests.'); assert.equal(restarts, '0');
  const result = { courseFilesMiB: total / MiB, turnedAwayThenAccepted: turnedAway, scormExportMiB: Math.round(zip.length / MiB), appMemoryLimitMiB: limit, appPeakMemoryMiB: Math.round(peak), restarts: 0, outOfMemory: false, seconds: Math.round((Date.now() - started) / 1000) };
  console.log('Large concurrent saves at the default limits:', JSON.stringify(result));
  return result;
}
