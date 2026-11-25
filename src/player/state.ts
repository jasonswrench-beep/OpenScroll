import type { Block,CourseDocument } from '../shared/course.js';
import { isAssessment,correctAnswer,validAnswer,assessmentIssue,interactionCount,type Answer,type AssessmentBlock } from '../shared/assessment.js';
import { isResponseBlock,cleanResponse,isEmptyResponse,responseMeets,type LearnerResponse,type ResponseBlock } from '../shared/responses.js';
export interface AssessmentRecord {attempts:number;last:Answer|null;best:Answer|null;draft:Answer|null;}
export interface LearnerSnapshot {version:4;lessonId:string;reviewed:string[];released:string[];completed:string[];assessments:Record<string,AssessmentRecord>;visits:Record<string,number[]>;responses:Record<string,LearnerResponse>;draws:Record<string,string[]>;}
type DrawBlock=Extract<Block,{type:'bank-draw'}>;
/** Learner state and score never enter the authored document. */
export class CourseFlow {
 readonly lessons:CourseDocument['course']['sections'][number]['lessons'];readonly reviewed=new Set<string>();readonly released=new Set<string>();readonly completed=new Set<string>();
 private attempts=new Map<string,AssessmentRecord>();private visits=new Map<string,Set<number>>();private answers=new Map<string,LearnerResponse>();private draws=new Map<string,string[]>();lessonId:string;
 constructor(readonly document:CourseDocument){this.lessons=document.course.sections.flatMap(s=>s.lessons);this.lessonId=this.lessons[0]?.id ?? '';}
 get lesson(){return this.lessons.find(l=>l.id===this.lessonId);}
 canEnter(id:string){const index=this.lessons.findIndex(l=>l.id===id);return index>=0 && (this.document.course.settings.navigation==='free' || this.lessons.slice(0,index).every(l=>this.completed.has(l.id)));}
 enter(id:string){if(!this.canEnter(id))return false;this.lessonId=id;return true;}
 visible(blocks=this.lesson?.blocks ?? []){const stop=blocks.findIndex(b=>b.type==='continue' && !this.released.has(b.id));return stop<0 ? blocks : blocks.slice(0,stop+1);}
 record(id:string){const value=this.attempts.get(id);return value ? structuredClone(value) : undefined;}
 explored(id:string){return this.visits.get(id)?.size ?? 0;}
 /** A learner's written answer, ticks or ratings for a response block. */
 response(id:string){const value=this.answers.get(id);return value ? structuredClone(value) : undefined;}
 respond(id:string,input:unknown){
  const block=this.visible().find((b):b is ResponseBlock=>b.id===id && isResponseBlock(b));if(!block)return false;
  const value=cleanResponse(block,input);if(!value)return false;
  if(isEmptyResponse(value))this.answers.delete(id);else this.answers.set(id,value);return true;
 }
 /** The questions a bank-draw block gave this learner, in order (empty until drawn). */
 drawn(id:string):AssessmentBlock[]{const block=this.lessons.flatMap(l=>l.blocks).find((b):b is DrawBlock=>b.id===id && b.type==='bank-draw');const bank=block ? this.document.course.banks.find(b=>b.id===block.content.bankId) : undefined;return (this.draws.get(id) ?? []).map(q=>bank?.questions.find(x=>x.id===q)).filter((q):q is AssessmentBlock=>!!q);}
 /** Draws this learner's questions for a visible bank-draw block once; the set is kept on resume. */
 draw(id:string,random=Math.random){
  const block=this.visible().find((b):b is DrawBlock=>b.id===id && b.type==='bank-draw');if(!block || this.draws.has(id))return false;
  const bank=this.document.course.banks.find(b=>b.id===block.content.bankId);if(!bank || !bank.questions.length)return false;
  const pool=bank.questions.map(q=>q.id);for(let i=pool.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[pool[i],pool[j]]=[pool[j]!,pool[i]!];}
  this.draws.set(id,pool.slice(0,Math.min(block.content.count,pool.length)));return true;
 }
 private drawCount(block:DrawBlock){const bank=this.document.course.banks.find(b=>b.id===block.content.bankId);return Math.min(block.content.count,bank?.questions.length ?? 0);}
 /** Every response in the course, for My workbook. */
 get responses(){return new Map([...this.answers].map(([id,value])=>[id,structuredClone(value)]));}
 visit(id:string,index:number){const block=this.visible().find(b=>b.id===id);if(!block || !block.requiredInteraction || !Number.isInteger(index) || index<0 || index>=interactionCount(block))return false;let set=this.visits.get(id);if(!set){set=new Set();this.visits.set(id,set);}if(set.has(index))return false;set.add(index);return true;}
 isComplete(block:Block):boolean{
  if(isAssessment(block)){const record=this.attempts.get(block.id);return !!record?.last && (block.assessment.completion==='submitted' || correctAnswer(block,record.best ?? record.last));}
  if(block.type==='bank-draw'){const questions=this.drawn(block.id);return questions.length>0 && questions.every(q=>this.isComplete(q));}
  if(isResponseBlock(block))return !block.content.required || responseMeets(block,this.answers.get(block.id));
  if(block.requiredInteraction)return this.explored(block.id)===interactionCount(block);
  return ['heading','divider','spacer'].includes(block.type) || (block.type==='continue' ? this.released.has(block.id) : this.reviewed.has(block.id));
 }
 required(blocks=this.lesson?.blocks ?? []){const ids=new Set<string>();blocks.forEach((b,i)=>{if(b.type==='continue'){const before=b.completion==='all-previous' ? blocks.slice(0,i) : b.completion==='previous' ? blocks.slice(Math.max(0,i-1),i) : [];for(const item of before)if(!['heading','divider','spacer','continue','assessment'].includes(item.type) && !item.requiredInteraction && !isResponseBlock(item) && item.type!=='bank-draw')ids.add(item.id);}});return ids;}
 review(id:string){const block=this.visible().find(b=>b.id===id);if(!block || !this.required().has(id))return false;this.reviewed.add(id);return true;}
 canContinue(id:string){const blocks=this.lesson?.blocks ?? [],index=blocks.findIndex(b=>b.id===id),block=blocks[index];if(block?.type!=='continue' || !this.visible().some(b=>b.id===id))return false;const before=block.completion==='all-previous' ? blocks.slice(0,index) : block.completion==='previous' ? blocks.slice(Math.max(0,index-1),index) : [];return before.every(b=>this.isComplete(b));}
 continue(id:string){if(!this.canContinue(id))return false;this.released.add(id);return true;}
 canComplete(){return !!this.lesson && this.lesson.blocks.every(b=>b.type==='continue' ? this.released.has(b.id) : (isAssessment(b) && b.assessment.required) || (isResponseBlock(b) && b.content.required) || (b.type==='bank-draw' && (!this.draws.has(b.id) || this.drawn(b.id).some(q=>q.assessment.required))) || b.requiredInteraction ? this.isComplete(b) : true);}
 /** A final Continue reveals no content; finish it with lesson completion. */
 canFinish(){const last=this.lesson?.blocks.at(-1);if(last?.type!=='continue' || this.released.has(last.id))return this.canComplete();if(!this.canContinue(last.id))return false;const copy=new CourseFlow(this.document);copy.restore(this.snapshot());copy.continue(last.id);return copy.canComplete();}
 finish(){if(!this.canFinish())return false;const last=this.lesson?.blocks.at(-1);if(last?.type==='continue')this.continue(last.id);return this.complete();}
 complete(){if(!this.canComplete())return false;this.completed.add(this.lessonId);return true;}
 private question(id:string){const visible=this.visible();return visible.find((b):b is AssessmentBlock=>b.id===id && isAssessment(b)) ?? visible.filter((b):b is DrawBlock=>b.type==='bank-draw').flatMap(b=>this.drawn(b.id)).find(q=>q.id===id);}
 canRetry(block:AssessmentBlock){const record=this.attempts.get(block.id);return !!record?.last && !correctAnswer(block,record.last) && record.attempts<(block.assessment.maxAttempts || 10000);}
 setAnswer(id:string,answer:Answer){const block=this.question(id),record=this.attempts.get(id);if(!block || assessmentIssue(block) || !validAnswer(block,answer,false) || (record?.last && record.draft===null))return false;this.attempts.set(id,{attempts:record?.attempts ?? 0,last:record?.last ?? null,best:record?.best ?? null,draft:structuredClone(answer)});return true;}
 submit(id:string,answer:Answer){const block=this.question(id),record=this.attempts.get(id);if(!block || assessmentIssue(block) || !validAnswer(block,answer) || (record?.last && record.draft===null) || (record?.attempts ?? 0)>=(block.assessment.maxAttempts || 10000))return false;this.attempts.set(id,{attempts:(record?.attempts ?? 0)+1,last:structuredClone(answer),best:correctAnswer(block,answer) ? structuredClone(answer) : record?.best ?? null,draft:null});return true;}
 retry(id:string){const block=this.question(id),record=this.attempts.get(id);if(!block || !record || !this.canRetry(block))return false;record.draft=structuredClone(record.last);return true;}
 get score(){const draws=this.lessons.flatMap(l=>l.blocks).filter((b):b is DrawBlock=>b.type==='bank-draw');const undrawn=draws.some(b=>!this.draws.has(b.id) && this.drawCount(b)>0 && this.document.course.banks.find(x=>x.id===b.content.bankId)!.questions.some(q=>q.assessment.graded));const questions=[...this.lessons.flatMap(l=>l.blocks).filter(isAssessment),...draws.flatMap(b=>this.drawn(b.id))].filter(b=>b.assessment.graded);let earned=0,possible=0,answered=0;for(const block of questions){possible+=block.assessment.points;const record=this.attempts.get(block.id);if(record?.last)answered++;if(record?.best && correctAnswer(block,record.best))earned+=block.assessment.points;}return {earned,possible,answered,total:questions.length,percent:possible ? Math.round(earned/possible*1000)/10 : null,passingScore:this.document.course.settings.passingScore,status:!questions.length && !undrawn ? 'not-assessed' : answered<questions.length || undrawn ? 'incomplete' : earned*100>=possible*this.document.course.settings.passingScore ? 'passed' : 'failed'};}
 get progress(){return {done:this.completed.size,total:this.lessons.length,percent:this.lessons.length ? Math.round(this.completed.size/this.lessons.length*100) : 0};}
 snapshot():LearnerSnapshot{return {version:4,lessonId:this.lessonId,reviewed:[...this.reviewed],released:[...this.released],completed:[...this.completed],assessments:Object.fromEntries([...this.attempts].map(([id,value])=>[id,structuredClone(value)])),visits:Object.fromEntries([...this.visits].map(([id,set])=>[id,[...set]])),responses:Object.fromEntries([...this.answers].map(([id,value])=>[id,structuredClone(value)])),draws:Object.fromEntries([...this.draws].map(([id,list])=>[id,[...list]]))};}
 reset(){this.reviewed.clear();this.released.clear();this.completed.clear();this.attempts.clear();this.visits.clear();this.answers.clear();this.draws.clear();this.lessonId=this.lessons[0]?.id ?? '';}
 restore(input:unknown){
  this.reset();if(!input || typeof input!=='object')return;const value=input as Record<string,unknown>;
  if(![1,2,3,4].includes(value.version as number) || typeof value.lessonId!=='string' || !['reviewed','released','completed'].every(key=>Array.isArray(value[key]) && value[key].length<=5000 && value[key].every((id:unknown)=>typeof id==='string' && id.length<=64)))return;
  const reviewed=new Set(value.reviewed as string[]),released=new Set(value.released as string[]),completed=new Set(value.completed as string[]);
  const records=(value.version as number)>=2 && value.assessments && typeof value.assessments==='object' ? value.assessments as Record<string,AssessmentRecord> : {};
  const visits=(value.version as number)>=2 && value.visits && typeof value.visits==='object' ? value.visits as Record<string,unknown> : {};
  const draws=value.version===4 && value.draws && typeof value.draws==='object' && !Array.isArray(value.draws) ? value.draws as Record<string,unknown> : {};
  const responses=(value.version as number)>=3 && value.responses && typeof value.responses==='object' && !Array.isArray(value.responses) ? value.responses as Record<string,unknown> : {};
  for(const lesson of this.lessons){if(!this.enter(lesson.id))break;for(const block of lesson.blocks){if(!this.visible().some(b=>b.id===block.id))break;
   // A drawn set must name distinct questions from the block's bank, as many as the block draws.
   if(block.type==='bank-draw' && Object.hasOwn(draws,block.id)){const list=draws[block.id],bank=this.document.course.banks.find(b=>b.id===block.content.bankId);if(bank && Array.isArray(list) && list.length===this.drawCount(block) && new Set(list).size===list.length && list.every(q=>typeof q==='string' && bank.questions.some(x=>x.id===q)))this.draws.set(block.id,[...list as string[]]);}
   for(const question of block.type==='bank-draw' ? this.drawn(block.id) : isAssessment(block) ? [block] : []){const block=question;
    const r=Object.hasOwn(records,block.id) ? records[block.id] : undefined;
    if(r && Number.isInteger(r.attempts) && r.attempts>=0 && r.attempts<=(block.assessment.maxAttempts || 10000) && !assessmentIssue(block) && (r.attempts===0 ? r.last===null && r.best===null : validAnswer(block,r.last))){
     const last=r.attempts ? structuredClone(r.last) : null;const best=last && correctAnswer(block,last) ? last : r.attempts && validAnswer(block,r.best) && correctAnswer(block,r.best) ? structuredClone(r.best) : null;
     const record={attempts:r.attempts,last,best,draft:validAnswer(block,r.draft,false) ? structuredClone(r.draft) : null};this.attempts.set(block.id,record);if(record.last && !this.canRetry(block))record.draft=null;
    }
   }
   if(isResponseBlock(block) && Object.hasOwn(responses,block.id))this.respond(block.id,responses[block.id]);
   if(block.requiredInteraction && Object.hasOwn(visits,block.id)){const items=visits[block.id];if(Array.isArray(items) && items.length<=50)for(const item of items)this.visit(block.id,item);}
   if(reviewed.has(block.id))this.review(block.id);if(released.has(block.id))this.continue(block.id);
  }if(completed.has(lesson.id))this.complete();}
  this.lessonId=this.lessons[0]?.id ?? '';this.enter(value.lessonId);
 }
}
