import type { Block } from './course.js';
/** Session-only block history. Assets are deliberately retained by the course. */
export class LessonHistory {
  private past:Block[][]=[];
  private future:Block[][]=[];
  private group:string|undefined;
  private time=0;
  constructor(private limit=50,private byteLimit=16*1024*1024){}
  get canUndo(){return this.past.length>0;}
  get canRedo(){return this.future.length>0;}
  record(before:Block[],after:Block[],group?:string,now=Date.now()) {
    if(JSON.stringify(before)===JSON.stringify(after))return;
    if(!group || group!==this.group || now-this.time>800)this.past.push(structuredClone(before));
    this.group=group;this.time=now;this.future=[];this.trim();
  }
  breakGroup(){this.group=undefined;}
  undo(current:Block[],apply?:(blocks:Block[])=>boolean):Block[]|undefined {
    const value=this.past.at(-1);if(!value || (apply && !apply(structuredClone(value))))return;this.past.pop();
    this.future.push(structuredClone(current));this.breakGroup();this.trim();return structuredClone(value);
  }
  redo(current:Block[],apply?:(blocks:Block[])=>boolean):Block[]|undefined {
    const value=this.future.at(-1);if(!value || (apply && !apply(structuredClone(value))))return;this.future.pop();
    this.past.push(structuredClone(current));this.breakGroup();this.trim();return structuredClone(value);
  }
  private trim(){
    while(this.past.length+this.future.length>this.limit || new TextEncoder().encode(JSON.stringify([this.past,this.future])).length>this.byteLimit){
      if(this.past.length)this.past.shift();else if(this.future.length)this.future.shift();else break;
    }
  }
}
