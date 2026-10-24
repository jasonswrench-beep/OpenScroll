import type { Block } from './course.js';
/** Paths are supplied by our controls, never by document text; refuse prototype traversal. */
export function setBlockValue(block:Block,path:string,value:unknown){
 const keys=path.split('.');let object:unknown=block.content;
 for(const key of keys.slice(0,-1)){if(!object || typeof object!=='object' || !Object.hasOwn(object,key) || ['__proto__','prototype','constructor'].includes(key))throw new Error('The content field is no longer available.');object=(object as Record<string,unknown>)[key];}
 const key=keys.at(-1)!;if(!object || typeof object!=='object' || !Object.hasOwn(object,key) || ['__proto__','prototype','constructor'].includes(key))throw new Error('The content field is no longer available.');(object as Record<string,unknown>)[key]=value;
}
export function blockItems(block:Block,key='items'){return (block.content as unknown as Record<string,unknown>)[key] as Record<string,unknown>[];}
