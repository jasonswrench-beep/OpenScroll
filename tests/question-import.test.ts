import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {htmlFiles} from '../src/project/html-export.js';
import {exportScorm} from '../src/project/scorm-export.js';
import {exportPdf} from '../src/project/pdf-export.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import yauzl from 'yauzl';import yazl from 'yazl';
import {readQuestionFile,questionCsvTemplate,questionXlsxTemplate,csvRows,TEMPLATE_ROWS,QUESTION_FILE_LIMIT} from '../src/project/question-spreadsheet.js';
import {parseQuestionTable,importedQuestions,QUESTION_HEADERS} from '../src/shared/question-import.js';
import {assessmentIssue,correctAnswer} from '../src/shared/assessment.js';
import {sampleProject} from '../src/project/sample.js';
import {exportProject,importProject} from '../src/project/archive.js';
import {buildApp} from '../src/server/app.js';
async function unpack(bytes:Buffer){
 return new Promise<Map<string,Buffer>>((resolve,reject)=>{yauzl.fromBuffer(bytes,{lazyEntries:true},(error,zip)=>{if(error||!zip){reject(error);return;}const files=new Map<string,Buffer>();zip.on('error',reject);zip.on('end',()=>resolve(files));zip.on('entry',entry=>zip.openReadStream(entry,(err,stream)=>{if(err||!stream){reject(err);return;}const chunks:Buffer[]=[];stream.on('data',c=>chunks.push(c));stream.on('end',()=>{files.set(entry.fileName,Buffer.concat(chunks));zip.readEntry();});}));zip.readEntry();});});
}
async function alter(bytes:Buffer,change:(files:Map<string,Buffer>)=>void){
 const files=await unpack(bytes);change(files);const zip=new yazl.ZipFile(),chunks:Buffer[]=[];const result=new Promise<Buffer>((resolve,reject)=>{zip.outputStream.on('data',c=>chunks.push(c));zip.outputStream.on('end',()=>resolve(Buffer.concat(chunks)));zip.outputStream.on('error',reject);});for(const[name,data]of files)zip.addBuffer(data,name);zip.end();return result;
}
test('actual 20-question AI CSV preserves every prompt, answer key, choice and feedback through portable export',async()=>{
 const bytes=await readFile('tests/fixtures/question-import/ai-basics-20.csv'),report=await readQuestionFile(bytes,'csv'),source=csvRows(bytes.toString('utf8')).slice(1);assert.deepEqual(report.errors,[]);assert.equal(report.questions.length,20);assert.equal(report.rowCount,20);
 for(let i=0;i<20;i++){const row=source[i]!.cells,item=report.questions[i]!,block=item.block;assert.equal(block.content.prompt,row[3]);assert.deepEqual(block.content.options,row.slice(4,9).filter(Boolean));assert.deepEqual(block.content.correct,[row[9]!.charCodeAt(0)-65]);assert.equal(block.content.feedbackCorrect,row[10]);assert.equal(block.content.feedbackIncorrect,row[11]);assert.equal(item.category,row[0]);assert.equal(item.value,row[1]);assert.equal(block.assessment.points,1);assert.equal(assessmentIssue(block),undefined);assert.equal(correctAnswer(block,{selection:block.content.correct}),true);}
 const project=sampleProject(),blocks=importedQuestions(report,3,true);project.document.course.sections[0]!.lessons[0]!.blocks.push(...blocks);const reopened=await importProject(await exportProject(project));assert.deepEqual(reopened.document.course.sections[0]!.lessons[0]!.blocks.slice(-20),blocks);assert.ok(blocks.every(b=>b.type==='assessment'&&b.assessment.points===3));assert.equal(new Set(blocks.map(b=>b.id)).size,20);
});
test('independently generated Excel workbook imports all twenty source rows from the Questions sheet, even when it is second',async()=>{
 const csv=await readQuestionFile(await readFile('tests/fixtures/question-import/ai-basics-20.csv'),'csv'),xlsx=await readQuestionFile(await readFile('tests/fixtures/question-import/ai-basics-20.xlsx'),'xlsx');assert.deepEqual(xlsx.errors,[]);assert.equal(xlsx.sheet,'Questions');assert.equal(xlsx.questions.length,20);
 for(let i=0;i<20;i++){const a=xlsx.questions[i]!,b=csv.questions[i]!;assert.deepEqual(a.block.content,b.block.content);assert.deepEqual(a.block.assessment,b.block.assessment);assert.equal(a.category,b.category);assert.equal(a.value,b.value);}
});
test('supplied OpenStage template imports nine questions including TF without needing Points',async()=>{const report=await readQuestionFile(await readFile('tests/fixtures/question-import/openstage-template.csv'),'csv');assert.deepEqual(report.errors,[]);assert.equal(report.questions.length,9);const tf=report.questions.filter(r=>r.block.content.options.join('|')==='True|False');assert.ok(tf.length>0);assert.ok(tf.every(r=>r.block.variant==='single-choice'&&assessmentIssue(r.block)===undefined));});
test('downloadable CSV and genuine XLSX templates round-trip all six spreadsheet question types',async()=>{for(const format of ['csv','xlsx']as const){const bytes=format==='csv'?Buffer.from(questionCsvTemplate()):await questionXlsxTemplate();const report=await readQuestionFile(bytes,format);assert.deepEqual(report.errors,[]);assert.equal(report.questions.length,6);assert.deepEqual(report.questions.map(q=>q.block.variant),['single-choice','single-choice','multiple-response','fill-blank','matching','sorting']);assert.ok(report.questions.every(q=>!assessmentIssue(q.block)));assert.equal(report.questions[1]!.block.content.correct[0],0);assert.deepEqual(report.questions[4]!.block.content.pairs[1],{left:'Act',right:'Try one useful step'});}});
test('Excel shared strings, rich text and boolean/numeric values are read by cell coordinates',async()=>{
 const bytes=await alter(await questionXlsxTemplate(),files=>{const header=QUESTION_HEADERS.map((name,i)=>`<c r="${String.fromCharCode(65+i)}1" t="s"><v>${i}</v></c>`).join('');files.set('xl/sharedStrings.xml',Buffer.from('<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'+QUESTION_HEADERS.map(x=>'<si><t>'+x+'</t></si>').join('')+'<si><r><t>Rich </t></r><r><t>question &amp; text</t></r></si></sst>'));files.set('xl/worksheets/sheet1.xml',Buffer.from('<worksheet><sheetData><row r="1">'+header+'</row><row r="2"><c r="B2"><v>400</v></c><c r="C2" t="inlineStr"><is><t>TF</t></is></c><c r="D2" t="s"><v>13</v></c><c r="J2" t="b"><v>1</v></c><c r="M2"><v>7</v></c></row></sheetData></worksheet>'));});const r=await readQuestionFile(bytes,'xlsx');assert.deepEqual(r.errors,[]);assert.equal(r.questions[0]!.block.content.prompt,'Rich question & text');assert.equal(r.questions[0]!.block.assessment.points,7);assert.equal(r.questions[0]!.value,'400');assert.deepEqual(r.questions[0]!.block.content.correct,[0]);
});
test('quoted multiline CSV, UTF-16 Excel CSV, semicolon files, sparse choices and literal markup stay text',async()=>{
 const rows=[['Type','Question','A','C','Correct','Feedback if right'],['MC','Line one\nLine two, "quoted"','<img src=x onerror=alert(1)>','Other','C','Nice, "clear" work']];const csv=rows.map(r=>r.map(v=>'"'+v.replaceAll('"','""')+'"').join(',')).join('\r\n');const r=await readQuestionFile(Buffer.from(csv),'csv');assert.deepEqual(r.errors,[]);assert.equal(r.questions[0]!.block.content.prompt,rows[1]![1]);assert.deepEqual(r.questions[0]!.block.content.correct,[1]);assert.equal(r.questions[0]!.block.content.options[0],rows[1]![2]);
 const utf16=Buffer.concat([Buffer.from([255,254]),Buffer.from('Type;Question;Correct\r\nTF;A statement;False\r\n','utf16le')]);assert.deepEqual((await readQuestionFile(utf16,'csv')).questions[0]!.block.content.correct,[1]);assert.throws(()=>csvRows('Type,Question\nMC,"unterminated'),/not closed/);
});
test('invalid rows are explicit and prevent importing even otherwise valid rows',()=>{
 const rows=TEMPLATE_ROWS.map((cells,i)=>({row:i+1,cells:[...cells]}));rows[2]!.cells[2]='UNSUPPORTED';rows[3]!.cells[9]='E';rows[4]!.cells[12]='101';const report=parseQuestionTable(rows,'Questions');assert.equal(report.errors.length,3);assert.deepEqual(report.errors.map(x=>x.row),[3,4,5]);assert.throws(()=>importedQuestions(report,1,true),/Fix all/);
 const header=parseQuestionTable([{row:1,cells:['Type','Question','Question','Unknown']},{row:2,cells:['MC','Question']}],'CSV');assert.ok(header.errors.length>=3);assert.equal(header.questions.length,0);assert.throws(()=>importedQuestions({...report,errors:[]},1.5,true),/Default points/);
});
test('XLSX formulas, XML entities, macro payloads and oversized archives are rejected before any edit',async()=>{
 const template=await questionXlsxTemplate();
 await assert.rejects(readQuestionFile(await alter(template,f=>f.set('xl/worksheets/sheet1.xml',Buffer.from('<worksheet><sheetData><row r="1"><c r="A1"><f>1+1</f><v>2</v></c></row></sheetData></worksheet>'))),'xlsx'),/formulas/);
 await assert.rejects(readQuestionFile(await alter(template,f=>f.set('xl/sharedStrings.xml',Buffer.from('<!DOCTYPE sst [<!ENTITY e "boom">]><sst/>'))),'xlsx'),/unsupported XML/);
 await assert.rejects(readQuestionFile(await alter(template,f=>f.set('xl/vbaProject.bin',Buffer.from('macro'))),'xlsx'),/Macro/);
 await assert.rejects(readQuestionFile(await alter(template,f=>f.set('xl/worksheets/sheet1.xml',Buffer.alloc(4*1024*1024+1,32))),'xlsx'),/size limits/);
 await assert.rejects(readQuestionFile(Buffer.alloc(QUESTION_FILE_LIMIT+1),'csv'),/2 MiB/);
 const tooMany=parseQuestionTable([{row:1,cells:QUESTION_HEADERS},...Array.from({length:501},(_,i)=>({row:i+2,cells:TEMPLATE_ROWS[1]!}))],'CSV');assert.match(tooMany.errors[0]!.message,/500/);assert.equal(tooMany.questions.length,0);
});
test('question API downloads real templates and failed previews release the processing slot',async()=>{
 const app=await buildApp({query:async()=>({})});try{for(const format of ['csv','xlsx']as const){const r=await app.inject(`/api/projects/questions/template.${format}`);assert.equal(r.statusCode,200);assert.match(r.headers['content-disposition']!,/attachment/);assert.equal((await readQuestionFile(r.rawPayload,format)).questions.length,6);}
 const source=await readFile('tests/fixtures/question-import/ai-basics-20.csv');const parsed=await app.inject({method:'POST',url:'/api/projects/questions/import?format=csv',headers:{'content-type':'application/octet-stream'},payload:source});assert.equal(parsed.statusCode,200);assert.equal(parsed.json().questions.length,20);
 const bad=await app.inject({method:'POST',url:'/api/projects/questions/import?format=xlsx',headers:{'content-type':'application/octet-stream'},payload:Buffer.from('broken')});assert.equal(bad.statusCode,422);assert.equal((await app.inject('/api/projects/sample')).statusCode,200);
 }finally{await app.close();}
});

