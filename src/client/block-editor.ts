import { saveReusable,chooseReusable,chooseLayout,browseAssets } from './reusable-content.js';
import { groupPacket,insertGroup,assertProjectBudget } from '../shared/reuse.js';
import { extendedSettings } from './extended-settings.js';
import { readMedia } from './media.js';
import { setBlockValue } from '../shared/block-values.js';
import { assetPath,type Block,type PortableProject } from '../shared/course.js';
import { BLOCK_TEMPLATES,prepareBlock,duplicateBlock,switchVariant,templatesFor } from '../shared/block-catalog.js';
import { renderBlock,type TextField } from '../shared/block-renderer.js';
import { LessonHistory } from '../shared/lesson-history.js';
import { moveItem } from '../shared/outline.js';
import { bindInline,caretAtEnd } from './inline-text.js';
import { readImage } from './images.js';
interface Host {
  project:()=>PortableProject|undefined;
  apply:(change:(project:PortableProject)=>void,assetsChanged?:boolean)=>boolean;
  navigate:(lessonId:string)=>void;
}
export class BlockEditor {
  private scope='';private lessonId='';private selected:string|undefined;private insertion=0;
  private histories=new Map<string,LessonHistory>();private libraryOpen=false;private settingsOpen=false;
  private category='All';private search='';private opener:HTMLElement|undefined;
  private canvas:HTMLElement;private library:HTMLElement;private inspector:HTMLElement;private layout:HTMLElement;
  private undo:HTMLButtonElement;private redo:HTMLButtonElement;private status:HTMLElement;private navigator:HTMLSelectElement;
  private pendingUploads=0;private groupSelection=new Set<string>();
  constructor(private root:HTMLElement,private host:Host){
    const bar=document.createElement('div');bar.className='lesson-editor-bar';
    const label=document.createElement('label');label.htmlFor='block-lesson-nav';label.textContent='Jump to lesson';
    this.navigator=document.createElement('select');this.navigator.id=label.htmlFor;this.navigator.addEventListener('change',()=>{if(!this.pendingUploads)this.host.navigate(this.navigator.value);else {this.navigator.value=this.lessonId;this.announce('Wait for the image to finish loading before changing lessons.');}});
    this.undo=this.button('Undo',()=>this.travel('undo'));this.undo.setAttribute('aria-label','Undo lesson edit');
    this.redo=this.button('Redo',()=>this.travel('redo'));this.redo.setAttribute('aria-label','Redo lesson edit');
    const open=this.button('Block library',()=>this.openLibrary(this.blocks().length,open));
    const layout=this.button('Learning layouts',()=>this.reuse(layout,'layout')),groups=this.button('Saved groups',()=>this.reuse(groups,'group')),assets=this.button('Asset library',()=>this.reuse(assets,'asset')),saveGroup=this.button('Save selected blocks',()=>{const project=this.host.project();if(!project||this.busy)return;const ids=this.blocks().filter(b=>this.groupSelection.has(b.id)).map(b=>b.id);if(!ids.length){this.announce('Select one or more blocks before saving a group.');return;}saveReusable('group',groupPacket(project,ids),saveGroup,'Reusable block group');});
    bar.append(label,this.navigator,this.undo,this.redo,open,layout,groups,assets,saveGroup);
    this.status=document.createElement('p');this.status.className='block-editor-status';this.status.setAttribute('role','status');
    this.layout=document.createElement('div');this.layout.className='lesson-editor-layout';
    this.library=document.createElement('aside');this.library.className='block-library';this.library.hidden=true;this.library.setAttribute('aria-label','Block library');
    this.canvas=document.createElement('div');this.canvas.className='lesson-canvas';this.canvas.setAttribute('role','region');this.canvas.setAttribute('aria-label','Lesson canvas');
    this.inspector=document.createElement('aside');this.inspector.className='block-inspector';this.inspector.hidden=true;this.inspector.setAttribute('aria-label','Block settings');
    this.layout.append(this.library,this.canvas,this.inspector);this.root.append(bar,this.status,this.layout);
    this.root.addEventListener('keydown',event=>{
      if(event.key==='Escape'){
        if(this.settingsOpen){event.preventDefault();this.closeSettings();}else if(this.libraryOpen){event.preventDefault();this.closeLibrary();}
      }
      if(!event.isComposing && (event.ctrlKey || event.metaKey) && !(event.target as HTMLElement).closest('[data-history-ignore]')){
        const key=event.key.toLowerCase();
        if(key==='z' || key==='y'){event.preventDefault();this.travel(key==='y' || event.shiftKey ? 'redo' : 'undo');}
      }
    });
  }
  get busy(){return this.pendingUploads>0;}
  show(scope:string,lessonId:string){
    if(this.scope!==scope){this.histories.clear();this.scope=scope;this.selected=undefined;this.libraryOpen=false;this.settingsOpen=false;}
    if(this.lessonId!==lessonId){this.groupSelection.clear();this.histories.get(this.lessonId)?.breakGroup();this.selected=undefined;this.libraryOpen=false;this.settingsOpen=false;}
    this.lessonId=lessonId;this.root.hidden=false;this.render();
  }
  hide(){this.canvas.replaceChildren();this.inspector.replaceChildren();this.library.replaceChildren();this.root.hidden=true;this.histories.get(this.lessonId)?.breakGroup();this.lessonId='';}
  reset(){this.groupSelection.clear();this.hide();this.histories.clear();this.scope='';this.selected=undefined;this.status.textContent='';this.navigator.replaceChildren();this.search='';this.category='All';this.opener=undefined;}
  private blocks():Block[]{return this.host.project()?.document.course.sections.flatMap(s=>s.lessons).find(l=>l.id===this.lessonId)?.blocks ?? [];}
  private history(){let history=this.histories.get(this.lessonId);if(!history){history=new LessonHistory();this.histories.set(this.lessonId,history);}return history;}
  private button(label:string,handler:()=>void){const b=document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',handler);return b;}
  private announce(message:string){if(this.status.textContent!==message)this.status.textContent=message;}
  private mutate(change:(blocks:Block[],project:PortableProject)=>void,group?:string,assetsChanged=false):boolean {
    const before=structuredClone(this.blocks());const lessonId=this.lessonId;
    const applied=this.host.apply(project=>{const lesson=project.document.course.sections.flatMap(s=>s.lessons).find(l=>l.id===lessonId);if(!lesson)throw new Error('The lesson is no longer available.');change(lesson.blocks,project);},assetsChanged);
    if(applied){this.history().record(before,this.blocks(),group);this.updateHistory();}return applied;
  }
  private updateHistory(){this.undo.disabled=!this.history().canUndo;this.redo.disabled=!this.history().canRedo;}
  private select(id:string){this.selected=id;for(const card of this.canvas.querySelectorAll<HTMLElement>('[data-block-id]'))card.classList.toggle('is-selected',card.dataset.blockId===id);if(this.settingsOpen)this.renderSettings();}
  private focusBlock(id?:string,field?:string){
    if(!id){this.canvas.querySelector<HTMLElement>('.quick-insert button')?.focus();return;}
    const card=this.canvas.querySelector<HTMLElement>(`[data-block-id="${id}"]`);
    const target=field ? card?.querySelector<HTMLElement>(`[data-field="${field}"]`) : card?.querySelector<HTMLElement>('.block-card-title');
    (target ?? card)?.focus();if(target?.isContentEditable)caretAtEnd(target);
  }
  private render(){
    const project=this.host.project();if(!project)return;
    this.navigator.replaceChildren();
    for(const section of project.document.course.sections)for(const lesson of section.lessons)this.navigator.add(new Option(`${section.title || 'Untitled section'} / ${lesson.title || 'Untitled lesson'}`,lesson.id));
    this.navigator.value=this.lessonId;this.renderCanvas();if(this.libraryOpen)this.renderLibrary();if(this.settingsOpen)this.renderSettings();this.syncPanels();this.updateHistory();
  }
  private syncPanels(){this.library.hidden=!this.libraryOpen;this.inspector.hidden=!this.settingsOpen;this.layout.classList.toggle('has-library',this.libraryOpen);this.layout.classList.toggle('has-settings',this.settingsOpen);}
  private renderCanvas(){
    this.canvas.replaceChildren();const project=this.host.project();if(!project)return;
    const blocks=this.blocks();
    const insertPoint=(index:number)=>{const point=this.button('+ Insert block',()=>this.openLibrary(index,point));point.className='block-insert-point';point.setAttribute('aria-label',`Insert a block at position ${index+1}`);this.canvas.append(point);};
    blocks.forEach((block,index)=>{
      insertPoint(index);
      const card=document.createElement('article');card.dataset.blockId=block.id;card.className='block-card';card.tabIndex=-1;card.classList.toggle('is-selected',block.id===this.selected);
      const header=document.createElement('div');header.className='block-toolbar';
      const title=document.createElement('h4');title.className='block-card-title';title.tabIndex=-1;title.textContent=`${index+1}. ${this.name(block)}`;card.setAttribute('aria-label',`${this.name(block)} block ${index+1}`);
      const variant=document.createElement('select');variant.setAttribute('aria-label',`Template for block ${index+1}`);variant.dataset.control='variant';
      for(const template of templatesFor(block))variant.add(new Option(template.label,template.variant));variant.value=block.variant;
      variant.addEventListener('change',()=>{if(this.mutate(items=>{const at=items.findIndex(item=>item.id===block.id);items[at]=switchVariant(items[at]!,variant.value);})){this.selected=block.id;this.render();this.canvas.querySelector<HTMLElement>(`[data-block-id="${block.id}"] [data-control="variant"]`)?.focus();this.announce('Block template changed. Content was preserved.');}});
      const settings=this.button('Settings',()=>{this.select(block.id);this.libraryOpen=false;this.settingsOpen=true;this.renderSettings();this.syncPanels();this.inspector.querySelector<HTMLElement>('h4')?.focus();});settings.setAttribute('aria-label',`Settings for block ${index+1}`);
      const up=this.button('Move up',()=>this.move(block.id,-1));up.disabled=index===0;up.setAttribute('aria-label',`Move block ${index+1} up`);
      const down=this.button('Move down',()=>this.move(block.id,1));down.disabled=index===blocks.length-1;down.setAttribute('aria-label',`Move block ${index+1} down`);
      const duplicate=this.button('Duplicate',()=>{if(this.mutate(items=>{const at=items.findIndex(item=>item.id===block.id);const copy=duplicateBlock(items[at]!);items.splice(at+1,0,copy);this.selected=copy.id;})){this.render();this.focusBlock(this.selected);this.announce('Block duplicated.');}});duplicate.setAttribute('aria-label',`Duplicate block ${index+1}`);
      const remove=this.button('Delete',()=>{if(this.mutate(items=>{const at=items.findIndex(item=>item.id===block.id);items.splice(at,1);this.selected=items[Math.min(at,items.length-1)]?.id;})){this.render();this.focusBlock(this.selected);this.announce('Block deleted. Undo can restore it.');}});remove.setAttribute('aria-label',`Delete block ${index+1}`);
      const selection=document.createElement('label');selection.className='block-group-select';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.checked=this.groupSelection.has(block.id);checkbox.setAttribute('aria-label',`Select block ${index+1} for saved group`);checkbox.addEventListener('change',()=>{if(checkbox.checked)this.groupSelection.add(block.id);else this.groupSelection.delete(block.id);});selection.append(checkbox,document.createTextNode('Reuse'));header.append(title,selection,variant,settings,up,down,duplicate,remove);card.append(header);
      card.append(renderBlock(block,project,(element,field)=>bindInline(element,field,text=>{
        this.mutate(items=>{const target=items.find(item=>item.id===block.id)!;if(field.key.startsWith('items-') && target.type==='list')target.content.items[Number(field.key.slice(6))]=text;else setBlockValue(target,field.key,text);},`${block.id}:${field.key}`);
      },()=>{if(this.selected!==block.id)this.select(block.id);})));
      if(block.type==='spacer'){const marker=document.createElement('p');marker.className='spacer-description';marker.textContent=`${block.variant} spacer`;card.append(marker);}
      if(block.type==='continue'){const note=document.createElement('p');note.className='block-edit-note';note.textContent='Continue rule is authored here; learner gating is not active in the editor.';card.append(note);}
      this.canvas.append(card);
    });
    insertPoint(blocks.length);
    const quick=document.createElement('div');quick.className='quick-insert';quick.setAttribute('role','group');quick.setAttribute('aria-label','Quick insert at end of lesson');
    for(const [key,label] of [['paragraph','Paragraph'],['heading','Heading'],['image','Image'],['bulleted-list','List']] as const)quick.append(this.button(label,()=>this.insert(key,this.blocks().length)));
    const library=this.button('Browse all blocks',()=>this.openLibrary(this.blocks().length,library));quick.append(library);this.canvas.append(quick);
  }
  private reuse(opener:HTMLElement,kind:'layout'|'group'|'asset'){
    if(this.busy){this.announce('Wait for media to finish loading before reusing content.');return;}const project=this.host.project();if(!project)return;const scope=this.scope,lessonId=this.lessonId;
    const use=(source:PortableProject)=>{if(this.scope!==scope||this.lessonId!==lessonId||this.busy)throw new Error('The open lesson changed. Reopen the reusable item.');let ids:string[]=[];if(this.mutate((_items,target)=>{ids=insertGroup(target,lessonId,source);assertProjectBudget(target);},undefined,true)){this.selected=ids[0];this.render();this.announce('Reusable content inserted as an independent copy. Undo can remove it.');}};
    if(kind==='layout')chooseLayout(opener,use);else if(kind==='group')chooseReusable('group',opener,use);else browseAssets(structuredClone(project),opener,use);
  }
  private name(block:Block){return BLOCK_TEMPLATES.find(t=>t.type===block.type && t.variant===block.variant)?.label ?? block.type;}
  private move(id:string,delta:-1|1){if(this.mutate(items=>moveItem(items,items.findIndex(item=>item.id===id),delta))){this.selected=id;this.render();this.focusBlock(id);this.announce(`Block moved ${delta===-1 ? 'up' : 'down'}.`);}}
  private insert(key:string,index:number){
    const project=this.host.project();if(!project)return;
    const prepared=prepareBlock(key,project);
    if(this.mutate((items,project)=>{if(prepared.asset){project.document.assets.push(prepared.asset);project.files[assetPath(prepared.asset)]=prepared.data!;}items.splice(index,0,prepared.block);},undefined,!!prepared.asset)){
      this.selected=prepared.block.id;this.insertion=index+1;this.render();const field=this.canvas.querySelector<HTMLElement>(`[data-block-id="${this.selected}"] [data-field]`);if(field){field.focus();caretAtEnd(field);}else this.focusBlock(this.selected);this.announce(`${this.name(prepared.block)} inserted at position ${index+1}.`);
    }
  }
  private openLibrary(index:number,opener:HTMLElement){this.insertion=index;this.opener=opener;this.settingsOpen=false;this.libraryOpen=true;this.renderLibrary();this.syncPanels();this.library.querySelector<HTMLInputElement>('input')?.focus();}
  private closeLibrary(){this.libraryOpen=false;this.syncPanels();if(this.opener?.isConnected)this.opener.focus();else this.focusBlock(this.selected);}
  private closeSettings(){this.settingsOpen=false;this.syncPanels();const card=this.canvas.querySelector<HTMLElement>(`[data-block-id="${this.selected}"]`);card?.querySelector<HTMLButtonElement>('button')?.focus();}
  private renderLibrary(){
    this.library.replaceChildren();
    const heading=document.createElement('h4');heading.textContent='Block library';
    const close=this.button('Close block library',()=>this.closeLibrary());
    const label=document.createElement('label');label.htmlFor='block-library-search';label.textContent='Search block templates';
    const search=document.createElement('input');search.id=label.htmlFor;search.type='search';search.value=this.search;search.dataset.historyIgnore='true';
    const categories=document.createElement('div');categories.className='block-categories';categories.setAttribute('role','group');categories.setAttribute('aria-label','Block categories');
    for(const category of ['All','Text','Images','Structure','Media','Interactive','Assessment']){const b=this.button(category,()=>{this.category=category;this.renderLibrary();this.library.querySelector<HTMLButtonElement>(`[data-category="${category}"]`)?.focus();});b.dataset.category=category;b.setAttribute('aria-pressed',String(this.category===category));categories.append(b);}
    const results=document.createElement('div');results.className='block-template-grid';
    const draw=()=>{
      results.replaceChildren();const templates=BLOCK_TEMPLATES.filter(t=>(this.category==='All' || t.category===this.category) && `${t.label} ${t.description}`.toLowerCase().includes(this.search.toLowerCase()));
      for(const template of templates){const b=this.button('',()=>this.insert(template.key,this.insertion));b.className='block-template';b.setAttribute('aria-label',`Insert ${template.label}`);
        const preview=document.createElement('span');preview.className=`block-template-preview preview-${template.type}`;preview.setAttribute('aria-hidden','true');
        for(let i=0;i<3;i++){const line=document.createElement('span');preview.append(line);}const name=document.createElement('strong');name.textContent=template.label;const description=document.createElement('span');description.textContent=template.description;b.append(preview,name,description);results.append(b);
      }
      if(!templates.length){const empty=document.createElement('p');empty.textContent='No templates match this search.';results.append(empty);}
    };
    search.addEventListener('input',()=>{this.search=search.value;draw();});this.library.append(heading,close,label,search,categories,results);draw();
  }
  private travel(direction:'undo'|'redo'){
    if(this.pendingUploads){this.announce('Wait for the image to finish loading before using undo or redo.');return;}
    const active=document.activeElement as HTMLElement|null;const field=active?.closest('[data-field]')?.getAttribute('data-field') ?? undefined;
    const before=this.blocks();const oldIds=new Set(before.map(b=>b.id));const value=this.history()[direction](before,blocks=>this.host.apply(project=>{project.document.course.sections.flatMap(s=>s.lessons).find(l=>l.id===this.lessonId)!.blocks=blocks;}));if(!value)return;
    const restored=value.find(b=>!oldIds.has(b.id));const selected=value.some(b=>b.id===this.selected) ? this.selected : value[0]?.id;
    {this.selected=restored?.id ?? selected;this.render();this.focusBlock(this.selected,field);this.announce(direction==='undo' ? 'Lesson edit undone.' : 'Lesson edit redone.');}
  }
  private renderSettings(){
    this.inspector.replaceChildren();const block=this.blocks().find(item=>item.id===this.selected);if(!block){this.settingsOpen=false;this.syncPanels();return;}
    const heading=document.createElement('h4');heading.textContent=`${this.name(block)} settings`;heading.tabIndex=-1;
    this.inspector.append(heading,this.button('Close block settings',()=>this.closeSettings()));
    const change=(mutator:(block:Block)=>void,key?:string,render=false)=>{
      const applied=this.mutate(items=>mutator(items.find(item=>item.id===block.id)!),key ? `${block.id}:${key}` : undefined);
      if(applied){if(key!=='narration')this.renderCanvas();this.updateHistory();if(render)this.renderSettings();}
      return applied;
    };
    const select=(label:string,options:[string,string][],value:string,handler:(value:string)=>void)=>{
      const wrap=document.createElement('label');wrap.textContent=label;const input=document.createElement('select');input.setAttribute('aria-label',label);for(const [key,name]of options)input.add(new Option(name,key));input.value=value;input.addEventListener('change',()=>handler(input.value));wrap.append(input);this.inspector.append(wrap);return input;
    };
    select('Block width',[['reading','Reading column'],['wide','Wide'],['full','Full width']],block.appearance.width,value=>change(b=>{b.appearance.width=value as Block['appearance']['width'];}));
    select('Block spacing',[['small','Small'],['medium','Medium'],['large','Large']],block.appearance.padding,value=>change(b=>{b.appearance.padding=value as Block['appearance']['padding'];}));
    select('Block background',[['page','Page'],['surface','Soft surface'],['accent','Course accent']],block.appearance.background,value=>change(b=>{b.appearance.background=value as Block['appearance']['background'];}));
    if(block.type==='image' || block.type==='image-text'){
      const project=this.host.project()!;select('Image asset',project.document.assets.filter(a=>a.mediaType.startsWith('image/')).map(a=>[a.id,a.fileName]),block.content.assetId,value=>change(b=>{if(b.type==='image'||b.type==='image-text')b.content.assetId=value;}));
      const label=document.createElement('label');label.textContent='Upload image (PNG, JPEG, or WebP)';const file=document.createElement('input');file.type='file';file.accept='.png,.jpg,.jpeg,.webp';label.append(file);this.inspector.append(label);
      file.addEventListener('change',()=>{const image=file.files?.[0];if(image)void this.uploadImage(image,block.id,file);});
      const altLabel=document.createElement('label');altLabel.textContent='Image alternative text';const alt=document.createElement('input');alt.value=block.content.altText;alt.maxLength=2000;alt.addEventListener('input',()=>change(b=>{if(b.type==='image'||b.type==='image-text')b.content.altText=alt.value;},'altText'));altLabel.append(alt);this.inspector.append(altLabel);
      const decorativeLabel=document.createElement('label');const decorative=document.createElement('input');decorative.type='checkbox';decorative.checked=block.content.decorative;decorative.addEventListener('change',()=>change(b=>{if(b.type==='image'||b.type==='image-text')b.content.decorative=decorative.checked;}));decorativeLabel.append(decorative,document.createTextNode(' Image is decorative'));this.inspector.append(decorativeLabel);
      const help=document.createElement('p');help.textContent='Describe a meaningful image, or mark it decorative. Captions are edited directly below the image.';this.inspector.append(help);
    }
    if(block.type==='list'){
      const controls=document.createElement('div');controls.className='list-item-controls';
      const add=this.button('Add list item',()=>{if(change(b=>{if(b.type==='list')b.content.items.push('A new point to explore.');},undefined,true)){this.focusBlock(block.id,`items-${(this.blocks().find((b):b is Extract<Block,{type:'list'}>=>b.id===block.id && b.type==='list')!.content.items.length-1)}`);}});add.disabled=block.content.items.length>=100;controls.append(add);
      block.content.items.forEach((_item,index)=>controls.append(this.button(`Remove list item ${index+1}`,()=>{change(b=>{if(b.type==='list')b.content.items.splice(index,1);},undefined,true);this.inspector.querySelector<HTMLButtonElement>('.list-item-controls button')?.focus();})));
      this.inspector.append(controls);
    }
    extendedSettings(this.inspector,block,this.host.project()!,change,(file,kind,assign,input)=>{void this.uploadFile(file,block.id,input,kind,assign);});
    if(block.type==='continue')select('Continue completion rule',[['none','No restriction'],['previous','Complete the previous block'],['all-previous','Complete all previous blocks']],block.completion,value=>change(b=>{if(b.type==='continue')b.completion=value as typeof b.completion;}));
    const narrationLabel=document.createElement('label');const enabled=document.createElement('input');enabled.type='checkbox';enabled.dataset.setting='narration-enable';enabled.checked=!!block.narration;narrationLabel.append(enabled,document.createTextNode(' Include a narration script'));this.inspector.append(narrationLabel);
    enabled.addEventListener('change',()=>{
      if(!enabled.checked && this.blocks().find(b=>b.id===block.id)?.narration?.script && !confirm('Remove this narration script? Undo can restore it.')){enabled.checked=true;return;}
      change(b=>{if(enabled.checked)b.narration={script:'',language:this.host.project()!.document.course.language,speed:1};else delete b.narration;},undefined,true);this.inspector.querySelector<HTMLInputElement>('[data-setting=narration-enable]')?.focus();
    });
    if(block.narration){
      const label=document.createElement('label');label.textContent='Narration script';const script=document.createElement('textarea');script.rows=5;script.maxLength=100000;script.value=block.narration.script;script.addEventListener('input',()=>change(b=>{if(b.narration)b.narration.script=script.value;},'narration'));label.append(script);this.inspector.append(label);
      const speedLabel=document.createElement('label');speedLabel.textContent='Narration speed';const speed=document.createElement('input');speed.type='number';speed.min='0.5';speed.max='2';speed.step='0.1';speed.value=String(block.narration.speed);speed.addEventListener('change',()=>change(b=>{if(b.narration)b.narration.speed=Number(speed.value);}));speedLabel.append(speed);this.inspector.append(speedLabel);
      const note=document.createElement('p');note.textContent='The script is saved with the block. Audio generation and playback are not available yet.';this.inspector.append(note);
    }
  }
  private async uploadImage(file:File,id:string,input:HTMLInputElement){return this.uploadFile(file,id,input,'image',(block,assetId)=>setBlockValue(block,'assetId',assetId));}
  private async uploadFile(file:File,id:string,input:HTMLInputElement,kind:'image'|'audio'|'video'|'attachment',assign:(block:Block,id:string)=>void){
    const scope=this.scope,lessonId=this.lessonId,signature=JSON.stringify(this.blocks().find(b=>b.id===id)?.content);this.pendingUploads++;input.disabled=true;this.announce(kind==='image' ? 'Reading image…' : 'Reading file…');
    try{
      const result=kind==='image' ? await readImage(file,this.host.project()!) : await readMedia(file,this.host.project()!,kind);if(this.scope!==scope || this.lessonId!==lessonId)return;
      if(this.mutate((items,project)=>{const block=items.find(item=>item.id===id);if(!block)throw new Error('This block is no longer available.');if(JSON.stringify(block.content)!==signature)throw new Error('The block changed while reading the file. Retry the upload.');assign(block,result.asset.id);project.document.assets.push(result.asset);project.files[assetPath(result.asset)]=result.data;},undefined,true)){
        this.render();this.inspector.querySelector<HTMLInputElement>('input[type=file]')?.focus();this.announce(kind==='image' ? 'Image added. Review its alternative text.' : 'File added. Review its description, transcript, and captions.');
      }
    }catch(error){this.announce(error instanceof Error ? error.message : 'The file could not be loaded.');}
    finally{this.pendingUploads--;input.disabled=false;input.value='';}
  }
}
