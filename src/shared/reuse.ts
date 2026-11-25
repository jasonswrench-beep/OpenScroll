import { assetPath,parseCourse,eachBlock,relinkCheckpoints,type Block,type PortableProject,type CourseDocument } from './course.js';
import { renewIds } from './block-catalog.js';
import { newId } from './outline.js';
export type ReusableKind='template'|'group'|'asset';
export function blockAssetIds(block:Block):string[]{
 if(block.type==='columns')return block.content.columns.flatMap(column=>column.blocks.flatMap(blockAssetIds));
 if(block.type==='assessment')return block.content.image ? [block.content.image.assetId] : [];
 if(block.type==='software-practice')return block.content.steps.map(step=>step.imageId);
 if(block.type==='video' && block.content.describedAssetId)return [...(block.content.assetId ? [block.content.assetId] : []),block.content.describedAssetId];
 if(block.type==='image'||block.type==='image-text'||block.type==='labeled-graphic')return [block.content.assetId];
 if(block.type==='gallery')return block.content.items.map(item=>item.assetId);
 if((block.type==='audio'||block.type==='video'||block.type==='attachment') && block.content.assetId)return [block.content.assetId];return [];
}
export function remapBlockAssets(block:Block,ids:Map<string,string>){
 if(block.type==='columns')for(const column of block.content.columns)for(const child of column.blocks)remapBlockAssets(child,ids);
 if(block.type==='assessment' && block.content.image)block.content.image.assetId=ids.get(block.content.image.assetId)!;
 if(block.type==='software-practice')for(const step of block.content.steps)step.imageId=ids.get(step.imageId)!;
 if(block.type==='video' && block.content.describedAssetId)block.content.describedAssetId=ids.get(block.content.describedAssetId)!;
 if(block.type==='image'||block.type==='image-text'||block.type==='labeled-graphic')block.content.assetId=ids.get(block.content.assetId)!;
 if(block.type==='gallery')for(const image of block.content.items)image.assetId=ids.get(image.assetId)!;
 if((block.type==='audio'||block.type==='video'||block.type==='attachment') && block.content.assetId)block.content.assetId=ids.get(block.content.assetId)!;
}
/** Every asset the course document refers to: cover, author photo, lesson banners and blocks, including blocks in columns. */
export function documentAssetIds(document:CourseDocument):Set<string>{
 const used=new Set<string>(),course=document.course;if(course.cover)used.add(course.cover.assetId);if(course.authorImage)used.add(course.authorImage.assetId);
 for(const lesson of course.sections.flatMap(s=>s.lessons)){if(lesson.banner?.assetId)used.add(lesson.banner.assetId);for(const block of lesson.blocks)for(const id of blockAssetIds(block))used.add(id);}
 return used;
}
/** Points every asset reference in the course at its new identifier. */
export function remapDocumentAssets(course:CourseDocument['course'],ids:Map<string,string>){
 if(course.cover)course.cover.assetId=ids.get(course.cover.assetId)!;if(course.authorImage)course.authorImage.assetId=ids.get(course.authorImage.assetId)!;
 for(const lesson of course.sections.flatMap(s=>s.lessons)){if(lesson.banner?.assetId)lesson.banner.assetId=ids.get(lesson.banner.assetId)!;for(const block of lesson.blocks)remapBlockAssets(block,ids);}
}
export function compactProject(source:PortableProject):PortableProject{
 const document=structuredClone(source.document),used=documentAssetIds(document);
 document.assets=document.assets.filter(asset=>used.has(asset.id));return {document:parseCourse(document),files:Object.fromEntries(document.assets.map(asset=>[assetPath(asset),source.files[assetPath(asset)]!]))};
}
export function groupPacket(source:PortableProject,ids:string[]):PortableProject{
 const wanted=new Set(ids),blocks=source.document.course.sections.flatMap(s=>s.lessons).flatMap(l=>l.blocks).filter(b=>wanted.has(b.id));
 if(!blocks.length || blocks.length!==wanted.size)throw new Error('Choose existing blocks to save as a group.');
 const project=structuredClone(source);project.document.course.cover=null;project.document.course.sections=[{id:newId(),title:'Reusable group',lessons:[{id:newId(),title:'Reusable blocks',blocks:structuredClone(blocks),banner:null,objectives:[]}]}];return compactProject(project);
}
export function assetPacket(source:PortableProject,id:string):PortableProject{
 const asset=source.document.assets.find(a=>a.id===id);if(!asset)throw new Error('Asset not found.');const document=structuredClone(source.document);document.course.cover=null;document.course.sections=[];document.assets=[structuredClone(asset)];return {document:parseCourse(document),files:{[assetPath(asset)]:source.files[assetPath(asset)]!}};
}
/** Existing target assets can be reused only when metadata AND exact bytes agree. */
export function importAssets(target:PortableProject,source:PortableProject){
 const ids=new Map<string,string>();for(const asset of source.document.assets){const data=source.files[assetPath(asset)];if(!data)throw new Error('Reusable asset bytes are missing.');const existing=target.document.assets.find(a=>a.mediaType===asset.mediaType && a.sha256===asset.sha256 && a.byteLength===asset.byteLength && target.files[assetPath(a)]===data);
 if(existing){ids.set(asset.id,existing.id);continue;}const copy={...asset,id:newId()};target.document.assets.push(copy);target.files[assetPath(copy)]=data;ids.set(asset.id,copy.id);}return ids;
}
export function insertGroup(target:PortableProject,lessonId:string,source:PortableProject,index?:number){
 const lesson=target.document.course.sections.flatMap(s=>s.lessons).find(l=>l.id===lessonId);if(!lesson)throw new Error('Open a lesson before inserting reusable content.');const links=new Map<string,string>(),ids=importAssets(target,source),blocks=source.document.course.sections.flatMap(s=>s.lessons).flatMap(l=>l.blocks).map(block=>{const copy=renewIds(structuredClone(block));links.set(block.id,copy.id);remapBlockAssets(copy,ids);return copy;});relinkCheckpoints(blocks,links);
 lesson.blocks.splice(index??lesson.blocks.length,0,...blocks);return blocks.map(b=>b.id);
}
export function templateCopy(source:PortableProject,title=source.document.course.title,author=source.document.course.author):PortableProject{
 const project:PortableProject={document:structuredClone(source.document),files:{}},ids=new Map<string,string>();project.document.assets=[];
 for(const [old,id]of importAssets(project,source))ids.set(old,id);
 const course=project.document.course;course.id=newId();course.title=title;course.author=author;course.createdAt=course.updatedAt=new Date().toISOString();remapDocumentAssets(course,ids);
 for(const section of course.sections){section.id=newId();for(const lesson of section.lessons){lesson.id=newId();for(const objective of lesson.objectives)objective.id=newId();const links=new Map<string,string>();for(const block of lesson.blocks){const old=block.id;renewIds(block);links.set(old,block.id);}relinkCheckpoints(lesson.blocks,links);}}project.document=parseCourse(project.document);return project;
}
/** Restore content while retaining current asset bytes needed by session undo. */
export function restoredProject(current:PortableProject,snapshot:PortableProject):PortableProject{
 const project=structuredClone(current),ids=importAssets(project,snapshot),course=structuredClone(snapshot.document.course);course.id=current.document.course.id;course.createdAt=current.document.course.createdAt;course.updatedAt=new Date().toISOString();
 remapDocumentAssets(course,ids);const used=new Set([course.id,...project.document.assets.map(a=>a.id)]);const unique=(id:string)=>{const next=used.has(id)?newId():id;used.add(next);return next;};for(const section of course.sections){section.id=unique(section.id);for(const lesson of section.lessons){lesson.id=unique(lesson.id);for(const objective of lesson.objectives)objective.id=unique(objective.id);const links=new Map<string,string>();for(const block of eachBlock(lesson.blocks)){const old=block.id;block.id=unique(block.id);links.set(old,block.id);if(block.type==='objectives')for(const item of block.content.items)item.id=unique(item.id);}relinkCheckpoints(lesson.blocks,links);}}project.document.course=course;project.document=parseCourse(project.document);assertProjectBudget(project);return project;
}
export type CourseTheme=CourseDocument['course']['theme'];

export function assertProjectBudget(project:PortableProject){const bytes=new TextEncoder().encode(JSON.stringify(project.document,null,2)+'\n').length;if(bytes>2*1024*1024)throw new Error('The course document would exceed 2 MiB. Split the content into another course.');if(bytes+project.document.assets.reduce((n,a)=>n+a.byteLength,0)>64*1024*1024)throw new Error('The course would exceed 64 MiB with retained assets. Download a copy or use a new course so retained assets stay safe.');}
