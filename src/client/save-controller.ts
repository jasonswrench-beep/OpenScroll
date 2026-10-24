import { parseCourse, type PortableProject, type CourseDocument } from '../shared/course.js';
export interface SavePayload {revision:number;mutationId:string;document:CourseDocument;files?:Record<string,string>;}
export interface SaveAck {revision:number;updatedAt:string;}
export type SaveState='saved'|'pending'|'saving'|'error'|'conflict';
interface Pending {generation:number;assetGeneration:number;payload:SavePayload;}
export interface RecoveryDraft {project:PortableProject;revision:number;generation:number;assetGeneration:number;savedAssetGeneration:number;pending?:Pending;}
interface Options {
  project:PortableProject;revision:number;delay?:number;
  send:(payload:SavePayload)=>Promise<SaveAck>;
  persist:(draft:RecoveryDraft|null)=>Promise<void>;
  changed:()=>void;
}
/** Serialize writes, retain exact requests on ambiguity, and never force a stale save. */
export class SaveController {
  project:PortableProject;
  revision:number;
  state:SaveState='saved';
  error='';
  recoveryWarning=false;
  private generation=0;
  private savedGeneration=0;
  private assetGeneration=0;
  private savedAssetGeneration=0;
  private pending:Pending|undefined;
  private timer:ReturnType<typeof setTimeout>|undefined;
  private draftTimer:ReturnType<typeof setTimeout>|undefined;
  private disposed=false;
  private inFlight=false;
  constructor(private options:Options) {this.project=structuredClone(options.project);this.revision=options.revision;}
  get dirty(){return this.generation!==this.savedGeneration || this.pending!==undefined;}
  edit(change:(project:PortableProject)=>void,assetsChanged=false) {
    if(this.disposed)return;
    const next={document:structuredClone(this.project.document),files:{...this.project.files}};
    change(next);next.document=parseCourse(next.document);this.project=next;this.generation++;
    if(assetsChanged)this.assetGeneration++;
    this.persistSoon();
    if(this.state!=='error' && this.state!=='conflict') {
      if(!this.inFlight)this.schedule();
    }
    this.options.changed();
  }
  private record():RecoveryDraft {return {project:structuredClone(this.project),revision:this.revision,generation:this.generation,assetGeneration:this.assetGeneration,savedAssetGeneration:this.savedAssetGeneration,...(this.pending ? {pending:structuredClone(this.pending)} : {})};}
  private persistSoon() {
    clearTimeout(this.draftTimer);this.draftTimer=setTimeout(()=>{void this.persistNow();},150);
  }
  private async persistNow() {
    clearTimeout(this.draftTimer);
    try {await this.options.persist(this.dirty ? this.record() : null);this.recoveryWarning=false;}
    catch {this.recoveryWarning=true;}
    if(!this.disposed)this.options.changed();
  }
  private schedule() {
    clearTimeout(this.timer);this.state='pending';
    this.timer=setTimeout(()=>{void this.save();},this.options.delay ?? 600);
  }
  async save() {
    if(this.disposed || this.inFlight || this.state==='conflict' || !this.dirty)return;
    clearTimeout(this.timer);this.inFlight=true;this.state='saving';this.error='';
    if(!this.pending)this.pending={generation:this.generation,assetGeneration:this.assetGeneration,payload:{revision:this.revision,mutationId:crypto.randomUUID(),document:structuredClone(this.project.document),...(this.assetGeneration>this.savedAssetGeneration ? {files:{...this.project.files}} : {})}};
    const flight=this.pending;
    this.options.changed();
    await this.persistNow();
    if(this.disposed){this.inFlight=false;return;}
    try {
      const ack=await this.options.send(flight.payload);
      if(this.disposed)return;
      this.revision=ack.revision;this.project.document.course.updatedAt=ack.updatedAt;
      this.savedGeneration=flight.generation;this.savedAssetGeneration=flight.assetGeneration;this.pending=undefined;
      this.state=this.dirty ? 'pending' : 'saved';
      await this.persistNow();
    } catch(error) {
      if(this.disposed)return;
      this.state=typeof error==='object' && error!==null && 'status' in error && error.status===409 ? 'conflict' : 'error';
      this.error=error instanceof Error ? error.message : 'The save could not be confirmed. Your edits remain here.';
      await this.persistNow();
    } finally {
      this.inFlight=false;
      if(!this.disposed){if(this.state==='pending')this.schedule();this.options.changed();}
    }
  }
  restore(draft:RecoveryDraft,conflict:boolean) {
    this.project=structuredClone(draft.project);this.project.document=parseCourse(this.project.document);
    this.revision=draft.revision;this.generation=draft.generation;this.savedGeneration=-1;
    this.assetGeneration=draft.assetGeneration;this.savedAssetGeneration=draft.savedAssetGeneration;
    this.pending=draft.pending;this.state=conflict ? 'conflict' : 'error';
    this.error=conflict ? 'The saved course changed since this draft. Download your edits or save a separate copy before reloading.' : 'Recovered edits are ready. Choose Retry save to continue.';
    this.options.changed();
  }
  dispose(){this.disposed=true;clearTimeout(this.timer);clearTimeout(this.draftTimer);}
  async keepDraft(){await this.persistNow();}
}
