import { accentInk } from '../shared/course-templates.js';
import { textAccent } from '../shared/contrast.js';
import { renderAssessment } from './assessment-player.js';
import { isAssessment,interactionCount,emptyAnswer,validAnswer,assessmentIssue } from '../shared/assessment.js';
import { assetPath,type PortableProject,type Lesson,type CourseDocument } from '../shared/course.js';
import { richToDom,richToPlain } from '../shared/rich-text.js';
import { renderBlock } from '../shared/block-renderer.js';
import { CourseFlow,type LearnerSnapshot } from './state.js';
import { renderResponse } from './response-player.js';
import { renderPractice } from './practice-player.js';
import { renderScenario } from './scenario-player.js';
import { enhanceVideo,enhanceEmbed } from './media-player.js';
import { renderDraw,renderResults,enhanceGlossary,linkGlossaryTerms } from './resources-player.js';
import { renderWorkbook,workbookEntries } from './workbook.js';
import { isResponseBlock,responseTitle } from '../shared/responses.js';
/** `lms` is the LMS tracking panel (status and buttons); the player keeps it in the course menu. */
export interface PlayerOptions {preview?:boolean;assetURL?:(id:string)=>string;restored?:unknown;changed?:(state:LearnerSnapshot)=>void;storageWarning?:string;lms?:HTMLElement;}
function node<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string,cls?:string){const element=document.createElement(tag);if(text!==undefined)element.textContent=text;if(cls)element.className=cls;return element;}
type Theme=CourseDocument['course']['theme'];
const SANS='"Segoe UI",system-ui,-apple-system,"Helvetica Neue",Arial,sans-serif',SERIF='Georgia,"Iowan Old Style","Times New Roman",serif';
/**
 * Heading and body type for each font pairing. The courses carry no font files, so each stack names the pairing's
 * typeface first (used where the learner's device has it) and falls back to a close system face.
 */
