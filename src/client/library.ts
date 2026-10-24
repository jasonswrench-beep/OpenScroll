import { chooseCourseTemplate,action as reuseAction } from './reusable-content.js';
import { api, account, type Account } from './account-api.js';
import type { PortableProject } from '../shared/course.js';
const panel=document.querySelector<HTMLElement>('#library-panel')!;
const list=document.querySelector<HTMLElement>('#course-list')!;
const status=document.querySelector<HTMLElement>('#library-status')!;
const search=document.querySelector<HTMLInputElement>('#course-search')!;
const sort=document.querySelector<HTMLSelectElement>('#course-sort')!;
let generation=0;
interface Course {id:string;revision:number;title:string;updated_at:string;sections:number;}
function fail(error:unknown) {status.textContent=error instanceof Error ? error.message : 'The course request failed.';}
async function refresh() {
  const current=++generation;
  if (!account) {list.replaceChildren();return;}
  status.textContent='Loading your courses…';
  try {
    const result=await api<{courses:Course[]}>(`/api/library/courses?search=${encodeURIComponent(search.value)}&sort=${sort.value}`);
    if (current !== generation || !account) return;
    list.replaceChildren();
    for (const course of result.courses) {
      const item=document.createElement('li');item.className='course-card';
      const heading=document.createElement('h3');heading.textContent=course.title || 'Untitled course';item.append(heading);
      const updated=document.createElement('p');updated.textContent=`Updated ${new Date(course.updated_at).toLocaleString()}`;item.append(updated);
      const actions=document.createElement('div');actions.className='course-actions';
      function action(label:string,handler:() => Promise<void>|void) {
        const button=document.createElement('button');button.type='button';button.textContent=label;button.setAttribute('aria-label',`${label}: ${course.title || 'Untitled course'}`);
        button.addEventListener('click',async () => {button.disabled=true;try {await handler();}catch(error){fail(error);}finally{button.disabled=false;}});
        actions.append(button);
      }
      action('Open',async () => {
        const owner=account?.id;
        if (!owner) return;
        window.dispatchEvent(new CustomEvent('openscroll:edit-course',{detail:{id:course.id,owner}}));
      });
      const rename=document.createElement('form');rename.hidden=true;
      const label=document.createElement('label');label.textContent='New course title';label.htmlFor=`rename-${course.id}`;
      const input=document.createElement('input');input.id=label.htmlFor;input.value=course.title;input.required=true;input.maxLength=300;
      const save=document.createElement('button');save.textContent='Save title';save.type='submit';
      const cancel=document.createElement('button');cancel.textContent='Cancel rename';cancel.type='button';cancel.addEventListener('click',() => {rename.hidden=true;});
      rename.append(label,input,save,cancel);
      rename.addEventListener('submit',async event => {
        event.preventDefault();save.disabled=true;
        try {await api(`/api/library/courses/${course.id}`,'PATCH',{title:input.value,revision:course.revision});await refresh();status.textContent='Course renamed.';document.querySelector<HTMLElement>('#library-title')!.focus();}catch(error){fail(error);}finally{save.disabled=false;}
      });
      action('Rename',() => {rename.hidden=false;input.focus();});
      action('Duplicate',async () => {await api(`/api/library/courses/${course.id}/duplicate`,'POST');await refresh();status.textContent='Independent course copy created.';document.querySelector<HTMLElement>('#library-title')!.focus();});
      action('Delete',async () => {
        if (!confirm(`Permanently delete “${course.title}” and its stored assets and snapshots? Download a project copy first if you want to keep it.`)) return;
        await api(`/api/library/courses/${course.id}`,'DELETE',{revision:course.revision});await refresh();status.textContent='Course permanently deleted.';document.querySelector<HTMLElement>('#library-title')!.focus();
      });
      item.append(actions,rename);list.append(item);
    }
    status.textContent=result.courses.length ? `${result.courses.length} ${result.courses.length === 1 ? 'course' : 'courses'} shown.` : 'No courses found. Create one or save an open project to your library.';
  }catch(error){if(current===generation)fail(error);}
}
window.addEventListener('openscroll:account',event => {
  const next=(event as CustomEvent<Account|null>).detail;panel.hidden=!next;
  if(!next){generation++;list.replaceChildren();}else{void refresh();}
});
window.addEventListener('openscroll:library-refresh',() => {void refresh();});
document.querySelector<HTMLFormElement>('#library-filter')!.addEventListener('submit',event => {event.preventDefault();void refresh();});
sort.addEventListener('change',() => {void refresh();});
const view=document.querySelector<HTMLButtonElement>('#library-view')!;
view.addEventListener('click',() => {
  const listView=list.classList.toggle('list-view');view.textContent=listView ? 'Use grid view' : 'Use list view';view.setAttribute('aria-pressed',String(listView));
});
document.querySelector<HTMLFormElement>('#create-course')!.addEventListener('submit',async event => {
  event.preventDefault();const form=event.currentTarget as HTMLFormElement;const button=form.querySelector('button')!;button.disabled=true;
  try {await api('/api/library/courses','POST',{title:new FormData(form).get('title')});form.reset();search.value='';await refresh();status.textContent='Course created.';}catch(error){fail(error);}finally{button.disabled=false;}
});

document.querySelector('#library-refresh')!.addEventListener('click',()=>{void refresh();});

const templates=reuseAction('Start from a course template',()=>chooseCourseTemplate(templates));document.querySelector('#create-course')!.after(templates);
