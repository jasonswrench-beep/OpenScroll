import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SaveController,type SavePayload,type SaveAck,type RecoveryDraft } from '../src/client/save-controller.js';
import { sampleProject } from '../src/project/sample.js';
import { copySection,copyLesson,moveLesson,moveItem,changeOutline } from '../src/shared/outline.js';
function deferred<T>(){let resolve!:(value:T)=>void;let reject!:(reason:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
const updatedAt='2026-10-22T01:00:00Z';
test('an edit during a save is queued against the acknowledged revision without losing text',async ()=>{
  const first=deferred<SaveAck>();const calls:SavePayload[]=[];let draft:RecoveryDraft|null=null;
  const c=new SaveController({project:sampleProject(),revision:1,delay:60000,persist:async value=>{draft=value;},changed:()=>{},send:async payload=>{calls.push(payload);return calls.length===1 ? first.promise : {revision:3,updatedAt};}});
  try {
    c.edit(p=>{p.document.course.title='First edit';});const saving=c.save();await new Promise(r=>setImmediate(r));
    c.edit(p=>{p.document.course.description='Typed while saving';});first.resolve({revision:2,updatedAt});await saving;
    assert.equal(c.state,'pending');assert.equal(c.project.document.course.description,'Typed while saving');
    await c.save();assert.equal(c.state,'saved');assert.equal(calls[1]!.revision,2);assert.equal(calls[1]!.document.course.description,'Typed while saving');assert.equal(draft,null);
  }finally{c.dispose();}
});
test('ambiguous failures retry the exact mutation before saving newer edits',async ()=>{
  const calls:SavePayload[]=[];
  const c=new SaveController({project:sampleProject(),revision:1,delay:60000,persist:async ()=>{},changed:()=>{},send:async payload=>{calls.push(structuredClone(payload));if(calls.length===1)throw new Error('Connection lost after sending');return {revision:calls.length,updatedAt};}});
  try{
    c.edit(p=>{p.document.course.title='Sent before failure';});await c.save();assert.equal(c.state,'error');
    c.edit(p=>{p.document.course.title='Newer local edit';});await c.save();assert.deepEqual(calls[1],calls[0]);assert.equal(c.state,'pending');
    await c.save();assert.equal(calls[2]!.revision,2);assert.notEqual(calls[2]!.mutationId,calls[0]!.mutationId);assert.equal(calls[2]!.document.course.title,'Newer local edit');
  }finally{c.dispose();}
});
test('conflicts retain edits and stop automatic or manual overwrite attempts',async ()=>{
  let calls=0;let kept:RecoveryDraft|null=null;
  const c=new SaveController({project:sampleProject(),revision:1,delay:60000,persist:async value=>{kept=value;},changed:()=>{},send:async ()=>{calls++;throw Object.assign(new Error('Changed elsewhere'),{status:409});}});
  try{
    c.edit(p=>{p.document.course.title='My protected draft';});await c.save();assert.equal(c.state,'conflict');await c.save();assert.equal(calls,1);
    assert.equal(c.project.document.course.title,'My protected draft');assert.ok(kept);
    const recovered=new SaveController({project:sampleProject(),revision:2,persist:async ()=>{},changed:()=>{},send:async ()=>{throw new Error('Must not overwrite');}});
    try{recovered.restore(kept,true);assert.equal(recovered.state,'conflict');assert.equal(recovered.project.document.course.title,'My protected draft');await recovered.save();}finally{recovered.dispose();}
  }finally{c.dispose();}
});
test('new asset bytes travel once; subsequent metadata saves omit them',async ()=>{
  const calls:SavePayload[]=[];
  const c=new SaveController({project:sampleProject(),revision:1,delay:60000,persist:async ()=>{},changed:()=>{},send:async payload=>{calls.push(payload);return {revision:calls.length+1,updatedAt};}});
  try{c.edit(p=>{p.document.course.cover={assetId:'sample-image',altText:'A cover',decorative:false};},true);await c.save();assert.ok(calls[0]!.files);c.edit(p=>{p.document.course.author='New author';});await c.save();assert.equal(calls[1]!.files,undefined);}finally{c.dispose();}
});
test('outline copies preserve content and asset references while allocating unique IDs',()=>{
  const original=sampleProject().document;const before=structuredClone(original);const section=copySection(original.course.sections[0]!);const lesson=copyLesson(original.course.sections[0]!.lessons[0]!);
  assert.notEqual(section.id,original.course.sections[0]!.id);assert.notEqual(lesson.blocks[0]!.id,original.course.sections[0]!.lessons[0]!.blocks[0]!.id);
  assert.equal(lesson.blocks.find(b=>b.type==='image')!.content.assetId,'sample-image');
  const result=changeOutline(original,doc=>{doc.course.sections.push(section);const id=doc.course.sections[0]!.lessons[0]!.id;moveLesson(doc,id,section.id);moveItem(doc.course.sections,1,-1);});
  assert.deepEqual(original,before);assert.equal(result.course.sections[0]!.id,section.id);assert.equal(result.course.sections[1]!.lessons.length,1);
});
test('recovery storage failure warns without blocking a confirmed server save',async()=>{
  const c=new SaveController({project:sampleProject(),revision:1,delay:60000,persist:async ()=>{throw new Error('Storage quota');},changed:()=>{},send:async()=>({revision:2,updatedAt})});
  try{c.edit(p=>{p.document.course.title='Save despite browser quota';});await c.keepDraft();assert.equal(c.recoveryWarning,true);assert.equal(c.dirty,true);await c.save();assert.equal(c.state,'saved');assert.equal(c.dirty,false);}finally{c.dispose();}
});

test('restoring a v1 recovery draft migrates local content while retrying its exact original pending request',async()=>{
 const legacy={...sampleProject(),document:{...sampleProject().document,schemaVersion:1}};const original={revision:1,mutationId:crypto.randomUUID(),document:structuredClone(legacy.document)};
 const draft={project:legacy,revision:1,generation:1,assetGeneration:0,savedAssetGeneration:0,pending:{generation:1,assetGeneration:0,payload:original}} as unknown as RecoveryDraft;
 const calls:SavePayload[]=[];const controller=new SaveController({project:sampleProject(),revision:2,delay:60000,persist:async()=>{},changed:()=>{},send:async payload=>{calls.push(structuredClone(payload));return {revision:calls.length+1,updatedAt};}});
 try{controller.restore(draft,false);assert.equal(controller.project.document.schemaVersion,3);await controller.save();assert.deepEqual(calls[0],original);assert.equal(controller.state,'saved');controller.edit(p=>{p.document.course.title='An upgraded edit';});await controller.save();assert.equal(calls[1]!.document.schemaVersion,3);assert.notEqual(calls[1]!.mutationId,original.mutationId);}finally{controller.dispose();}
});