test('imported assessments publish with unchanged keys/feedback in HTML and both SCORM editions, and complete question text in PDF',async()=>{
 const report=await readQuestionFile(await readFile('tests/fixtures/question-import/ai-basics-20.csv'),'csv'),project=sampleProject(),blocks=importedQuestions(report,5,true);project.document.course.sections[0]!.lessons[0]!.blocks=blocks;
 const html=await htmlFiles(project,resolve('dist/client'));assert.deepEqual(JSON.parse(html.get('course.json')!.toString()).course.sections[0].lessons[0].blocks,blocks);
 for(const edition of ['1.2','2004']as const){const files=await unpack(await exportScorm(project,resolve('dist/client'),edition));assert.deepEqual(JSON.parse(files.get('course.json')!.toString()).course.sections[0].lessons[0].blocks,blocks);assert.ok(files.has('imsmanifest.xml'));}
 const directory=await mkdtemp('/tmp/openscroll-import-pdf-');try{const path=directory+'/questions.pdf';await writeFile(path,await exportPdf(project));const text=execFileSync('pdftotext',[path,'-'],{encoding:'utf8'}).replace(/\s+/g,' ');for(const question of report.questions)assert.ok(text.includes(question.block.content.prompt.replace(/\s+/g,' ')),question.block.content.prompt);}finally{await rm(directory,{recursive:true,force:true});}
});
