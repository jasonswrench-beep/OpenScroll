import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOCK_TEMPLATES,prepareBlock,switchVariant,duplicateBlock,templatesFor } from '../src/shared/block-catalog.js';
import { LessonHistory } from '../src/shared/lesson-history.js';
import { parseCourse,assetPath,type Block } from '../src/shared/course.js';
import { sampleProject } from '../src/project/sample.js';
import { validateProject,exportProject,importProject } from '../src/project/archive.js';
test('every original template inserts as a valid portable block and image defaults reuse their asset',async()=>{
  const project=sampleProject();const lesson=project.document.course.sections[0]!.lessons[0]!;
  const originalAssetCount=project.document.assets.length;
  for(const template of BLOCK_TEMPLATES){const prepared=prepareBlock(template.key,project);if(prepared.asset){project.document.assets.push(prepared.asset);project.files[assetPath(prepared.asset)]=prepared.data!;}lesson.blocks.push(prepared.block);}
  assert.equal(project.document.assets.length,originalAssetCount+1,'all original image templates share one course-owned starter asset');
  const validated=validateProject(project);assert.deepEqual(await importProject(await exportProject(validated)),validated);
});
test('compatible template changes preserve hidden fields, settings, narration, and identity',()=>{
  const p=sampleProject();
  for(const template of BLOCK_TEMPLATES){
    const block=prepareBlock(template.key,p).block;block.narration={script:'Author-owned narration',language:'en',speed:1.2,voice:'my-voice'};const before=structuredClone(block);
    for(const sibling of templatesFor(block)){const result=switchVariant(block,sibling.variant);assert.deepEqual({...result,variant:before.variant},before);}
    assert.deepEqual(block,before);
  }
  assert.throws(()=>switchVariant(prepareBlock('paragraph',p).block,'image-left'),/compatible/);
});
test('duplicate blocks have independent content and preserve asset references and narration',()=>{
  const source=sampleProject().document.course.sections[0]!.lessons[0]!.blocks[1]!;const copy=duplicateBlock(source);assert.notEqual(copy.id,source.id);assert.deepEqual(copy.narration,source.narration);
  if(copy.type==='paragraph')copy.content.text='Only the copy changes';assert.notDeepEqual(copy.content,source.content);
  const image=sampleProject().document.course.sections[0]!.lessons[0]!.blocks[2]!;const duplicate=duplicateBlock(image);assert.deepEqual(duplicate.content,image.content);
});
test('typing groups by field and time, while structural operations and divergent edits clear redo',()=>{
  const initial=sampleProject().document.course.sections[0]!.lessons[0]!.blocks;
  const history=new LessonHistory();const a=structuredClone(initial);const b=structuredClone(initial);const c=structuredClone(initial);
  (a[0] as Extract<Block,{type:'heading'}>).content.text='A';(b[0] as Extract<Block,{type:'heading'}>).content.text='AB';(c[0] as Extract<Block,{type:'heading'}>).content.text='ABC';
  history.record(initial,a,'heading:text',1000);history.record(a,b,'heading:text',1300);assert.deepEqual(history.undo(b),initial);assert.deepEqual(history.redo(initial),b);
  history.record(b,c,'heading:text',3000);assert.deepEqual(history.undo(c),b);history.record(b,a,'different-field',3100);assert.equal(history.canRedo,false);
});
test('history is bounded, remains session-local, and a rejected undo does not consume the entry',()=>{
  const initial=sampleProject().document.course.sections[0]!.lessons[0]!.blocks;const history=new LessonHistory(2);
  const a=structuredClone(initial);a.pop();const b=structuredClone(a);b.pop();const c=structuredClone(b);c.pop();
  history.record(initial,a);history.record(a,b);history.record(b,c);
  assert.equal(history.undo(c,()=>false),undefined);assert.equal(history.canUndo,true);assert.deepEqual(history.undo(c),b);assert.deepEqual(history.undo(b),a);assert.equal(history.undo(a),undefined);
  assert.equal(new LessonHistory().canUndo,false);
});
test('undoing an image insertion retains valid course assets for subsequent redo and export',()=>{
  const project=sampleProject();const lesson=project.document.course.sections[0]!.lessons[0]!;const history=new LessonHistory();const before=structuredClone(lesson.blocks);
  const prepared=prepareBlock('image',project);project.document.assets.push(prepared.asset!);project.files[assetPath(prepared.asset!)]=prepared.data!;lesson.blocks.push(prepared.block);history.record(before,lesson.blocks);
  lesson.blocks=history.undo(lesson.blocks)!;parseCourse(project.document);validateProject(project);assert.equal(project.document.assets.length,2);
  lesson.blocks=history.redo(lesson.blocks)!;assert.equal(lesson.blocks.at(-1)!.id,prepared.block.id);validateProject(project);
});
