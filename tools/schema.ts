import { z } from 'zod';
import { writeFile, readFile } from 'node:fs/promises';
import { courseSchema } from '../src/shared/course.js';
const contents=JSON.stringify({ ...z.toJSONSchema(courseSchema), $id: 'urn:openscroll:course:v3', title:'OpenScroll course version 3' },null,2)+'\n';
if (process.argv.includes('--check')) {
  if (await readFile('schema/course-v3.schema.json','utf8') !== contents) throw new Error('Schema artifact is stale. Run npm run schema.');
  console.log('JSON Schema artifact matches runtime structural validation.');
} else await writeFile('schema/course-v3.schema.json',contents);
