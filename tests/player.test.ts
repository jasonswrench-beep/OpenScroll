import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CourseFlow } from '../src/player/state.js';
import { sampleProject } from '../src/project/sample.js';
import { prepareBlock } from '../src/shared/block-catalog.js';
function fixture(){const project=sampleProject();const lesson=project.document.course.sections[0]!.lessons[0]!;const original=lesson.blocks[1]!;const gate=lesson.blocks[3]!;assert.equal(gate.type,'continue');gate.completion='previous';lesson.blocks=[original,gate,{...structuredClone(original),id:'second-text'}, {...structuredClone(gate),id:'second-gate',completion:'all-previous'}];return project.document;}
test('Continue reveals one section at a time and requires explicit review without mutating authored data',()=>{
 const document=fixture(),before=structuredClone(document),flow=new CourseFlow(document);assert.equal(flow.visible().length,2);assert.equal(flow.canContinue('continue-block'),false);assert.equal(flow.review('second-text'),false);assert.equal(flow.continue('second-gate'),false);assert.equal(flow.canComplete(),false);
 assert.equal(flow.review('welcome-paragraph'),true);assert.equal(flow.continue('continue-block'),true);assert.equal(flow.visible().length,4);assert.equal(flow.canContinue('second-gate'),false);assert.equal(flow.review('second-text'),true);assert.equal(flow.continue('second-gate'),true);assert.equal(flow.complete(),true);assert.deepEqual(flow.progress,{done:1,total:2,percent:50});assert.deepEqual(document,before);
});
test('free and sequential navigation separate visiting from completing and handle empty lessons',()=>{
 const document=fixture();document.course.settings.navigation='sequential';const flow=new CourseFlow(document);assert.equal(flow.enter('keep-your-work'),false);flow.review('welcome-paragraph');flow.continue('continue-block');flow.review('second-text');flow.continue('second-gate');flow.complete();assert.equal(flow.enter('keep-your-work'),true);flow.complete();assert.equal(flow.progress.percent,100);flow.reset();assert.equal(flow.progress.done,0);assert.equal(flow.enter('missing'),false);
 const free=new CourseFlow(sampleProject().document);assert.equal(free.enter('keep-your-work'),true);assert.equal(free.progress.done,0);free.lesson!.blocks=[];assert.equal(free.complete(),true);
 const empty=sampleProject().document;empty.course.sections=[];const blank=new CourseFlow(empty);assert.equal(blank.complete(),false);assert.equal(blank.progress.percent,0);
});
test('unrestricted and structural Continue rules cannot deadlock; chained gates still require release',()=>{
 const project=sampleProject(),lesson=project.document.course.sections[0]!.lessons[0]!;lesson.blocks=[prepareBlock('divider',project).block,{...lesson.blocks[3]!,completion:'previous'} as typeof lesson.blocks[number]];
 const flow=new CourseFlow(project.document);assert.equal(flow.canContinue('continue-block'),true);assert.equal(flow.canComplete(),false);flow.continue('continue-block');assert.equal(flow.canComplete(),true);
});
test('resume validates learner state, ignores unknown IDs, and rejects impossible sequential completion',()=>{
 const document=fixture();document.course.settings.navigation='sequential';const flow=new CourseFlow(document);flow.review('welcome-paragraph');flow.continue('continue-block');const state=flow.snapshot();const resumed=new CourseFlow(document);resumed.restore(state);assert.deepEqual(resumed.snapshot(),state);
 resumed.restore({version:1,lessonId:'keep-your-work',reviewed:['unknown'],released:['second-gate'],completed:['keep-your-work']});assert.equal(resumed.lessonId,'your-course');assert.equal(resumed.released.size,0);assert.equal(resumed.completed.size,0);
 resumed.restore({version:2,lessonId:'x',reviewed:[],released:[],completed:[]});assert.equal(resumed.progress.done,0);resumed.restore({version:1,lessonId:'x',reviewed:'wrong',released:[],completed:[]});assert.equal(resumed.progress.done,0);
});
test('finishing combines only a terminal Continue with completion and does not bypass review or interior gates',()=>{
 const flow=new CourseFlow(fixture()),before=flow.snapshot();assert.equal(flow.canFinish(),false);assert.equal(flow.finish(),false);assert.deepEqual(flow.snapshot(),before);
 flow.review('welcome-paragraph');assert.equal(flow.canFinish(),false);flow.continue('continue-block');assert.equal(flow.canFinish(),false);flow.review('second-text');const ready=flow.snapshot();assert.equal(flow.canFinish(),true);assert.deepEqual(flow.snapshot(),ready);assert.equal(flow.finish(),true);assert.equal(flow.released.has('second-gate'),true);assert.equal(flow.completed.has(flow.lessonId),true);
 const resumed=new CourseFlow(flow.document);resumed.restore(flow.snapshot());assert.deepEqual(resumed.snapshot(),flow.snapshot());
});
