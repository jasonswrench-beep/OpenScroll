import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { htmlFiles,exportHtml } from '../src/project/html-export.js';
import { sampleProject } from '../src/project/sample.js';
import { buildApprovedProjectApp } from './helpers/project-app.js';
test('HTML packaging includes only its player dependency graph, canonical assets, and notices with relative paths',async()=>{
 const root=await mkdtemp(join(tmpdir(),'openscroll-html-')),playerRoot=join(root,'dist/client');
 try{
  await mkdir(join(playerRoot,'.vite'),{recursive:true});await mkdir(join(playerRoot,'assets'));
  await writeFile(join(playerRoot,'.vite/manifest.json'),JSON.stringify({'player.html':{file:'assets/player-abc.js',imports:['shared'],css:['assets/player-abc.css']},shared:{file:'assets/shared-abc.js'},'index.html':{file:'assets/author-only.js'}}));
  await writeFile(join(playerRoot,'player.html'),'<script type="module" src="/assets/player-abc.js"></script><link href="/assets/player-abc.css">');
  for(const file of ['player-abc.js','shared-abc.js','player-abc.css','author-only.js'])await writeFile(join(playerRoot,'assets',file),'trusted fixture');
  await writeFile(join(playerRoot,'player-notices.txt'),'Third-party runtime license fixture');await writeFile(join(root,'LICENSE'),'License fixture');await writeFile(join(root,'NOTICE'),'Notice fixture');
  const project=sampleProject();project.document.course.title='</script><img src=x onerror=alert(1)>';const before=structuredClone(project);
  const files=await htmlFiles(project,playerRoot);assert.ok(files.has('runtime/shared-abc.js'));assert.equal(files.has('runtime/author-only.js'),false);assert.ok(files.has('assets/sample-image.png'));assert.match(files.get('index.html')!.toString(),/src="\.\/runtime\/player-abc.js"/);assert.equal(files.get('index.html')!.toString().includes('<img'),false);assert.equal(JSON.parse(files.get('course.json')!.toString()).course.title,project.document.course.title);assert.ok(files.has('THIRD-PARTY-NOTICES.txt'));assert.deepEqual(project,before);
  const publication=JSON.parse(files.get('publication.json')!.toString());assert.match(publication.fingerprint,/^[a-f0-9]{64}$/);project.document.course.title='Changed';assert.notEqual(JSON.parse((await htmlFiles(project,playerRoot)).get('publication.json')!.toString()).fingerprint,publication.fingerprint);
  assert.equal((await exportHtml(project,playerRoot)).readUInt32LE(),0x04034b50);
  await writeFile(join(playerRoot,'.vite/manifest.json'),JSON.stringify({'player.html':{file:'../outside.js'}}));await assert.rejects(htmlFiles(project,playerRoot),/unsupported runtime path/);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('HTML API rejects invalid snapshots and absent player builds without changing the project',async()=>{
 const project=sampleProject(),before=structuredClone(project);await assert.rejects(htmlFiles(project,'/tmp/openscroll-missing-player-build'),/build is unavailable/);assert.deepEqual(project,before);
 const app=await buildApprovedProjectApp();try{const bad=structuredClone(project);bad.document.course.sections[0]!.lessons[0]!.blocks[0]!.id='INVALID';const response=await app.inject({method:'POST',url:'/api/projects/html',payload:bad});assert.equal(response.statusCode,422);assert.match(response.json().error,/Invalid course/);}finally{await app.close();}
});
