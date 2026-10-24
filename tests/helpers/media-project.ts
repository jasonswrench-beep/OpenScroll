import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { sampleProject } from '../../src/project/sample.js';
import { prepareBlock,BLOCK_TEMPLATES } from '../../src/shared/block-catalog.js';
import { type Asset,type PortableProject,assetPath } from '../../src/shared/course.js';
export async function mediaProject():Promise<PortableProject>{
 const project=sampleProject(),lesson=project.document.course.sections[0]!.lessons[0]!;lesson.blocks=[];
 for(const template of BLOCK_TEMPLATES.filter(t=>t.category==='Media' || t.category==='Interactive')){const prepared=prepareBlock(template.key,project);lesson.blocks.push(prepared.block);if(prepared.asset){project.document.assets.push(prepared.asset);project.files[assetPath(prepared.asset)]=prepared.data!;}}
 for(const [kind,path,type]of [['audio','original-tone.wav','audio/wav'],['video','original-clip.mp4','video/mp4'],['attachment','original-resource.txt','text/plain']] as const){const bytes=await readFile(new URL(`../fixtures/${path}`,import.meta.url));const asset:Asset={id:`fixture-${kind}`,fileName:path,mediaType:type,byteLength:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};project.document.assets.push(asset);project.files[assetPath(asset)]=bytes.toString('base64');const block=lesson.blocks.find(b=>b.type===kind)!;if(block.type==='audio' || block.type==='video' || block.type==='attachment')block.content.assetId=asset.id;
  if(block.type==='audio')block.content.transcript='A steady tone plays for two seconds.';
  if(block.type==='video'){block.content.transcript='A dark green rectangle appears while a steady tone plays for two seconds.';block.content.captions=[{start:0,end:2,text:'[A steady tone; a dark green rectangle]'}];}
 }
 const link=lesson.blocks.find(b=>b.type==='button')!;if(link.type==='button')link.content.url='https://example.org/learning';
 const gate=prepareBlock('continue',project).block;if(gate.type==='continue')gate.completion='all-previous';lesson.blocks.push(gate);project.document.course.sections[0]!.lessons=[lesson];return project;
}
