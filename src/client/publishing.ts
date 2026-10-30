import {authorizedFetch} from './account-api.js';
import type { PortableProject } from '../shared/course.js';
import './publishing.css';
let dialog:HTMLDialogElement|undefined;
/** A cloned snapshot crosses into an independent player; authored state never crosses back. */
export function previewCourse(project:PortableProject,opener:HTMLElement,lessonId?:string){
  if(dialog?.open)return;
  const snapshot=structuredClone(project);dialog=document.createElement('dialog');dialog.className='preview-dialog';dialog.setAttribute('aria-labelledby','preview-title');
  const bar=document.createElement('div');bar.className='preview-toolbar';const heading=document.createElement('h2');heading.id='preview-title';heading.textContent='Course preview';
  const label=document.createElement('label');label.textContent='Preview device';const device=document.createElement('select');device.setAttribute('aria-label','Preview device');for(const [key,title]of [['desktop','Desktop'],['tablet','Tablet · 768 px'],['phone','Phone · 375 px']])device.add(new Option(title,key));label.append(device);
  const reset=document.createElement('button');reset.type='button';reset.textContent='Restart preview';const close=document.createElement('button');close.type='button';close.textContent='Return to editing';
  const hint=document.createElement('p');hint.textContent='Preview uses a snapshot of your current edits. Practice progress stays in this preview and never changes the course.';
  const viewport=document.createElement('div');viewport.className='preview-viewport';const frame=document.createElement('iframe');frame.title='Learner course preview';frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms');frame.src='/player.html?preview=1';viewport.append(frame);
  const send=()=>frame.contentWindow?.postMessage({type:'openscroll:preview-project',project:snapshot,lessonId},location.origin);
  const ready=(event:MessageEvent)=>{if(event.source===frame.contentWindow && event.origin===location.origin && event.data?.type==='openscroll:preview-ready')send();};window.addEventListener('message',ready);
  device.addEventListener('change',()=>{viewport.dataset.device=device.value;});reset.addEventListener('click',send);close.addEventListener('click',()=>dialog?.close());
  bar.append(heading,label,reset,close);dialog.append(bar,hint,viewport);document.body.append(dialog);dialog.addEventListener('close',()=>{window.removeEventListener('message',ready);dialog?.remove();dialog=undefined;if(opener.isConnected)opener.focus();},{once:true});dialog.showModal();close.focus();
}
window.addEventListener('openscroll:account',()=>dialog?.close());
window.addEventListener('openscroll:signed-out',()=>dialog?.close());
export async function publishHtml(project:PortableProject,status:HTMLElement,button:HTMLButtonElement,format='html'){
  button.disabled=true;status.textContent=format==='html'?'Validating course and building the standalone HTML ZIP…':'Validating course and building the SCORM ZIP…';
  try{
    const response=await authorizedFetch('/api/projects/'+format,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(project),signal:AbortSignal.timeout(30000)});
    if(!response.ok){const data=await response.json();throw new Error(data.error ?? 'HTML export failed.');}
    const link=document.createElement('a'),url=URL.createObjectURL(await response.blob());link.href=url;link.download=`course-${format}.zip`;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
    status.textContent=format==='html'?'HTML ZIP prepared. Extract it and serve its folder from a static web server. Keep your editable project separately.':'SCORM ZIP prepared. Import the complete ZIP into your LMS. Test launch, score and resume there before distribution. SCORM 1.2 resume capacity is limited to 4096 characters.';
  }catch(error){status.textContent=error instanceof Error ? error.message : 'HTML export failed. Your course is unchanged.';}
  finally{button.disabled=false;}
}

let pdfDialog:HTMLDialogElement|undefined;
export function publishPdf(project:PortableProject,status:HTMLElement,opener:HTMLButtonElement){
 if(pdfDialog?.open)return;const snapshot=structuredClone(project),modal=document.createElement('dialog');pdfDialog=modal;modal.className='pdf-dialog';modal.setAttribute('aria-labelledby','pdf-export-title');
 const heading=document.createElement('h2');heading.id='pdf-export-title';heading.textContent='Export PDF';const hint=document.createElement('p');hint.textContent='All lessons and interactive panels become readable static content. Media uses transcripts. Companion files are not embedded.';
 const form=document.createElement('form'),label=document.createElement('label');label.textContent='Paper size';const paper=document.createElement('select');paper.setAttribute('aria-label','PDF paper size');paper.add(new Option('A4','A4'));paper.add(new Option('US Letter','Letter'));label.append(paper);
 const answerLabel=document.createElement('label'),answers=document.createElement('input');answers.type='checkbox';answerLabel.append(answers,document.createTextNode(' Include answer key and assessment feedback'));
 const result=document.createElement('p');result.setAttribute('role','status');const submit=document.createElement('button');submit.type='submit';submit.textContent='Download PDF';const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancel';cancel.addEventListener('click',()=>modal.close());
 const controller=new AbortController();let busy=false;
 form.addEventListener('submit',event=>{event.preventDefault();if(busy)return;busy=true;submit.disabled=true;paper.disabled=true;answers.disabled=true;result.textContent='Preparing all course content and generating the PDF…';status.textContent=result.textContent;
  void (async()=>{try{
   const response=await authorizedFetch('/api/projects/pdf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:snapshot,options:{paper:paper.value,includeAnswers:answers.checked}}),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(60000)])});
   if(!response.ok){const data=await response.json();throw new Error(data.error??'PDF export failed.');}
   const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');link.href=url;link.download=answers.checked?'course-with-answers.pdf':'course.pdf';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);status.textContent=answers.checked?'PDF prepared with answer key. Keep your editable project separately.':'Learner PDF prepared without an answer key. Keep your editable project separately.';modal.close();
  }catch(error){if(!controller.signal.aborted){result.textContent=error instanceof Error?error.message:'PDF export failed. Your course is unchanged.';status.textContent=result.textContent;}}finally{busy=false;submit.disabled=false;paper.disabled=false;answers.disabled=false;}})();
 });
 form.append(label,answerLabel,result,submit,cancel);modal.append(heading,hint,form);document.body.append(modal);modal.addEventListener('close',()=>{controller.abort();modal.remove();if(pdfDialog===modal)pdfDialog=undefined;if(opener.isConnected)opener.focus();},{once:true});modal.showModal();paper.focus();
}
window.addEventListener('openscroll:account',()=>pdfDialog?.close());window.addEventListener('openscroll:signed-out',()=>pdfDialog?.close());
