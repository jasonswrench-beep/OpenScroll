import { accentInk } from '../shared/course-templates.js';
import { z } from 'zod';
import { assetPath,safeLink,ProjectError,type Block,type PortableProject } from '../shared/course.js';
import { OBJECTIVE_LEVEL_NAMES } from '../shared/objectives.js';
import { publicationProject } from './readiness.js';
import { PDF_RENDER_REQUEST_LIMIT } from './pdf-protocol.js';
import { richHtml,richIsEmpty } from '../shared/rich-text.js';
import type { Lesson } from '../shared/course.js';
export const pdfOptionsSchema=z.strictObject({paper:z.enum(['A4','Letter']).default('A4'),includeAnswers:z.boolean().default(false)});
export type PdfOptions=z.output<typeof pdfOptionsSchema>;
export function parsePdfOptions(input:unknown):PdfOptions{const parsed=pdfOptionsSchema.safeParse(input??{});if(!parsed.success)throw new ProjectError('Choose A4 or Letter and a valid answer-key option.');return parsed.data;}
export const escapeHtml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const text=(tag:string,value:string)=>`<${tag}>${escapeHtml(value)}</${tag}>`;
const list=(values:string[],ordered=false)=>`<${ordered?'ol':'ul'}>${values.map(v=>text('li',v)).join('')}</${ordered?'ol':'ul'}>`;
/** Rich text is canonical and escaped by construction; richHtml rebuilds it from the parsed tree. */
const rich=(value:string)=>richHtml(value);
const richList=(values:string[],ordered=false)=>`<${ordered?'ol':'ul'}>${values.map(v=>`<li>${richHtml(v,{paragraphTag:'span'})}</li>`).join('')}</${ordered?'ol':'ul'}>`;
export function pdfHtml(input:unknown,settings:unknown={}){
 const project=publicationProject(input),options=parsePdfOptions(settings),{course}=project.document;let number=0;
 // Reserve for escaped text, repeated headings, fixed markup and JSON framing before joins.
 // Inline binary/text attachments are charged at every reference, not once per asset.
 let remaining=PDF_RENDER_REQUEST_LIMIT-32768-8*Buffer.byteLength(JSON.stringify(project.document));
 const reserve=(bytes:number)=>{remaining-=bytes;if(remaining<0)throw new ProjectError('The PDF content exceeds the 32 MiB rendering budget. Reduce image sizes or split the course.');};
 reserve(0);
 const escapedBytes=(value:string)=>{let bytes=Buffer.byteLength(value);for(const char of value){if(char==='&')bytes+=4;else if(char==='<'||char==='>')bytes+=3;else if(char==='"')bytes+=5;else if(char==="'")bytes+=4;}return bytes;};
 const questions:{block:Extract<Block,{type:'assessment'}>;number:number}[]=[];
 const samples:{prompt:string;sample:string}[]=[];
 const lines=(count:number)=>`<div class="lines" aria-hidden="true">${'<span></span>'.repeat(count)}</div>`;
 const image=(id:string,alt:string,decorative:boolean)=>{const asset=project.document.assets.find(a=>a.id===id);if(!asset)return text('p','Image unavailable.');const encoded=project.files[assetPath(asset)]!;reserve(encoded.length);return `<img src="data:${asset.mediaType};base64,${encoded}" alt="${escapeHtml(decorative?'':alt)}">`;};
 const figure=(id:string,alt:string,decorative:boolean,caption:string)=>`<figure>${image(id,alt,decorative)}${caption?text('figcaption',caption):''}</figure>`;
 const items=(values:{title:string;text:string;date?:string}[],ordered=false)=>`<${ordered?'ol':'div'}>${values.map(v=>`${ordered?'<li>':'<section>'}${v.date?`<p class="date">${escapeHtml(v.date)}</p>`:''}${text('h5',v.title)}${rich(v.text)}${ordered?'</li>':'</section>'}`).join('')}</${ordered?'ol':'div'}>`;
 const card=(value:{title:string;text:string}|null)=>value?`<section>${text('h5',value.title)}${rich(value.text)}</section>`:'';
 const render=(block:Block):string=>{
  let body='';switch(block.type){
   case 'heading':body=text(block.variant==='subheading'?'h5':'h4',block.content.text);break;
   case 'paragraph':body=(block.variant==='with-heading'?text('h4',block.content.heading):'')+rich(block.content.text);break;
   case 'statement':body=`<aside>${block.variant==='note'?'<h4>Note</h4>':''}${rich(block.content.text)}</aside>`;break;
   case 'quote':body=`<figure><blockquote>${rich(block.content.text)}</blockquote>${text('figcaption',block.content.attribution)}</figure>`;break;
   case 'list':body=(block.variant==='checklist'?'<p>Checklist</p>':'')+richList(block.content.items,block.variant==='numbered');break;
   case 'image':body=figure(block.content.assetId,block.content.altText,block.content.decorative,block.content.caption);break;
   case 'image-text':body=figure(block.content.assetId,block.content.altText,block.content.decorative,block.content.caption)+text('h4',block.content.heading)+rich(block.content.text);break;
   case 'divider':body='<hr>'+text('p',block.content.label);break;
   case 'spacer':body='<div class="spacer" aria-hidden="true"></div>';break;
   case 'continue':body='<hr class="section-break" aria-hidden="true">';break;
   case 'gallery':body=block.content.items.map(v=>figure(v.assetId,v.altText,v.decorative,v.caption)).join('');break;
   case 'audio':case 'video':{
    const asset=project.document.assets.find(a=>a.id===block.content.assetId);body=text('h4',block.content.title || (block.type==='audio'?'Audio':'Video'))+text('p',`${block.type==='audio'?'Audio':'Video'} is represented by its transcript.${asset?' Source file: '+asset.fileName:''}`)+text('h5',block.type==='video'?'Descriptive transcript':'Transcript')+text('p',block.content.transcript || 'No transcript supplied.');
    if(block.type==='video' && block.content.captions.length)body+='<h5>Timed captions (seconds)</h5>'+list(block.content.captions.map(c=>`${c.start}–${c.end}: ${c.text}`));break;
   }
   case 'attachment':{
    const asset=project.document.assets.find(a=>a.id===block.content.assetId);body=text('h4',block.content.label || 'Attachment')+text('p',block.content.description)+text('p',asset?`Companion file: ${asset.fileName}. The file itself is not embedded in this PDF.`:'Attachment unavailable.');
    if(asset?.mediaType==='text/plain'){const value=Buffer.from(project.files[assetPath(asset)]!,'base64').toString('utf8');reserve(2*escapedBytes(value));body+='<h5>Attachment text</h5>'+text('pre',value);}break;
   }
   case 'button':body=safeLink(block.content.url)?`<p><a href="${escapeHtml(block.content.url)}">${escapeHtml(block.content.label || 'Open resource')}</a><br><span class="url">${escapeHtml(block.content.url)}</span></p>`:text('p',`${block.content.label || 'Resource'}: link not configured.`);break;
   case 'accordion':case 'tabs':case 'timeline':body=items(block.content.items,block.type==='timeline');break;
   case 'process':body=card(block.content.intro)+items(block.content.items,true)+card(block.content.summary);break;
   case 'flashcards':body=block.content.cards.map((c,i)=>`<section>${text('h5',`Card ${i+1}`)}${rich(c.front)}${rich(c.back)}</section>`).join('');break;
   case 'labeled-graphic':body=`<figure><div class="graphic">${image(block.content.assetId,block.content.altText,block.content.decorative)}${block.content.markers.map((m,i)=>`<span aria-hidden="true" class="marker" style="left:${m.x}%;top:${m.y}%">${i+1}</span>`).join('')}</div>${text('figcaption',block.content.caption)}</figure>`+`<ol>${block.content.markers.map(m=>`<li>${text('h5',m.label)}${rich(m.text)}</li>`).join('')}</ol>`;break;
   case 'assessment':{
    const n=++number;questions.push({block,number:n});body=text('h4',`Question ${n}.`)+rich(block.content.prompt)+text('p',block.assessment.graded?`${block.assessment.points} ${block.assessment.points===1?'point':'points'}.`:'Practice exercise.');
    if(block.variant==='true-false')body+=text('p','Circle one.')+list(block.content.options);
    else if(block.variant==='short-answer')body+=(block.content.selfCheck?text('p','Write your answer, then compare it with the model answer.'):'')+lines(4);
    else if(block.variant==='numeric')body+=`<p>Answer: ____________${block.content.numeric.unit?' '+escapeHtml(block.content.numeric.unit):''}</p>`;
    else if(block.variant==='hotspot'){const c=block.content,letter=(i:number)=>String.fromCharCode(65+i);body+=(c.image?`<figure><div class="graphic">${image(c.image.assetId,c.image.altText,false)}${c.areas.map((a,i)=>`<span aria-hidden="true" class="area" style="left:${a.x}%;top:${a.y}%;width:${a.w}%;height:${a.h}%">${letter(i)}</span>`).join('')}</div></figure>`:'')+text('p',c.correct.length>1?'Circle the letters of every correct area.':'Circle the letter of the correct area.')+`<ol type="A">${c.areas.map(a=>text('li',a.label)).join('')}</ol>`;}
    else if(block.variant==='single-choice'||block.variant==='multiple-response')body+=text('p',block.variant==='single-choice'?'Select one answer.':'Select every correct answer.')+list(block.content.options,true);
    else if(block.variant==='fill-blank')body+='<p>Answer: ________________________________________</p>';
    else if(block.variant==='matching')body+='<h5>Terms</h5>'+list(block.content.pairs.map(p=>p.left),true)+'<h5>Matches</h5>'+list([...block.content.pairs].reverse().map(p=>p.right),true)+'<p>Write the matching number beside each term.</p>';
    else if(block.variant==='categorize')body+='<h5>Groups</h5>'+list(block.content.groups)+'<p>Write the group beside each card.</p>'+list(block.content.items.map(v=>'____ '+v));
    else body+='<p>Number these items in the correct order.</p>'+list([...block.content.items].reverse().map(v=>'____ '+v));break;
   }
   case 'objectives':body=(block.content.heading?text('h4',block.content.heading):'')+(richIsEmpty(block.content.intro)?'':rich(block.content.intro))+`<ol class="objectives">${block.content.items.map(o=>`<li>${escapeHtml(o.text)}${o.level?` <span class="level">(${escapeHtml(OBJECTIVE_LEVEL_NAMES[o.level])})</span>`:''}</li>`).join('')}</ol>`;break;
   case 'table':{
    const c=block.content,head=c.head.length?`<thead><tr>${c.head.map(h=>`<th scope="col">${escapeHtml(h)}</th>`).join('')}</tr></thead>`:'';
    body=`<table class="${block.variant}">${c.caption?text('caption',c.caption):''}${head}<tbody>${c.rows.map(row=>`<tr>${row.map((cell,i)=>i===0&&c.headerColumn?`<th scope="row">${rich(cell)}</th>`:`<td>${rich(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;break;
   }
   case 'reflection':body=text('h4',block.variant==='journal'?'Journal':'Reflection')+rich(block.content.prompt)+(block.content.minWords?text('p',`Write at least ${block.content.minWords} words.`):'')+lines(8);if(!richIsEmpty(block.content.sample))samples.push({prompt:block.content.prompt,sample:block.content.sample});break;
   case 'activity':body=`<section class="activity">${text('h4',block.content.title||'Activity')}${block.content.minutes?text('p',`About ${block.content.minutes} ${block.content.minutes===1?'minute':'minutes'}.`):''}<ol>${block.content.steps.map(step=>`<li>${richHtml(step,{paragraphTag:'span'})}</li>`).join('')}</ol>${block.content.output?text('h5',block.content.output)+lines(6):''}</section>`;break;
   case 'checklist':body=(block.content.title?text('h4',block.content.title):'')+`<ul class="boxes">${block.content.items.map(item=>text('li',item)).join('')}</ul>`;break;
   case 'self-assessment':{
    const c=block.content;
    body=(c.title?text('h4',c.title):'')+(richIsEmpty(c.intro)?'':rich(c.intro))+`<table class="rating"><thead><tr><th scope="col">Statement</th>${c.scale.map((label,i)=>`<th scope="col">${escapeHtml(label)} (${i+1})</th>`).join('')}</tr></thead><tbody>${c.items.map(item=>`<tr><th scope="row">${escapeHtml(item)}</th>${c.scale.map(()=>'<td class="box"><span></span></td>').join('')}</tr>`).join('')}</tbody></table>`;
    if(c.bands.length)body+=`<p>Add up the numbers you chose. Your total is between ${c.items.length} and ${c.items.length*c.scale.length}.</p><table class="bands"><thead><tr><th scope="col">Total</th><th scope="col">What it means</th></tr></thead><tbody>${c.bands.map(band=>`<tr><th scope="row">${band.min}–${band.max}</th><td>${rich(band.text)}</td></tr>`).join('')}</tbody></table>`;
    break;
   }
   case 'survey':{
    const c=block.content;body=(c.title?text('h4',c.title):'')+(richIsEmpty(c.intro)?'':rich(c.intro))+`<ol class="survey">${c.items.map(item=>`<li>${text('p',item.prompt)}${item.kind==='comment'?lines(3):item.kind==='differential'?`<p class="scale">${escapeHtml(item.options[0]??'')} ${c.scale.map((_,i)=>`<span class="box"></span>${i+1}`).join(' ')} ${escapeHtml(item.options[1]??'')}</p>`:`<ul class="boxes inline">${(item.kind==='choice'?item.options:c.scale).map(o=>text('li',o)).join('')}</ul>`}</li>`).join('')}</ol>`;break;
   }
   case 'columns':body=`<div class="columns cols-${block.variant}">${block.content.columns.map(column=>`<div class="col">${column.blocks.map(render).join('')}</div>`).join('')}</div>`;break;
   default:{const unsupported:never=block;throw new ProjectError(`Unsupported PDF block: ${String(unsupported)}`);}
  }
  if(block.narration?.script)body+='<aside><h5>Narration script</h5>'+text('p',block.narration.script)+'</aside>';
  return `<div class="block" data-block-type="${block.type}" id="pdf-${block.id}">${body}</div>`;
 };
 const contents=`<section class="contents"><h2>Contents</h2><ol>${course.sections.map(section=>{const lessons=section.lessons.map(l=>`<li><a href="#pdf-${l.id}">${escapeHtml(l.title || 'Untitled lesson')}</a></li>`).join('');return section.title?`<li><a href="#pdf-${section.id}">${escapeHtml(section.title)}</a><ol>${lessons}</ol></li>`:lessons;}).join('')}${options.includeAnswers?'<li><a href="#answer-key">Answer key</a></li>':''}</ol></section>`;
 const banner=(lesson:Lesson)=>{const b=lesson.banner;const id=b?(b.source==='cover'?course.cover?.assetId:b.assetId):undefined;return b && id?figure(id,b.altText,b.decorative,''):'';};
 const objectives=(lesson:Lesson)=>lesson.objectives.length && !lesson.blocks.some(b=>b.type==='objectives')?`<section class="objectives"><h4>In this lesson, you will</h4>${list(lesson.objectives.map(o=>o.text))}</section>`:'';
 const lessons=course.sections.map(section=>`<section class="course-section" id="pdf-${section.id}">${section.title?text('h2',section.title):''}${section.lessons.length?section.lessons.map(lesson=>`<article class="lesson" id="pdf-${lesson.id}">${banner(lesson)}${text('h3',lesson.title || 'Untitled lesson')}${objectives(lesson)}${lesson.blocks.map(render).join('')}</article>`).join(''):'<p>No lessons in this section.</p>'}</section>`).join('');
 const key=options.includeAnswers?`<section class="answer-key" id="answer-key"><h2>Answer key</h2>${questions.length?questions.map(({block,number:n})=>{
  const c=block.content,range=c.numeric.mode==='range'?`${c.numeric.min} to ${c.numeric.max}`:c.numeric.tolerance?`${c.numeric.value} ± ${c.numeric.tolerance}`:String(c.numeric.value);
  const answers=block.variant==='numeric'?[`${range}${c.numeric.unit?' '+c.numeric.unit:''}`]:block.variant==='hotspot'?c.correct.map(i=>`${String.fromCharCode(65+i)}. ${c.areas[i]?.label??''}`):block.variant==='short-answer'?(c.selfCheck?['Self-check: learners compare with the model answer below.']:c.accepted):block.variant==='fill-blank'?c.accepted:block.variant==='matching'?c.pairs.map(p=>`${p.left} → ${p.right}`):block.variant==='ordering'?c.items:block.variant==='categorize'?c.items.map((v,i)=>`${v} → ${c.groups[c.placements[i] ?? -1] ?? '(no group)'}`):c.correct.map(i=>`${i+1}. ${c.options[i]}`);
  const choiceFeedback=c.feedbackMode==='per-choice'?c.choiceFeedback.map((f,i)=>richIsEmpty(f)?'':`<p>Feedback for choice ${i+1}:</p>${rich(f)}`).join(''):'';
  return `<section>${text('h3',`Question ${n}.`)}${rich(c.prompt)}${list(answers,block.variant==='ordering')}${block.variant==='fill-blank'||(block.variant==='short-answer'&&!c.selfCheck)?text('p',c.caseSensitive?'Case-sensitive.':'Case-insensitive.'):''}${block.variant==='short-answer'&&!richIsEmpty(c.model)?'<p>Model answer:</p>'+rich(c.model):''}${c.feedbackMode==='none'?'':choiceFeedback+(richIsEmpty(c.feedbackCorrect)?'':'<p>Correct-answer feedback:</p>'+rich(c.feedbackCorrect))+(richIsEmpty(c.feedbackIncorrect)?'':'<p>Incorrect-answer feedback:</p>'+rich(c.feedbackIncorrect))}</section>`;
 }).join(''):'<p>This course contains no questions.</p>'}${samples.length?`<h2>Sample responses</h2>${samples.map(s=>`<section>${rich(s.prompt)}<p>Sample response:</p>${rich(s.sample)}</section>`).join('')}`:''}</section>`:'';
 const html=`<!doctype html><html lang="${escapeHtml(course.language)}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escapeHtml(course.title || 'Untitled course')}</title><style>${PDF_CSS}html{font-family:${course.theme.font==='serif'?'"Noto Serif","DejaVu Serif",serif':'"Noto Sans","DejaVu Sans",sans-serif'}}.cover .brand{background:${course.theme.accentColor};color:${accentInk(course.theme.accentColor)};padding:8pt}aside,blockquote{border-left-color:${course.theme.accentColor}}</style></head><body><main><section class="cover"><p class="brand">OpenScroll · Course edition</p>${text('h1',course.title || 'Untitled course')}${course.author?text('p',`By ${course.author}`):''}${course.description?rich(course.description):''}${course.cover?figure(course.cover.assetId,course.cover.altText,course.cover.decorative,''):''}<p class="edition">${options.includeAnswers?'Includes answer key':'Learner copy · No answer key'}</p></section>${contents}${lessons||'<section class="course-section"><h2>Course content</h2><p>No lessons in this course.</p></section>'}${key}</main></body></html>`;
 if(Buffer.byteLength(html)>PDF_RENDER_REQUEST_LIMIT-128)throw new ProjectError('The PDF content exceeds the 32 MiB rendering budget. Reduce image sizes or split the course.');
 return {options,html};
}
const PDF_CSS=`@page{size:auto}*{box-sizing:border-box}html{color:#182d28;background:white;font-family:"Noto Sans","DejaVu Sans",sans-serif;font-size:11pt;line-height:1.55}body{margin:0}h1,h2,h3,h4,h5{line-height:1.25;break-after:avoid;white-space:pre-wrap;overflow-wrap:anywhere}h1{font-size:30pt}h2{font-size:23pt}h3{font-size:19pt}h4{font-size:15pt}h5{font-size:12pt}p,li,figcaption,pre{white-space:pre-wrap;overflow-wrap:anywhere;orphans:3;widows:3}p{margin:.6em 0 1em}pre{font:inherit}a{color:#163f73;text-decoration:underline;overflow-wrap:anywhere}figure{margin:1em 0;break-inside:avoid}img{display:block;max-width:100%;max-height:165mm;width:auto;height:auto;object-fit:contain}figcaption,.url{font-size:9pt}blockquote,aside{margin:1em 0;border-left:3pt solid #466d5b;padding-left:1em}li{margin-bottom:.35em}hr{border:0;border-top:1pt solid #a5b8ae;margin:1em 0}.section-break{border-top-style:dashed}.spacer{height:6mm}.cover{break-after:page;padding-top:12mm}.cover figure img{max-height:100mm}.brand,.edition{font-size:10pt;color:#425e52}.edition{margin-top:12mm}.contents{break-after:page}.contents li{break-inside:avoid}.course-section,.answer-key{break-before:page}.lesson:not(:first-of-type){break-before:page}.block{margin:1em 0}.block[data-block-type=assessment],.answer-key>section{break-inside:avoid}.graphic{position:relative;display:inline-block;max-width:100%}.marker{position:absolute;transform:translate(-50%,-50%);background:#193c35;color:white;border:1pt solid white;border-radius:50%;font-size:9pt;min-width:6mm;text-align:center;padding:.3mm}.answer-key>section{margin-bottom:1.5em}table{border-collapse:collapse;width:100%;margin:1em 0;font-size:10pt}thead{display:table-header-group}tr{break-inside:avoid}th,td{border:.75pt solid #a5b8ae;padding:1.5mm 2mm;text-align:left;vertical-align:top}th p,td p{margin:0}caption{text-align:left;font-weight:bold;margin-bottom:1mm}table.striped tbody tr:nth-child(even) td{background:#eef3f0}.level{color:#425e52;font-size:9pt}.lines span{display:block;border-bottom:.75pt solid #a5b8ae;height:8mm}.activity{border:1pt solid #a5b8ae;padding:3mm 4mm;break-inside:avoid}.boxes{list-style:none;padding-left:0}.boxes li::before{content:'';display:inline-block;width:3.5mm;height:3.5mm;border:1pt solid #182d28;margin-right:2.5mm;vertical-align:-.5mm}.rating td.box{text-align:center}.rating td.box span{display:inline-block;width:3.5mm;height:3.5mm;border:1pt solid #182d28}.area{position:absolute;border:1.5pt solid #193c35;background:rgba(255,255,255,.55);font-weight:bold;font-size:10pt;padding:0 1mm}.boxes.inline li{display:inline-block;margin-right:5mm}.scale .box{display:inline-block;width:3.5mm;height:3.5mm;border:1pt solid #182d28;margin:0 1mm 0 3mm;vertical-align:-.5mm}.columns{display:flex;gap:6mm;align-items:flex-start}.columns .col{flex:1 1 0;min-width:0}.cols-2-1 .col:first-child,.cols-1-2 .col:last-child{flex-grow:2}`;
