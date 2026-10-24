import { assetSchema,type Asset,type PortableProject } from '../shared/course.js';
import { newId } from '../shared/outline.js';
export async function readMedia(file:File,project:PortableProject,kind:'audio'|'video'|'attachment'){
 const types:Record<string,Asset['mediaType']>={mp3:'audio/mpeg',wav:'audio/wav',mp4:'video/mp4',pdf:'application/pdf',txt:'text/plain'};
 const extension=file.name.split('.').at(-1)!.toLowerCase(),mediaType=types[extension];const allowed=kind==='audio' ? ['audio/mpeg','audio/wav'] : kind==='video' ? ['video/mp4'] : ['application/pdf','text/plain'];
 if(!mediaType || !allowed.includes(mediaType) || !file.size || file.size>16*1024*1024)throw new Error(`Choose ${kind==='audio' ? 'MP3 or WAV audio' : kind==='video' ? 'an MP4 video' : 'a PDF or TXT attachment'} up to 16 MiB.`);
 if(project.document.assets.length>=255 || project.document.assets.reduce((n,a)=>n+a.byteLength,0)+file.size+new TextEncoder().encode(JSON.stringify(project.document)).length>64*1024*1024)throw new Error('The file would exceed the project asset or size limit.');
 const bytes=await file.arrayBuffer(),header=new Uint8Array(bytes).slice(0,16),ascii=new TextDecoder().decode(header);let valid=mediaType==='audio/mpeg' ? ascii.startsWith('ID3') || (header[0]===255 && ((header[1] ?? 0)&224)===224) : mediaType==='audio/wav' ? ascii.startsWith('RIFF') && ascii.slice(8,12)==='WAVE' : mediaType==='video/mp4' ? ascii.slice(4,8)==='ftyp' : mediaType==='application/pdf' ? ascii.startsWith('%PDF-') : false;
 if(mediaType==='text/plain'){try{valid=!new TextDecoder('utf-8',{fatal:true}).decode(bytes).includes('\0');}catch{valid=false;}}
 if(!valid)throw new Error('The file content does not match its type.');
 const hash=await crypto.subtle.digest('SHA-256',bytes),id=newId();const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]!);reader.onerror=()=>reject(new Error('The file could not be read.'));reader.readAsDataURL(file);});
 return {asset:{id,fileName:assetSchema.shape.fileName.safeParse(file.name).success?file.name:`${id}.${extension}`,mediaType,byteLength:file.size,sha256:Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('')} satisfies Asset,data};
}
