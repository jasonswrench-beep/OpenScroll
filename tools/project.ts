import { writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { exportProject, importProject, LIMITS } from '../src/project/archive.js';
import { sampleProject } from '../src/project/sample.js';
async function readArchive(path: string) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of createReadStream(path)) {
    const bytes = chunk as Buffer;
    size += bytes.length;
    if (size > LIMITS.archive) throw new Error('Choose a project no larger than 32 MiB.');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}
const [command, input, output] = process.argv.slice(2);
try {
  if (command === 'sample' && input && !output) {
    await writeFile(input, await exportProject(sampleProject()), { flag: 'wx' });
    console.log('Created sample project.');
  } else if (command === 'inspect' && input && !output) {
    const { document } = await importProject(await readArchive(input));
    console.log(JSON.stringify({ title: document.course.title, schemaVersion: document.schemaVersion, sections: document.course.sections.length, lessons: document.course.sections.reduce((n,s) => n+s.lessons.length,0), assets: document.assets.length },null,2));
  } else if (command === 'repack' && input && output) {
    await writeFile(output, await exportProject(await importProject(await readArchive(input))), { flag: 'wx' });
    console.log('Reopened and saved project. The original was preserved.');
  } else throw new Error('Usage: npm run project -- sample FILE | inspect FILE | repack INPUT OUTPUT');
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Project operation failed.');
  process.exitCode = 1;
}
