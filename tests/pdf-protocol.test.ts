import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer,type Socket} from 'node:net';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {renderPdfViaSocket} from '../src/project/pdf-export.js';
import {pdfHtml} from '../src/project/pdf-html.js';
import {sampleProject} from '../src/project/sample.js';
import {assetPath,ProjectError,type Block} from '../src/shared/course.js';
import {PDF_CLIENT_DEADLINE_MS,PDF_RENDER_OUTPUT_LIMIT,PDF_RENDER_REQUEST_LIMIT,PDF_STATUS_OK,PDF_STATUS_ERROR,PDF_STATUS_BUSY} from '../src/project/pdf-protocol.js';

const input={html:'<!doctype html><p>Only sanitized HTML</p>',paper:'A4' as const};
const pdf=Buffer.from('%PDF-1.7\nTest output\n%%EOF\n');
function frame(body:Buffer,status=PDF_STATUS_OK){const output=Buffer.alloc(body.length+5);output.writeUInt32BE(body.length+1,0);output[4]=status;body.copy(output,5);return output;}
async function renderer<T>(reply:(socket:Socket,bytes:Buffer)=>void,run:(path:string)=>Promise<T>){
  const directory=await mkdtemp(join(tmpdir(),'openscroll-protocol-')),path=join(directory,'worker.sock'),sockets=new Set<Socket>();
  const server=createServer({allowHalfOpen:true},socket=>{
    sockets.add(socket);socket.on('error',()=>{});socket.once('close',()=>sockets.delete(socket));const chunks:Buffer[]=[];
    socket.on('data',(chunk:Buffer)=>chunks.push(chunk));socket.once('end',()=>reply(socket,Buffer.concat(chunks)));
  });
  try{await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(path,resolve);});return await run(path);}
  finally{for(const socket of sockets)socket.destroy();await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(directory,{recursive:true,force:true});}
}
const generic=(error:unknown)=>error instanceof ProjectError&&error.message==='The PDF could not be generated. Reduce course size or try again shortly.';

test('PDF transport sends only sanitized HTML and paper and accepts fragmented framed PDF through EOF',async()=>{
  await renderer((socket,bytes)=>{
    assert.equal(bytes.readUInt32BE(0),bytes.length-4);
    const sent=JSON.parse(bytes.subarray(4).toString('utf8'));
    assert.deepEqual(sent,input);assert.deepEqual(Object.keys(sent),['html','paper']);
    const output=frame(pdf);socket.write(output.subarray(0,2));setImmediate(()=>{socket.write(output.subarray(2,4));setImmediate(()=>{socket.write(output.subarray(4,8));socket.end(output.subarray(8));});});
  },async path=>assert.deepEqual(await renderPdfViaSocket(path,input),pdf));
});

test('PDF transport rejects missing or unsafe socket configuration and oversized JSON without connecting',async()=>{
  for(const path of [undefined,'relative.sock','/tmp/worker\0.sock','/'+''.padEnd(108,'x')])await assert.rejects(renderPdfViaSocket(path,input),generic);
  await assert.rejects(renderPdfViaSocket('/tmp/no-renderer.sock',{...input,html:'x'.repeat(PDF_RENDER_REQUEST_LIMIT)}),generic);
  for(const deadline of [0,-1,Infinity,PDF_CLIENT_DEADLINE_MS+1])await assert.rejects(renderPdfViaSocket('/tmp/no-renderer.sock',input,deadline),generic);
  await assert.rejects(renderPdfViaSocket('/tmp/no-renderer.sock',input,100),generic);
});

test('PDF transport rejects oversized frames, truncation, invalid PDF, invalid status and trailing bytes',async()=>{
  const oversized=Buffer.alloc(4);oversized.writeUInt32BE(PDF_RENDER_OUTPUT_LIMIT+2,0);
  const empty=Buffer.alloc(4);
  const samples=[oversized,empty,Buffer.from([0,0]),frame(pdf).subarray(0,7),frame(Buffer.from('<html>not a PDF</html>')),frame(pdf,9),Buffer.concat([frame(pdf),Buffer.from('extra')]),frame(Buffer.alloc(1025,65),PDF_STATUS_ERROR),frame(Buffer.from('extra'),PDF_STATUS_BUSY),frame(Buffer.alloc(0))];
  for(const bytes of samples)await renderer(socket=>socket.end(bytes),async path=>assert.rejects(renderPdfViaSocket(path,input),generic));
});

test('PDF worker errors and busy messages remain generic and never disclose worker text',async()=>{
  for(const bytes of [frame(Buffer.from('Synthetic private worker diagnostic'),PDF_STATUS_ERROR),frame(Buffer.alloc(0),PDF_STATUS_BUSY)])await renderer(socket=>socket.end(bytes),async path=>{
    await assert.rejects(renderPdfViaSocket(path,input),error=>generic(error)&&!(error as Error).message.includes('Synthetic'));
  });
});

test('PDF client deadline is absolute even when a worker keeps sending bytes or withholds EOF',async()=>{
  await renderer(socket=>{
    const output=frame(pdf);socket.write(output.subarray(0,5));let offset=5;
    const drip=setInterval(()=>{if(offset<output.length)socket.write(output.subarray(offset,++offset));},5);socket.once('close',()=>clearInterval(drip));
  },async path=>assert.rejects(renderPdfViaSocket(path,input,30),generic));
  await renderer(socket=>socket.write(frame(pdf)),async path=>assert.rejects(renderPdfViaSocket(path,input,30),generic));
});

test('PDF HTML budget charges every repeated image reference before large concatenation',()=>{
  const project=sampleProject(),asset=project.document.assets[0]!,bytes=Buffer.concat([Buffer.from(project.files[assetPath(asset)]!,'base64'),Buffer.alloc(1024*1024)]);
  asset.byteLength=bytes.length;asset.sha256=createHash('sha256').update(bytes).digest('hex');project.files[assetPath(asset)]=bytes.toString('base64');
  const template=project.document.course.sections[0]!.lessons[0]!.blocks.find(block=>block.type==='image')!;
  project.document.course.sections[0]!.lessons[0]!.blocks=Array.from({length:30},(_,i)=>({...structuredClone(template),id:`repeated-image-${i}`}));
  assert.throws(()=>pdfHtml(project),error=>error instanceof ProjectError&&/32 MiB/.test(error.message));
  project.document.course.sections[0]!.lessons[0]!.blocks=project.document.course.sections[0]!.lessons[0]!.blocks.slice(0,2);
  assert.ok(Buffer.byteLength(pdfHtml(project).html)<PDF_RENDER_REQUEST_LIMIT);
});

test('PDF HTML budget bounds escaped attachment text at each occurrence before escaping',()=>{
  const project=sampleProject(),asset=project.document.assets[0]!,bytes=Buffer.from('&'.repeat(4*1024*1024));
  asset.fileName='attachment.txt';asset.mediaType='text/plain';asset.byteLength=bytes.length;asset.sha256=createHash('sha256').update(bytes).digest('hex');project.files={'assets/sample-image.txt':bytes.toString('base64')};
  const block:Block={id:'large-text',type:'attachment',variant:'download',appearance:{width:'reading',padding:'medium',background:'page'},content:{label:'Text',description:'',assetId:asset.id}};
  project.document.course.sections[0]!.lessons[0]!.blocks=[block];
  assert.throws(()=>pdfHtml(project),error=>error instanceof ProjectError&&/32 MiB/.test(error.message));
});
