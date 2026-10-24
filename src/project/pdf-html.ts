import { accentInk } from '../shared/course-templates.js';
import { z } from 'zod';
import { assetPath,safeLink,ProjectError,type Block,type PortableProject } from '../shared/course.js';
import { publicationProject } from './readiness.js';
export const pdfOptionsSchema=z.strictObject({paper:z.enum(['A4','Letter']).default('A4'),includeAnswers:z.boolean().default(false)});
export type PdfOptions=z.output<typeof pdfOptionsSchema>;
export function parsePdfOptions(input:unknown):PdfOptions{const parsed=pdfOptionsSchema.safeParse(input??{});if(!parsed.success)throw new ProjectError('Choose A4 or Letter and a valid answer-key option.');return parsed.data;}
export const escapeHtml=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const text=(tag:string,value:string)=>`<${tag}>${escapeHtml(value)}</${tag}>`;
const list=(values:string[],ordered=false)=>`<${ordered?'ol':'ul'}>${values.map(v=>text('li',v)).join('')}</${ordered?'ol':'ul'}>`;
export function pdfHtml(input:unknown,settings:unknown={}){
 const project=publicationProject(input),options=parsePdfOptions(settings),{course}=project.document;let number=0;
 const questions:{block:Extract<Block,{type:'assessment'}>;number:number}[]=[];
 const image=(id:string,alt:string,decorative:boolean)=>{const asset=project.document.assets.find(a=>a.id===id);if(!asset)return text('p','Image unavailable.');return `<img src="data:${asset.mediaType};base64,${project.files[assetPath(asset)]}" alt="${escapeHtml(decorative?'':alt)}">`;};
 const figure=(id:string,alt:string,decorative:boolean,caption:string)=>`<figure>${image(id,alt,decorative)}${caption?text('figcaption',caption):''}</figure>`;
 const items=(values:{title:string;text:string}[],ordered=false)=>`<${ordered?'ol':'div'}>${values.map(v=>`${ordered?'<li>':'<section>'}${text('h5',v.title)}${text('p',v.text)}${ordered?'</li>':'</section>'}`).join('')}</${ordered?'ol':'div'}>`;
 const render=(block:Block):string=>{
  let body='';switch(block.type){
   case 'heading':body=text(block.variant==='subheading'?'h5':'h4',block.content.text);break;
   case 'paragraph':body=(block.variant==='with-heading'?text('h4',block.content.heading):'')+text('p',block.content.text);break;
   case 'statement':body=`<aside>${block.variant==='note'?'<h4>Note</h4>':''}${text('p',block.content.text)}</aside>`;break;
   case 'quote':body=`<figure><blockquote>${text('p',block.content.text)}</blockquote>${text('figcaption',block.content.attribution)}</figure>`;break;
   case 'list':body=(block.variant==='checklist'?'<p>Checklist</p>':'')+list(block.content.items,block.variant==='numbered');break;
   case 'image':body=figure(block.content.assetId,block.content.altText,block.content.decorative,block.content.caption);break;
   case 'image-text':body=figure(block.content.assetId,block.content.altText,block.content.decorative,block.content.caption)+text('h4',block.content.heading)+text('p',block.content.text);break;
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
    if(asset?.mediaType==='text/plain')body+='<h5>Attachment text</h5>'+text('pre',Buffer.from(project.files[assetPath(asset)]!,'base64').toString('utf8'));break;
   }
   case 'button':body=safeLink(block.content.url)?`<p><a href="${escapeHtml(block.content.url)}">${escapeHtml(block.content.label || 'Open resource')}</a><br><span class="url">${escapeHtml(block.content.url)}</span></p>`:text('p',`${block.content.label || 'Resource'}: link not configured.`);break;
   case 'accordion':case 'tabs':case 'timeline':case 'process':body=items(block.content.items,['timeline','process'].includes(block.type));break;
   case 'flashcards':body=block.content.cards.map((card,i)=>`<section>${text('h5',`Card ${i+1}`)}${text('p',card.front)}${text('p',card.back)}</section>`).join('');break;
   case 'labeled-graphic':body=`<figure><div class="graphic">${image(block.content.assetId,block.content.altText,block.content.decorative)}${block.content.markers.map((m,i)=>`<span aria-hidden="true" class="marker" style="left:${m.x}%;top:${m.y}%">${i+1}</span>`).join('')}</div>${text('figcaption',block.content.caption)}</figure>`+`<ol>${block.content.markers.map(m=>`<li>${text('h5',m.label)}${text('p',m.text)}</li>`).join('')}</ol>`;break;
   case 'assessment':{
    const n=++number;questions.push({block,number:n});body=text('h4',`Question ${n}. ${block.content.prompt}`)+text('p',block.assessment.graded?`${block.assessment.points} ${block.assessment.points===1?'point':'points'}.`:'Practice exercise.');
    if(block.variant==='single-choice'||block.variant==='multiple-response')body+=text('p',block.variant==='single-choice'?'Select one answer.':'Select every correct answer.')+list(block.content.options,true);
    else if(block.variant==='fill-blank')body+='<p>Answer: ________________________________________</p>';
    else if(block.variant==='matching')body+='<h5>Terms</h5>'+list(block.content.pairs.map(p=>p.left),true)+'<h5>Matches</h5>'+list([...block.content.pairs].reverse().map(p=>p.right),true)+'<p>Write the matching number beside each term.</p>';
    else body+='<p>Number these items in the correct order.</p>'+list([...block.content.items].reverse().map(v=>'____ '+v));break;
   }
   default:{const unsupported:never=block;throw new ProjectError(`Unsupported PDF block: ${String(unsupported)}`);}
  }
  if(block.narration?.script)body+='<aside><h5>Narration script</h5>'+text('p',block.narration.script)+'</aside>';
  return `<div class="block" data-block-type="${block.type}" id="pdf-${block.id}">${body}</div>`;
 };
 const contents=`<section class="contents"><h2>Contents</h2><ol>${course.sections.map(section=>`<li><a href="#pdf-${section.id}">${escapeHtml(section.title || 'Untitled section')}</a><ol>${section.lessons.map(l=>`<li><a href="#pdf-${l.id}">${escapeHtml(l.title || 'Untitled lesson')}</a></li>`).join('')}</ol></li>`).join('')}${options.includeAnswers?'<li><a href="#answer-key">Answer key</a></li>':''}</ol></section>`;
 const lessons=course.sections.map(section=>`<section class="course-section" id="pdf-${section.id}">${text('h2',section.title || 'Untitled section')}${section.lessons.length?section.lessons.map(lesson=>`<article class="lesson" id="pdf-${lesson.id}">${text('h3',lesson.title || 'Untitled lesson')}${lesson.blocks.map(render).join('')}</article>`).join(''):'<p>No lessons in this section.</p>'}</section>`).join('');
 const key=options.includeAnswers?`<section class="answer-key" id="answer-key"><h2>Answer key</h2>${questions.length?questions.map(({block,number:n})=>{
  const c=block.content,answers=block.variant==='fill-blank'?c.accepted:block.variant==='matching'?c.pairs.map(p=>`${p.left} → ${p.right}`):block.variant==='sorting'?c.items:c.correct.map(i=>`${i+1}. ${c.options[i]}`);
  return `<section>${text('h3',`Question ${n}. ${c.prompt}`)}${list(answers,block.variant==='sorting')}${block.variant==='fill-blank'?text('p',c.caseSensitive?'Case-sensitive.':'Case-insensitive.'):''}${c.feedbackCorrect?text('p',`Correct-answer feedback: ${c.feedbackCorrect}`):''}${c.feedbackIncorrect?text('p',`Incorrect-answer feedback: ${c.feedbackIncorrect}`):''}</section>`;
 }).join(''):'<p>This course contains no questions.</p>'}</section>`:'';
 return {options,html:`<!doctype html><html lang="${escapeHtml(course.language)}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escapeHtml(course.title || 'Untitled course')}</title><style>${PDF_CSS}html{font-family:${course.theme.font==='serif'?'"Noto Serif","DejaVu Serif",serif':'"Noto Sans","DejaVu Sans",sans-serif'}}.cover .brand{background:${course.theme.accentColor};color:${accentInk(course.theme.accentColor)};padding:8pt}aside,blockquote{border-left-color:${course.theme.accentColor}}</style></head><body><main><section class="cover"><p class="brand">OpenScroll · Course edition</p>${text('h1',course.title || 'Untitled course')}${course.author?text('p',`By ${course.author}`):''}${course.description?text('p',course.description):''}${course.cover?figure(course.cover.assetId,course.cover.altText,course.cover.decorative,''):''}<p class="edition">${options.includeAnswers?'Includes answer key':'Learner copy · No answer key'}</p></section>${contents}${lessons||'<section class="course-section"><h2>Course content</h2><p>No lessons in this course.</p></section>'}${key}</main></body></html>`};
}
const PDF_CSS=`@page{size:auto}*{box-sizing:border-box}html{color:#182d28;background:white;font-family:"Noto Sans","DejaVu Sans",sans-serif;font-size:11pt;line-height:1.55}body{margin:0}h1,h2,h3,h4,h5{line-height:1.25;break-after:avoid;white-space:pre-wrap;overflow-wrap:anywhere}h1{font-size:30pt}h2{font-size:23pt}h3{font-size:19pt}h4{font-size:15pt}h5{font-size:12pt}p,li,figcaption,pre{white-space:pre-wrap;overflow-wrap:anywhere;orphans:3;widows:3}p{margin:.6em 0 1em}pre{font:inherit}a{color:#163f73;text-decoration:underline;overflow-wrap:anywhere}figure{margin:1em 0;break-inside:avoid}img{display:block;max-width:100%;max-height:165mm;width:auto;height:auto;object-fit:contain}figcaption,.url{font-size:9pt}blockquote,aside{margin:1em 0;border-left:3pt solid #466d5b;padding-left:1em}li{margin-bottom:.35em}hr{border:0;border-top:1pt solid #a5b8ae;margin:1em 0}.section-break{border-top-style:dashed}.spacer{height:6mm}.cover{break-after:page;padding-top:12mm}.cover figure img{max-height:100mm}.brand,.edition{font-size:10pt;color:#425e52}.edition{margin-top:12mm}.contents{break-after:page}.contents li{break-inside:avoid}.course-section,.answer-key{break-before:page}.lesson:not(:first-of-type){break-before:page}.block{margin:1em 0}.block[data-block-type=assessment],.answer-key>section{break-inside:avoid}.graphic{position:relative;display:inline-block;max-width:100%}.marker{position:absolute;transform:translate(-50%,-50%);background:#193c35;color:white;border:1pt solid white;border-radius:50%;font-size:9pt;min-width:6mm;text-align:center;padding:.3mm}.answer-key>section{margin-bottom:1.5em}`;