const PAIRINGS:Record<NonNullable<Theme['fontPairing']>,[head:string,serif:string]>={
  'lato-merriweather':[`"Lato",${SANS}`,`"Merriweather",${SERIF}`],
  'worksans-sourceserif':[`"Work Sans",${SANS}`,`"Source Serif 4","Source Serif Pro",${SERIF}`],
  'figtree-literata':[`"Figtree",${SANS}`,`"Literata",${SERIF}`],
  'atkinson':[`"Atkinson Hyperlegible",${SANS}`,`"Atkinson Hyperlegible",${SANS}`],
};
function fonts(theme:Theme){const [head,serif]=theme.fontPairing ? PAIRINGS[theme.fontPairing] : [SANS,SERIF];return {head,body:theme.font==='serif' ? serif : theme.fontPairing==='atkinson' ? head : SANS};}
/** True once a learner has done anything in the course, so a returning learner skips the cover. Drawn questions alone do not count. */
function started(flow:CourseFlow){const s=flow.snapshot();return !!(s.completed.length || s.released.length || s.reviewed.length || Object.keys(s.assessments).length || Object.keys(s.visits).length || Object.keys(s.responses).length || (flow.lessons[0] && s.lessonId!==flow.lessons[0].id));}
export class CoursePlayer {
  readonly flow:CourseFlow;private message='';private warning:string;private view:'cover'|'lesson'|'workbook';private menuOpen=false;
  constructor(private root:HTMLElement,private project:PortableProject,private options:PlayerOptions={}){
    this.flow=new CourseFlow(project.document);if(options.restored)this.flow.restore(options.restored);this.warning=options.storageWarning ?? '';
    // Learners start on the course cover; a returning learner and the author's lesson preview go straight to the lesson.
    this.view=options.preview || started(this.flow) ? 'lesson' : 'cover';this.render();
  }
  reset(){this.flow.reset();this.message='Progress reset. Start again when you are ready.';this.view=this.options.preview ? 'lesson' : 'cover';this.persist();this.render(this.view==='cover' ? 'cover-title' : 'lesson-title');}
  private persist(){try{this.options.changed?.(this.flow.snapshot());}catch{this.warning='Progress could not be saved in this browser. Keep this page open to retain this session.';}}
  private action(label:string,run:()=>void,key:string,disabled=false,cls?:string){const b=node('button',label,cls);b.type='button';b.disabled=disabled;b.dataset.focus=key;b.addEventListener('click',run);return b;}
  private url(id:string){if(this.options.assetURL)return this.options.assetURL(id);const asset=this.project.document.assets.find(a=>a.id===id)!;return `data:${asset.mediaType};base64,${this.project.files[assetPath(asset)]}`;}
  private open(lessonId:string,focus='lesson-title'){if(!this.flow.enter(lessonId))return;this.view='lesson';this.message='';this.menuOpen=false;this.persist();this.render(focus);}
  private render(focus?:string){
    this.root.replaceChildren();const course=this.project.document.course,flow=this.flow,theme=course.theme;document.documentElement.lang=course.language;document.title=course.title || 'Untitled course';
    const type=fonts(theme);this.root.classList.add('player-root');
    for(const [name,value]of [['--course-accent',textAccent(theme.accentColor)],['--course-fill',theme.accentColor],['--course-accent-ink',accentInk(theme.accentColor)],['--font-head',type.head],['--font-body',type.body]] as const)this.root.style.setProperty(name,value);
    const app=node('div',undefined,`player-app${theme.pageWidth==='wide' ? ' player-wide' : ''}`),main=node('main',undefined,'player-main');main.id='lesson-content';main.tabIndex=-1;
    if(this.view==='cover')main.append(this.cover());
    else if(this.view==='workbook'){main.append(renderWorkbook(this.project,flow,()=>{this.view='lesson';this.render('lesson-title');}));main.classList.add('player-main-workbook');}
    else main.append(...this.lesson());
    app.append(this.menu(),main);this.root.append(app);
    if(focus){const target=[...this.root.querySelectorAll<HTMLElement>('[data-focus]')].find(el=>el.dataset.focus===focus);target?.focus();}
  }
  /** The course menu: title and progress on the accent band, the lessons, the learner's tools and LMS tracking. */
  private menu(){
    const course=this.project.document.course,flow=this.flow,menu=node('aside',undefined,`player-sidebar${this.menuOpen ? ' is-open' : ''}`);menu.setAttribute('aria-label','Course menu');
    const head=node('div',undefined,'player-sidebar-head');if(this.options.preview)head.append(node('p','Author preview · isolated practice progress','player-brand'));
    const title=node('h1'),home=this.action(course.title || 'Untitled course',()=>{this.view='cover';this.menuOpen=false;this.render('cover-title');},'home',false,'player-home'),hint=node('span','Opens the course overview','os-sr-only');hint.id='player-home-hint';home.setAttribute('aria-describedby',hint.id);if(this.view==='cover')home.setAttribute('aria-current','page');title.append(home);head.append(title,hint);
    const progress=flow.progress,label=node('p',`${progress.done} of ${progress.total} lessons complete · ${progress.percent}%`,'player-progress-label');label.id='course-progress-label';
    const meter=node('progress');meter.max=Math.max(1,progress.total);meter.value=progress.done;meter.setAttribute('aria-labelledby',label.id);head.append(label,meter);
    const score=flow.score;if(score.possible)head.append(node('p',`Assessment: ${score.earned} of ${score.possible} points · ${score.percent}% · ${score.status}. Passing score: ${score.passingScore}%.`,'player-score'));
    const nav=node('nav',undefined,'player-nav');nav.setAttribute('aria-label','Course lessons');
    const list=node('div',undefined,`player-nav-list${this.menuOpen ? ' is-open' : ''}`);list.id='player-lesson-list';
    // On narrow screens the lessons, tools and LMS buttons fold behind one button; wider screens always show them.
    const toggle=this.action(this.menuOpen ? 'Hide course menu' : 'Show course menu',()=>{this.menuOpen=!this.menuOpen;this.render('menu-toggle');},'menu-toggle',false,'player-nav-toggle');toggle.setAttribute('aria-expanded',String(this.menuOpen));toggle.setAttribute('aria-controls',`${list.id} player-tools`);
    let number=0;
    for(const section of course.sections){
      if(!section.lessons.length)continue;if(section.title)list.append(node('h2',section.title,'player-nav-section'));const items=node('ol');
      for(const lesson of section.lessons){
        number++;const li=node('li'),complete=flow.completed.has(lesson.id),locked=!flow.canEnter(lesson.id),current=this.view!=='cover' && lesson.id===flow.lessonId;
        const b=this.action('',()=>this.open(lesson.id),`nav-${lesson.id}`,locked,'player-lesson');
        const digits=node('span',String(number),'player-lesson-number');digits.setAttribute('aria-hidden','true');b.append(digits,node('span',lesson.title || 'Untitled lesson','player-lesson-title'),node('span',complete ? ' · Complete' : locked ? ' · Locked' : '','os-sr-only'));
        const mark=node('span',undefined,`player-lesson-state${complete ? ' is-complete' : locked ? ' is-locked' : current ? ' is-current' : ''}`);mark.setAttribute('aria-hidden','true');b.append(mark);
        if(current)b.setAttribute('aria-current','step');li.append(b);items.append(li);
      }
      list.append(items);
    }
    nav.append(list);
    const tools=node('div',undefined,'player-tools');tools.id='player-tools';
    if(workbookEntries(this.project).length){const open=this.action(this.view==='workbook' ? 'Back to the course' : 'My workbook',()=>{this.view=this.view==='workbook' ? 'lesson' : 'workbook';this.menuOpen=false;this.render(this.view==='workbook' ? 'workbook' : 'lesson-title');},'workbook-toggle');open.setAttribute('aria-pressed',String(this.view==='workbook'));tools.append(open);}
    tools.append(this.action('Reset progress',()=>{if(this.options.preview || confirm('Reset your progress in this course?'))this.reset();},'reset'));
    menu.append(head,toggle,nav,tools);if(this.options.lms)menu.append(this.options.lms);
    return menu;
  }
  /** The course cover, laid out as the author chose in the theme. */
  private cover(){
    const course=this.project.document.course,cover=course.cover,count=this.flow.lessons.length;
    const section=node('section',undefined,`player-cover l-${course.theme.coverLayout}${cover ? '' : ' no-image'}`);section.setAttribute('aria-labelledby','cover-title');
    const picture=node('div',undefined,'cimg');if(cover){const img=node('img');img.src=this.url(cover.assetId);img.alt=cover.decorative ? '' : cover.altText;picture.append(img);}
    const text=node('div',undefined,'ctext');
    if(course.author){const by=node('p',undefined,'byline');if(course.authorImage){const photo=node('img');photo.src=this.url(course.authorImage.assetId);photo.alt='';by.append(photo);}by.append(document.createTextNode(`By ${course.author}`));text.append(by);}
    const title=node('h2',course.title || 'Untitled course','ctitle');title.id='cover-title';title.tabIndex=-1;title.dataset.focus='cover-title';text.append(title);
    if(course.description){const description=node('div',undefined,'cdesc os-rich');description.append(richToDom(course.description));text.append(description);}
    text.append(node('p',`${count} ${count===1 ? 'lesson' : 'lessons'}`,'cmeta'));
    const first=this.flow.lessons.find(l=>!this.flow.completed.has(l.id) && this.flow.canEnter(l.id)) ?? this.flow.lessons[0];
    if(first)text.append(this.action(started(this.flow) ? 'Resume course' : 'Start course',()=>this.open(this.flow.lessons.some(l=>l.id===this.flow.lessonId) && started(this.flow) ? this.flow.lessonId : first.id),'start',false,'player-start'));
    section.append(picture,text);
    const parts:HTMLElement[]=[section];
    const status=node('p',this.message,'player-status');status.setAttribute('role','status');parts.push(status);
    if(this.warning){const warning=node('p',this.warning,'player-warning');warning.setAttribute('role','status');parts.push(warning);}
    const wrap=node('div',undefined,'player-cover-wrap');wrap.append(...parts);return wrap;
  }
  private lesson():HTMLElement[]{
    const flow=this.flow,lesson=flow.lesson,course=this.project.document.course,parts:HTMLElement[]=[];
    const index=flow.lessons.findIndex(l=>l.id===flow.lessonId);
    const banner=lesson ? this.banner(lesson) : undefined,header=node('header',undefined,`player-lesson-head${banner ? ' has-image' : ''}${course.theme.lessonHeader==='accent' ? ' is-accent' : ''}`);
    if(banner)header.append(banner);
    const words=node('div',undefined,'player-lesson-words');if(lesson)words.append(node('p',`Lesson ${index+1} of ${flow.lessons.length}`,'player-lesson-eyebrow'));
    const heading=node('h2',lesson?.title || 'No lessons yet');heading.tabIndex=-1;heading.dataset.focus='lesson-title';words.append(heading);header.append(words);parts.push(header);
    const intro=node('div',undefined,'player-lesson-intro');
    // An objectives block in the lesson replaces the lesson-level list, so objectives never show twice.
    if(lesson?.objectives.length && !lesson.blocks.some(b=>b.type==='objectives')){const objectives=node('section',undefined,'player-objectives');objectives.setAttribute('aria-label','Lesson objectives');objectives.append(node('h3','In this lesson, you will'));const list=node('ul');for(const objective of lesson.objectives)list.append(node('li',objective.text));objectives.append(list);intro.append(objectives);}
    const status=node('p',this.message,'player-status');status.setAttribute('role','status');intro.append(status);
    if(this.warning){const warning=node('p',this.warning,'player-warning');warning.setAttribute('role','status');intro.append(warning);}
    parts.push(intro);
    if(!lesson){intro.append(node('p','This course has no lessons to display. Return to the authoring tool to add one.'));return parts;}
    const content=node('div',undefined,'player-blocks');const required=flow.required();
    for(const block of flow.visible()){
      const wrapper=node('section');wrapper.className='player-block';wrapper.dataset.blockId=block.id;wrapper.tabIndex=-1;wrapper.dataset.focus=`block-${block.id}`;
      if(block.type==='continue' && block===lesson.blocks.at(-1))continue;
      if(block.type==='continue'){
        const enabled=flow.canContinue(block.id),released=flow.released.has(block.id);wrapper.classList.add('player-gate');
        // An opened gate has done its job: it leaves a quiet divider rather than a disabled button.
        if(released){wrapper.classList.add('is-released');wrapper.removeAttribute('tabindex');wrapper.append(node('hr'));content.append(wrapper);continue;}
        const help=node('p',enabled ? 'Continue to reveal the next part of this lesson.' : block.content.hint || 'Complete the required content above before continuing.');help.id=`gate-${block.id}`;
        const button=this.action(block.content.label || 'Continue',()=>{const visible=flow.visible().length;if(flow.continue(block.id)){this.message='More content is available.';this.persist();const next=flow.visible()[visible];this.render(next ? `block-${next.id}` : 'complete-lesson');}},`continue-${block.id}`,!enabled);button.setAttribute('aria-describedby',help.id);wrapper.append(button,help);
      }else{
        const rendered=renderBlock(block,this.project,undefined,id=>this.url(id),index=>{if(flow.visit(block.id,index)){this.persist();queueMicrotask(()=>this.refreshGates());}});
        if(isAssessment(block))rendered.replaceChildren(renderAssessment(block,flow,()=>this.persist(),focus=>this.render(focus),id=>this.url(id)));
        else if(block.type==='scenario')rendered.replaceChildren(renderScenario(block,flow,()=>this.persist(),()=>this.refreshGates(),this.project,id=>this.url(id)));
        else if(block.type==='software-practice')rendered.replaceChildren(renderPractice(block,flow,()=>this.persist(),()=>this.refreshGates(),id=>this.url(id)));
        else if(isResponseBlock(block))rendered.replaceChildren(renderResponse(block,flow,()=>this.persist(),()=>this.refreshGates()));
        else if(block.type==='video')enhanceVideo(block,rendered,flow,id=>this.url(id),id=>{const target=this.root.querySelector<HTMLElement>(`[data-focus="question-${id}"]`);target?.scrollIntoView({block:'center'});target?.focus();});
        else if(block.type==='embed-video')enhanceEmbed(block,rendered,!!this.options.preview);
        else if(block.type==='bank-draw'){if(flow.draw(block.id))this.persist();rendered.replaceChildren(renderDraw(block,flow,()=>this.persist(),focus=>this.render(focus),id=>this.url(id)));}
        else if(block.type==='results')rendered.replaceChildren(renderResults(block,flow,this.project,(lessonId,questionId)=>{if(flow.enter(lessonId)){this.message='';this.persist();this.render(`question-${questionId}`);}},id=>this.url(id)));
        else if(block.type==='glossary')enhanceGlossary(block,rendered);
        wrapper.append(rendered);
        if(block.requiredInteraction){const status=node('p',undefined,'player-block-note');status.dataset.interactionProgress=block.id;status.setAttribute('role','status');status.textContent=`Explored ${flow.explored(block.id)} of ${interactionCount(block)} items.`;wrapper.append(status);}
        if(required.has(block.id)){const reviewed=flow.reviewed.has(block.id);wrapper.append(this.action(reviewed ? 'Reviewed' : 'Mark as reviewed',()=>{flow.review(block.id);this.message='Content marked as reviewed.';this.persist();this.render(`review-${block.id}`);},`review-${block.id}`,false,'player-review'));const b=wrapper.querySelector<HTMLButtonElement>(`[data-focus="review-${block.id}"]`)!;b.setAttribute('aria-pressed',String(reviewed));b.setAttribute('aria-label',`${reviewed ? 'Reviewed' : 'Mark as reviewed'}: ${this.blockLabel(block.id)}`);}
      }
      content.append(wrapper);
    }
    parts.push(content);linkGlossaryTerms(content,this.project);
    const footer=node('div',undefined,'player-lesson-actions'),done=flow.completed.has(flow.lessonId),next=flow.lessons[index+1];
    const requirements=node('div');requirements.className='player-requirements';requirements.dataset.requirements='';footer.append(requirements);this.requirements(requirements);
    const pending=[...flow.visible().filter(isAssessment),...flow.visible().flatMap(b=>b.type==='bank-draw' ? flow.drawn(b.id) : [])].filter(block=>{const record=flow.record(block.id);return ((block.assessment.required || this.gated(block.id)) && !record?.last) || !!record?.draft;});
    const buttons=node('div',undefined,'player-lesson-buttons');
    if(pending.length)buttons.append(this.action('Submit all answers',()=>{
      const responses=pending.map(block=>({block,answer:flow.record(block.id)?.draft ?? emptyAnswer(block)}));
      const missing=responses.find(({block,answer})=>assessmentIssue(block)||!validAnswer(block,answer));
      if(missing){this.message=`Answer this question before submitting: ${richToPlain(missing.block.content.prompt).slice(0,160)}`;this.render(`question-${missing.block.id}`);return;}
      for(const {block,answer}of responses)flow.submit(block.id,answer);
      this.message='Answers submitted. Review your feedback, then finish the lesson.';this.persist();this.render('complete-lesson');
    },'submit-all',false,'is-primary'));
    if(next && !done){const upNext=node('p',undefined,'player-next');upNext.append(node('span',`Up next · Lesson ${index+2} of ${flow.lessons.length}`,'player-next-label'),node('span',next.title || 'Untitled lesson','player-next-title'));footer.append(upNext);}
    if(!done || !next)buttons.append(this.action(done ? 'Lesson complete' : next ? 'Complete lesson and continue' : 'Complete lesson',()=>{if(flow.finish()){
      this.message=flow.progress.done===flow.progress.total ? 'Course complete. You have completed every lesson.' : 'Lesson complete.';
      if(next){flow.enter(next.id);this.message='Previous lesson complete.';}this.persist();this.render(next ? 'lesson-title' : 'complete-lesson');
    }},'complete-lesson',done || !flow.canFinish(),'is-primary player-complete'));
    if(done && next)buttons.append(this.action('Next lesson',()=>this.open(next.id),'next',!flow.canEnter(next.id),'is-primary'));
    if(index>0)buttons.append(this.action('Previous lesson',()=>this.open(flow.lessons[index-1]!.id),'previous'));
    footer.append(buttons);
    if(flow.progress.total>0 && flow.progress.done===flow.progress.total)footer.append(node('p','Course complete. All lessons are marked complete.','player-course-complete'));
    parts.push(footer);
    return parts;
  }
  private refreshGates(){
    for(const block of this.flow.visible()){
      if(block.type==='continue' && !this.flow.released.has(block.id)){const button=this.root.querySelector<HTMLButtonElement>(`[data-focus="continue-${block.id}"]`);if(button)button.disabled=!this.flow.canContinue(block.id);const help=this.root.querySelector<HTMLElement>(`#gate-${block.id}`);if(help)help.textContent=this.flow.canContinue(block.id) ? 'Continue to reveal the next part of this lesson.' : block.content.hint || 'Complete the required content above before continuing.';}
      const status=this.root.querySelector<HTMLElement>(`[data-interaction-progress="${block.id}"]`);if(status)status.textContent=`Explored ${this.flow.explored(block.id)} of ${interactionCount(block)} items.`;
    }
    const complete=this.root.querySelector<HTMLButtonElement>('[data-focus="complete-lesson"]');if(complete)complete.disabled=this.flow.completed.has(this.flow.lessonId) || !this.flow.canFinish();
    const requirements=this.root.querySelector<HTMLElement>('[data-requirements]');if(requirements)this.requirements(requirements);
  }
  private gated(id:string){const blocks=this.flow.visible(),index=blocks.findIndex(b=>b.id===id);return blocks.some((b,i)=>b.type==='continue' && i>index && (b.completion==='all-previous' || b.completion==='previous' && i===index+1));}
  private requirements(root:HTMLElement){
    root.replaceChildren();if(this.flow.canFinish())return;
    const items=this.flow.visible().filter(block=>{
      if(block.type==='continue')return block!==this.flow.lesson?.blocks.at(-1) && !this.flow.released.has(block.id);
      return (isAssessment(block) && (block.assessment.required || this.gated(block.id)) || (block.type==='bank-draw' && !this.flow.isComplete(block)) || (isResponseBlock(block) && block.content.required) || block.requiredInteraction || this.flow.required().has(block.id)) && !this.flow.isComplete(block);
    });
    if(!items.length)return;root.append(node('p','To finish this lesson:'));const list=node('ul');
    for(const block of items){
      const label=isAssessment(block)?`${this.flow.record(block.id)?.last?'Answer correctly':'Submit answer'}: ${richToPlain(block.content.prompt).slice(0,120)}`:block.type==='bank-draw'?`Answer the questions: ${block.content.title || 'questions from the bank'}`:isResponseBlock(block)?`Respond: ${responseTitle(block).slice(0,120)}`:block.requiredInteraction?`Explore all items: ${this.blockLabel(block.id)}`:block.type==='continue'?'Open the next section':'Review: '+this.blockLabel(block.id);
      const item=node('li');item.append(this.action(label,()=>{const target=this.root.querySelector<HTMLElement>(`[data-focus="${isAssessment(block)?'question-':'block-'}${block.id}"]`);target?.focus();target?.scrollIntoView({block:'center'});},'requirement-'+block.id));list.append(item);
    }root.append(list);
  }
  private blockLabel(id:string){const block=this.flow.lesson!.blocks.find(b=>b.id===id)!;const content=block.content as Record<string,unknown>;const text=String(content.prompt || content.heading || content.text || content.caption || (Array.isArray(content.items) ? typeof content.items[0]==='string' ? content.items[0] : (content.items[0] as {title?:string})?.title : '') || block.type);return richToPlain(text).replace(/\s+/g,' ').slice(0,100);}
  /** A lesson banner shows the course cover or the lesson's own image, with its alternative text. */
  private banner(lesson:Lesson){const banner=lesson.banner;if(!banner)return undefined;const id=banner.source==='cover' ? this.project.document.course.cover?.assetId : banner.assetId;if(!id)return undefined;const figure=node('figure',undefined,'player-banner'),img=node('img');img.src=this.url(id);img.alt=banner.decorative ? '' : banner.altText;figure.append(img);return figure;}
}
