import { ThemeControls } from './theme-controls.js';
import { previewCourse,publishHtml,publishPdf } from './publishing.js';
import { api, account, authorizedFetch } from './account-api.js';
import { parseCourse, type PortableProject } from '../shared/course.js';
const openSample = document.querySelector<HTMLButtonElement>('#open-sample')!;
const downloadSample=document.querySelector<HTMLButtonElement>('#download-sample')!;
const fileInput = document.querySelector<HTMLInputElement>('#project-file')!;
const details = document.querySelector<HTMLDivElement>('#project-details')!;
const title = document.querySelector<HTMLInputElement>('#course-title')!;
const summary = document.querySelector<HTMLParagraphElement>('#project-summary')!;
const outline = document.querySelector<HTMLOListElement>('#project-outline')!;
const status = document.querySelector<HTMLParagraphElement>('#project-status')!;
const download = document.querySelector<HTMLButtonElement>('#download-project')!;
let project: PortableProject | undefined;
let dirty = false;
const saveLibrary=document.querySelector<HTMLButtonElement>('#save-library')!;
let privateProject=false;
function setBusy(value: boolean) {
  for (const control of [openSample,downloadSample,fileInput,title,download,saveLibrary]) control.disabled=value;
  details.setAttribute('aria-busy',String(value));
}
async function responseError(response: Response): Promise<never> {
  const body: unknown = await response.json().catch(() => null);
  throw new Error(body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : 'The project request failed. Please try again.');
}
function showProject(data:PortableProject,fromLibrary:boolean) {
  const courseDocument = parseCourse(data.document);
  if (!data.files || typeof data.files !== 'object') throw new Error('The service returned an invalid project.');
  project = { document: courseDocument, files:data.files };
  title.value=courseDocument.course.title;
  const lessons=courseDocument.course.sections.flatMap(section => section.lessons);
  summary.textContent=`${courseDocument.course.sections.length} sections · ${lessons.length} lessons · ${lessons.reduce((n,lesson) => n+lesson.blocks.length,0)} blocks · ${courseDocument.assets.length} assets`;
  outline.replaceChildren();
  for (const section of courseDocument.course.sections) {
    const item=document.createElement('li'); item.textContent=section.title || 'Untitled section';
    const list=document.createElement('ol');
    for (const lesson of section.lessons) { const row=document.createElement('li'); row.textContent=lesson.title || 'Untitled lesson'; list.append(row); }
    item.append(list); outline.append(item);
  }
  themeControls.update();details.hidden=false; dirty=false;
  status.textContent=fromLibrary ? 'Library course opened. Title edits here stay in this tab; save a copy or download to keep them.' : 'Project opened. Download it to keep changes, or sign in to save a copy to your library.';
  setBusy(false); title.focus();
  privateProject=fromLibrary;
}
async function openProject(file: Blob) {
  if (file.size > 32 * 1024 * 1024) { status.textContent='Choose a project no larger than 32 MiB. Your current project is unchanged.'; return; }
  if (dirty && !window.confirm('Replace the current project? Download it first if you want to keep your changes.')) { fileInput.value=''; return; }
  setBusy(true); status.textContent='Opening and checking the project…';
  try {
    const response=await authorizedFetch('/api/projects/import',{method:'POST',headers:{'Content-Type':'application/x-openscroll-project'},body:file,signal:AbortSignal.timeout(30_000)});
    if (!response.ok) await responseError(response);
    const data = await response.json() as PortableProject;
    showProject(data,false);
  } catch (error) {
    status.textContent=`${error instanceof Error ? error.message : 'The project could not be opened.'} Your current project is unchanged.`;
  } finally { setBusy(false); fileInput.value=''; }
}
openSample.addEventListener('click', async () => {
  setBusy(true);
  try {
    const response=await authorizedFetch('/api/projects/sample',{signal:AbortSignal.timeout(30_000)});
    if (!response.ok) await responseError(response);
    await openProject(await response.blob());
  } catch { status.textContent='The starter course is unavailable. Try again.'; }
  finally { setBusy(false); }
});
fileInput.addEventListener('change', () => { const file=fileInput.files?.[0]; if (file) void openProject(file); });
downloadSample.addEventListener('click',async()=>{
  setBusy(true);status.textContent='Preparing the starter project…';
  try{
    const response=await authorizedFetch('/api/projects/sample',{signal:AbortSignal.timeout(30_000)});
    if(!response.ok)await responseError(response);
    const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');
    link.href=url;link.download='welcome.openscroll';link.click();setTimeout(()=>URL.revokeObjectURL(url),60_000);
    status.textContent='Starter project download prepared.';
  }catch(error){status.textContent=error instanceof Error?error.message:'The starter project could not be downloaded.';}
  finally{setBusy(false);}
});
title.addEventListener('input', () => {
  if (!project) return;
  project.document.course.title=title.value;
  project.document.course.updatedAt=new Date().toISOString(); dirty=true;
  status.textContent='Title changed in this tab. Download the project to keep your changes.';
});
download.addEventListener('click', async () => {
  if (!project) return;
  setBusy(true); status.textContent='Preparing the editable project…';
  try {
    const response=await authorizedFetch('/api/projects/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(project),signal:AbortSignal.timeout(30_000)});
    if (!response.ok) await responseError(response);
    const url=URL.createObjectURL(await response.blob());
    const link=document.createElement('a'); link.href=url; link.download='course.openscroll'; link.click();
    setTimeout(() => URL.revokeObjectURL(url),60_000);
    dirty=false; status.textContent='Download prepared. Save the .openscroll file to keep your work.';
  } catch (error) { status.textContent=error instanceof Error ? error.message : 'Download failed. Your project is still open.'; }
  finally { setBusy(false); }
});
window.addEventListener('beforeunload', event => { if (dirty) event.preventDefault(); });

window.addEventListener('openscroll:open-project',event => {
  if (dirty && !confirm('Replace the current project? Download it first to keep your changes.')) return;
  try {showProject((event as CustomEvent<PortableProject>).detail,true);document.querySelector('#workspace-title')!.scrollIntoView();}catch{status.textContent='The library project could not be opened.';}
});
window.addEventListener('openscroll:before-signout',event => {
  if (dirty && !confirm('Sign out and close this project? Download it first to keep unsaved changes.')) event.preventDefault();
});
window.addEventListener('openscroll:account',() => {
  saveLibrary.hidden=!account;
  if (!account && privateProject) {project=undefined;dirty=false;privateProject=false;details.hidden=true;title.value='';outline.replaceChildren();status.textContent='Sign in again to open your library courses.';}
});
saveLibrary.addEventListener('click',async () => {
  if (!project || !account) return;
  setBusy(true);
  try {
    await api('/api/library/courses/import','POST',project);
    dirty=false;status.textContent='A new copy was saved to your private library.';
    window.dispatchEvent(new Event('openscroll:library-refresh'));
  }catch(error){status.textContent=error instanceof Error ? error.message : 'The course could not be saved. Your project is still open.';}
  finally{setBusy(false);}
});

window.addEventListener('openscroll:signed-out',() => {project=undefined;dirty=false;privateProject=false;details.hidden=true;title.value='';outline.replaceChildren();status.textContent='Project closed after sign-out. Downloaded files are unchanged.';});

document.querySelector('#project-preview')!.addEventListener('click',event=>{if(project)previewCourse(project,event.currentTarget as HTMLElement);});
document.querySelector('#project-html')!.addEventListener('click',event=>{if(project)void publishHtml(project,status,event.currentTarget as HTMLButtonElement);});

for(const format of ['scorm-12','scorm-2004'])document.querySelector('#project-'+format)!.addEventListener('click',event=>{if(project)void publishHtml(project,status,event.currentTarget as HTMLButtonElement,format);});

document.querySelector('#project-pdf')!.addEventListener('click',event=>{if(project)publishPdf(project,status,event.currentTarget as HTMLButtonElement);});

const themeControls=new ThemeControls(document.querySelector<HTMLElement>('#project-theme')!,()=>project,theme=>{if(project){project.document.course.theme=theme;project.document.course.updatedAt=new Date().toISOString();dirty=true;status.textContent='Theme changed in this tab. Download the project to keep your changes.';}});
