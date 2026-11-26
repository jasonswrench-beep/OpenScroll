import { renderExtended } from './extended-renderer.js';
import { renderWaveA } from './wave-a-renderer.js';
import { assetPath,type Block,type PortableProject } from './course.js';
import { richToDom,RICH_TEXT_MAX } from './rich-text.js';
export interface TextField {key:string;label:string;max:number;multiline:boolean;rich?:boolean;}
export type TextBinder=(element:HTMLElement,field:TextField)=>void;
/** Same semantic content renderer is usable without any editor controls. All text is inert. */
export function renderBlock(block:Block,project:PortableProject,bind?:TextBinder,assetURL?:(id:string)=>string,explored?:(index:number)=>void):HTMLElement {
  const root=document.createElement('div');root.className=`os-block os-${block.type} os-variant-${block.variant} os-width-${block.appearance.width} os-pad-${block.appearance.padding} os-bg-${block.appearance.background}`;
  const accent=project.document.course.theme.accentColor;root.style.setProperty('--os-accent',accent);
  const rgb=[1,3,5].map(start=>parseInt(accent.slice(start,start+2),16)/255).map(c=>c<=0.04045 ? c/12.92 : ((c+0.055)/1.055)**2.4);
  const luminance=0.2126*rgb[0]!+0.7152*rgb[1]!+0.0722*rgb[2]!;
  root.style.setProperty('--os-accent-ink',luminance>0.179 ? '#000000' : '#ffffff');
  root.classList.add(project.document.course.theme.font==='serif' ? 'os-font-serif' : 'os-font-sans');
  function field(tag:string,value:string,key:string,label:string,max=100000,multiline=true){
    const node=document.createElement(tag);node.textContent=value;node.dataset.field=key;
    if(bind)bind(node,{key,label,max,multiline});return node;
  }
  /** Formatted text: paragraphs, subheadings, lists, bold, italic and links, built as DOM nodes. */
  function rich(tag:string,value:string,key:string,label:string){
    const node=document.createElement(tag);node.className='os-rich';node.append(richToDom(value,document,{editable:!!bind}));node.dataset.field=key;
    if(bind)bind(node,{key,label,max:RICH_TEXT_MAX,multiline:true,rich:true});return node;
  }
  function picture(assetId:string,altText:string,decorative:boolean){
    const img=document.createElement('img');const asset=project.document.assets.find(a=>a.id===assetId);
    if(asset)img.src=assetURL ? assetURL(asset.id) : `data:${asset.mediaType};base64,${project.files[assetPath(asset)] ?? ''}`;
    img.alt=decorative ? '' : altText;img.loading='lazy';img.decoding='async';return img;
  }
  const src=(id:string)=>{const asset=project.document.assets.find(a=>a.id===id)!;return assetURL ? assetURL(id) : `data:${asset.mediaType};base64,${project.files[assetPath(asset)] ?? ''}`;};
  switch(block.type){
    case 'assessment':{
      root.append(rich('div',block.content.prompt,'prompt','Question prompt'));
      if(['single-choice','multiple-response','true-false'].includes(block.variant))block.content.options.forEach((value,i)=>root.append(field('p',value,`options.${i}`,`Choice ${i+1}`,300,false)));
      if(block.variant==='fill-blank'){const note=document.createElement('p');note.textContent='Accepted answers are edited in question settings.';root.append(note);}
      if(block.variant==='short-answer'){
        const box=document.createElement('div');box.className='os-response-box';box.textContent=block.content.selfCheck ? 'Learners write their answer, then compare it with the model answer.' : 'Learners type an answer that must match an accepted answer.';root.append(box);
        if(block.content.selfCheck){const label=document.createElement('h4');label.className='os-sample-label';label.textContent='Model answer';root.append(label,rich('div',block.content.model,'model','Model answer'));}
      }
      if(block.variant==='numeric'){const box=document.createElement('p');box.className='os-number-box';box.textContent=`Learners type a number${block.content.numeric.unit ? ` in ${block.content.numeric.unit}` : ''}.`;root.append(box);}
      if(block.variant==='hotspot' && block.content.image){
        const figure=document.createElement('figure'),stage=document.createElement('div');stage.className='os-hotspot-stage';stage.append(picture(block.content.image.assetId,block.content.image.altText,false));
        block.content.areas.forEach((area,i)=>{const mark=document.createElement('span');mark.className='os-area';mark.setAttribute('aria-hidden','true');mark.textContent=String.fromCharCode(65+i);mark.style.left=`${area.x}%`;mark.style.top=`${area.y}%`;mark.style.width=`${area.w}%`;mark.style.height=`${area.h}%`;stage.append(mark);});
        figure.append(stage);root.append(figure);
        const list=document.createElement('ol');list.type='A';block.content.areas.forEach(area=>{const li=document.createElement('li');li.textContent=area.label;list.append(li);});root.append(list);
      }
      if(block.variant==='matching')block.content.pairs.forEach((pair,i)=>root.append(field('h4',pair.left,`pairs.${i}.left`,`Pair ${i+1} term`,300,false),field('p',pair.right,`pairs.${i}.right`,`Pair ${i+1} match`,300,false)));
      if(block.variant==='ordering')block.content.items.forEach((value,i)=>root.append(field('p',value,`items.${i}`,`Ordering item ${i+1}`,300,false)));
      if(block.variant==='categorize'){
        block.content.groups.forEach((value,i)=>root.append(field('h4',value,`groups.${i}`,`Group ${i+1}`,300,false)));
        block.content.items.forEach((value,i)=>root.append(field('p',value,`items.${i}`,`Card ${i+1} to sort`,300,false)));
        const note=document.createElement('p');note.textContent='Choose each card’s correct group in question settings.';root.append(note);
      }
      break;
    }
    case 'heading':root.append(field(block.variant==='heading' ? 'h2' : 'h3',block.content.text,'text','Heading text'));break;
    case 'paragraph':
      if(block.variant==='with-heading')root.append(field('h3',block.content.heading,'heading','Paragraph heading',300,false));
      root.append(rich('div',block.content.text,'text','Paragraph text'));break;
    case 'statement':{
      // A note is ancillary text inside the lesson, not a page region: role=note keeps lessons with several notes free of duplicate landmarks.
      const body=document.createElement('div');
      if(block.variant==='note'){body.className='os-note';body.setAttribute('role','note');body.setAttribute('aria-label','Note');}body.append(rich('div',block.content.text,'text',block.variant==='note' ? 'Note text' : 'Statement text'));root.append(body);break;
    }
    case 'quote':{
      const figure=document.createElement('figure');const quote=document.createElement('blockquote');quote.append(rich('div',block.content.text,'text','Quotation text'));
      figure.append(quote,field('figcaption',block.content.attribution,'attribution','Quotation attribution',300,false));root.append(figure);break;
    }
    case 'list':{
      const list=document.createElement(block.variant==='numbered' ? 'ol' : 'ul');list.className=block.variant==='checklist' ? 'os-checklist' : '';
      block.content.items.forEach((item,index)=>{const li=document.createElement('li');li.append(rich('div',item,`items.${index}`,`List item ${index+1}`));list.append(li);});root.append(list);break;
    }
    case 'image':{
      const figure=document.createElement('figure');figure.append(picture(block.content.assetId,block.content.altText,block.content.decorative),field('figcaption',block.content.caption,'caption','Image caption'));root.append(figure);break;
    }
    case 'image-text':{
      const figure=document.createElement('figure');figure.append(picture(block.content.assetId,block.content.altText,block.content.decorative),field('figcaption',block.content.caption,'caption','Image caption'));
      const text=document.createElement('div');text.className='os-image-copy';text.append(field('h3',block.content.heading,'heading','Image text heading',300,false),rich('div',block.content.text,'text','Image accompanying text'));
      root.append(figure,text);break;
    }
    case 'divider':{
      const line=document.createElement('hr');root.append(line,field('p',block.content.label,'label','Divider label',300,false));break;
    }
    case 'spacer':root.setAttribute('aria-hidden','true');break;
    case 'continue':{
      // An editor can author this now; gating and learner actions belong to the player.
      const label=field('p',block.content.label,'label','Continue label',300,false);label.className='os-continue-label';root.append(label);
      if(bind || block.content.hint){const hint=field('p',block.content.hint,'hint','Message shown until learners can continue',300,false);hint.className='os-continue-hint';root.append(hint);}
      break;
    }
  }
  // Blocks inside a column are edited through the same binder, with their path inside the columns block.
  const child=(inner:Block,prefix:string)=>renderBlock(inner,project,bind ? (element,f)=>{const key=prefix+f.key;element.dataset.field=key;bind(element,{...f,key});} : undefined,assetURL);
  if(!renderWaveA(block,root,field,rich,!!bind,child,picture,project.document.course))renderExtended(block,root,project,field,rich,picture,src,!!bind,explored);
  return root;
}
