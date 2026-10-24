import { parseCourse,assetPath,type PortableProject } from './course.js';
import { newId } from './outline.js';
import { prepareBlock } from './block-catalog.js';
import type { CourseTheme } from './reuse.js';
export const THEME_PRESETS:{name:string;theme:CourseTheme}[]=[
 {name:'Forest',theme:{accentColor:'#193c35',font:'sans',pageWidth:'standard'}},
 {name:'Ocean',theme:{accentColor:'#164e78',font:'sans',pageWidth:'wide'}},
 {name:'Plum',theme:{accentColor:'#613b67',font:'serif',pageWidth:'standard'}},
 {name:'Sunlight',theme:{accentColor:'#f4d87a',font:'sans',pageWidth:'wide'}},
];
export const COURSE_TEMPLATES=[{key:'short-course',name:'Focused short course',description:'An idea, an example and a practical reflection.'},{key:'onboarding',name:'Welcome and orientation',description:'Purpose, first steps and a useful knowledge check.'},{key:'workshop',name:'Guided workshop',description:'Explore a process, compare approaches and plan an action.'}];
export const LEARNING_LAYOUTS=[{key:'concept',name:'Concept and example'},{key:'compare',name:'Compare two perspectives'},{key:'practice',name:'Process and practice'}];
function blank():PortableProject{const time=new Date().toISOString();return {document:parseCourse({format:'openscroll',schemaVersion:3,course:{id:newId(),title:'Reusable content',description:'',author:'',language:'en',createdAt:time,updatedAt:time,cover:null,theme:THEME_PRESETS[0]!.theme,settings:{navigation:'free',completion:'all-lessons',passingScore:80},sections:[{id:newId(),title:'Explore and apply',lessons:[{id:newId(),title:'Start here',blocks:[]}]}]},assets:[]}),files:{}};}
export function learningLayout(key:string):PortableProject{
 if(!LEARNING_LAYOUTS.some(l=>l.key===key))throw new Error('Choose a learning layout.');const project=blank(),blocks=project.document.course.sections[0]!.lessons[0]!.blocks;
 const add=(key:string)=>{const prepared=prepareBlock(key,project);if(prepared.asset){project.document.assets.push(prepared.asset);project.files[assetPath(prepared.asset)]=prepared.data!;}blocks.push(prepared.block);return prepared.block;};
 if(key==='concept'){
  const image=add('image-text');image.appearance.width='wide';image.appearance.background='surface';if(image.type==='image-text'){image.content.heading='One idea, one useful example';image.content.text='Explain an idea your learners can use. Describe a familiar situation, then show how the idea changes what someone does.';}
  const note=add('statement');note.appearance.background='accent';if(note.type==='statement')note.content.text='Connect the example to one action your learners can try.';
 }else if(key==='compare'){
  const tabs=add('tabs');if(tabs.type==='tabs')tabs.content.items=[{title:'First perspective',text:'Describe one approach, its strengths and when it is useful.'},{title:'Another perspective',text:'Describe a different approach and the trade-offs a learner should consider.'}];
  const paragraph=add('paragraph-heading');if(paragraph.type==='paragraph'){paragraph.content.heading='Choose with a reason';paragraph.content.text='Compare the approaches. Which best fits your situation, and what evidence supports your choice?';}
 }else{
  const process=add('process');if(process.type==='process')process.content.items=[{title:'Notice',text:'Identify the situation and what matters.'},{title:'Act',text:'Try one small, purposeful action.'},{title:'Reflect',text:'Consider the result and choose what to improve.'}];
  const question=add('single-choice');if(question.type==='assessment'){question.content.prompt='What is a useful next step after trying an action?';question.content.options=['Reflect on the result and decide what to improve.','Assume the first attempt was perfect.','Ignore what happened.'];question.content.correct=[0];}
 }return project;
}
export function courseTemplate(key:string,author=''):PortableProject{
 const entry=COURSE_TEMPLATES.find(t=>t.key===key);if(!entry)throw new Error('Choose a course template.');const layout=learningLayout(key==='workshop'?'practice':key==='onboarding'?'compare':'concept'),course=layout.document.course;
 course.title=entry.name;course.author=author;course.description=entry.description;const first=course.sections[0]!.lessons[0]!;first.title=key==='onboarding'?'Welcome and purpose':'Explore the idea';
 const next={id:newId(),title:'Apply what you learned',blocks:[prepareBlock('paragraph-heading',layout).block,prepareBlock('bulleted-list',layout).block]};if(next.blocks[0]?.type==='paragraph'){next.blocks[0].content.heading='Make a practical plan';next.blocks[0].content.text='Choose one action you can take, decide when you will try it, and identify how you will know it helped.';}if(next.blocks[1]?.type==='list')next.blocks[1].content.items=['Name one useful action.','Try it in a real situation.','Reflect and adjust your approach.'];course.sections[0]!.lessons.push(next);return layout;
}
export function accentInk(hex:string){const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return .2126*rgb[0]!+.7152*rgb[1]!+.0722*rgb[2]!>.179?'#000000':'#ffffff';}
