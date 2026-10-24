import type { CourseDocument } from '../shared/course.js';
import { CourseFlow,type LearnerSnapshot } from './state.js';
export type Edition='1.2'|'2004';
type Api=Record<string,unknown>;
export function discoverAPI(start:Window,edition:Edition):Api{
 const seen=new Set<Window>(),queue=[start];
 while(queue.length && seen.size<128){const candidate=queue.shift()!;if(seen.has(candidate))continue;seen.add(candidate);try{const api=(candidate as unknown as Record<string,unknown>)[edition==='1.2'?'API':'API_1484_11'];if(api && (typeof api==='object'||typeof api==='function') && ['Initialize','GetValue','SetValue','Commit',edition==='1.2'?'Finish':'Terminate','GetLastError'].every(name=>typeof (api as Api)[edition==='1.2'?'LMS'+name:name]==='function'))return api as Api;}catch{/* A cross-origin ancestor is inaccessible. */}try{if(candidate.parent!==candidate)queue.push(candidate.parent);}catch{}try{if(candidate.opener)queue.push(candidate.opener);}catch{}}
 throw new Error('The LMS API is unavailable. Launch this package through your LMS and retry.');
}
export function encodeResume(document:CourseDocument,state:LearnerSnapshot,fingerprint:string,edition:Edition){
 const lessons=document.course.sections.flatMap(s=>s.lessons),blocks=lessons.flatMap(l=>l.blocks),ids=blocks.map(b=>b.id),lessonIds=lessons.map(l=>l.id);
 const compact=[2,lessonIds.indexOf(state.lessonId),state.reviewed.map(id=>ids.indexOf(id)),state.released.map(id=>ids.indexOf(id)),state.completed.map(id=>lessonIds.indexOf(id)),Object.entries(state.assessments).map(([id,r])=>[ids.indexOf(id),r]),Object.entries(state.visits).map(([id,v])=>[ids.indexOf(id),v])];
 const bytes=new TextEncoder().encode(JSON.stringify(compact));let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);const result=`OS1:${fingerprint}:${btoa(binary)}`;
 if(result.length>(edition==='1.2'?4096:64000))throw new Error(`Progress exceeds the SCORM ${edition} resume capacity. Keep this page open and download recovery progress. Use SCORM 2004 for larger courses.`);return result;
}
export function decodeResume(document:CourseDocument,raw:string,fingerprint:string,edition:Edition):LearnerSnapshot{
 try{
 if(raw.length>(edition==='1.2'?4096:64000) || !raw.startsWith(`OS1:${fingerprint}:`))throw new Error();const encoded=raw.slice(69);if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded))throw new Error();const binary=atob(encoded);if(btoa(binary)!==encoded)throw new Error();const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(binary,c=>c.charCodeAt(0))));
 const lessons=document.course.sections.flatMap(s=>s.lessons),blocks=lessons.flatMap(l=>l.blocks);
 const index=(n:unknown,list:{id:string}[])=>{if(!Number.isInteger(n) || (n as number)<0 || (n as number)>=list.length)throw new Error();return list[n as number]!.id;};
 const ids=(v:unknown,list:{id:string}[])=>{if(!Array.isArray(v))throw new Error();const result=v.map(n=>index(n,list));if(new Set(result).size!==result.length)throw new Error();return result;};
 const entries=(v:unknown)=>{if(!Array.isArray(v))throw new Error();const pairs=v.map(pair=>{if(!Array.isArray(pair)||pair.length!==2)throw new Error();return [index(pair[0],blocks),pair[1]] as const;});if(new Set(pairs.map(p=>p[0])).size!==pairs.length)throw new Error();return Object.fromEntries(pairs);};
 if(!Array.isArray(value)||value.length!==7||value[0]!==2)throw new Error();const state:LearnerSnapshot={version:2,lessonId:index(value[1],lessons),reviewed:ids(value[2],blocks),released:ids(value[3],blocks),completed:ids(value[4],lessons),assessments:entries(value[5]),visits:entries(value[6])};
 const flow=new CourseFlow(document);flow.restore(state);const canonical=(s:LearnerSnapshot)=>JSON.stringify({...s,reviewed:[...s.reviewed].sort(),released:[...s.released].sort(),completed:[...s.completed].sort(),assessments:Object.fromEntries(Object.entries(s.assessments).sort()),visits:Object.fromEntries(Object.entries(s.visits).sort().map(([id,v])=>[id,[...v].sort((a,b)=>a-b)]))});if(canonical(flow.snapshot())!==canonical(state))throw new Error();return state;
 }catch{throw new Error('The LMS checkpoint is invalid or belongs to a different publication. It has not been overwritten. Ask your LMS administrator to start a new attempt.');}
}
export function sessionTime(seconds:number,edition:Edition){const centis=Math.min(3599999999,Math.max(0,Math.floor(seconds*100))),hours=Math.floor(centis/360000),minutes=Math.floor(centis/6000)%60,s=(centis%6000)/100;return edition==='1.2'?`${String(hours).padStart(4,'0')}:${String(minutes).padStart(2,'0')}:${s.toFixed(2).padStart(5,'0')}`:`PT${hours}H${minutes}M${s.toFixed(2)}S`;}
export class ScormSession{
 private active=false;private ready=false;private started=0;private latest:LearnerSnapshot;readonly flow:CourseFlow;readonly readOnly:boolean;readonly restored:LearnerSnapshot|undefined;
 constructor(private api:Api,readonly edition:Edition,private document:CourseDocument,readonly fingerprint:string,private now=()=>performance.now()){
  this.flow=new CourseFlow(document);this.latest=this.flow.snapshot();this.call('Initialize','');this.active=true;this.started=this.now();
  try{const mode=this.get(edition==='1.2'?'core.lesson_mode':'mode');this.readOnly=mode==='review'||mode==='browse';const entry=this.get(edition==='1.2'?'core.entry':'entry');const raw=this.get('suspend_data');if(raw && (this.readOnly || entry!=='ab-initio')){this.restored=decodeResume(document,raw,fingerprint,edition);this.flow.restore(this.restored);}this.latest=this.flow.snapshot();this.ready=true;}catch(error){try{this.terminate();}catch{/* Preserve the original read failure. */}throw error;}
 }
 private name(name:string){return this.edition==='1.2'?'LMS'+name:name;}
 private invoke(name:string,...args:string[]){const fn=this.api[this.name(name)];if(typeof fn!=='function')throw new Error('The LMS API is incomplete.');try{return fn.apply(this.api,args);}catch{throw new Error('The LMS connection failed. Keep this page open and retry saving.');}}
 private call(name:string,...args:string[]){const result=this.invoke(name,...args);if((result!==true && result!=='true') || String(this.invoke('GetLastError'))!=='0')throw new Error(`LMS ${name} failed. Keep this page open and retry.`);}
 private get(name:string){
  const result=this.invoke('GetValue','cmi.'+name),code=String(this.invoke('GetLastError'));
  // SCORM 2004 reports 403 for a supported value that has not been set yet.
  // An empty, uninitialized checkpoint is a fresh session, not a failed read.
  if(this.edition==='2004' && name==='suspend_data' && result==='' && code==='403')return '';
  if(typeof result!=='string'||code!=='0')throw new Error(`The LMS could not read cmi.${name} (error ${/^\d{1,6}$/.test(code)?code:'unknown'}). The checkpoint has not been overwritten.`);return result;
 }

