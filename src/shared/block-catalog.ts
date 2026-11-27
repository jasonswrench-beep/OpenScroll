import { type Block,type PortableProject,type Asset,assetPath,blockSchema,renewBlockIds } from './course.js';
import { newId } from './outline.js';
import { STARTER_IMAGE_BASE64,STARTER_IMAGE_SHA256,STARTER_IMAGE_BYTES } from './starter-image.js';
export interface BlockTemplate {key:string;label:string;category:'Text'|'Images'|'Structure'|'Media'|'Interactive'|'Activities'|'Assessment';type:Block['type'];variant:string;description:string;}
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
  {key:'checklist',label:'Check-mark list',category:'Text',type:'list',variant:'checklist',description:'A list marked with ticks. Learners read it; nothing is saved.'},
  {key:'objectives',label:'Learning objectives',category:'Text',type:'objectives',variant:'list',description:'What learners will be able to do, with optional thinking levels.'},
  {key:'objective-cards',label:'Objective cards',category:'Text',type:'objectives',variant:'cards',description:'Learning objectives shown as a row of cards.'},
  {key:'glossary',label:'Glossary',category:'Text',type:'glossary',variant:'a-z',description:'The course glossary, A to Z, with letters and search.'},
  {key:'table',label:'Table',category:'Text',type:'table',variant:'lined',description:'Rows and columns with real header cells.'},
  {key:'striped-table',label:'Striped table',category:'Text',type:'table',variant:'striped',description:'A table with shaded alternate rows.'},
  {key:'image',label:'Centered image',category:'Images',type:'image',variant:'centered',description:'A centered picture with an editable caption.'},
  {key:'full-image',label:'Full-width image',category:'Images',type:'image',variant:'full-width',description:'Let an image span the available content width.'},
  {key:'image-text',label:'Image and text',category:'Images',type:'image-text',variant:'image-left',description:'Place a picture beside an explanation.'},
  {key:'text-image',label:'Text and image',category:'Images',type:'image-text',variant:'image-right',description:'An explanation followed by a supporting image.'},
  {key:'divider',label:'Divider',category:'Structure',type:'divider',variant:'line',description:'Separate ideas with a simple rule and label.'},
  {key:'numbered-divider',label:'Numbered divider',category:'Structure',type:'divider',variant:'numbered',description:'Mark a transition with a numbered label.'},
  {key:'small-spacer',label:'Small spacer',category:'Structure',type:'spacer',variant:'small',description:'A little breathing room between blocks.'},
  {key:'spacer',label:'Medium spacer',category:'Structure',type:'spacer',variant:'medium',description:'A larger pause between ideas.'},
  {key:'large-spacer',label:'Large spacer',category:'Structure',type:'spacer',variant:'large',description:'A generous pause in the page layout.'},
  {key:'columns',label:'Two columns',category:'Structure',type:'columns',variant:'1-1',description:'Two equal columns that stack on phones.'},
  {key:'three-columns',label:'Three columns',category:'Structure',type:'columns',variant:'1-1-1',description:'Three equal columns that stack on phones.'},
  {key:'columns-wide-left',label:'Wide and narrow columns',category:'Structure',type:'columns',variant:'2-1',description:'A wide column beside a narrow one.'},
  {key:'columns-wide-right',label:'Narrow and wide columns',category:'Structure',type:'columns',variant:'1-2',description:'A narrow column beside a wide one.'},
  {key:'gallery',label:'Image gallery',category:'Media',type:'gallery',variant:'grid',description:'A responsive gallery with individual image descriptions.'},
  {key:'audio',label:'Audio',category:'Media',type:'audio',variant:'player',description:'Uploaded audio with a readable transcript.'},
  {key:'video',label:'Video',category:'Media',type:'video',variant:'player',description:'Uploaded video with captions and a descriptive transcript.'},
  {key:'interactive-video',label:'Interactive video',category:'Media',type:'video',variant:'interactive',description:'An uploaded video that pauses for questions and notes, with chapters.'},
  {key:'embed-video',label:'YouTube or Vimeo video',category:'Media',type:'embed-video',variant:'facade',description:'Plays from YouTube or Vimeo only after learners press play. Needs a transcript.'},
  {key:'attachment',label:'Attachment',category:'Media',type:'attachment',variant:'download',description:'A PDF or text file learners can download.'},
  {key:'button',label:'Link button',category:'Media',type:'button',variant:'link',description:'An accessible link to a web resource.'},
  {key:'accordion',label:'Accordion',category:'Interactive',type:'accordion',variant:'stacked',description:'Expandable explanations for related ideas.'},
  {key:'tabs',label:'Tabs',category:'Interactive',type:'tabs',variant:'horizontal',description:'Related panels with keyboard navigation.'},
  {key:'flashcards',label:'Flashcards',category:'Interactive',type:'flashcards',variant:'grid',description:'Reveal an explanation on the back of each card.'},
  {key:'process',label:'Process',category:'Interactive',type:'process',variant:'steps',description:'A sequence learners explore one step at a time.'},
  {key:'timeline',label:'Timeline',category:'Interactive',type:'timeline',variant:'vertical',description:'A readable sequence of events and explanations.'},
  {key:'software-practice',label:'Software practice',category:'Interactive',type:'software-practice',variant:'steps',description:'Watch, try and test a task on screenshots, step by step.'},
  {key:'scenario',label:'Scenario',category:'Interactive',type:'scenario',variant:'conversation',description:'A branching conversation: learners make choices that lead to different endings.'},
  {key:'labeled-graphic',label:'Labeled graphic',category:'Interactive',type:'labeled-graphic',variant:'markers',description:'Keyboard accessible image markers and descriptions.'},
  {key:'reflection',label:'Reflection',category:'Activities',type:'reflection',variant:'plain',description:'Learners write a response and can compare it with a sample.'},
  {key:'journal',label:'Journal prompt',category:'Activities',type:'reflection',variant:'journal',description:'A reflection styled as a journal page.'},
  {key:'activity',label:'Activity',category:'Activities',type:'activity',variant:'card',description:'Timed steps to follow, with a box to write in.'},
  {key:'interactive-checklist',label:'Checklist',category:'Activities',type:'checklist',variant:'ticks',description:'Items learners tick off. Their ticks are saved.'},
  {key:'action-plan',label:'Action plan',category:'Activities',type:'action-plan',variant:'table',description:'A table learners fill in: what, who, by when. They can add rows.'},
  {key:'survey',label:'Survey',category:'Activities',type:'survey',variant:'form',description:'Unscored ratings, choices and comments about the course.'},
  {key:'self-assessment',label:'Self-assessment',category:'Activities',type:'self-assessment',variant:'scale',description:'Learners rate statements and see what their total means.'},
  {key:'single-choice',label:'Multiple choice',category:'Assessment',type:'assessment',variant:'single-choice',description:'Select one answer.'},
  {key:'multiple-response',label:'Multiple response',category:'Assessment',type:'assessment',variant:'multiple-response',description:'Select every correct answer.'},
  {key:'bank-draw',label:'Questions from a bank',category:'Assessment',type:'bank-draw',variant:'random',description:'A random set from a course question bank; each learner keeps their set on resume.'},
  {key:'results',label:'Results and certificate',category:'Assessment',type:'results',variant:'summary',description:'Progress, scores, pass status, missed questions and a printable certificate.'},
  {key:'true-false',label:'True or false',category:'Assessment',type:'assessment',variant:'true-false',description:'Judge whether a statement is true.'},
  {key:'short-answer',label:'Short answer',category:'Assessment',type:'assessment',variant:'short-answer',description:'Type an answer that matches, or compare it with a model answer.'},
  {key:'numeric',label:'Numeric answer',category:'Assessment',type:'assessment',variant:'numeric',description:'Type a number; an exact value, a tolerance or a range counts.'},
  {key:'hotspot',label:'Hotspot',category:'Assessment',type:'assessment',variant:'hotspot',description:'Select the right place on a picture, or choose it from a list.'},
  {key:'fill-blank',label:'Fill in the blank',category:'Assessment',type:'assessment',variant:'fill-blank',description:'Type an accepted answer.'},
  {key:'matching',label:'Matching',category:'Assessment',type:'assessment',variant:'matching',description:'Match related terms without dragging.'},
  {key:'ordering',label:'Ordering',category:'Assessment',type:'assessment',variant:'ordering',description:'Put items in order with keyboard controls.'},
  {key:'categorize',label:'Sort into groups',category:'Assessment',type:'assessment',variant:'categorize',description:'Place each card in its group without dragging.'},
  {key:'continue',label:'Continue button',category:'Structure',type:'continue',variant:'button',description:'Author the label and rule. Reveal the next section after the selected rule.'},
];
/** A short starter conversation: a narration, a line, a choice with two routes, and two endings. */
function scenarioStarter(project:PortableProject){
  const ids=Array.from({length:6},()=>newId()),character=project.document.course.characters[0],speaker=character ? {characterId:character.id,poseId:character.poses[0]?.id ?? null} : {characterId:null,poseId:null};
  return {title:'A conversation to practise',intro:'Choose what to say. Each choice leads somewhere different.',start:ids[0],allowTakeBack:true,showPathReview:true,scoring:false,passPoints:0,required:false,workbook:false,
    scenes:[{id:newId(),title:'The request',backgroundId:null,nodes:[
      {id:ids[0],kind:'narration',text:'A colleague stops by your desk with a question.',next:ids[1]},
      {id:ids[1],kind:'line',...speaker,text:'Could you help me with the report before Friday?',next:ids[2]},
      {id:ids[2],kind:'choice',text:'What do you say?',choices:[{text:'Ask what part of the report they need help with.',next:ids[3],feedback:'Asking first shows you want to understand.',points:2},{text:'Say you are too busy this week.',next:ids[4],feedback:'Saying no is fine, but offering another time keeps the door open.',points:0}]},
      {id:ids[3],kind:'ending',...speaker,text:'They explain, and you agree on a plan together.',outcome:'positive'},
      {id:ids[4],kind:'ending',...speaker,text:'They thank you and look for help elsewhere.',outcome:'neutral'},
    ]}]};
}
export function templatesFor(block:Block){return BLOCK_TEMPLATES.filter(t=>t.type===block.type);}
export function switchVariant(block:Block,variant:string):Block {
  if(!templatesFor(block).some(t=>t.variant===variant))throw new Error('Choose a compatible template for this block.');
  const next=structuredClone(block);
  // Changing the column count keeps every child block: a removed column's blocks join the one before it.
  if(next.type==='columns'){const count=variant==='1-1-1' ? 3 : 2;while(next.content.columns.length<count)next.content.columns.push({blocks:[]});while(next.content.columns.length>count){const last=next.content.columns.pop()!;next.content.columns.at(-1)!.blocks.push(...last.blocks);}}
  if(next.type==='assessment' && variant==='true-false' && next.variant!=='true-false'){next.content.options=['True','False'];next.content.correct=[next.content.correct[0]===1 ? 1 : 0];next.content.choiceFeedback=next.content.choiceFeedback.slice(0,2);}
  return blockSchema.parse({...next,variant});
}
/** A copy with new identifiers for the block, the blocks inside it, and its objectives. */
export function duplicateBlock(block:Block):Block {return renewIds(structuredClone(block));}
export function renewIds<T extends Block>(block:T):T {return renewBlockIds(block,newId);}
export function prepareBlock(key:string,project:PortableProject):{block:Block;asset?:Asset;data?:string} {
  const template=BLOCK_TEMPLATES.find(t=>t.key===key);if(!template)throw new Error('Unknown block template.');
  const appearance={width:'reading',padding:'medium',background:'page'};const base={id:newId(),type:template.type,variant:template.variant,appearance:template.type==='columns' ? {...appearance,width:'wide'} : appearance};
  let asset:Asset|undefined;let imageId='';
  if(['image','image-text','gallery','labeled-graphic','software-practice'].includes(template.type) || template.variant==='hotspot'){
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
    assessment:{prompt:template.variant==='fill-blank' ? 'Learning grows through ____.' : template.variant==='matching' ? 'Match each action to its meaning.' : template.variant==='ordering' ? 'Order the steps from noticing to reflection.' : template.variant==='categorize' ? 'Place each action in the stage where it belongs.' : 'Which action helps turn an idea into practice?',options:['Try a small, practical step.','Wait for a perfect plan.','Avoid reflecting on the result.'],correct:[0],accepted:['practice'],caseSensitive:false,pairs:[{left:'Notice',right:'Identify what matters'},{left:'Act',right:'Try one useful step'}],items:['Notice what matters','Try a useful step','Reflect on the result'],feedbackCorrect:'You connected the idea to a useful action.',feedbackIncorrect:'Review the idea, then try another approach.',groups:['Before you act','After you act'],placements:[0,0,1]},
    divider:{label:template.variant==='numbered' ? '1' : 'The next idea'},spacer:{},continue:{label:'Continue'},
    objectives:{heading:'By the end of this lesson, you will be able to',intro:'',items:[{id:newId(),text:'Describe the main idea in your own words.',level:'understand'},{id:newId(),text:'Apply it to one situation from your own work.',level:'apply'}]},
    table:{caption:'How the three stages compare',head:['Stage','What you do','What to look for'],rows:[['Notice','Look closely at the situation.','What stands out?'],['Act','Try one small step.','What changes?'],['Reflect','Think about the result.','What will you keep?']],headerColumn:true},
    reflection:{prompt:'Think of a time you tried something new at work. What helped you take the first step?',placeholder:'Write a few sentences…',sample:'A colleague showed me a short example, which made the first step feel small enough to try.',minWords:0,required:false,workbook:true},
    activity:{title:'Try it now',minutes:10,steps:['Choose one task you do every week.','Write down one small change you could test.','Try the change once and note what happened.'],output:'What I noticed',required:false,workbook:true},
    checklist:{title:'Before you start',items:['I know what I want to try.','I have the materials I need.','I know who to ask for help.'],required:false,workbook:true},
    'self-assessment':{title:'How confident do you feel?',intro:'Rate each statement honestly. There are no wrong answers.',scale:['Not yet','Somewhat','Mostly','Fully'],items:['I can explain the main idea.','I can use it in my own work.','I can help a colleague use it.'],bands:[{min:3,max:6,text:'You are just getting started. Revisit the examples and try one small step.'},{min:7,max:9,text:'You are well on your way. Pick one area to practise next.'},{min:10,max:12,text:'You are confident. Consider sharing what you know with others.'}],required:false,workbook:true},
    'embed-video':{provider:'youtube',videoId:'',title:'Watch the overview',transcript:'Add a transcript of everything said and shown in the video.',start:0},
    'software-practice':{title:'Try it yourself',intro:'Follow each step on the screenshots. In Try, select the right place; in Test, do it without hints.',steps:[{id:newId(),imageId,alt:'Screenshot of the task screen.',instruction:'Select the person on the left.',target:{x:6,y:12,w:32,h:76},typed:'',hint:'Look at the left side of the screen.'}],modes:{watch:true,try:true,test:false},required:false,workbook:false},
    glossary:{title:'Glossary',showLetters:true,search:true},
    'action-plan':{title:'My action plan',intro:'Write down what you will do, who can help, and when.',columns:[{label:'What I will do',kind:'text'},{label:'Who can help',kind:'text'},{label:'By when',kind:'date'}],starterRows:3,maxRows:10,required:false,workbook:true},
    results:{title:'Your results',showReview:true,showCertificate:true},
    'bank-draw':{title:'',bankId:project.document.course.banks[0]?.id ?? 'bank-not-chosen',count:Math.min(5,project.document.course.banks[0]?.questions.length || 5)},
    scenario:scenarioStarter(project),
    survey:{title:'Tell us what you think',intro:'Your answers help improve this course. There are no right or wrong answers.',scale:['Strongly disagree','Disagree','Neutral','Agree','Strongly agree'],items:[{id:newId(),kind:'rating',prompt:'The examples were useful.',options:[]},{id:newId(),kind:'differential',prompt:'How did the pace feel?',options:['Too slow','Too fast']},{id:newId(),kind:'choice',prompt:'Which part did you use most?',options:['The reading','The activities','The questions']},{id:newId(),kind:'comment',prompt:'What one change would improve this lesson?',options:[]}],required:false,workbook:false},
    columns:{columns:Array.from({length:template.variant==='1-1-1' ? 3 : 2},(_,index)=>({blocks:[blockSchema.parse({id:newId(),type:'paragraph',variant:'with-heading',appearance,content:{heading:['First idea','Second idea','Third idea'][index],text:'Keep each column short. On a phone, columns stack in reading order.'}})]}))},
  };
  const questions:Record<string,object>={
    'true-false':{prompt:'Small, practical steps make new ideas easier to apply.',options:['True','False'],correct:[0],choiceFeedback:[]},
    'short-answer':{prompt:'In one word, what turns an idea into a habit?',accepted:['practice','repetition'],model:'Practice: repeating a small action until it becomes routine.'},
    numeric:{prompt:'How many days are in two weeks?',numeric:{mode:'exact',value:14,tolerance:0,min:10,max:20,unit:'days'}},
    hotspot:{prompt:'Select the part of the picture that shows the person.',options:[],correct:[0],image:{assetId:imageId,altText:image.altText},areas:[{x:6,y:12,w:32,h:76,label:'The person'},{x:44,y:12,w:50,h:34,label:'The upper lines of text'},{x:44,y:54,w:50,h:34,label:'The lower lines of text'}]},
  };
  const starter=template.type==='assessment' && questions[template.variant] ? {...(content.assessment as object),...questions[template.variant]} : content[template.type];
  const block=blockSchema.parse({...base,content:starter,...(template.type==='assessment' ? {assessment:{graded:false,points:1,required:false,completion:'submitted',maxAttempts:0}} : {}),...(template.type==='continue' ? {completion:'none'} : {})});
  return {block,...(asset ? {asset,data:STARTER_IMAGE_BASE64} : {})};
}
