import { discoverAPI,ScormSession } from './scorm.js';
import '../shared/blocks.css';
import './style.css';
import { assetPath,parseCourse,type PortableProject } from '../shared/course.js';
import { CoursePlayer } from './player.js';
const root=document.querySelector<HTMLElement>('#player')!;
const preview=new URLSearchParams(location.search).get('preview')==='1' && parent!==window;
let player:CoursePlayer|undefined;
function fail(message:string){root.replaceChildren();const error=document.createElement('p');error.setAttribute('role','alert');error.textContent=message;root.append(error);}
if(preview){
  window.addEventListener('message',event=>{
    if(event.source!==parent || event.origin!==location.origin || !event.data || event.data.type!=='openscroll:preview-project')return;
    try{const project:PortableProject={document:parseCourse(event.data.project.document),files:structuredClone(event.data.project.files)};player=new CoursePlayer(root,project,{preview:true});if(event.data.lessonId)player.flow.enter(event.data.lessonId);if(event.data.lessonId){const state=player.flow.snapshot();player=new CoursePlayer(root,project,{preview:true,restored:state});}}
    catch{fail('The preview could not open this course. Return to the editor and check the project.');}
  });
  parent.postMessage({type:'openscroll:preview-ready'},location.origin);
}else{
  void (async()=>{
    try{
      const [courseResponse,publicationResponse]=await Promise.all([fetch('./course.json'),fetch('./publication.json')]);if(!courseResponse.ok || !publicationResponse.ok)throw new Error();
      const document=parseCourse(await courseResponse.json());const publication=await publicationResponse.json();if(!['openscroll-html','openscroll-scorm'].includes(publication.format) || publication.version!==1 || !/^[a-f0-9]{64}$/.test(publication.fingerprint))throw new Error();
      if(publication.format==='openscroll-scorm'){
        if(!['1.2','2004'].includes(publication.edition))throw new Error();
        const controls=window.document.createElement('section'),status=window.document.createElement('p');status.setAttribute('role','status');controls.setAttribute('aria-label','LMS tracking');controls.className='player-lms-controls';controls.append(status);root.before(controls);
        let session:ScormSession|undefined,timer:ReturnType<typeof setTimeout>|undefined,heartbeat:ReturnType<typeof setInterval>|undefined,failed=false,ended=false;
        const report=(error:unknown)=>{failed=true;status.textContent=error instanceof Error?error.message:'LMS tracking failed.';};
        const save=()=>{if(!session||ended)return;try{session.save();failed=false;status.textContent=session.readOnly?'LMS review mode: progress is not saved.':'Progress saved to LMS.';}catch(error){report(error);}};
        const button=(label:string,action:()=>void)=>{const b=window.document.createElement('button');b.type='button';b.textContent=label;b.addEventListener('click',action);controls.append(b);return b;};
        const launch=()=>{try{session=new ScormSession(discoverAPI(window,publication.edition),publication.edition,document,publication.fingerprint);player=new CoursePlayer(root,{document,files:{}},{restored:session.restored,assetURL:id=>assetPath(document.assets.find(a=>a.id===id)!),changed:state=>{session!.update(state);clearTimeout(timer);timer=setTimeout(save,400);}});retry.hidden=true;saveButton.disabled=false;recoveryButton.disabled=false;exitButton.disabled=false;save();heartbeat=setInterval(save,30000);}catch(error){report(error);fail('Course launch stopped. '+(error instanceof Error?error.message:'The LMS connection could not be established.'));saveButton.disabled=true;recoveryButton.disabled=true;exitButton.disabled=true;}};
        const retry=button('Retry LMS connection',launch);const saveButton=button('Save LMS progress',save);
        const recoveryButton=button('Download recovery progress',()=>{if(!session)return;const url=URL.createObjectURL(new Blob([session.recovery()],{type:'application/json'})),a=window.document.createElement('a');a.href=url;a.download='learner-progress-recovery.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
        const exitButton=button('Exit course',()=>{if(!session)return;try{session.finish();ended=true;clearTimeout(timer);clearInterval(heartbeat);root.inert=true;controls.querySelectorAll('button').forEach(b=>b.disabled=true);failed=false;status.textContent='LMS session ended. You may close this window.';}catch(error){report(error);}});
        window.document.addEventListener('visibilitychange',()=>{if(window.document.hidden)save();});window.addEventListener('beforeunload',event=>{if(failed){event.preventDefault();event.returnValue='';}});window.addEventListener('pagehide',()=>{clearTimeout(timer);clearInterval(heartbeat);try{session?.finish();}catch(error){report(error);}});window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});launch();return;
      }
      const key=`openscroll-player:v1:${publication.fingerprint}`;let restored:unknown,storageWarning='';try{const raw=localStorage.getItem(key);if(raw && raw.length<=4*1024*1024)restored=JSON.parse(raw);}catch{storageWarning='Browser progress storage is unavailable. Progress lasts only while this page stays open.';}
      player=new CoursePlayer(root,{document,files:{}},{restored,storageWarning,assetURL:id=>assetPath(document.assets.find(a=>a.id===id)!),changed:state=>localStorage.setItem(key,JSON.stringify(state))});
    }catch{fail('This course could not be loaded. Serve the complete extracted HTML package from a static web server and try again.');}
  })();
}
