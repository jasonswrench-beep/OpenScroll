import { publicationProject } from './readiness.js';
import { Readable } from 'node:stream';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import yazl from 'yazl';
import { LIMITS } from './archive.js';
import { ProjectError } from '../shared/course.js';
interface ManifestEntry {file:string;imports?:string[];css?:string[];}
/** Only trusted build artifacts and validated canonical course assets enter the publication. */
export async function htmlFiles(input:unknown,playerRoot:string):Promise<Map<string,Buffer>>{
  const project=publicationProject(input);
  let manifest:Record<string,ManifestEntry>,html:string;
  try{manifest=JSON.parse(await readFile(resolve(playerRoot,'.vite/manifest.json'),'utf8'));html=await readFile(resolve(playerRoot,'player.html'),'utf8');}catch{throw new ProjectError('The HTML player build is unavailable. Build OpenScroll before exporting.');}
  const files=new Map<string,Buffer>();const visited=new Set<string>();
  const addRuntime=async(path:string)=>{if(!/^assets\/[a-zA-Z0-9_-]+\.(js|css)$/.test(path))throw new ProjectError('The player build contains an unsupported runtime path.');const destination=`runtime/${path.slice(7)}`;if(!files.has(destination))files.set(destination,await readFile(resolve(playerRoot,path)));};
  const visit=async(key:string)=>{if(visited.has(key))return;visited.add(key);const entry=manifest[key];if(!entry)throw new ProjectError('The HTML player build is incomplete.');await addRuntime(entry.file);for(const css of entry.css ?? [])await addRuntime(css);for(const dependency of entry.imports ?? [])await visit(dependency);};
  await visit('player.html');
  if(!html.includes('/assets/') || !html.includes('type="module"'))throw new ProjectError('The HTML player entry is invalid.');
  html=html.replaceAll('="/assets/','="./runtime/');files.set('index.html',Buffer.from(html));
  const json=JSON.stringify(project.document);files.set('course.json',Buffer.from(json+'\n'));
  files.set('publication.json',Buffer.from(JSON.stringify({format:'openscroll-html',version:1,fingerprint:createHash('sha256').update(json).digest('hex')})+'\n'));
  for(const [path,data]of Object.entries(project.files))files.set(path,Buffer.from(data,'base64'));
  files.set('THIRD-PARTY-NOTICES.txt',await readFile(resolve(playerRoot,'player-notices.txt')));
  files.set('README.txt',Buffer.from('OpenScroll standalone HTML course\n\nExtract this complete ZIP and serve its directory from any static web server. Open index.html through that server. Direct file:// execution is not supported. No OpenScroll server, author account, database, CDN, or learner account is required. All runtime and course assets are included with relative references.\n\nProgress stays in this browser and origin, when local storage is available. Reset progress starts again. This is not LMS reporting or SCORM. A changed course gets a separate progress key. Preview progress is never exported. Keep your .openscroll project separately for editing.\n\nContinue sections reveal content after any required review confirmations. These confirmations record learner acknowledgement, not assessment success or proof of comprehension. Audio narration is not generated or played in this version.\n\nRuntime code is Apache-2.0; see LICENSE.txt, NOTICE.txt, and THIRD-PARTY-NOTICES.txt. Authored course content retains its own rights.\n'));
  // Constants avoid dependence on a source checkout in production containers.
  const licenseRoot=resolve(playerRoot,'../..');
  try{files.set('LICENSE.txt',await readFile(resolve(licenseRoot,'LICENSE')));files.set('NOTICE.txt',await readFile(resolve(licenseRoot,'NOTICE')));}catch{throw new ProjectError('Required publication license notices are unavailable.');}
  if([...files.values()].reduce((total,data)=>total+data.length,0)>LIMITS.expanded)throw new ProjectError('The HTML publication exceeds the 64 MiB expanded limit. Remove unused assets or reduce media sizes.');
  return files;
}
export async function exportHtml(input:unknown,playerRoot:string){
  return zipPublication(await htmlFiles(input,playerRoot));
}
export async function zipPublication(files:Map<string,Buffer>){
  if([...files.values()].reduce((n,b)=>n+b.length,0)>LIMITS.expanded)throw new ProjectError("Publication exceeds the expanded size limit.");
  const zip=new yazl.ZipFile();const chunks:Buffer[]=[];let size=0;
  const output=new Promise<Buffer>((resolve,reject)=>{zip.on('error',reject);zip.outputStream.on('error',reject);zip.outputStream.on('data',(chunk:Buffer)=>{size+=chunk.length;if(size>LIMITS.archive){(zip.outputStream as Readable).destroy(new ProjectError('The HTML publication exceeds the 32 MiB ZIP limit.'));return;}chunks.push(chunk);});zip.outputStream.on('end',()=>resolve(Buffer.concat(chunks)));});
  for(const [path,data]of files)zip.addBuffer(data,path,{mtime:new Date('1980-01-01T00:00:00Z'),mode:0o100644,compress:true});zip.end();return output;
}
