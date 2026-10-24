import { renderExtended } from './extended-renderer.js';
import { assetPath,type Block,type PortableProject } from './course.js';
export interface TextField {key:string;label:string;max:number;multiline:boolean;}
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
  function picture(assetId:string,altText:string,decorative:boolean){
    const img=document.createElement('img');const asset=project.document.assets.find(a=>a.id===assetId);
    if(asset)img.src=assetURL ? assetURL(asset.id) : `data:${asset.mediaType};base64,${project.files[assetPath(asset)] ?? ''}`;
    img.alt=decorative ? '' : altText;img.loading='lazy';img.decoding='async';return img;
  }
  const src=(id:string)=>{const asset=project.document.assets.find(a=>a.id===id)!;return assetURL ? assetURL(id) : `data:${asset.mediaType};base64,${project.files[assetPath(asset)] ?? ''}`;};
  switch(block.type){
    case 'assessment':{
      root.append(field('h3',block.content.prompt,'prompt','Question prompt'));
      if(['single-choice','multiple-response'].includes(block.variant))block.content.options.forEach((value,i)=>root.append(field('p',value,`options.${i}`,`Choice ${i+1}`,300,false)));
      if(block.variant==='fill-blank'){const note=document.createElement('p');note.textContent='Accepted answers are edited in question settings.';root.append(note);}
      if(block.variant==='matching')block.content.pairs.forEach((pair,i)=>root.append(field('h4',pair.left,`pairs.${i}.left`,`Pair ${i+1} term`,300,false),field('p',pair.right,`pairs.${i}.right`,`Pair ${i+1} match`,300,false)));
      if(block.variant==='sorting')block.content.items.forEach((value,i)=>root.append(field('p',value,`items.${i}`,`Sorting item ${i+1}`,300,false)));
      break;
    }
    case 'heading':root.append(field(block.variant==='heading' ? 'h2' : 'h3',block.content.text,'text','Heading text'));break;
    case 'paragraph':
      if(block.variant==='with-heading')root.append(field('h3',block.content.heading,'heading','Paragraph heading',300,false));
      root.append(field('p',block.content.text,'text','Paragraph text'));break;
    case 'statement':{
      const body=block.variant==='note' ? document.createElement('aside') : document.createElement('div');
      if(block.variant==='note')body.setAttribute('aria-label','Note');body.append(field('p',block.content.text,'text',block.variant==='note' ? 'Note text' : 'Statement text'));root.append(body);break;
    }
    case 'quote':{
      const figure=document.createElement('figure');const quote=document.createElement('blockquote');quote.append(field('p',block.content.text,'text','Quotation text'));
      figure.append(quote,field('figcaption',block.content.attribution,'attribution','Quotation attribution',300,false));root.append(figure);break;
    }
    case 'list':{
      const list=document.createElement(block.variant==='numbered' ? 'ol' : 'ul');list.className=block.variant==='checklist' ? 'os-checklist' : '';
      block.content.items.forEach((item,index)=>{const li=document.createElement('li');li.append(field('span',item,`items-${index}`,`List item ${index+1}`));list.append(li);});root.append(list);break;
    }
    case 'image':{
      const figure=document.createElement('figure');figure.append(picture(block.content.assetId,block.content.altText,block.content.decorative),field('figcaption',block.content.caption,'caption','Image caption'));root.append(figure);break;
    }
    case 'image-text':{
      const figure=document.createElement('figure');figure.append(picture(block.content.assetId,block.content.altText,block.content.decorative),field('figcaption',block.content.caption,'caption','Image caption'));
      const text=document.createElement('div');text.className='os-image-copy';text.append(field('h3',block.content.heading,'heading','Image text heading',300,false),field('p',block.content.text,'text','Image accompanying text'));
      root.append(figure,text);break;
    }
    case 'divider':{
      const line=document.createElement('hr');root.append(line,field('p',block.content.label,'label','Divider label',300,false));break;
    }
    case 'spacer':root.setAttribute('aria-hidden','true');break;
    case 'continue':{
      // An editor can author this now; gating and learner actions belong to the player.
      const label=field('p',block.content.label,'label','Continue label',300,false);label.className='os-continue-label';root.append(label);break;
    }
  }
  renderExtended(block,root,project,field,picture,src,!!bind,explored);
  return root;
}
