import { readFile,stat,writeFile } from 'node:fs/promises';
import { importProject,LIMITS } from '../src/project/archive.js';
import { exportPdf } from '../src/project/pdf-export.js';
const [input,output,...flags]=process.argv.slice(2);
try{
 if(!input || !output || flags.some(f=>!['--answers','--letter'].includes(f)))throw new Error('Usage: npx tsx tools/pdf.ts INPUT.openscroll OUTPUT.pdf [--answers] [--letter]');
 if((await stat(input)).size>LIMITS.archive)throw new Error('Choose a project no larger than 32 MiB.');
 const project=await importProject(await readFile(input));await writeFile(output,await exportPdf(project,{paper:flags.includes('--letter')?'Letter':'A4',includeAnswers:flags.includes('--answers')}),{flag:'wx'});console.log('Created PDF. The editable project was preserved.');
}catch(error){console.error(error instanceof Error?error.message:'PDF publishing failed.');process.exitCode=1;}
