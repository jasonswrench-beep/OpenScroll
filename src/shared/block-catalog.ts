import { type Block,type PortableProject,type Asset,assetPath,blockSchema } from './course.js';
import { newId } from './outline.js';
import { STARTER_IMAGE_BASE64,STARTER_IMAGE_SHA256,STARTER_IMAGE_BYTES } from './starter-image.js';
export interface BlockTemplate {key:string;label:string;category:'Text'|'Images'|'Structure'|'Media'|'Interactive'|'Assessment';type:Block['type'];variant:string;description:string;}
export const BLOCK_TEMPLATES:BlockTemplate[]=[
  {key:'paragraph',label:'Paragraph',category:'Text',type:'paragraph',variant:'plain',description:'A clear reading column for one useful idea.'},
  {key:'paragraph-heading',label:'Paragraph with heading',category:'Text',type:'paragraph',variant:'with-heading',description:'A short heading followed by explanatory text.'},
  {key:'heading',label:'Heading',category:'Text',type:'heading',variant:'heading',description:'Introduce a new idea with a strong heading.'},
  {key:'subheading',label:'Subheading',category:'Text',type:'heading',variant:'subheading',description:'Give the next part of your lesson a name.'},
  {key:'statement',label:'Statement',category:'Text',type:'statement',variant:'statement',description:'Give a central idea room to stand out.'},
  {key:'note',label:'Note',category:'Text',type:'statement',variant:'note',description:'A compact callout for a useful reminder.'},
  {key:'quote',label:'Quote',category:'Text',type:'quote',variant:'plain',description:'A quotation with its own attribution.'},
  {key:'bulleted-list',label:'Bulleted list',category:'Text',type:'list',variant:'bulleted',description:'Group related points without a sequence.'},
  {key:'numbered-list',label:'Numbered list',category:'Text',type:'list',variant:'numbered',description:'Describe a sequence, one step at a time.'},
  {key:'checklist',label:'Checklist',category:'Text',type:'list',variant:'checklist',description:'A visual checklist of things to consider.'},
  {key:'image',label:'Centered image',category:'Images',type:'image',variant:'centered',description:'A centered picture with an editable caption.'},
  {key:'full-image',label:'Full-width image',category:'Images',type:'image',variant:'full-width',description:'Let an image span the available content width.'},
  {key:'image-text',label:'Image and text',category:'Images',type:'image-text',variant:'image-left',description:'Place a picture beside an explanation.'},
  {key:'text-image',label:'Text and image',category:'Images',type:'image-text',variant:'image-right',description:'An explanation followed by a supporting image.'},
  {key:'divider',label:'Divider',category:'Structure',type:'divider',variant:'line',description:'Separate ideas with a simple rule and label.'},
  {key:'numbered-divider',label:'Numbered divider',category:'Structure',type:'divider',variant:'numbered',description:'Mark a transition with a numbered label.'},
  {key:'small-spacer',label:'Small spacer',category:'Structure',type:'spacer',variant:'small',description:'A little breathing room between blocks.'},
  {key:'spacer',label:'Medium spacer',category:'Structure',type:'spacer',variant:'medium',description:'A larger pause between ideas.'},
  {key:'large-spacer',label:'Large spacer',category:'Structure',type:'spacer',variant:'large',description:'A generous pause in the page layout.'},
  {key:'gallery',label:'Image gallery',category:'Media',type:'gallery',variant:'grid',description:'A responsive gallery with individual image descriptions.'},
  {key:'audio',label:'Audio',category:'Media',type:'audio',variant:'player',description:'Uploaded audio with a readable transcript.'},
  {key:'video',label:'Video',category:'Media',type:'video',variant:'player',description:'Uploaded video with captions and a descriptive transcript.'},
  {key:'attachment',label:'Attachment',category:'Media',type:'attachment',variant:'download',description:'A PDF or text file learners can download.'},
  {key:'button',label:'Link button',category:'Media',type:'button',variant:'link',description:'An accessible link to a web resource.'},
  {key:'accordion',label:'Accordion',category:'Interactive',type:'accordion',variant:'stacked',description:'Expandable explanations for related ideas.'},
  {key:'tabs',label:'Tabs',category:'Interactive',type:'tabs',variant:'horizontal',description:'Related panels with keyboard navigation.'},
  {key:'flashcards',label:'Flashcards',category:'Interactive',type:'flashcards',variant:'grid',description:'Reveal an explanation on the back of each card.'},
  {key:'process',label:'Process',category:'Interactive',type:'process',variant:'steps',description:'A sequence learners explore one step at a time.'},
  {key:'timeline',label:'Timeline',category:'Interactive',type:'timeline',variant:'vertical',description:'A readable sequence of events and explanations.'},
  {key:'labeled-graphic',label:'Labeled graphic',category:'Interactive',type:'labeled-graphic',variant:'markers',description:'Keyboard accessible image markers and descriptions.'},
  {key:'single-choice',label:'Multiple choice',category:'Assessment',type:'assessment',variant:'single-choice',description:'Select one answer.'},
  {key:'multiple-response',label:'Multiple response',category:'Assessment',type:'assessment',variant:'multiple-response',description:'Select every correct answer.'},
  {key:'fill-blank',label:'Fill in the blank',category:'Assessment',type:'assessment',variant:'fill-blank',description:'Type an accepted answer.'},
  {key:'matching',label:'Matching',category:'Assessment',type:'assessment',variant:'matching',description:'Match related terms without dragging.'},
  {key:'sorting',label:'Sorting',category:'Assessment',type:'assessment',variant:'sorting',description:'Order items with keyboard controls.'},
  {key:'continue',label:'Continue button',category:'Structure',type:'continue',variant:'button',description:'Author the label and rule. Reveal the next section after the selected rule.'},
];
export function templatesFor(block:Block){return BLOCK_TEMPLATES.filter(t=>t.type===block.type);}
export function switchVariant(block:Block,variant:string):Block {
  if(!templatesFor(block).some(t=>t.variant===variant))throw new Error('Choose a compatible template for this block.');
  return blockSchema.parse({...structuredClone(block),variant});
}
export function duplicateBlock(block:Block):Block {return {...structuredClone(block),id:newId()};}
export function prepareBlock(key:string,project:PortableProject):{block:Block;asset?:Asset;data?:string} {
  const template=BLOCK_TEMPLATES.find(t=>t.key===key);if(!template)throw new Error('Unknown block template.');
  const appearance={width:'reading',padding:'medium',background:'page'};const base={id:newId(),type:template.type,variant:template.variant,appearance};
  let asset:Asset|undefined;let imageId='';
  if(['image','image-text','gallery','labeled-graphic'].includes(template.type)){
    const existing=project.document.assets.find(a=>a.mediaType==='image/png' && a.sha256===STARTER_IMAGE_SHA256 && project.files[assetPath(a)]===STARTER_IMAGE_BASE64);
    asset=existing ? undefined : {id:newId(),fileName:'openscroll-starter.png',mediaType:'image/png',byteLength:STARTER_IMAGE_BYTES,sha256:STARTER_IMAGE_SHA256};
    imageId=existing?.id ?? asset!.id;
  }
  const image={assetId:imageId,altText:'A geometric illustration of a person beside four lines of text.',decorative:false,caption:'Replace this illustration with an image that supports your lesson.'};
  const content:Record<Block['type'],unknown>={
    heading:{text:template.variant==='subheading' ? 'A closer look' : 'Start with a useful question'},
    paragraph:{heading:'Put the idea into practice',text:'Explain one idea clearly. Give your learners a concrete example, then connect it to something they can do.'},
    list:{items:['Notice what matters.','Try a small, practical step.','Reflect on what changed.']},
    statement:{text:template.variant==='note' ? 'A useful reminder: small steps make a good place to begin.' : 'A useful lesson gives people something they can use.'},
    quote:{text:'Understanding grows when we connect an idea to an experience.',attribution:'OpenScroll starter quotation'},
    image, 'image-text':{...image,heading:'See the idea in context',text:'Use a picture and a short explanation to make an abstract idea concrete.'},
    gallery:{items:[{...image},{...image,caption:'Describe a second view of your idea.'}]},
    audio:{title:'Listen to an example',assetId:null,transcript:'Add an accurate transcript when you upload your audio.'},
    video:{title:'Watch the idea in action',assetId:null,transcript:'Describe the spoken content and meaningful visual information.',captionLanguage:project.document.course.language,captions:[]},
    attachment:{label:'Download the resource',description:'Explain how this resource supports the lesson.',assetId:null},
    button:{label:'Explore the resource',url:''},
    accordion:{items:[{title:'Notice',text:'Look closely at what matters.'},{title:'Try',text:'Choose one useful action.'}]},
    tabs:{items:[{title:'The idea',text:'Explain the central idea.'},{title:'An example',text:'Connect the idea to a practical example.'}]},
    flashcards:{cards:[{front:'What makes an idea useful?',back:'A connection to something you can do.'}]},
    process:{items:[{title:'Notice',text:'Identify what matters.'},{title:'Act',text:'Try one practical step.'},{title:'Reflect',text:'Consider what changed.'}]},
    timeline:{items:[{title:'Before',text:'Describe the starting point.'},{title:'After',text:'Explain what changed and why.'}]},
    'labeled-graphic':{...image,markers:[{label:'Look here',text:'Explain this part of the image.',x:30,y:40},{label:'A connection',text:'Connect this detail to your main idea.',x:70,y:60}]},
    assessment:{prompt:template.variant==='fill-blank' ? 'Learning grows through ____.' : template.variant==='matching' ? 'Match each action to its meaning.' : template.variant==='sorting' ? 'Order the steps from noticing to reflection.' : 'Which action helps turn an idea into practice?',options:['Try a small, practical step.','Wait for a perfect plan.','Avoid reflecting on the result.'],correct:[0],accepted:['practice'],caseSensitive:false,pairs:[{left:'Notice',right:'Identify what matters'},{left:'Act',right:'Try one useful step'}],items:['Notice what matters','Try a useful step','Reflect on the result'],feedbackCorrect:'You connected the idea to a useful action.',feedbackIncorrect:'Review the idea, then try another approach.'},
    divider:{label:template.variant==='numbered' ? '1' : 'The next idea'},spacer:{},continue:{label:'Continue'},
  };
  const block=blockSchema.parse({...base,content:content[template.type],...(template.type==='assessment' ? {assessment:{graded:false,points:1,required:false,completion:'submitted',maxAttempts:0}} : {}),...(template.type==='continue' ? {completion:'none'} : {})});
  return {block,...(asset ? {asset,data:STARTER_IMAGE_BASE64} : {})};
}
