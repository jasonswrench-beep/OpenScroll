import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { mediaProject } from './helpers/media-project.js';
import { parseCourse,assetPath } from '../src/shared/course.js';
import { importProject,exportProject,validateProject } from '../src/project/archive.js';
import { duplicateProject } from '../src/server/library-routes.js';
import { htmlFiles } from '../src/project/html-export.js';
import { parseVtt,webVtt } from '../src/shared/captions.js';
import { setBlockValue } from '../src/shared/block-values.js';
test('version 1 archives migrate on a copy while the original bytes, asset hashes, and authored content remain intact',async()=>{
 const bytes=await readFile('tests/fixtures/welcome-v1.openscroll'),hash=createHash('sha256').update(bytes).digest('hex');const project=await importProject(bytes);assert.equal(project.document.schemaVersion,3);const legacy={...structuredClone(project.document),schemaVersion:1};assert.equal(parseCourse(legacy).schemaVersion,3);assert.equal(legacy.schemaVersion,1);assert.equal(createHash('sha256').update(bytes).digest('hex'),hash);assert.equal((await importProject(await exportProject(project))).document.schemaVersion,3);
});
test('all media and interactions round trip and library duplication remaps nested asset references independently',async()=>{
 const project=await mediaProject(),before=structuredClone(project);assert.deepEqual(await importProject(await exportProject(project)),project);const copy=duplicateProject(project);validateProject(copy);assert.deepEqual(project,before);
 assert.equal(copy.document.assets.some(a=>project.document.assets.some(original=>original.id===a.id)),false);
 for(const block of copy.document.course.sections[0]!.lessons[0]!.blocks){assert.equal(project.document.course.sections[0]!.lessons[0]!.blocks.some(b=>b.id===block.id),false);if(block.type==='gallery')assert.ok(block.content.items.every(image=>copy.document.assets.some(a=>a.id===image.assetId)));if(block.type==='video' && block.content.assetId){const asset=copy.document.assets.find(a=>a.id===block.content.assetId)!;assert.equal(copy.files[assetPath(asset)],project.files['assets/fixture-video.mp4']);}}
});
test('new blocks reject broken media, unsafe links, impossible markers and invalid captions without mutating input',async()=>{
 const source=await mediaProject();const check=(type:string,mutate:(content:Record<string,unknown>)=>void)=>{const project=structuredClone(source);const block=project.document.course.sections[0]!.lessons[0]!.blocks.find(b=>b.type===type)!;mutate(block.content as unknown as Record<string,unknown>);assert.throws(()=>parseCourse(project.document));};
 check('audio',content=>{content.assetId='fixture-video';});check('gallery',content=>{(content.items as {assetId:string}[])[0]!.assetId='missing-image';});check('labeled-graphic',content=>{(content.markers as {x:number}[])[0]!.x=101;});check('video',content=>{content.captions=[{start:2,end:1,text:'Wrong timing'}];});
 for(const url of ['javascript:alert(1)','data:text/html,unsafe','file:///tmp/file','https://name:password@example.org'])check('button',content=>{content.url=url;});const legacy={...source.document,schemaVersion:1};assert.throws(()=>parseCourse(legacy),/Version 1/);assert.equal(source.document.schemaVersion,3);
});
test('caption import validates timing and exports inert Unicode WebVTT; malformed files do not replace cues',()=>{
 const cues=parseVtt('WEBVTT\n\n00:00.000 --> 00:02.250\nA café & <b>tone</b>.\n');assert.deepEqual(cues,[{start:0,end:2.25,text:'A café & tone.'}]);assert.match(webVtt([{start:1,end:2,text:'<script> & words'}]),/&lt;script&gt; &amp; words/);
 for(const value of ['not captions','WEBVTT\n\n00:03.000 --> 00:01.000\nBackwards','WEBVTT\n\n00:61.000 --> 00:62.000\nInvalid','WEBVTT\n\n'])assert.throws(()=>parseVtt(value));
});
test('nested content paths preserve independent card/item values and reject prototype traversal',async()=>{
 const project=await mediaProject();const tabs=project.document.course.sections[0]!.lessons[0]!.blocks.find(b=>b.type==='tabs')!;setBlockValue(tabs,'items.0.title','Updated topic');assert.equal(tabs.content.items[0]!.title,'Updated topic');assert.notEqual(tabs.content.items[1]!.title,'Updated topic');assert.throws(()=>setBlockValue(tabs,'__proto__.unsafe','value'));assert.throws(()=>setBlockValue(tabs,'items.90.text','value'));
});
test('publishing requires transcripts and timed captions on configured media but allows incomplete drafts to be saved',async()=>{
 const project=await mediaProject();const blocks=project.document.course.sections[0]!.lessons[0]!.blocks;const audio=blocks.find(b=>b.type==='audio')!;audio.content.transcript='';validateProject(project);await assert.rejects(htmlFiles(project,'/tmp/no-player'),/transcript/);audio.content.transcript='A steady tone.';const video=blocks.find(b=>b.type==='video')!;video.content.captions=[];validateProject(project);await assert.rejects(htmlFiles(project,'/tmp/no-player'),/timed captions/);
});