 update(state:LearnerSnapshot){this.latest=structuredClone(state);}
 recovery(){return JSON.stringify({format:'openscroll-learner-recovery',fingerprint:this.fingerprint,state:this.latest},null,2);}
 save(){
  if(!this.active||!this.ready)throw new Error('The LMS session has ended. Relaunch from your LMS.');if(this.readOnly)return;
  const checkpoint=encodeResume(this.document,this.latest,this.fingerprint,this.edition);this.flow.restore(this.latest);const score=this.flow.score,progress=this.flow.progress,complete=progress.done===progress.total;
  const values:Record<string,string>={suspend_data:checkpoint};const modern=this.edition==='2004',prefix=modern?'':'core.';
  values[prefix+(modern?'location':'lesson_location')]=this.flow.lessonId;
  if(score.possible){values[prefix+'score.min']='0';values[prefix+'score.max']='100';values[prefix+'score.raw']=(score.earned/score.possible*100).toFixed(7);if(modern)values['score.scaled']=(score.earned/score.possible).toFixed(7);}
  if(modern){values.completion_status=complete?'completed':'incomplete';values.success_status=score.status==='passed'||score.status==='failed'?score.status:'unknown';values.progress_measure=(progress.total?progress.done/progress.total:0).toFixed(7);}else values['core.lesson_status']=!complete?'incomplete':score.status==='passed'||score.status==='failed'?score.status:'completed';
  values[prefix+'session_time']=sessionTime((this.now()-this.started)/1000,this.edition);values[prefix+'exit']=complete && (score.status==='passed'||score.status==='not-assessed')?(modern?'normal':''):'suspend';
  for(const [name,value]of Object.entries(values))this.call('SetValue','cmi.'+name,value);this.call('Commit','');
 }
 terminate(){if(!this.active)return;this.call(this.edition==='1.2'?'Finish':'Terminate','');this.active=false;}
 finish(){if(!this.active)return;this.save();this.terminate();}
}
