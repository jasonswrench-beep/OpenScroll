import type { Block,CourseDocument } from '../shared/course.js';
import { isAssessment,correctAnswer,validAnswer,assessmentIssue,interactionCount,type Answer,type AssessmentBlock } from '../shared/assessment.js';
export interface AssessmentRecord {attempts:number;last:Answer|null;best:Answer|null;draft:Answer|null;}
export interface LearnerSnapshot {version:2;lessonId:string;reviewed:string[];released:string[];completed:string[];assessments:Record<string,AssessmentRecord>;visits:Record<string,number[]>;}
/** Learner state and score never enter the authored document. */
export class CourseFlow {
 readonly lessons:CourseDocument['course']['sections'][number]['lessons'];readonly reviewed=new Set<string>();readonly released=new Set<string>();readonly completed=new Set<string>();
 private attempts=new Map<string,AssessmentRecord>();private visits=new Map<string,Set<number>>();lessonId:string;
 constructor(readonly document:CourseDocument){this.lessons=document.course.sections.flatMap(s=>s.lessons);this.lessonId=this.lessons[0]?.id ?? '';}
 get lesson(){return this.lessons.find(l=>l.id===this.lessonId);}
 canEnter(id:string){const index=this.lessons.findIndex(l=>l.id===id);return index>=0 && (this.document.course.settings.navigation==='free' || this.lessons.slice(0,index).every(l=>this.completed.has(l.id)));}
 enter(id:string){if(!this.canEnter(id))return false;this.lessonId=id;return true;}
 visible(blocks=this.lesson?.blocks ?? []){const stop=blocks.findIndex(b=>b.type==='continue' && !this.released.has(b.id));return stop<0 ? blocks : blocks.slice(0,stop+1);}
 record(id:string){const value=this.attempts.get(id);return value ? structuredClone(value) : undefined;}
 explored(id:string){return this.visits.get(id)?.size ?? 0;}
 visit(id:string,index:number){const block=this.visible().find(b=>b.id===id);if(!block || !block.requiredInteraction || !Number.isInteger(index) || index<0 || index>=interactionCount(block))return false;let set=this.visits.get(id);if(!set){set=new Set();this.visits.set(id,set);}if(set.has(index))return false;set.add(index);return true;}
 isComplete(block:Block){
  if(isAssessment(block)){const record=this.attempts.get(block.id);return !!record?.last && (block.assessment.completion==='submitted' || correctAnswer(block,record.best ?? record.last));}
  if(block.requiredInteraction)return this.explored(block.id)===interactionCount(block);
  return ['heading','divider','spacer'].includes(block.type) || (block.type==='continue' ? this.released.has(block.id) : this.reviewed.has(block.id));
 }
 required(blocks=this.lesson?.blocks ?? []){const ids=new Set<string>();blocks.forEach((b,i)=>{if(b.type==='continue'){const before=b.completion==='all-previous' ? blocks.slice(0,i) : b.completion==='previous' ? blocks.slice(Math.max(0,i-1),i) : [];for(const item of before)if(!['heading','divider','spacer','continue','assessment'].includes(item.type) && !item.requiredInteraction)ids.add(item.id);}});return ids;}
 review(id:string){const block=this.visible().find(b=>b.id===id);if(!block || !this.required().has(id))return false;this.reviewed.add(id);return true;}
 canContinue(id:string){const blocks=this.lesson?.blocks ?? [],index=blocks.findIndex(b=>b.id===id),block=blocks[index];if(block?.type!=='continue' || !this.visible().some(b=>b.id===id))return false;const before=block.completion==='all-previous' ? blocks.slice(0,index) : block.completion==='previous' ? blocks.slice(Math.max(0,index-1),index) : [];return before.every(b=>this.isComplete(b));}
 continue(id:string){if(!this.canContinue(id))return false;this.released.add(id);return true;}
 canComplete(){return !!this.lesson && this.lesson.blocks.every(b=>b.type==='continue' ? this.released.has(b.id) : (isAssessment(b) && b.assessment.required) || b.requiredInteraction ? this.isComplete(b) : true);}
 /** A final Continue reveals no content; finish it with lesson completion. */
 canFinish(){const last=this.lesson?.blocks.at(-1);if(last?.type!=='continue' || this.released.has(last.id))return this.canComplete();if(!this.canContinue(last.id))return false;const copy=new CourseFlow(this.document);copy.restore(this.snapshot());copy.continue(last.id);return copy.canComplete();}
 finish(){if(!this.canFinish())return false;const last=this.lesson?.blocks.at(-1);if(last?.type==='continue')this.continue(last.id);return this.complete();}
 complete(){if(!this.canComplete())return false;this.completed.add(this.lessonId);return true;}
 private question(id:string){return this.visible().find((b):b is AssessmentBlock=>b.id===id && isAssessment(b));}
 canRetry(block:AssessmentBlock){const record=this.attempts.get(block.id);return !!record?.last && !correctAnswer(block,record.last) && record.attempts<(block.assessment.maxAttempts || 10000);}
 setAnswer(id:string,answer:Answer){const block=this.question(id),record=this.attempts.get(id);if(!block || assessmentIssue(block) || !validAnswer(block,answer,false) || (record?.last && record.draft===null))return false;this.attempts.set(id,{attempts:record?.attempts ?? 0,last:record?.last ?? null,best:record?.best ?? null,draft:structuredClone(answer)});return true;}
 submit(id:string,answer:Answer){const block=this.question(id),record=this.attempts.get(id);if(!block || assessmentIssue(block) || !validAnswer(block,answer) || (record?.last && record.draft===null) || (record?.attempts ?? 0)>=(block.assessment.maxAttempts || 10000))return false;this.attempts.set(id,{attempts:(record?.attempts ?? 0)+1,last:structuredClone(answer),best:correctAnswer(block,answer) ? structuredClone(answer) : record?.best ?? null,draft:null});return true;}
 retry(id:string){const block=this.question(id),record=this.attempts.get(id);if(!block || !record || !this.canRetry(block))return false;record.draft=structuredClone(record.last);return true;}
 get score(){const questions=this.lessons.flatMap(l=>l.blocks).filter(isAssessment).filter(b=>b.assessment.graded);let earned=0,possible=0,answered=0;for(const block of questions){possible+=block.assessment.points;const record=this.attempts.get(block.id);if(record?.last)answered++;if(record?.best && correctAnswer(block,record.best))earned+=block.assessment.points;}return {earned,possible,answered,total:questions.length,percent:possible ? Math.round(earned/possible*1000)/10 : null,passingScore:this.document.course.settings.passingScore,status:!questions.length ? 'not-assessed' : answered<questions.length ? 'incomplete' : earned*100>=possible*this.document.course.settings.passingScore ? 'passed' : 'failed'};}
 get progress(){return {done:this.completed.size,total:this.lessons.length,percent:this.lessons.length ? Math.round(this.completed.size/this.lessons.length*100) : 0};}
 snapshot():LearnerSnapshot{return {version:2,lessonId:this.lessonId,reviewed:[...this.reviewed],released:[...this.released],completed:[...this.completed],assessments:Object.fromEntries([...this.attempts].map(([id,value])=>[id,structuredClone(value)])),visits:Object.fromEntries([...this.visits].map(([id,set])=>[id,[...set]]))};}
 reset(){this.reviewed.clear();this.released.clear();this.completed.clear();this.attempts.clear();this.visits.clear();this.lessonId=this.lessons[0]?.id ?? '';}
 restore(input:unknown){
  this.reset();if(!input || typeof input!=='object')return;const value=input as Record<string,unknown>;
  if(![1,2].includes(value.version as number) || typeof value.lessonId!=='string' || !['reviewed','released','completed'].every(key=>Array.isArray(value[key]) && value[key].length<=5000 && value[key].every((id:unknown)=>typeof id==='string' && id.length<=64)))return;
  const reviewed=new Set(value.reviewed as string[]),released=new Set(value.released as string[]),completed=new Set(value.completed as string[]);
  const records=value.version===2 && value.assessments && typeof value.assessments==='object' ? value.assessments as Record<string,AssessmentRecord> : {};
  const visits=value.version===2 && value.visits && typeof value.visits==='object' ? value.visits as Record<string,unknown> : {};
  for(const lesson of this.lessons){if(!this.enter(lesson.id))break;for(const block of lesson.blocks){if(!this.visible().some(b=>b.id===block.id))break;
   if(isAssessment(block)){
    const r=Object.hasOwn(records,block.id) ? records[block.id] : undefined;
    if(r && Number.isInteger(r.attempts) && r.attempts>=0 && r.attempts<=(block.assessment.maxAttempts || 10000) && !assessmentIssue(block) && (r.attempts===0 ? r.last===null && r.best===null : validAnswer(block,r.last))){
     const last=r.attempts ? structuredClone(r.last) : null;const best=last && correctAnswer(block,last) ? last : r.attempts && validAnswer(block,r.best) && correctAnswer(block,r.best) ? structuredClone(r.best) : null;
     const record={attempts:r.attempts,last,best,draft:validAnswer(block,r.draft,false) ? structuredClone(r.draft) : null};this.attempts.set(block.id,record);if(record.last && !this.canRetry(block))record.draft=null;
    }
   }
   if(block.requiredInteraction && Object.hasOwn(visits,block.id)){const items=visits[block.id];if(Array.isArray(items) && items.length<=50)for(const item of items)this.visit(block.id,item);}
   if(reviewed.has(block.id))this.review(block.id);if(released.has(block.id))this.continue(block.id);
  }if(completed.has(lesson.id))this.complete();}
  this.lessonId=this.lessons[0]?.id ?? '';this.enter(value.lessonId);
 }
}
