import type { Block } from './course.js';
import { richIsEmpty } from './rich-text.js';
export type AssessmentBlock=Extract<Block,{type:'assessment'}>;
export type Answer={selection:number[]}|{text:string}|{matches:number[]}|{order:number[]}|{groups:number[]};
export function isAssessment(block:Block):block is AssessmentBlock{return block.type==='assessment';}
const normalize=(s:string,sensitive=false)=>{const value=s.normalize('NFC').trim().replace(/\s+/g,' ');return sensitive ? value : value.toLowerCase();};
/** A typed number, allowing a comma as the decimal mark, spaces, and the question's unit after the number. */
export function parseNumeric(text:string,unit=''):number|undefined{
 let value=text.normalize('NFKC').trim().replace(/\s+/g,'');
 if(unit && value.toLowerCase().endsWith(unit.replace(/\s+/g,'').toLowerCase()))value=value.slice(0,value.length-unit.replace(/\s+/g,'').length);
 if(!value.includes('.') && /^[-+]?\d+,\d+$/.test(value))value=value.replace(',','.');
 if(!/^[-+]?(\d+(\.\d*)?|\.\d+)$/.test(value))return undefined;
 const number=Number(value);return Number.isFinite(number) ? number : undefined;
}
/** Whether a question takes one choice (radio buttons) rather than several. */
export function singleChoice(block:AssessmentBlock){return block.variant==='single-choice' || block.variant==='true-false' || (block.variant==='hotspot' && block.content.correct.length<=1);}
/** The choices a learner picks from: options, or a hotspot's areas. */
export function choiceCount(block:AssessmentBlock){return block.variant==='hotspot' ? block.content.areas.length : block.content.options.length;}
export function assessmentIssue(block:AssessmentBlock):string|undefined{
 const c=block.content;if(richIsEmpty(c.prompt))return 'Add a question prompt.';
 if(block.variant==='short-answer'){
  if(c.selfCheck && block.assessment.graded)return 'A self-check question cannot count toward the score. Turn off scoring or use exact-match answers.';
  if(c.selfCheck && richIsEmpty(c.model))return 'Add a model answer for learners to compare with.';
  if(!c.selfCheck && (!c.accepted.length || c.accepted.some(x=>!x.trim())))return 'Add at least one nonempty accepted answer.';
 }
 if(block.variant==='numeric' && c.numeric.mode==='range' && c.numeric.min>c.numeric.max)return 'The lowest accepted number must not be above the highest.';
 if(block.variant==='hotspot'){
  if(!c.image)return 'Choose the picture learners will select on.';
  if(c.areas.length<2 || c.areas.some(a=>!a.label.trim()))return 'Add at least two areas, each with a label.';
  if(!c.correct.length)return 'Mark the correct area or areas.';
 }
 if(['single-choice','multiple-response','true-false'].includes(block.variant)){
  if(c.options.length<2 || c.options.some(x=>!x.trim()) || new Set(c.options.map(x=>normalize(x))).size!==c.options.length)return 'Add at least two distinct, nonempty choices.';
  if(!c.correct.length || (block.variant!=='multiple-response' && c.correct.length!==1))return 'Select the correct answer or answers.';
 }
 if(block.variant==='fill-blank' && (!c.accepted.length || c.accepted.some(x=>!x.trim())))return 'Add at least one nonempty accepted answer.';
 if(block.variant==='matching' && (c.pairs.length<2 || c.pairs.some(p=>!p.left.trim() || !p.right.trim()) || new Set(c.pairs.map(p=>normalize(p.left))).size!==c.pairs.length || new Set(c.pairs.map(p=>normalize(p.right))).size!==c.pairs.length))return 'Add at least two distinct, nonempty matching pairs.';
 if(block.variant==='ordering' && (c.items.length<2 || c.items.some(x=>!x.trim()) || new Set(c.items.map(x=>normalize(x))).size!==c.items.length))return 'Add at least two distinct, nonempty items to put in order.';
 if(block.variant==='categorize'){
  if(c.groups.length<2 || c.groups.some(x=>!x.trim()) || new Set(c.groups.map(x=>normalize(x))).size!==c.groups.length)return 'Add at least two distinct, nonempty groups.';
  if(c.items.length<2 || c.items.some(x=>!x.trim()))return 'Add at least two nonempty cards to sort.';
  if(c.placements.length!==c.items.length || c.placements.some(i=>i>=c.groups.length))return 'Choose the correct group for every card.';
 }
}
export function validAnswer(block:AssessmentBlock,value:unknown,complete=true):value is Answer{
 if(!value || typeof value!=='object' || Array.isArray(value))return false;const answer=value as Record<string,unknown>;
 const kind=['fill-blank','short-answer','numeric'].includes(block.variant) ? 'text' : block.variant==='matching' ? 'matches' : block.variant==='ordering' ? 'order' : block.variant==='categorize' ? 'groups' : 'selection';if(Object.keys(answer).length!==1 || !(kind in answer))return false;
 if(kind==='text')return typeof answer.text==='string' && answer.text.length<=(block.variant==='short-answer' ? 4000 : block.variant==='numeric' ? 60 : 1000) && (!complete || (block.variant==='numeric' ? parseNumeric(answer.text,block.content.numeric.unit)!==undefined : !!answer.text.trim()));
 const items=answer[kind];if(!Array.isArray(items) || items.length>20 || !items.every(i=>Number.isInteger(i)))return false;
 if(kind==='groups')return items.length===block.content.items.length && items.every(i=>i>=(complete ? 0 : -1) && i<block.content.groups.length);
 const count=kind==='matches' ? block.content.pairs.length : kind==='order' ? block.content.items.length : choiceCount(block);
 if(items.some(i=>i< (kind==='matches' && !complete ? -1 : 0) || i>=count))return false;
 if(kind==='matches')return items.length===count && (!complete || new Set(items).size===count);
 if(new Set(items).size!==items.length)return false;
 if(kind==='order')return items.length===count;
 return (!complete || items.length>0) && (!singleChoice(block) || items.length<=1);
}
export function correctAnswer(block:AssessmentBlock,answer:Answer){
 if(assessmentIssue(block) || !validAnswer(block,answer))return false;
 if('selection' in answer)return answer.selection.length===block.content.correct.length && block.content.correct.every(i=>answer.selection.includes(i));
 if('text' in answer && block.variant==='numeric'){const n=parseNumeric(answer.text,block.content.numeric.unit),q=block.content.numeric;if(n===undefined)return false;return q.mode==='range' ? n>=q.min && n<=q.max : Math.abs(n-q.value)<=q.tolerance+1e-9;}
 if('text' in answer && block.variant==='short-answer' && block.content.selfCheck)return !!answer.text.trim();
 if('text' in answer)return block.content.accepted.some(value=>normalize(value,block.content.caseSensitive)===normalize(answer.text,block.content.caseSensitive));
 if('groups' in answer)return answer.groups.every((group,index)=>group===block.content.placements[index]);
 const values='matches' in answer ? answer.matches : answer.order;return values.every((value,index)=>value===index);
}
export function emptyAnswer(block:AssessmentBlock):Answer{
 if(['fill-blank','short-answer','numeric'].includes(block.variant))return {text:''};if(block.variant==='matching')return {matches:block.content.pairs.map(()=>-1)};if(block.variant==='ordering')return {order:block.content.items.map((_,i)=>i).reverse()};if(block.variant==='categorize')return {groups:block.content.items.map(()=>-1)};return {selection:[]};
}
/** Rich feedback messages for a submitted answer: per choice when authored, otherwise the right/wrong message. */
export function feedbackMessages(block:AssessmentBlock,answer:Answer,correct:boolean):string[]{
 const c=block.content;if(c.feedbackMode==='none')return [];
 if(c.feedbackMode==='per-choice' && 'selection' in answer){const messages=answer.selection.map(i=>c.choiceFeedback[i] ?? '').filter(value=>!richIsEmpty(value));if(messages.length)return messages;}
 const general=correct ? c.feedbackCorrect : c.feedbackIncorrect;return richIsEmpty(general) ? [] : [general];
}
export function interactionCount(block:Block){if(block.type==='flashcards')return block.content.cards.length;if(block.type==='labeled-graphic')return block.content.markers.length;if(['accordion','tabs','process'].includes(block.type))return (block.content as {items:unknown[]}).items.length;return 0;}
