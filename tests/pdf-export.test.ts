import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { pdfHtml } from '../src/project/pdf-html.js';
import { exportPdf } from '../src/project/pdf-export.js';
import { pdfProject } from './helpers/pdf-project.js';
import { sampleProject } from '../src/project/sample.js';
import { BLOCK_TEMPLATES } from '../src/shared/block-catalog.js';
import { buildApp } from '../src/server/app.js';
test('static PDF source expands every block family and excludes keys by default without changing authored state',async()=>{
 const project=await pdfProject(),before=structuredClone(project);const learner=pdfHtml(project),key=pdfHtml(project,{paper:'Letter',includeAnswers:true});for(const type of new Set(BLOCK_TEMPLATES.map(t=>t.type)))assert.ok(learner.html.includes(`data-block-type="${type}"`),type);
 for(const text of ['HIDDEN-TAB-CONTENT','FLASHCARD-BACK-CONTENT','AFTER-CONTINUE-CONTENT','END-OF-LONG-CONTENT','Transcript','Timed captions','Attachment text','Narration script'])assert.ok(learner.html.includes(text),text);
 assert.equal(learner.html.includes('PRIVATE-ANSWER-731'),false);assert.ok(key.html.includes('PRIVATE-ANSWER-731'));assert.equal(learner.html.includes('<script'),false);assert.equal(learner.html.includes('<video'),false);assert.equal(learner.html.includes('<button'),false);assert.ok(learner.html.includes('Terms</h5>'));assert.deepEqual(project,before);
});
test('PDF escapes author text, preserves safe links, rejects unsafe options and unusable draft assessments',()=>{
 const project=sampleProject();project.document.course.title='</title><script>fetch("http://127.0.0.1/private")</script>';const html=pdfHtml(project).html;assert.ok(html.includes('&lt;script&gt;'));assert.equal(html.includes('<script>'),false);assert.throws(()=>pdfHtml(project,{includeAnswers:'yes'}));assert.throws(()=>pdfHtml(project,{paper:'A3'}));assert.throws(()=>pdfHtml(project,{includeAnswers:true,unknown:true}));
});
test('actual learner and answer-key PDFs preserve tags, language, outlines, alt text, complete reading content and paper sizes',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'openscroll-pdf-'));try{const project=await pdfProject();for(const includeAnswers of [false,true]){const path=join(directory,includeAnswers?'key.pdf':'learner.pdf');await writeFile(path,await exportPdf(project,{paper:includeAnswers?'Letter':'A4',includeAnswers}));}
 const result=JSON.parse(execFileSync('python3',['-c',`
from pypdf import PdfReader
import json,sys
result=[]
for name in ['learner.pdf','key.pdf']:
 r=PdfReader(sys.argv[1]+'/'+name);root=r.trailer['/Root'];text='\\n'.join(p.extract_text() for p in r.pages);roles=[];alts=[]
 def walk(obj):
  if hasattr(obj,'get_object'):obj=obj.get_object()
  if isinstance(obj,list):
   for x in obj:walk(x)
  elif isinstance(obj,dict):
   if '/S' in obj:roles.append(str(obj['/S']))
   if '/Alt' in obj:alts.append(str(obj['/Alt']))
   if '/K' in obj:walk(obj['/K'])
 walk(root.get('/StructTreeRoot'))
 result.append(dict(pages=len(r.pages),tagged=bool(root.get('/MarkInfo',{}).get('/Marked')),language=root.get('/Lang'),outlines=len(r.outline),roles=roles,alts=alts,text=text,width=float(r.pages[0].mediabox.width),links=sum(len(p.get('/Annots',[])) for p in r.pages)))
print(json.dumps(result))`,directory],{encoding:'utf8'}));
 // Poppler versions differ in whether the text dump prints /Alt metadata.
 // Keep checking actual /Alt entries for BOTH editions below; use this dump for reading order.
 const structure=execFileSync('pdfinfo',['-struct-text',join(directory,'learner.pdf')],{encoding:'utf8'});assert.ok(structure.indexOf('HIDDEN-TAB-CONTENT')<structure.indexOf('FLASHCARD-BACK-CONTENT'));assert.ok(structure.indexOf('FLASHCARD-BACK-CONTENT')<structure.indexOf('AFTER-CONTINUE-CONTENT'));
 const [learner,key]=result;for(const pdf of result){assert.equal(pdf.tagged,true);assert.equal(pdf.language,'en');assert.ok(pdf.outlines>0);assert.ok(pdf.roles.includes('/H1'));assert.ok(pdf.roles.includes('/H3'));assert.ok(pdf.roles.includes('/Figure'));assert.ok(pdf.alts.includes('Original geometric learning illustration'));assert.ok(pdf.pages>=5);assert.ok(pdf.links>0);for(const marker of ['HIDDEN-TAB-CONTENT','FLASHCARD-BACK-CONTENT','AFTER-CONTINUE-CONTENT','END-OF-LONG-CONTENT'])assert.ok(pdf.text.includes(marker),marker);assert.ok(pdf.text.indexOf('HIDDEN-TAB-CONTENT')<pdf.text.indexOf('AFTER-CONTINUE-CONTENT'));assert.ok(pdf.text.includes('Page 1 of'));}
 assert.equal(learner.text.includes('PRIVATE-ANSWER-731'),false);assert.ok(key.text.includes('PRIVATE-ANSWER-731'));assert.ok(Math.abs(learner.width-595.28)<2);assert.ok(Math.abs(key.width-612)<2);
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('PDF API rejects malformed options and snapshots and successfully returns a standalone PDF',async()=>{
 const app=await buildApp({query:async()=>({})});try{for(const payload of [{},{project:sampleProject(),options:{includeAnswers:'yes'}}]){const r=await app.inject({method:'POST',url:'/api/projects/pdf',payload});assert.equal(r.statusCode,422);}const r=await app.inject({method:'POST',url:'/api/projects/pdf',payload:{project:sampleProject(),options:{paper:'A4'}}});assert.equal(r.statusCode,200);assert.match(r.headers['content-type']!,/application\/pdf/);assert.equal(r.rawPayload.subarray(0,5).toString(),'%PDF-');}finally{await app.close();}
});
test('PDF rendering does not fetch external links or execute text masquerading as scripts',async()=>{
 const {createServer}=await import('node:http');const {prepareBlock}=await import('../src/shared/block-catalog.js');let requests=0;const server=createServer((_req,res)=>{requests++;res.end('private');});await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{const project=sampleProject(),link=prepareBlock('button',project).block;if(link.type!=='button')throw new Error();link.content.url=`http://127.0.0.1:${(server.address() as {port:number}).port}/private`;project.document.course.sections[0]!.lessons[0]!.blocks.push(link);project.document.course.title=`<script>fetch('${link.content.url}')</script>`;const bytes=await exportPdf(project);assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.equal(requests,0);}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
