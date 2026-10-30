import { saveReusable,action as reuseAction } from './reusable-content.js';
import { compactProject } from '../shared/reuse.js';
import { openSnapshots } from './snapshots.js';
import { ThemeControls } from './theme-controls.js';
import { assertProjectBudget } from '../shared/reuse.js';
import { previewCourse,publishHtml,publishPdf } from './publishing.js';
import { BlockEditor } from './block-editor.js';
import { api,account,authorizedFetch } from './account-api.js';
import { SaveController, type RecoveryDraft, type SaveAck } from './save-controller.js';
import { readDraft,storeDraft,clearOwnerDrafts } from './recovery.js';
import { assetPath,parseCourse,assetSchema,type PortableProject,type Asset } from '../shared/course.js';
import { newId,newSection,newLesson,copySection,copyLesson,moveItem,moveLesson } from '../shared/outline.js';
const panel=document.querySelector<HTMLElement>('#outline-editor')!;
const structure=document.querySelector<HTMLElement>('#outline-sections')!;
const status=document.querySelector<HTMLElement>('#outline-save-status')!;
const notice=document.querySelector<HTMLElement>('#outline-notice')!;
const lessonPanel=document.querySelector<HTMLElement>('#outline-lesson')!;
const retry=document.querySelector<HTMLButtonElement>('#outline-retry')!;
const saveNow=document.querySelector<HTMLButtonElement>('#outline-save-now')!;
const recovery=document.querySelector<HTMLElement>('#outline-recovery')!;
let controller:SaveController|undefined;
let current:{id:string;owner:string}|undefined;
let currentLesson:string|undefined;
let candidate:RecoveryDraft|undefined;
let candidateConflict=false;
let loadGeneration=0;
let signingOutOwner:string|undefined;
let editorScope='';
const themeControls=new ThemeControls(document.querySelector<HTMLElement>('#outline-theme')!,()=>controller?.project,theme=>{edit(p=>{p.document.course.theme=theme;});if(currentLesson)renderLesson();});
const inputIds={'outline-course-title':'title','outline-description':'description','outline-author':'author','outline-language':'language'} as const;
const blockEditor=new BlockEditor(document.querySelector<HTMLElement>('#lesson-block-editor')!,{project:()=>controller?.project,apply:(change,assetsChanged)=>edit(change,assetsChanged),navigate:id=>{currentLesson=id;renderLesson();document.querySelector<HTMLElement>('#outline-lesson-title')!.focus();}});
function tell(error:unknown){notice.textContent=error instanceof Error ? error.message : 'The change could not be completed.';}
function renderState() {
  if(!controller)return;
  const labels={saved:'Saved to your library.',pending:'Unsaved changes. Waiting to save…',saving:'Saving…',error:'Save not confirmed. Your edits remain in this tab.',conflict:'Conflict: this course changed elsewhere. Your edits are preserved here.'};
  let message=labels[controller.state]+(controller.error ? ` ${controller.error}` : '')+(controller.recoveryWarning && controller.dirty ? ' Browser recovery is unavailable. Keep this tab open until saved, or download a copy.' : '');
  if(candidate)message='Recovery draft available. Restore or discard it before editing.';
  if(status.textContent!==message)status.textContent=message;
  retry.hidden=!!candidate || controller.state!=='error';saveNow.disabled=!!candidate || !controller.dirty || controller.state==='saving' || controller.state==='conflict';
}
function edit(change:(project:PortableProject)=>void,assetsChanged=false,render=false) {
  if(!controller)return false;
  try {controller.edit(p=>{change(p);assertProjectBudget(p);},assetsChanged);notice.textContent='';if(render)renderAll();return true;}
  catch(error){tell(error);return false;}
}
function focusStructure(){document.querySelector<HTMLElement>('#outline-structure-title')!.focus();}
function button(label:string,handler:()=>void,disabled=false) {
  const b=document.createElement('button');b.type='button';b.textContent=label;b.disabled=disabled;
  b.addEventListener('click',handler);return b;
}
function renderAll() {
  if(!controller)return;
  const document=controller.project.document;
  for(const [id,field] of Object.entries(inputIds)) (window.document.getElementById(id) as HTMLInputElement).value=document.course[field as 'title'|'description'|'author'|'language'];
  window.document.querySelector<HTMLSelectElement>('#outline-navigation')!.value=document.course.settings.navigation;
  window.document.querySelector<HTMLInputElement>('#outline-passing-score')!.value=String(document.course.settings.passingScore);
  const covers=window.document.querySelector<HTMLSelectElement>('#outline-cover')!;
  covers.replaceChildren(new Option('No cover',''));
  for(const asset of document.assets.filter(a=>a.mediaType.startsWith('image/')))covers.add(new Option(asset.fileName,asset.id));
  covers.value=document.course.cover?.assetId ?? '';
  (window.document.querySelector('#outline-cover-alt') as HTMLInputElement).value=document.course.cover?.altText ?? '';
  (window.document.querySelector('#outline-cover-decorative') as HTMLInputElement).checked=document.course.cover?.decorative ?? false;
  themeControls.update();renderCover();renderStructure();renderLesson();renderState();
}
function renderCover() {
  const image=document.querySelector<HTMLImageElement>('#outline-cover-preview')!;
  const project=controller?.project;const cover=project?.document.course.cover;
  const asset=project?.document.assets.find(a=>a.id===cover?.assetId);
  image.hidden=!asset;
  if(asset && project){image.src=`data:${asset.mediaType};base64,${project.files[assetPath(asset)]}`;image.alt=cover?.altText || 'Course cover preview';}
  else image.removeAttribute('src');
  for(const id of ['outline-cover-alt','outline-cover-decorative'])(document.getElementById(id) as HTMLInputElement).disabled=!asset;
}
function renderStructure() {
  structure.replaceChildren();if(!controller)return;
  const sections=controller.project.document.course.sections;
  if(!sections.length){const empty=document.createElement('p');empty.textContent='No sections yet. Add a section to start organizing lessons.';structure.append(empty);}
  sections.forEach((section,sectionIndex)=>{
    const card=document.createElement('section');card.className='outline-section';card.dataset.sectionId=section.id;
    const heading=document.createElement('h4');heading.textContent=section.title || 'Untitled section';card.append(heading);
    const label=document.createElement('label');label.htmlFor=`section-title-${section.id}`;label.textContent='Section title';
    const title=document.createElement('input');title.id=label.htmlFor;title.value=section.title;title.maxLength=300;
    title.addEventListener('input',()=>{edit(p=>{p.document.course.sections.find(s=>s.id===section.id)!.title=title.value;});heading.textContent=title.value || 'Untitled section';});
    card.append(label,title);
    const controls=document.createElement('div');controls.className='outline-actions';
    controls.append(
      button('Move section up',()=>{edit(p=>moveItem(p.document.course.sections,sectionIndex,-1),false,true);focusStructure();},sectionIndex===0),
      button('Move section down',()=>{edit(p=>moveItem(p.document.course.sections,sectionIndex,1),false,true);focusStructure();},sectionIndex===sections.length-1),
      button('Duplicate section',()=>{edit(p=>{p.document.course.sections.splice(sectionIndex+1,0,copySection(p.document.course.sections[sectionIndex]!));},false,true);focusStructure();}),
      button('Delete section',()=>{if(confirm(`Delete “${section.title || 'Untitled section'}” and all its lessons? Download a project copy first if you want to keep them.`)){edit(p=>{p.document.course.sections.splice(sectionIndex,1);},false,true);focusStructure();}}),
      button('Add lesson',()=>{edit(p=>{p.document.course.sections[sectionIndex]!.lessons.push(newLesson());},false,true);focusStructure();}),
    );card.append(controls);
    const lessons=document.createElement('ol');lessons.className='outline-lessons';
    section.lessons.forEach((lesson,lessonIndex)=>{
      const row=document.createElement('li');row.dataset.lessonId=lesson.id;
      const lessonLabel=document.createElement('label');lessonLabel.htmlFor=`lesson-title-${lesson.id}`;lessonLabel.textContent='Lesson title';
      const title=document.createElement('input');title.id=lessonLabel.htmlFor;title.value=lesson.title;title.maxLength=300;
      title.addEventListener('input',()=>{edit(p=>{p.document.course.sections[sectionIndex]!.lessons[lessonIndex]!.title=title.value;});if(currentLesson===lesson.id)renderLesson();});row.append(lessonLabel,title);
      const actions=document.createElement('div');actions.className='outline-actions';
      actions.append(
        button('Open lesson',()=>{currentLesson=lesson.id;renderLesson();document.querySelector<HTMLElement>('#outline-lesson-title')!.focus();}),
        button('Move lesson up',()=>{edit(p=>moveItem(p.document.course.sections[sectionIndex]!.lessons,lessonIndex,-1),false,true);focusStructure();},lessonIndex===0),
        button('Move lesson down',()=>{edit(p=>moveItem(p.document.course.sections[sectionIndex]!.lessons,lessonIndex,1),false,true);focusStructure();},lessonIndex===section.lessons.length-1),
        button('Duplicate lesson',()=>{edit(p=>{p.document.course.sections[sectionIndex]!.lessons.splice(lessonIndex+1,0,copyLesson(p.document.course.sections[sectionIndex]!.lessons[lessonIndex]!));},false,true);focusStructure();}),
        button('Delete lesson',()=>{if(confirm(`Delete “${lesson.title || 'Untitled lesson'}” and its content blocks?`)){edit(p=>{p.document.course.sections[sectionIndex]!.lessons.splice(lessonIndex,1);},false,true);focusStructure();}}),
      );row.append(actions);
      if(sections.length>1){
        const targetLabel=document.createElement('label');targetLabel.htmlFor=`move-lesson-${lesson.id}`;targetLabel.textContent='Destination section';
        const target=document.createElement('select');target.id=targetLabel.htmlFor;
        for(const destination of sections.filter(s=>s.id!==section.id))target.add(new Option(destination.title || 'Untitled section',destination.id));
        row.append(targetLabel,target,button('Move to section',()=>{edit(p=>moveLesson(p.document,lesson.id,target.value),false,true);focusStructure();}));
      }
      lessons.append(row);
    });card.append(lessons);structure.append(card);
  });
}
function renderLesson() {
  const lesson=controller?.project.document.course.sections.flatMap(s=>s.lessons).find(l=>l.id===currentLesson);
  lessonPanel.hidden=!lesson;document.querySelector<HTMLElement>('#outline-overview')!.hidden=!!lesson;
  document.querySelector<HTMLElement>('#outline-heading')!.textContent=lesson ? 'Lesson editor' : 'Course outline editor';
  if(!lesson){currentLesson=undefined;blockEditor.hide();return;}
  document.querySelector<HTMLElement>('#outline-lesson-heading')!.textContent=lesson.title || 'Untitled lesson';
  document.querySelector<HTMLInputElement>('#outline-lesson-title')!.value=lesson.title;
  document.querySelector<HTMLElement>('#outline-lesson-count')!.textContent='Edit text directly in the lesson. Use block settings for layout, images, and narration scripts.';
  blockEditor.show(editorScope,lesson.id);
}
async function openCourse(id:string,owner:string,discard=false) {
  if(account?.id!==owner)return;
  if(blockEditor.busy){tell(new Error('Wait for the image to finish loading before changing courses.'));return;}
  if(!discard && current?.id===id && current.owner===owner && controller){panel.scrollIntoView();document.querySelector<HTMLElement>('#outline-heading')!.focus();return;}
  if(!discard && controller?.dirty && !confirm('Open another course? Unsaved edits will remain in a recovery draft in this browser.'))return;
  panel.inert=true;panel.hidden=false;
  if(controller?.dirty)await controller.keepDraft();
  const sequence=++loadGeneration;notice.textContent='Opening course…';
  document.querySelector<HTMLElement>('#outline-fields')!.hidden=!controller;
  try {
    const snapshot=await api<{project:PortableProject;revision:number;lastMutationId:string|null}>(`/api/library/courses/${id}/edit`);
    const draft=discard ? undefined : await readDraft(owner,id).catch(()=>undefined);
    if(sequence!==loadGeneration || account?.id!==owner)return;
    if(discard)await storeDraft(owner,id,null);
    controller?.dispose();blockEditor.reset();editorScope=crypto.randomUUID();current={id,owner};currentLesson=undefined;candidate=draft;
    candidateConflict=!!draft && draft.revision!==snapshot.revision && !(draft.pending && draft.pending.payload.mutationId===snapshot.lastMutationId && draft.pending.payload.revision+1===snapshot.revision);
    controller=new SaveController({project:snapshot.project,revision:snapshot.revision,
      send:payload=>api<SaveAck>(`/api/library/courses/${id}/document`,'PUT',payload),
      persist:draft=>storeDraft(owner,id,draft),changed:renderState,
    });
    recovery.hidden=!draft;document.querySelector<HTMLElement>('#outline-fields')!.inert=!!draft;
    panel.hidden=false;document.querySelector<HTMLElement>('#outline-fields')!.hidden=false;renderAll();notice.textContent='';
    panel.scrollIntoView();document.querySelector<HTMLElement>('#outline-heading')!.focus();
  }catch(error){tell(error);}finally{panel.inert=false;}
}
window.addEventListener('openscroll:edit-course',event=>{const data=(event as CustomEvent<{id:string;owner:string}>).detail;void openCourse(data.id,data.owner);});
for(const [id,field] of Object.entries(inputIds))document.getElementById(id)!.addEventListener('input',event=>{const value=(event.target as HTMLInputElement).value;edit(p=>{p.document.course[field as 'title'|'description'|'author'|'language']=value;});});
document.querySelector('#outline-add-section')!.addEventListener('click',()=>{edit(p=>{p.document.course.sections.push(newSection());},false,true);focusStructure();});
document.querySelector('#outline-save-now')!.addEventListener('click',()=>{void controller?.save();});
retry.addEventListener('click',()=>{void controller?.save();});
document.querySelector('#outline-restore')!.addEventListener('click',()=>{
  if(!candidate || !controller)return;
  try {controller.restore(candidate,candidateConflict);candidate=undefined;recovery.hidden=true;blockEditor.reset();editorScope=crypto.randomUUID();document.querySelector<HTMLElement>('#outline-fields')!.inert=false;renderAll();}catch(error){tell(error);}
});
document.querySelector('#outline-discard-draft')!.addEventListener('click',async ()=>{
  if(!current || !confirm('Discard this browser recovery draft and use the saved course?'))return;
  try {await storeDraft(current.owner,current.id,null);candidate=undefined;recovery.hidden=true;document.querySelector<HTMLElement>('#outline-fields')!.inert=false;renderState();}catch(error){tell(error);}
});
document.querySelector('#outline-reload')!.addEventListener('click',()=>{
  if(current && confirm('Reload the saved course and discard this outline’s unsaved edits? Download a copy first if you want to keep them.'))void openCourse(current.id,current.owner,true);
});
document.querySelector('#outline-back')!.addEventListener('click',async ()=>{
  if(blockEditor.busy){tell(new Error('Wait for the image to finish loading before leaving the lesson.'));return;}
  if(controller?.dirty && !confirm('Leave the outline with unsaved changes? A recovery draft will stay in this browser.'))return;
  const previous=controller;await previous?.keepDraft();if(controller!==previous)return;previous?.dispose();blockEditor.reset();controller=undefined;current=undefined;loadGeneration++;panel.hidden=true;document.querySelector<HTMLElement>('#library-title')!.focus();window.dispatchEvent(new Event('openscroll:library-refresh'));
});
document.querySelector('#outline-close-lesson')!.addEventListener('click',()=>{if(blockEditor.busy){tell(new Error('Wait for the image to finish loading before leaving the lesson.'));return;}currentLesson=undefined;renderLesson();focusStructure();});
document.querySelector('#outline-lesson-title')!.addEventListener('input',event=>{
  const value=(event.target as HTMLInputElement).value;edit(p=>{const lesson=p.document.course.sections.flatMap(s=>s.lessons).find(l=>l.id===currentLesson);if(lesson)lesson.title=value;});
  document.querySelector<HTMLElement>('#outline-lesson-heading')!.textContent=value || 'Untitled lesson';renderStructure();
});
document.querySelector('#outline-cover')!.addEventListener('change',event=>{const id=(event.target as HTMLSelectElement).value;edit(p=>{p.document.course.cover=id ? {assetId:id,altText:'',decorative:false} : null;},false,true);});
document.querySelector('#outline-cover-alt')!.addEventListener('input',event=>{const value=(event.target as HTMLInputElement).value;edit(p=>{if(p.document.course.cover)p.document.course.cover.altText=value;});renderCover();});
document.querySelector('#outline-cover-decorative')!.addEventListener('change',event=>{const value=(event.target as HTMLInputElement).checked;edit(p=>{if(p.document.course.cover)p.document.course.cover.decorative=value;});});
document.querySelector<HTMLInputElement>('#outline-cover-file')!.addEventListener('change',async event=>{
  const input=event.target as HTMLInputElement;const file=input.files?.[0];const active=controller;if(!file || !active)return;
  try {
    if(file.size===0 || file.size>16*1024*1024)throw new Error('Choose a PNG, JPEG, or WebP image up to 16 MiB.');
    const extensions:Record<string,Asset['mediaType']>={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'};
    const extension=file.name.split('.').at(-1)!.toLowerCase();const mediaType=extensions[extension];if(!mediaType)throw new Error('Choose a PNG, JPEG, or WebP image.');
    const bytes=await file.arrayBuffer();const header=new Uint8Array(bytes).slice(0,12);
    const signature=mediaType==='image/png' ? [137,80,78,71,13,10,26,10].every((byte,index)=>header[index]===byte) : mediaType==='image/jpeg' ? header[0]===255 && header[1]===216 && header[2]===255 : new TextDecoder().decode(header.slice(0,4))==='RIFF' && new TextDecoder().decode(header.slice(8,12))==='WEBP';
    if(!signature)throw new Error('The image content does not match its file type. Choose another image.');
    if(active.project.document.assets.reduce((size,asset)=>size+asset.byteLength,0)+file.size+jsonSize(active.project.document)>64*1024*1024)throw new Error('The project would exceed its 64 MiB expanded limit.');
    const hash=await crypto.subtle.digest('SHA-256',bytes);const id=newId();
    const base64=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]!);reader.onerror=()=>reject(new Error('The cover could not be read.'));reader.readAsDataURL(file);});
    if(controller!==active)return;
    const asset:Asset={id,fileName:assetSchema.shape.fileName.safeParse(file.name).success?file.name:`${id}.${extension}`,mediaType,byteLength:file.size,sha256:Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('')};
    edit(p=>{p.document.assets.push(asset);p.files[assetPath(asset)]=base64;p.document.course.cover={assetId:id,altText:'',decorative:false};},true,true);
  }catch(error){tell(error);}finally{input.value='';}
});
document.querySelector<HTMLButtonElement>('#outline-preview')!.addEventListener('click',event=>{
  if(!controller)return;if(blockEditor.busy){tell(new Error('Wait for the image to finish loading before previewing.'));return;}
  previewCourse(candidate?.project ?? controller.project,event.currentTarget as HTMLElement,currentLesson);
});
document.querySelector<HTMLButtonElement>('#outline-html')!.addEventListener('click',event=>{
  if(!controller)return;if(blockEditor.busy){tell(new Error('Wait for the image to finish loading before exporting.'));return;}
  void publishHtml(candidate?.project ?? controller.project,notice,event.currentTarget as HTMLButtonElement);
});
document.querySelector('#outline-download')!.addEventListener('click',async ()=>{
  if(!controller)return;
  try {
    const response=await authorizedFetch('/api/projects/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(candidate?.project ?? controller.project),signal:AbortSignal.timeout(30000)});
    if(!response.ok){const data=await response.json();throw new Error(data.error ?? 'Download failed.');}
    const url=URL.createObjectURL(await response.blob());const link=document.createElement('a');link.href=url;link.download='course.openscroll';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);notice.textContent='Download prepared. This does not overwrite the library course.';
  }catch(error){tell(error);}
});
document.querySelector('#outline-copy')!.addEventListener('click',async ()=>{
  if(!controller)return;
  try {await api('/api/library/courses/import','POST',candidate?.project ?? controller.project);notice.textContent='A separate copy of your edits was saved to the library.';window.dispatchEvent(new Event('openscroll:library-refresh'));}catch(error){tell(error);}
});
window.addEventListener('beforeunload',event=>{if(controller?.dirty || blockEditor.busy)event.preventDefault();});
window.addEventListener('openscroll:before-signout',event=>{
  if(event.defaultPrevented)return;
  if(blockEditor.busy){tell(new Error('Wait for the image to finish loading before signing out.'));event.preventDefault();return;}
  if((controller?.dirty || candidate) && !confirm('Sign out and discard unsaved outline edits? Download or save a separate copy first to keep them.'))event.preventDefault();
  signingOutOwner=event.defaultPrevented ? undefined : account?.id;
});
window.addEventListener('openscroll:signed-out',()=>{if(signingOutOwner)void clearOwnerDrafts(signingOutOwner).catch(()=>{});signingOutOwner=undefined;});
window.addEventListener('openscroll:account',()=>{
  if(current && account?.id!==current.owner){controller?.dispose();blockEditor.reset();controller=undefined;current=undefined;candidate=undefined;loadGeneration++;panel.hidden=true;structure.replaceChildren();lessonPanel.hidden=true;
    for(const id of [...Object.keys(inputIds),'outline-cover-alt','outline-lesson-title'])(document.getElementById(id) as HTMLInputElement).value='';
    document.querySelector('#outline-cover-preview')!.removeAttribute('src');}
});

