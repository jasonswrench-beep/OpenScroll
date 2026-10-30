import {createConnection,type Socket} from 'node:net';
import {isAbsolute} from 'node:path';
import {ProjectError} from '../shared/course.js';
import {pdfHtml} from './pdf-html.js';
import {PDF_CLIENT_DEADLINE_MS,PDF_RENDER_REQUEST_LIMIT,PDF_RENDER_OUTPUT_LIMIT,PDF_STATUS_OK,PDF_STATUS_ERROR,PDF_STATUS_BUSY,type PdfRenderRequest} from './pdf-protocol.js';

const unavailable=()=>new ProjectError('The PDF could not be generated. Reduce course size or try again shortly.');
/** Internal transport; a shorter deadline supports isolated protocol tests, never a fallback. */
export async function renderPdfViaSocket(socketPath:string|undefined,request:PdfRenderRequest,deadlineMs=PDF_CLIENT_DEADLINE_MS):Promise<Buffer>{
  let payload:Buffer;
  try{
    if(typeof socketPath!=='string'||!isAbsolute(socketPath)||socketPath.includes('\0')||Buffer.byteLength(socketPath)>107)throw unavailable();
    if(!Number.isInteger(deadlineMs)||deadlineMs<1||deadlineMs>PDF_CLIENT_DEADLINE_MS)throw unavailable();
    if(typeof request.html!=='string'||!['A4','Letter'].includes(request.paper))throw unavailable();
    if(Buffer.byteLength(request.html)>PDF_RENDER_REQUEST_LIMIT-32)throw unavailable();
    payload=Buffer.from(JSON.stringify({html:request.html,paper:request.paper}),'utf8');
    if(payload.length===0||payload.length>PDF_RENDER_REQUEST_LIMIT)throw unavailable();
  }catch{throw unavailable();}
  const frame=Buffer.allocUnsafe(payload.length+4);frame.writeUInt32BE(payload.length,0);payload.copy(frame,4);
  return new Promise<Buffer>((resolve,reject)=>{
    let socket:Socket|undefined,settled=false,headerBytes=0,expected:number|undefined,received=0,status:number|undefined,body:Buffer|undefined;
    const header=Buffer.alloc(4);
    const finish=(result?:Buffer)=>{
      if(settled)return;settled=true;clearTimeout(deadline);socket?.destroy();
      if(result)resolve(result);else reject(unavailable());
    };
    const deadline=setTimeout(()=>finish(),deadlineMs);
    try{
      socket=createConnection({path:socketPath!});
      socket.once('connect',()=>{try{socket!.end(frame);}catch{finish();}});
      socket.on('error',()=>finish());
      socket.on('close',()=>{if(!settled)finish();});
      socket.on('data',(chunk:Buffer)=>{
        if(settled)return;
        let offset=0;
        if(headerBytes<4){const take=Math.min(4-headerBytes,chunk.length);chunk.copy(header,headerBytes,0,take);headerBytes+=take;offset+=take;
          if(headerBytes<4)return;
          expected=header.readUInt32BE(0);
          if(expected<1||expected>PDF_RENDER_OUTPUT_LIMIT+1){finish();return;}
          body=Buffer.allocUnsafe(expected);
        }
        const data=chunk.subarray(offset);
        if(!data.length)return;
        if(received+data.length>expected!){finish();return;}
        if(status===undefined){
          status=data[0];
          if((status===PDF_STATUS_OK&&expected!<6)||(status===PDF_STATUS_ERROR&&expected!>1025)||(status===PDF_STATUS_BUSY&&expected!==1)||![PDF_STATUS_OK,PDF_STATUS_ERROR,PDF_STATUS_BUSY].includes(status!)){finish();return;}
        }
        data.copy(body!,received);received+=data.length;
      });
      socket.once('end',()=>{
        if(settled)return;
        if(expected===undefined||received!==expected||status!==PDF_STATUS_OK){finish();return;}
        const pdf=body!.subarray(1);
        if(pdf.length<5||pdf.length>PDF_RENDER_OUTPUT_LIMIT||pdf.subarray(0,5).toString('ascii')!=='%PDF-'){finish();return;}
        finish(pdf);
      });
    }catch{finish();}
  });
}

/** Only sanitized HTML and paper selection cross into the credential-free worker. */
export async function exportPdf(input:unknown,settings:unknown={}){
  const {html,options}=pdfHtml(input,settings);
  return renderPdfViaSocket(process.env.PDF_RENDERER_SOCKET,{html,paper:options.paper});
}
