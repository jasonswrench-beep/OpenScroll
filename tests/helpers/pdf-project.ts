import { mediaProject } from './media-project.js';
import { BLOCK_TEMPLATES,prepareBlock } from '../../src/shared/block-catalog.js';
import { assetPath } from '../../src/shared/course.js';
export async function pdfProject(){
 const project=await mediaProject(),course=project.document.course,lesson=course.sections[0]!.lessons[0]!;course.title='Learning that travels';course.description='A complete OpenScroll publication: readable content, meaningful images, expanded interactions, and practice.';course.author='OpenScroll';
 const existing=new Set(lesson.blocks.map(b=>b.type));for(const template of BLOCK_TEMPLATES.filter(t=>!existing.has(t.type))){const prepared=prepareBlock(template.key,project);lesson.blocks.push(prepared.block);if(prepared.asset){project.document.assets.push(prepared.asset);project.files[assetPath(prepared.asset)]=prepared.data!;}}
 const fill=lesson.blocks.find(b=>b.type==='assessment' && b.variant==='fill-blank');if(fill?.type==='assessment')fill.content.accepted=['PRIVATE-ANSWER-731'];
 const tabs=lesson.blocks.find(b=>b.type==='tabs');if(tabs?.type==='tabs')tabs.content.items[1]!.text='HIDDEN-TAB-CONTENT: the second panel must be present in the PDF.';
 const cards=lesson.blocks.find(b=>b.type==='flashcards');if(cards?.type==='flashcards')cards.content.cards[0]!.back='FLASHCARD-BACK-CONTENT: all sides travel in this edition.';
 const text=prepareBlock('paragraph',project).block;text.narration={script:'An authored narration script appears as readable text in the PDF.',language:'en',speed:1};if(text.type==='paragraph')text.content.text='AFTER-CONTINUE-CONTENT: later course content is included without learner clicks.\n\n'+('A complete paragraph should wrap naturally, preserve its reading order, and continue onto another page without clipping. '.repeat(60))+'\nEND-OF-LONG-CONTENT';
 const image=lesson.blocks.find(b=>b.type==='labeled-graphic');if(image?.type==='labeled-graphic')course.cover={assetId:image.content.assetId,altText:'Original geometric learning illustration',decorative:false};
 course.sections.push({id:'pdf-later-section',title:'Apply and reflect',lessons:[{id:'pdf-later-lesson',title:'Take the next step',blocks:[text]}]});return project;
}
