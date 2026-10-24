import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assessmentProject } from './helpers/assessment-project.js';
import { isAssessment,correctAnswer,validAnswer,assessmentIssue,type Answer } from '../src/shared/assessment.js';
import { CourseFlow } from '../src/player/state.js';
import { parseCourse } from '../src/shared/course.js';
import { importProject,exportProject } from '../src/project/archive.js';
import { prepareBlock } from '../src/shared/block-catalog.js';
import { htmlFiles } from '../src/project/html-export.js';
const answers:Answer[]=[{selection:[0]},{selection:[2,0]},{text:'  PRACTICE  '},{matches:[0,1]},{order:[0,1,2]}];
test('all assessment variants grade exact responses without interpreting markup or using partial credit',()=>{
 const questions=assessmentProject().document.course.sections[0]!.lessons[0]!.blocks.filter(isAssessment);questions.forEach((block,i)=>assert.equal(correctAnswer(block,answers[i]!),true));assert.equal(correctAnswer(questions[1]!,{selection:[0]}),false);assert.equal(validAnswer(questions[1]!,{selection:[0,0]}),false);assert.equal(validAnswer(questions[3]!,{matches:[0,0]}),false);assert.equal(validAnswer(questions[4]!,{order:[0,0,1]}),false);assert.equal(correctAnswer(questions[4]!,{order:[2,1,0]}),false);
 questions[2]!.content.caseSensitive=true;assert.equal(correctAnswer(questions[2]!,{text:'Practice'}),false);assert.equal(correctAnswer(questions[2]!,{text:'practice'}),true);assert.equal(correctAnswer(questions[2]!,{text:'<b>practice</b>'}),false);
});
test('failed submissions, retries and attempt exhaustion do not grant correct-answer completion',()=>{
 const project=assessmentProject(),lesson=project.document.course.sections[0]!.lessons[0]!,q=lesson.blocks.find(isAssessment)!;q.assessment.completion='correct';q.assessment.maxAttempts=2;lesson.blocks=[q];const flow=new CourseFlow(project.document);
 assert.equal(flow.submit(q.id,{selection:[]}),false);assert.equal(flow.record(q.id),undefined);assert.equal(flow.submit(q.id,{selection:[1]}),true);assert.equal(flow.canComplete(),false);assert.equal(flow.submit(q.id,{selection:[0]}),false);assert.equal(flow.retry(q.id),true);assert.equal(flow.submit(q.id,{selection:[2]}),true);assert.equal(flow.retry(q.id),false);assert.equal(flow.canComplete(),false);assert.equal(flow.score.status,'failed');flow.reset();assert.equal(flow.submit(q.id,{selection:[0]}),true);assert.equal(flow.complete(),true);assert.equal(flow.score.status,'passed');
});
test('completion and success are separate, with weighted grading and exact threshold comparisons',()=>{
 const project=assessmentProject(),lesson=project.document.course.sections[0]!.lessons[0]!;lesson.blocks=lesson.blocks.filter(isAssessment).slice(0,2);const [one,two]=lesson.blocks.filter(isAssessment);one!.assessment.points=2;two!.assessment.points=1;project.document.course.settings.passingScore=67;const flow=new CourseFlow(project.document);
 assert.equal(flow.score.status,'incomplete');flow.submit(one!.id,{selection:[0]});flow.submit(two!.id,{selection:[1]});assert.equal(flow.score.percent,66.7);assert.equal(flow.score.status,'failed');assert.equal(flow.complete(),true);assert.equal(flow.progress.percent,100);flow.retry(two!.id);flow.submit(two!.id,{selection:[0,2]});assert.equal(flow.score.status,'passed');assert.equal(flow.progress.percent,100);
});
test('required assessments and item exploration cannot be bypassed by review or premature gate release',()=>{
 const project=assessmentProject(),lesson=project.document.course.sections[0]!.lessons[0]!,q=lesson.blocks.find(isAssessment)!,gate=lesson.blocks.at(-1)!;const tabs=prepareBlock('tabs',project).block;tabs.requiredInteraction=true;lesson.blocks=[tabs,q,gate];const flow=new CourseFlow(project.document);
 assert.equal(flow.review(q.id),false);assert.equal(flow.review(tabs.id),false);assert.equal(flow.canContinue(gate.id),false);assert.equal(flow.visit(tabs.id,99),false);flow.visit(tabs.id,0);flow.visit(tabs.id,1);assert.equal(flow.canContinue(gate.id),false);flow.submit(q.id,{selection:[0]});assert.equal(flow.canContinue(gate.id),true);flow.continue(gate.id);assert.equal(flow.complete(),true);
});
test('partial answers, failed attempts, exploration, released gates, and score resume without mutating source',()=>{
 const project=assessmentProject(),before=structuredClone(project),lesson=project.document.course.sections[0]!.lessons[0]!,questions=lesson.blocks.filter(isAssessment),flow=new CourseFlow(project.document);flow.submit(questions[0]!.id,{selection:[1]});flow.setAnswer(questions[1]!.id,{selection:[0]});const snapshot=flow.snapshot(),resumed=new CourseFlow(project.document);resumed.restore(snapshot);assert.deepEqual(resumed.snapshot(),snapshot);assert.equal(resumed.record(questions[0]!.id)!.attempts,1);resumed.retry(questions[0]!.id);resumed.submit(questions[0]!.id,answers[0]!);questions.slice(1).forEach((q,i)=>resumed.submit(q.id,answers[i+1]!));resumed.continue(lesson.blocks.at(-1)!.id);resumed.complete();const done=new CourseFlow(project.document);done.restore(resumed.snapshot());assert.equal(done.progress.percent,100);assert.equal(done.score.status,'passed');assert.deepEqual(project,before);
});
test('invalid resume records and hidden question answers cannot unlock gates or manufacture completion',()=>{
 const project=assessmentProject(),lesson=project.document.course.sections[0]!.lessons[0]!,q=lesson.blocks.find(isAssessment)!,gate=lesson.blocks.at(-1)!;lesson.blocks=[gate,q];const flow=new CourseFlow(project.document);assert.equal(flow.submit(q.id,answers[0]!),false);flow.restore({version:2,lessonId:lesson.id,reviewed:[q.id],released:[gate.id],completed:[lesson.id],assessments:{[q.id]:{attempts:99,last:answers[0],best:answers[0],draft:null}},visits:{}});assert.equal(flow.progress.done,0);assert.equal(flow.released.size,1);assert.equal(flow.record(q.id),undefined);
});
test('v1 and v2 archives migrate losslessly to v3, while v2 cannot disguise new assessments',async()=>{
 for(const version of [1,2]){const bytes=await readFile(`tests/fixtures/welcome-v${version}.openscroll`),before=Buffer.from(bytes),project=await importProject(bytes);assert.equal(project.document.schemaVersion,3);assert.deepEqual(bytes,before);assert.deepEqual(await importProject(await exportProject(project)),project);}assert.throws(()=>parseCourse({...assessmentProject().document,schemaVersion:2}),/version 3/);
});
test('incomplete authoring drafts can save but cannot publish unusable questions',async()=>{
 const project=assessmentProject(),q=project.document.course.sections[0]!.lessons[0]!.blocks.find(isAssessment)!;q.content.correct=[];parseCourse(project.document);assert.match(assessmentIssue(q)!,/correct answer/);await assert.rejects(htmlFiles(project,'/tmp/no-build'),/Assessment is not ready/);
});

test('all supported exploration requirements count unique items, resume, and reset independently of authored content',()=>{
 const project=assessmentProject(),lesson=project.document.course.sections[0]!.lessons[0]!;lesson.blocks=[];
 for(const type of ['accordion','tabs','flashcards','process','labeled-graphic']){const prepared=prepareBlock(type,project);prepared.block.requiredInteraction=true;lesson.blocks.push(prepared.block);if(prepared.asset){project.document.assets.push(prepared.asset);project.files[`assets/${prepared.asset.id}.png`]=prepared.data!;}}
 const flow=new CourseFlow(project.document);for(const b of lesson.blocks){let index=0;while(flow.visit(b.id,index))index++;assert.ok(index>0);assert.equal(flow.visit(b.id,0),false);assert.equal(flow.explored(b.id),index);}assert.equal(flow.complete(),true);const next=new CourseFlow(project.document);next.restore(flow.snapshot());assert.equal(next.progress.percent,100);assert.deepEqual(next.snapshot(),flow.snapshot());next.reset();assert.equal(next.canComplete(),false);assert.equal(next.progress.done,0);
});
