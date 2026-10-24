import { type Block,type PortableProject,safeLink } from './course.js';
import { webVtt } from './captions.js';
type Field=(tag:string,value:string,key:string,label:string,max?:number,multiline?:boolean)=>HTMLElement;
type Picture=(id:string,alt:string,decorative:boolean)=>HTMLImageElement;
function el<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;}
function button(label:string,run:()=>void){const b=el('button',label);b.type='button';b.addEventListener('click',run);return b;}
export function renderExtended(block:Block,root:HTMLElement,project:PortableProject,field:Field,picture:Picture,src:(id:string)=>string,editing:boolean,explored?:(index:number)=>void){
 const itemFields=(title:string,text:string,path:string,index:number)=>{const section=el('section');section.append(field('h3',title,`${path}.${index}.title`,`${block.type} item ${index+1} title`,300,false),field('p',text,`${path}.${index}.text`,`${block.type} item ${index+1} text`));return section;};
 switch(block.type){
  case 'gallery':for(const [index,image]of block.content.items.entries()){const figure=el('figure');figure.append(picture(image.assetId,image.altText,image.decorative),field('figcaption',image.caption,`items.${index}.caption`,`Gallery caption ${index+1}`));root.append(figure);}break;
  case 'audio':case 'video':{
   root.append(field('h3',block.content.title,'title',`${block.type} title`,300,false));
   if(block.content.assetId){const media=el(block.type);media.controls=true;media.preload='metadata';media.src=src(block.content.assetId);media.setAttribute('aria-label',block.content.title || (block.type==='audio' ? 'Audio recording' : 'Video recording'));
    if(block.type==='video' && block.content.captions.length){const track=el('track');track.kind='captions';track.label='Captions';track.srclang=block.content.captionLanguage;track.default=true;const data=new TextEncoder().encode(webVtt(block.content.captions));let binary='';for(const byte of data)binary+=String.fromCharCode(byte);track.src=`data:text/vtt;base64,${btoa(binary)}`;media.append(track);}
    const error=el('p');error.setAttribute('role','status');media.addEventListener('error',()=>{error.textContent='This media could not be played. Use the transcript below.';});root.append(media,error);
   }else root.append(el('p',editing ? `Upload ${block.type} in block settings.` : `${block.type==='audio' ? 'Audio' : 'Video'} is unavailable. Read the transcript below.`));
   root.append(el('h4',block.type==='video' ? 'Descriptive transcript' : 'Transcript'),field('p',block.content.transcript,'transcript',`${block.type} transcript`));break;
  }
  case 'attachment':{
   root.append(field('p',block.content.description,'description','Attachment description'));
   const link=el('a');link.append(field('span',block.content.label,'label','Attachment label',300,false));if(block.content.assetId && !editing){link.href=src(block.content.assetId);link.download=project.document.assets.find(a=>a.id===block.content.assetId)!.fileName;}else if(!block.content.assetId)root.append(el('p',editing ? 'Upload a PDF or TXT file in settings.' : 'This attachment is unavailable.'));root.append(link);break;
  }
  case 'button':{
   const link=el('a');link.className='os-link-button';link.append(field('span',block.content.label || (editing ? '' : 'Open resource'),'label','Link button label',300,false));if(!editing && safeLink(block.content.url)){link.href=block.content.url;link.target='_blank';link.rel='noopener noreferrer';link.setAttribute('aria-label',`${block.content.label || 'Open resource'} (opens in a new tab)`);}else if(!editing)root.append(el('p','This link is not configured.'));root.append(link);break;
  }
  case 'accordion':block.content.items.forEach((item,index)=>{if(editing){root.append(itemFields(item.title,item.text,'items',index));return;}const details=el('details'),summary=el('summary',item.title || `Item ${index+1}`);details.addEventListener('toggle',()=>{if(details.open)explored?.(index);});details.append(summary,el('p',item.text));root.append(details);});break;
  case 'timeline':{const list=el('ol');for(const [index,item]of block.content.items.entries()){const li=el('li');li.append(itemFields(item.title,item.text,'items',index));list.append(li);}root.append(list);break;}
  case 'tabs':{
   if(editing){block.content.items.forEach((item,index)=>root.append(itemFields(item.title,item.text,'items',index)));break;}
   const bar=el('div');bar.setAttribute('role','tablist');bar.setAttribute('aria-label','Explore related ideas');const panels:HTMLElement[]=[],tabs:HTMLButtonElement[]=[];
   const activate=(index:number,focus=false)=>{tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(index===i));tab.tabIndex=index===i ? 0 : -1;panels[i]!.hidden=index!==i;});explored?.(index);if(focus)tabs[index]!.focus();};
   block.content.items.forEach((item,index)=>{const panel=el('section');panel.id=`${block.id}-panel-${index}`;panel.setAttribute('role','tabpanel');panel.tabIndex=0;const tab=button(item.title || `Tab ${index+1}`,()=>activate(index));tab.id=`${block.id}-tab-${index}`;tab.setAttribute('role','tab');tab.setAttribute('aria-controls',panel.id);panel.setAttribute('aria-labelledby',tab.id);panel.append(el('h3',item.title),el('p',item.text));tab.addEventListener('keydown',event=>{let next=index;if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else if(event.key==='Home')next=0;else if(event.key==='End')next=tabs.length-1;else return;event.preventDefault();activate(next,true);});tabs.push(tab);panels.push(panel);bar.append(tab);});root.append(bar,...panels);activate(0);break;
  }
  case 'flashcards':block.content.cards.forEach((card,index)=>{const item=el('section');item.className='os-flashcard';item.append(field('p',card.front,`cards.${index}.front`,`Card ${index+1} front`));const back=field('p',card.back,`cards.${index}.back`,`Card ${index+1} back`);back.id=`${block.id}-back-${index}`;back.hidden=!editing;if(!editing){const toggle=button('Reveal answer',()=>{back.hidden=!back.hidden;toggle.textContent=back.hidden ? 'Reveal answer' : 'Hide answer';toggle.setAttribute('aria-expanded',String(!back.hidden));if(!back.hidden)explored?.(index);});toggle.setAttribute('aria-label',`Reveal or hide card ${index+1} answer`);toggle.setAttribute('aria-controls',back.id);toggle.setAttribute('aria-expanded','false');item.append(toggle);}item.append(back);root.append(item);});break;
  case 'process':{
   if(editing){block.content.items.forEach((item,index)=>root.append(itemFields(item.title,item.text,'items',index)));break;}
   const panels=block.content.items.map((item,index)=>itemFields(item.title,item.text,'items',index));let active=0;const status=el('p');status.setAttribute('role','status');const previous=button('Previous step',()=>show(active-1)),next=button('Next step',()=>show(active+1));const show=(index:number)=>{active=index;explored?.(index);panels.forEach((panel,i)=>{panel.hidden=i!==active;});previous.disabled=active===0;next.disabled=active===panels.length-1;status.textContent=`Step ${active+1} of ${panels.length}`;if(document.activeElement===next && next.disabled)previous.focus();if(document.activeElement===previous && previous.disabled)next.focus();};const controls=el('div');controls.className='os-interaction-controls';controls.append(previous,status,next);root.append(...panels,controls);show(0);break;
  }
  case 'labeled-graphic':{
   const figure=el('figure'),image=el('div');image.className='os-marker-image';image.append(picture(block.content.assetId,block.content.altText,block.content.decorative));figure.append(image,field('figcaption',block.content.caption,'caption','Graphic caption'));root.append(figure);
   block.content.markers.forEach((marker,index)=>{const panel=el('section');panel.id=`${block.id}-marker-${index}`;panel.append(field('h3',marker.label,`markers.${index}.label`,`Marker ${index+1} label`,300,false),field('p',marker.text,`markers.${index}.text`,`Marker ${index+1} text`));if(!editing){panel.hidden=true;const toggle=button(String(index+1),()=>{panel.hidden=!panel.hidden;toggle.setAttribute('aria-expanded',String(!panel.hidden));if(!panel.hidden)explored?.(index);});toggle.className='os-marker';toggle.style.left=`${marker.x}%`;toggle.style.top=`${marker.y}%`;toggle.setAttribute('aria-label',`${index+1}. ${marker.label || 'Image detail'}`);toggle.setAttribute('aria-controls',panel.id);toggle.setAttribute('aria-expanded','false');image.append(toggle);}root.append(panel);});break;
  }
 }
}
