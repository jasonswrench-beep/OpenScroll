import { type Block } from '../shared/course.js';
import { type AssessmentBlock,assessmentIssue } from '../shared/assessment.js';
import { setBlockValue } from '../shared/block-values.js';
type Change=(change:(block:Block)=>void,key?:string,render?:boolean)=>boolean;
export function assessmentSettings(root:HTMLElement,block:Block,change:Change){
 const check=(text:string,value:boolean,run:(value:boolean)=>void)=>{const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=value;input.addEventListener('change',()=>run(input.checked));label.append(input,document.createTextNode(` ${text}`));root.append(label);};
 if(['accordion','tabs','flashcards','process','labeled-graphic'].includes(block.type))check('Require every item to be explored',!!block.requiredInteraction,value=>change(b=>{b.requiredInteraction=value;}));
 if(block.type!=='assessment')return;
 const apply=(run:(b:AssessmentBlock)=>void,key?:string,render=false)=>change(b=>{if(b.type==='assessment')run(b);},key,render);
 const select=(text:string,choices:[string,string][],value:string,run:(value:string)=>void)=>{const label=document.createElement('label');label.textContent=text;const input=document.createElement('select');input.setAttribute('aria-label',text);for(const [key,name]of choices)input.add(new Option(name,key));input.value=value;input.addEventListener('change',()=>run(input.value));label.append(input);root.append(label);};
 const number=(text:string,value:number,min:number,max:number,run:(value:number)=>void)=>{const label=document.createElement('label');label.textContent=text;const input=document.createElement('input');input.type='number';input.min=String(min);input.max=String(max);input.step='1';input.value=String(value);input.addEventListener('change',()=>run(Number(input.value)));label.append(input);root.append(label);};
 const text=(name:string,path:string,value:string,max=100000)=>{const label=document.createElement('label');label.textContent=name;const input=document.createElement('textarea');input.value=value;input.maxLength=max;input.addEventListener('input',()=>apply(b=>setBlockValue(b,path,input.value),path));label.append(input);root.append(label);};
 check('Include in course score',block.assessment.graded,value=>apply(b=>{b.assessment.graded=value;}));number('Question points',block.assessment.points,1,100,value=>apply(b=>{b.assessment.points=value;}));check('Require this question for lesson completion',block.assessment.required,value=>apply(b=>{b.assessment.required=value;}));
 select('Question completion',[['submitted','Submit a valid answer'],['correct','Answer correctly']],block.assessment.completion,value=>apply(b=>{b.assessment.completion=value as 'submitted'|'correct';}));number('Maximum attempts (0 means unlimited)',block.assessment.maxAttempts,0,20,value=>apply(b=>{b.assessment.maxAttempts=value;}));
 text('Correct-answer feedback','feedbackCorrect',block.content.feedbackCorrect);text('Incorrect-answer feedback','feedbackIncorrect',block.content.feedbackIncorrect);
 const button=(name:string,run:()=>void,disabled=false)=>{const b=document.createElement('button');b.type='button';b.textContent=name;b.disabled=disabled;b.addEventListener('click',run);root.append(b);};
 if(['single-choice','multiple-response'].includes(block.variant)){
  block.content.options.forEach((_item,index)=>check(`Choice ${index+1} is correct`,block.content.correct.includes(index),value=>apply(b=>{b.content.correct=value ? b.variant==='single-choice' ? [index] : [...new Set([...b.content.correct,index])] : b.content.correct.filter(i=>i!==index);},undefined,true)));
  button('Add choice',()=>apply(b=>{b.content.options.push('A new choice');},undefined,true),block.content.options.length>=20);
  block.content.options.forEach((_item,index)=>button(`Remove choice ${index+1}`,()=>apply(b=>{b.content.options.splice(index,1);b.content.correct=b.content.correct.filter(i=>i!==index).map(i=>i>index ? i-1 : i);},undefined,true),block.content.options.length<=2));
 }
 if(block.variant==='fill-blank'){
  check('Case-sensitive answers',block.content.caseSensitive,value=>apply(b=>{b.content.caseSensitive=value;}));
  block.content.accepted.forEach((value,index)=>text(`Accepted answer ${index+1}`,`accepted.${index}`,value,300));button('Add accepted answer',()=>apply(b=>{b.content.accepted.push('A new answer');},undefined,true),block.content.accepted.length>=20);
  block.content.accepted.forEach((_value,index)=>button(`Remove accepted answer ${index+1}`,()=>apply(b=>{b.content.accepted.splice(index,1);},undefined,true),block.content.accepted.length<=1));
 }
 for(const key of ['pairs','items'] as const)if((key==='pairs' && block.variant==='matching') || (key==='items' && block.variant==='sorting')){
  const count=block.content[key].length;button(`Add ${key==='pairs' ? 'pair' : 'sorting item'}`,()=>apply(b=>{if(key==='pairs')b.content.pairs.push({left:'New term',right:'New explanation'});else b.content.items.push('A new step');},undefined,true),count>=20);
  for(let index=0;index<count;index++){
   for(const delta of [-1,1] as const)button(`Move ${key==='pairs' ? 'pair' : 'sorting item'} ${index+1} ${delta===-1 ? 'up' : 'down'}`,()=>apply(b=>{const array=b.content[key];[array[index],array[index+delta]]=[array[index+delta]!,array[index]!];},undefined,true),index+delta<0 || index+delta>=count);
   button(`Remove ${key==='pairs' ? 'pair' : 'sorting item'} ${index+1}`,()=>apply(b=>{b.content[key].splice(index,1);},undefined,true),count<=2);
  }
 }
 const limits=document.createElement('p');limits.textContent='With limited attempts and a correct-answer requirement, a learner who runs out of attempts must reset course progress to try again.';root.append(limits);
 const note=document.createElement('p');note.setAttribute('role','status');note.textContent=assessmentIssue(block) ?? 'Question is ready to preview and publish.';root.append(note);
}