function jsonSize(value:unknown){return new TextEncoder().encode(JSON.stringify(value,null,2)).length;}

document.querySelector('#outline-navigation')!.addEventListener('change',event=>{const value=(event.target as HTMLSelectElement).value;edit(p=>{p.document.course.settings.navigation=value as 'free'|'sequential';});});

document.querySelector('#outline-passing-score')!.addEventListener('change',event=>{const value=Number((event.target as HTMLInputElement).value);edit(p=>{p.document.course.settings.passingScore=value;});});

for(const format of ['scorm-12','scorm-2004'])document.querySelector<HTMLButtonElement>('#outline-'+format)!.addEventListener('click',event=>{
  if(!controller)return;if(blockEditor.busy){tell(new Error('Wait for the image to finish loading before exporting.'));return;}
  void publishHtml(candidate?.project ?? controller.project,notice,event.currentTarget as HTMLButtonElement,format);
});

document.querySelector('#outline-pdf')!.addEventListener('click',event=>{if(!controller)return;if(blockEditor.busy){tell(new Error('Wait for media to finish loading before exporting.'));return;}publishPdf(candidate?.project ?? controller.project,notice,event.currentTarget as HTMLButtonElement);});

const saveTemplate=reuseAction('Save as course template',()=>{if(!controller||candidate||blockEditor.busy){tell(new Error('Resolve the recovery draft or pending upload before saving a template.'));return;}saveReusable('template',compactProject(controller.project),saveTemplate,controller.project.document.course.title+' template');});
const snapshots=reuseAction('Snapshots',()=>{const active=controller,course=current;if(!active||!course||candidate||blockEditor.busy){tell(new Error('Resolve the recovery draft or pending upload before opening snapshots.'));return;}openSnapshots(snapshots,{id:course.id,owner:course.owner,controller:active,valid:()=>controller===active && current?.id===course.id && !candidate && !blockEditor.busy,changed:message=>{blockEditor.reset();editorScope=crypto.randomUUID();currentLesson=undefined;renderAll();notice.textContent=message;}});});
document.querySelector('#outline-save-now')!.after(saveTemplate,snapshots);
