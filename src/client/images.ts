import { assetSchema,type Asset,type PortableProject } from '../shared/course.js';
import { newId } from '../shared/outline.js';
export async function readImage(file:File,project:PortableProject):Promise<{asset:Asset;data:string}>{
  if(file.size===0 || file.size>16*1024*1024)throw new Error('Choose a PNG, JPEG, or WebP image up to 16 MiB.');
  const types:Record<string,Asset['mediaType']>={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'};
  const extension=file.name.split('.').at(-1)!.toLowerCase();const mediaType=types[extension];if(!mediaType)throw new Error('Choose a PNG, JPEG, or WebP image.');
  const bytes=await file.arrayBuffer();const header=new Uint8Array(bytes).slice(0,12);
  const signature=mediaType==='image/png' ? [137,80,78,71,13,10,26,10].every((b,i)=>header[i]===b) : mediaType==='image/jpeg' ? header[0]===255 && header[1]===216 && header[2]===255 : new TextDecoder().decode(header.slice(0,4))==='RIFF' && new TextDecoder().decode(header.slice(8,12))==='WEBP';
  if(!signature)throw new Error('The image content does not match its file type.');
  if(project.document.assets.length>=255 || project.document.assets.reduce((size,asset)=>size+asset.byteLength,0)+file.size+new TextEncoder().encode(JSON.stringify(project.document,null,2)).length>64*1024*1024)throw new Error('This image would exceed the project asset or size limit.');
  const hash=await crypto.subtle.digest('SHA-256',bytes);const id=newId();
  const data=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]!);reader.onerror=()=>reject(new Error('The image could not be read.'));reader.readAsDataURL(file);});
  return {asset:{id,fileName:assetSchema.shape.fileName.safeParse(file.name).success?file.name:`${id}.${extension}`,mediaType,byteLength:file.size,sha256:Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')},data};
}
