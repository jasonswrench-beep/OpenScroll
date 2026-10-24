import { blockSchema,type Block } from './course.js';
import { assessmentIssue,type AssessmentBlock } from './assessment.js';
import { newId } from './outline.js';
export const QUESTION_HEADERS=['Category','Value','Type','Question','A','B','C','D','E','Correct','Feedback if right','Feedback if wrong','Points'];
export const QUESTION_IMPORT_LIMIT=500;
export interface QuestionRow{row:number;category:string;value:string;points?:number;block:AssessmentBlock;}
export interface QuestionReport{sheet:string;rowCount:number;questions:QuestionRow[];errors:{row:number;message:string}[];errorsTruncated:boolean;}
export interface TableRow{row:number;cells:string[];}
export function parseQuestionTable(rows:TableRow[],sheet:string):QuestionReport{
 const report:QuestionReport={sheet,rowCount:0,questions:[],errors:[],errorsTruncated:false};
 const error=(row:number,message:string)=>{if(report.errors.length<50)report.errors.push({row,message});else report.errorsTruncated=true;};
 const data=rows.filter(r=>r.cells.some(c=>c.trim()));const header=data.shift();if(!header){error(1,'The spreadsheet is empty.');return report;}
 const normalize=(s:string)=>s.replace(/^\uFEFF/,'').trim().toLowerCase().replace(/\s+/g,' ');
 const headerCells=[...header.cells];while(headerCells.length&&!headerCells.at(-1)!.trim())headerCells.pop();
 const names=headerCells.map(normalize),allowed=new Set(QUESTION_HEADERS.map(normalize));
 for(const required of ['type','question','correct'])if(!names.includes(required))error(header.row,`Missing column: ${required}. Use the downloadable template.`);
 if(new Set(names).size!==names.length)error(header.row,'Column names must be unique.');
 names.forEach((name,i)=>{if(!allowed.has(name))error(header.row,`Unsupported column ${i+1}: ${header.cells[i] || '(blank)'}.`);});
 report.rowCount=data.length;if(data.length>QUESTION_IMPORT_LIMIT)error(header.row,`Import up to ${QUESTION_IMPORT_LIMIT} questions at a time.`);
 if(report.errors.length)return report;
 const types:Record<string,AssessmentBlock['variant']|'tf'>={MC:'single-choice',MCQ:'single-choice',MULTIPLECHOICE:'single-choice',SINGLECHOICE:'single-choice',MR:'multiple-response',MA:'multiple-response',MULTIPLERESPONSE:'multiple-response',TF:'tf',TRUEFALSE:'tf',FIB:'fill-blank',FB:'fill-blank',FILLBLANK:'fill-blank',MATCH:'matching',MATCHING:'matching',SORT:'sorting',SORTING:'sorting'};
 for(const entry of data){try{
  if(entry.cells.length>names.length&&entry.cells.slice(names.length).some(c=>c.trim()))throw new Error('There is data beyond the named columns.');
  const get=(key:string)=>entry.cells[names.indexOf(key)]?.trim()??'';
  const kind=types[get('type').toUpperCase().replace(/[\s_\-/]/g,'')];if(!kind)throw new Error(`Unsupported question Type “${get('type').slice(0,80)}”. Use MC, TF, MR, FIB, MATCH or SORT.`);
  const pointText=get('points'),points=pointText?Number(pointText):undefined;if(points!==undefined&&(!Number.isInteger(points)||points<1||points>100))throw new Error('Points must be a whole number from 1 to 100.');
  const block:AssessmentBlock={id:newId(),type:'assessment',variant:kind==='tf'?'single-choice':kind,appearance:{width:'reading',padding:'medium',background:'page'},content:{prompt:get('question'),options:[],correct:[],accepted:[],caseSensitive:false,pairs:[],items:[],feedbackCorrect:get('feedback if right'),feedbackIncorrect:get('feedback if wrong')},assessment:{graded:true,points:points??1,required:false,completion:'submitted',maxAttempts:0}};
  const choices=['a','b','c','d','e'].map(letter=>({letter:letter.toUpperCase(),text:get(letter)})).filter(x=>x.text);
  const correct=get('correct');
  if(kind==='tf'){
   if(choices.length)throw new Error('TF rows use automatic True/False choices; leave A–E blank.');
   const answer=correct.toLowerCase();if(!['true','false','t','f'].includes(answer))throw new Error('TF Correct must be True or False.');block.content.options=['True','False'];block.content.correct=[answer==='true'||answer==='t'?0:1];
  }else if(kind==='single-choice'||kind==='multiple-response'){
   block.content.options=choices.map(x=>x.text);const answers=correct.toUpperCase().split(/[|,;\s]+/).filter(Boolean);
   if(!answers.length||(kind==='single-choice'&&answers.length!==1)||new Set(answers).size!==answers.length)throw new Error(kind==='single-choice'?'Correct must contain one answer letter (A–E).':'Correct must contain distinct answer letters, separated by |.');
   block.content.correct=answers.map(answer=>{const at=choices.findIndex(c=>c.letter===answer);if(at<0)throw new Error(`Correct refers to a missing choice: ${answer}.`);return at;});
  }else if(kind==='fill-blank'){
   if(choices.length)throw new Error('FIB rows use Correct for accepted answers; leave A–E blank.');block.content.accepted=correct.split('|').map(x=>x.trim()).filter(Boolean);
  }else if(kind==='matching'){
   if(correct)throw new Error('MATCH rows define pairs in A–E as left | right; leave Correct blank.');
   block.content.pairs=choices.map(c=>{const parts=c.text.split('|').map(x=>x.trim());if(parts.length!==2||parts.some(x=>!x))throw new Error(`Choice ${c.letter} must contain a matching pair: left | right.`);return {left:parts[0]!,right:parts[1]!};});
  }else{
   let ordered=choices;if(correct){const letters=correct.toUpperCase().split(/[|,;\s]+/).filter(Boolean);if(letters.length!==choices.length||new Set(letters).size!==choices.length)throw new Error('SORT Correct must list each provided choice letter once, in order.');ordered=letters.map(letter=>{const c=choices.find(x=>x.letter===letter);if(!c)throw new Error(`SORT refers to a missing choice: ${letter}.`);return c;});}block.content.items=ordered.map(x=>x.text);
  }
  const parsed=blockSchema.safeParse(block);if(!parsed.success)throw new Error('A field exceeds its supported size (choices/answers are limited to 300 characters).');
  const issue=assessmentIssue(block);if(issue)throw new Error(issue);
  report.questions.push({row:entry.row,category:get('category'),value:get('value'),...(points!==undefined?{points}:{}),block});
 }catch(reason){error(entry.row,reason instanceof Error?reason.message:'This row is invalid.');}}
 if(!data.length)error(header.row,'Add at least one question below the header.');return report;
}
export function importedQuestions(report:QuestionReport,points:number,graded:boolean):Block[]{
 if(report.errors.length||report.errorsTruncated||!report.questions.length)throw new Error('Fix all spreadsheet errors before importing.');
 if(!Number.isInteger(points)||points<1||points>100)throw new Error('Default points must be a whole number from 1 to 100.');
 return report.questions.map(row=>{const block=structuredClone(row.block);block.id=newId();block.assessment.points=row.points??points;block.assessment.graded=graded;return block;});
}
