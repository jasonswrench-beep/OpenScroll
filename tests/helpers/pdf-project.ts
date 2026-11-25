import { plainToRich } from '../../src/shared/rich-text.js';
import { mediaProject } from './media-project.js';
import { BLOCK_TEMPLATES,prepareBlock } from '../../src/shared/block-catalog.js';
import { assetPath } from '../../src/shared/course.js';
export async function pdfProject(){
 const project=await mediaProject(),course=project.document.course,lesson=course.sections[0]!.lessons[0]!;course.title='Learning that travels';course.description='A complete OpenScroll publication: readable content, meaningful images, expanded interactions, and practice.';course.author='OpenScroll';
 const existing=new Set(lesson.blocks.map(b=>b.type));for(const template of BLOCK_TEMPLATES.filter(t=>!existing.has(t.type))){const prepared=prepareBlock(template.key,project);lesson.blocks.push(prepared.block);if(prepared.asset){project.document.assets.push(prepared.asset);project.files[assetPath(prepared.asset)]=prepared.data!;}}
 // A bank-draw block needs a course question bank with at least one question.
 const bankQuestion=prepareBlock('true-false',project).block;if(bankQuestion.type==='assessment')bankQuestion.content.prompt=plainToRich('BANK-QUESTION-CONTENT: drawn questions are printed from their bank.');course.banks=[{id:'bank-pdf',name:'PDF bank',questions:[bankQuestion as never]}];const draw=lesson.blocks.find(b=>b.type==='bank-draw');if(draw?.type==='bank-draw'){draw.content.bankId='bank-pdf';draw.content.count=1;}
 // Embedded video publishes only where the server allows it; the PDF tests turn that on and give the video an address.
 process.env.OPENSCROLL_EXTERNAL_VIDEO='on';const embed=lesson.blocks.find(b=>b.type==='embed-video');if(embed?.type==='embed-video')embed.content.videoId='aqz-KE-bpKQ';
 const fill=lesson.blocks.find(b=>b.type==='assessment' && b.variant==='fill-blank');if(fill?.type==='assessment')fill.content.accepted=['PRIVATE-ANSWER-731'];
 const tabs=lesson.blocks.find(b=>b.type==='tabs');if(tabs?.type==='tabs')tabs.content.items[1]!.text='HIDDEN-TAB-CONTENT: the second panel must be present in the PDF.';
 const cards=lesson.blocks.find(b=>b.type==='flashcards');if(cards?.type==='flashcards')cards.content.cards[0]!.back='FLASHCARD-BACK-CONTENT: all sides travel in this edition.';
 const text=prepareBlock('paragraph',project).block;text.narration={script:'An authored narration script appears as readable text in the PDF.',language:'en',speed:1};if(text.type==='paragraph')text.content.text=plainToRich('AFTER-CONTINUE-CONTENT: later course content is included without learner clicks.\n\n'+('A complete paragraph should wrap naturally, preserve its reading order, and continue onto another page without clipping. '.repeat(60))+'\nEND-OF-LONG-CONTENT');
 const image=lesson.blocks.find(b=>b.type==='labeled-graphic');if(image?.type==='labeled-graphic')course.cover={assetId:image.content.assetId,altText:'Original geometric learning illustration',decorative:false};
 course.sections.push({id:'pdf-later-section',title:'Apply and reflect',lessons:[{id:'pdf-later-lesson',title:'Take the next step',blocks:[text],banner:null,objectives:[]}]});return project;
}
