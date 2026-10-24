import type { Block } from './course.js';
export type AssessmentBlock=Extract<Block,{type:'assessment'}>;
export type Answer={selection:number[]}|{text:string}|{matches:number[]}|{order:number[]};
export function isAssessment(block:Block):block is AssessmentBlock{return block.type==='assessment';}
const normalize=(s:string,sensitive=false)=>{const value=s.normalize('NFC').trim().replace(/\s+/g,' ');return sensitive ? value : value.toLowerCase();};
export function assessmentIssue(block:AssessmentBlock):string|undefined{
 const c=block.content;if(!c.prompt.trim())return 'Add a question prompt.';
 if(['single-choice','multiple-response'].includes(block.variant)){
  if(c.options.length<2 || c.options.some(x=>!x.trim()) || new Set(c.options.map(x=>normalize(x))).size!==c.options.length)return 'Add at least two distinct, nonempty choices.';
  if(!c.correct.length || (block.variant==='single-choice' && c.correct.length!==1))return 'Select the correct answer or answers.';
 }
 if(block.variant==='fill-blank' && (!c.accepted.length || c.accepted.some(x=>!x.trim())))return 'Add at least one nonempty accepted answer.';
 if(block.variant==='matching' && (c.pairs.length<2 || c.pairs.some(p=>!p.left.trim() || !p.right.trim()) || new Set(c.pairs.map(p=>normalize(p.left))).size!==c.pairs.length || new Set(c.pairs.map(p=>normalize(p.right))).size!==c.pairs.length))return 'Add at least two distinct, nonempty matching pairs.';
 if(block.variant==='sorting' && (c.items.length<2 || c.items.some(x=>!x.trim()) || new Set(c.items.map(x=>normalize(x))).size!==c.items.length))return 'Add at least two distinct, nonempty sorting items.';
}
export function validAnswer(block:AssessmentBlock,value:unknown,complete=true):value is Answer{
 if(!value || typeof value!=='object' || Array.isArray(value))return false;const answer=value as Record<string,unknown>;
 const kind=block.variant==='fill-blank' ? 'text' : block.variant==='matching' ? 'matches' : block.variant==='sorting' ? 'order' : 'selection';if(Object.keys(answer).length!==1 || !(kind in answer))return false;
 if(kind==='text')return typeof answer.text==='string' && answer.text.length<=1000 && (!complete || !!answer.text.trim());
 const items=answer[kind];if(!Array.isArray(items) || items.length>20 || !items.every(i=>Number.isInteger(i)))return false;
 const count=kind==='matches' ? block.content.pairs.length : kind==='order' ? block.content.items.length : block.content.options.length;
 if(items.some(i=>i< (kind==='matches' && !complete ? -1 : 0) || i>=count))return false;
 if(kind==='matches')return items.length===count && (!complete || new Set(items).size===count);
 if(new Set(items).size!==items.length)return false;
 if(kind==='order')return items.length===count;
 return (!complete || items.length>0) && (block.variant!=='single-choice' || items.length<=1);
}
export function correctAnswer(block:AssessmentBlock,answer:Answer){
 if(assessmentIssue(block) || !validAnswer(block,answer))return false;
 if('selection' in answer)return answer.selection.length===block.content.correct.length && block.content.correct.every(i=>answer.selection.includes(i));
 if('text' in answer)return block.content.accepted.some(value=>normalize(value,block.content.caseSensitive)===normalize(answer.text,block.content.caseSensitive));
 const values='matches' in answer ? answer.matches : answer.order;return values.every((value,index)=>value===index);
}
export function emptyAnswer(block:AssessmentBlock):Answer{
 if(block.variant==='fill-blank')return {text:''};if(block.variant==='matching')return {matches:block.content.pairs.map(()=>-1)};if(block.variant==='sorting')return {order:block.content.items.map((_,i)=>i).reverse()};return {selection:[]};
}
export function interactionCount(block:Block){if(block.type==='flashcards')return block.content.cards.length;if(block.type==='labeled-graphic')return block.content.markers.length;if(['accordion','tabs','process'].includes(block.type))return (block.content as {items:unknown[]}).items.length;return 0;}
