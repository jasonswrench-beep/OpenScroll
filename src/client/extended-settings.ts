import { assessmentSettings } from './assessment-settings.js';
import { type Block,type PortableProject } from '../shared/course.js';
import { setBlockValue,blockItems } from '../shared/block-values.js';
import { parseVtt,webVtt } from '../shared/captions.js';
import { moveItem } from '../shared/outline.js';
type Change=(change:(block:Block)=>void,key?:string,render?:boolean)=>boolean;
type Upload=(file:File,kind:'image'|'audio'|'video'|'attachment',assign:(block:Block,id:string)=>void,input:HTMLInputElement)=>void;
export function extendedSettings(root:HTMLElement,block:Block,project:PortableProject,change:Change,upload:Upload){
 assessmentSettings(root,block,change);
 const button=(label:string,run:()=>void)=>{const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',run);return b;};
 const input=(label:string,value:string,path:string,type='text')=>{const wrap=document.createElement('label');wrap.textContent=label;const field=type==='textarea' ? document.createElement('textarea') : document.createElement('input');if(field instanceof HTMLInputElement)field.type=type;field.value=value;field.maxLength=path==='url' ? 2048 : path.includes('transcript') ? 100000 : 2000;field.addEventListener(path==='url' ? 'change' : 'input',()=>change(b=>setBlockValue(b,path,field.value),path));wrap.append(field);root.append(wrap);return field;};
 const assetSelect=(label:string,path:string,value:string|null,types:string[],clear=false)=>{const wrap=document.createElement('label');wrap.textContent=label;const select=document.createElement('select');select.setAttribute('aria-label',label);if(clear)select.add(new Option('No file selected',''));for(const asset of project.document.assets.filter(a=>types.some(type=>a.mediaType.startsWith(type))))select.add(new Option(asset.fileName,asset.id));select.value=value ?? '';select.addEventListener('change',()=>change(b=>setBlockValue(b,path,select.value || null)));wrap.append(select);root.append(wrap);};
 const file=(label:string,kind:'image'|'audio'|'video'|'attachment',assign:(block:Block,id:string)=>void)=>{const wrap=document.createElement('label');wrap.textContent=label;const control=document.createElement('input');control.type='file';control.accept=kind==='image' ? '.png,.jpg,.jpeg,.webp' : kind==='audio' ? '.mp3,.wav' : kind==='video' ? '.mp4' : '.pdf,.txt';control.addEventListener('change',()=>{if(control.files?.[0])upload(control.files[0],kind,assign,control);});wrap.append(control);root.append(wrap);};
 const imageUsage=(prefix:string,image:{assetId:string;altText:string;decorative:boolean},index:number)=>{
  const path=prefix ? `${prefix}.` : '';assetSelect(`Image ${index+1} asset`,`${path}assetId`,image.assetId,['image/']);
  file(`Upload image ${index+1}`,'image',(b,id)=>{setBlockValue(b,`${path}assetId`,id);});
  input(`Image ${index+1} alternative text`,image.altText,`${path}altText`);
  const label=document.createElement('label'),decorative=document.createElement('input');decorative.type='checkbox';decorative.checked=image.decorative;decorative.addEventListener('change',()=>change(b=>setBlockValue(b,`${path}decorative`,decorative.checked)));label.append(decorative,document.createTextNode(` Image ${index+1} is decorative`));root.append(label);
 };
 const collection=(key:string,count:number,limit:number,make:()=>Record<string,unknown>,label:string)=>{
  const controls=document.createElement('div');controls.className='list-item-controls';
  const add=button(`Add ${label}`,()=>{change(b=>blockItems(b,key).push(make()),undefined,true);root.querySelector<HTMLElement>('h4')?.focus();});add.disabled=count>=limit;controls.append(add);
  for(let index=0;index<count;index++){
   const move=(delta:-1|1)=>{change(b=>moveItem(blockItems(b,key),index,delta),undefined,true);root.querySelector<HTMLElement>('h4')?.focus();};
   const up=button(`Move ${label} ${index+1} up`,()=>move(-1));up.disabled=index===0;const down=button(`Move ${label} ${index+1} down`,()=>move(1));down.disabled=index===count-1;const remove=button(`Remove ${label} ${index+1}`,()=>{change(b=>blockItems(b,key).splice(index,1),undefined,true);root.querySelector<HTMLElement>('h4')?.focus();});remove.disabled=count===1;controls.append(up,down,remove);
  }root.append(controls);
 };
 if(block.type==='gallery'){block.content.items.forEach((image,index)=>imageUsage(`items.${index}`,image,index));collection('items',block.content.items.length,30,()=>({...block.content.items.at(-1)!,caption:'Describe this image.'}),'gallery image');}
 if(block.type==='labeled-graphic'){
  imageUsage('',block.content,0);
  block.content.markers.forEach((marker,index)=>{for(const axis of ['x','y'] as const){const label=document.createElement('label');label.textContent=`Marker ${index+1} ${axis} position (%)`;const control=document.createElement('input');control.type='number';control.min='0';control.max='100';control.step='1';control.value=String(marker[axis]);control.addEventListener('change',()=>change(b=>setBlockValue(b,`markers.${index}.${axis}`,Number(control.value))));label.append(control);root.append(label);}});
  collection('markers',block.content.markers.length,30,()=>({label:'A new detail',text:'Explain this detail.',x:50,y:50}),'marker');
 }
 if(block.type==='audio' || block.type==='video' || block.type==='attachment'){
  const types=block.type==='audio' ? ['audio/'] : block.type==='video' ? ['video/'] : ['application/pdf','text/plain'];
  assetSelect('Media asset','assetId',block.content.assetId,types,true);file(`Upload ${block.type}`,block.type,(b,id)=>setBlockValue(b,'assetId',id));
  if(block.type!=='attachment'){input('Media transcript',block.content.transcript,'transcript','textarea');const help=document.createElement('p');help.textContent=block.type==='video' ? 'Provide an accurate descriptive transcript and timed captions before publishing.' : 'Provide an accurate transcript before publishing.';root.append(help);}
 }
 if(block.type==='video'){
  input('Caption language',block.content.captionLanguage,'captionLanguage');const label=document.createElement('label');label.textContent='Timed captions (WebVTT)';const area=document.createElement('textarea');area.rows=8;area.maxLength=1024*1024;area.value=webVtt(block.content.captions);area.dataset.historyIgnore='true';label.append(area);const message=document.createElement('p');message.setAttribute('role','status');
  const apply=()=>{if(!area.isConnected)return;try{const captions=parseVtt(area.value);if(change(b=>{if(b.type==='video')b.content.captions=captions;}))message.textContent='Captions applied.';}catch(error){message.textContent=(error as Error).message;}};
  const uploadLabel=document.createElement('label');uploadLabel.textContent='Import WebVTT captions';const captionsFile=document.createElement('input');captionsFile.type='file';captionsFile.accept='.vtt';captionsFile.addEventListener('change',async()=>{const file=captionsFile.files?.[0];if(!file)return;try{if(file.size>1024*1024)throw new Error('Choose a WebVTT file up to 1 MiB.');area.value=await file.text();apply();}catch(error){message.textContent=(error as Error).message;}finally{captionsFile.value='';}});uploadLabel.append(captionsFile);
  root.append(label,button('Apply captions',apply),uploadLabel,message,button('Clear captions',()=>{change(b=>{if(b.type==='video')b.content.captions=[];});area.value='WEBVTT\n\n';message.textContent='Captions cleared. Undo can restore them.';}));
 }
 if(block.type==='button')input('Link address (HTTP or HTTPS)',block.content.url,'url');
 if(['accordion','tabs','process','timeline'].includes(block.type)){const items=blockItems(block);collection('items',items.length,50,()=>({title:'A new idea',text:'Explain this idea.'}),'item');}
 if(block.type==='flashcards')collection('cards',block.content.cards.length,50,()=>({front:'A new question',back:'A useful explanation'}),'card');
}
