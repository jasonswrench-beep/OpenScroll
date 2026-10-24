import { parseCourse, type CourseDocument } from './course.js';
export type Section=CourseDocument['course']['sections'][number];
export type Lesson=Section['lessons'][number];
export function newId() { return `item-${crypto.randomUUID()}`; }
export function newSection():Section {return {id:newId(),title:'Untitled section',lessons:[]};}
export function newLesson():Lesson {return {id:newId(),title:'Untitled lesson',blocks:[]};}
export function copyLesson(source:Lesson):Lesson {
  const copy=structuredClone(source);copy.id=newId();copy.title=`Copy of ${source.title}`.slice(0,300);
  for(const block of copy.blocks)block.id=newId();
  return copy;
}
export function copySection(source:Section):Section {
  return {id:newId(),title:`Copy of ${source.title}`.slice(0,300),lessons:source.lessons.map(lesson => {const copy=copyLesson(lesson);copy.title=lesson.title;return copy;})};
}
export function moveItem<T>(items:T[],index:number,delta:-1|1) {
  const target=index+delta;
  if(index<0 || index>=items.length || target<0 || target>=items.length)return;
  [items[index],items[target]]=[items[target]!,items[index]!];
}
export function moveLesson(document:CourseDocument,lessonId:string,targetSectionId:string) {
  const from=document.course.sections.find(section => section.lessons.some(lesson => lesson.id===lessonId));
  const to=document.course.sections.find(section => section.id===targetSectionId);
  if(!from || !to || from===to)return;
  const index=from.lessons.findIndex(lesson=>lesson.id===lessonId);
  to.lessons.push(from.lessons.splice(index,1)[0]!);
}
export function changeOutline(source:CourseDocument,change:(document:CourseDocument)=>void):CourseDocument {
  const draft=structuredClone(source);change(draft);return parseCourse(draft);
}
