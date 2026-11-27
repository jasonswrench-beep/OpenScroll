import { z } from 'zod';
import { writeFile, readFile } from 'node:fs/promises';
import { courseSchema } from '../src/shared/course.js';
const contents=JSON.stringify({ ...z.toJSONSchema(courseSchema,{io:'input'}), $id: 'urn:openscroll:course:v4', title:'OpenScroll course version 4' },null,2)+'\n';
// Compare without carriage returns so Windows checkouts with automatic line-ending conversion still pass.
const unix=(value:string)=>value.replace(/\r\n/g,'\n');
if (process.argv.includes('--check')) {
  if (unix(await readFile('schema/course-v4.schema.json','utf8')) !== contents) throw new Error('Schema artifact is stale. Run npm run schema.');
  console.log('JSON Schema artifact matches runtime structural validation.');
} else await writeFile('schema/course-v4.schema.json',contents);
