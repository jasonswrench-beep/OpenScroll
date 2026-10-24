import { accentInk } from '../shared/course-templates.js';
import { renderAssessment } from './assessment-player.js';
import { isAssessment,interactionCount,emptyAnswer,validAnswer,assessmentIssue } from '../shared/assessment.js';
import { assetPath,type PortableProject } from '../shared/course.js';
import { renderBlock } from '../shared/block-renderer.js';
import { CourseFlow,type LearnerSnapshot } from './state.js';
export interface PlayerOptions {preview?:boolean;assetURL?:(id:string)=>string;restored?:unknown;changed?:(state:LearnerSnapshot)=>void;storageWarning?:string;}
function node<K extends keyof HTMLElementTagNameMap>(tag:K,text?:string,cls?:string){const element=document.createElement(tag);if(text!==undefined)element.textContent=text;if(cls)element.className=cls;return element;}
export class CoursePlayer {
  readonly flow:CourseFlow;private message='';private warning:string;
  constructor(private root:HTMLElement,private project:PortableProject,private options:PlayerOptions={}){
    this.flow=new CourseFlow(project.document);if(options.restored)this.flow.restore(options.restored);this.warning=options.storageWarning ?? '';this.render();
  }
  reset(){this.flow.reset();this.message='Progress reset. Start again when you are ready.';this.persist();this.render('lesson-title');}
  private persist(){try{this.options.changed?.(this.flow.snapshot());}catch{this.warning='Progress could not be saved in this browser. Keep this page open to retain this session.';}}
  private action(label:string,run:()=>void,key:string,disabled=false){const b=node('button',label);b.type='button';b.disabled=disabled;b.dataset.focus=key;b.addEventListener('click',run);return b;}
  private url(id:string){if(this.options.assetURL)return this.options.assetURL(id);const asset=this.project.document.assets.find(a=>a.id===id)!;return `data:${asset.mediaType};base64,${this.project.files[assetPath(asset)]}`;}
  private render(focus?:string){
    this.root.replaceChildren();const course=this.project.document.course,flow=this.flow;document.documentElement.lang=course.language;document.title=course.title || 'Untitled course';this.root.style.fontFamily=course.theme.font==='serif'?'Georgia,serif':'system-ui,sans-serif';this.root.style.setProperty('--course-accent',accentInk(course.theme.accentColor)==='#000000'?'#193c35':course.theme.accentColor);this.root.style.setProperty('--course-accent-ink',accentInk(course.theme.accentColor));
    const header=node('header',undefined,'player-header');header.append(node('p',this.options.preview ? 'Author preview · isolated practice progress' : 'OpenScroll course','player-brand'),node('h1',course.title || 'Untitled course'));
    if(course.author)header.append(node('p',`By ${course.author}`));
    if(course.description){const description=node('p',course.description,'player-description');header.append(description);}
    if(course.cover){const img=node('img');img.className='player-cover';img.src=this.url(course.cover.assetId);img.alt=course.cover.decorative ? '' : course.cover.altText;header.append(img);}
    const progress=flow.progress;const progressLabel=node('p',`${progress.done} of ${progress.total} lessons complete · ${progress.percent}%`);progressLabel.id='course-progress-label';
    const meter=node('progress');meter.max=Math.max(1,progress.total);meter.value=progress.done;meter.setAttribute('aria-labelledby',progressLabel.id);header.append(progressLabel,meter);
    header.append(this.action('Reset progress',()=>{if(this.options.preview || confirm('Reset your progress in this course?'))this.reset();},'reset'));
    const score=flow.score;if(score.possible){const result=node('p',`Assessment: ${score.earned} of ${score.possible} points · ${score.percent}% · ${score.status}. Passing score: ${score.passingScore}%.`);result.className='player-score';result.setAttribute('role','status');header.append(result);}
    const layout=node('div',undefined,`player-layout${course.theme.pageWidth==='wide' ? ' player-wide' : ''}`);
    const nav=node('nav');nav.setAttribute('aria-label','Course lessons');nav.append(node('h2','Course outline'));
    for(const section of course.sections){if(!section.lessons.length)continue;nav.append(node('h3',section.title || 'Untitled section'));const list=node('ol');for(const lesson of section.lessons){const li=node('li'),complete=flow.completed.has(lesson.id),locked=!flow.canEnter(lesson.id);const b=this.action(`${lesson.title || 'Untitled lesson'}${complete ? ' · Complete' : locked ? ' · Locked' : ''}`,()=>{flow.enter(lesson.id);this.message='';this.persist();this.render('lesson-title');},`nav-${lesson.id}`,locked);if(lesson.id===flow.lessonId)b.setAttribute('aria-current','step');li.append(b);list.append(li);}nav.append(list);}
    const main=node('main');main.id='lesson-content';main.tabIndex=-1;
    const heading=node('h2',flow.lesson?.title || 'No lessons yet');heading.tabIndex=-1;heading.dataset.focus='lesson-title';main.append(heading);
    const status=node('p',this.message);status.setAttribute('role','status');status.className='player-status';main.append(status);
    if(this.warning){const warning=node('p',this.warning);warning.setAttribute('role','status');main.append(warning);}
    if(!flow.lesson)main.append(node('p','This course has no lessons to display. Return to the authoring tool to add one.'));
    else{
      const content=node('div',undefined,'player-blocks');const required=flow.required();
      for(const block of flow.visible()){
        const wrapper=node('section');wrapper.className='player-block';wrapper.dataset.blockId=block.id;wrapper.tabIndex=-1;wrapper.dataset.focus=`block-${block.id}`;
        if(block.type==='continue' && block===flow.lesson.blocks.at(-1))continue;
        if(block.type==='continue'){
          const enabled=flow.canContinue(block.id),released=flow.released.has(block.id);const help=node('p',released ? 'This section is open.' : enabled ? 'Continue to reveal the next part of this lesson.' : 'Complete the required content above before continuing.');help.id=`gate-${block.id}`;
          const button=this.action(released ? `${block.content.label || 'Continue'} · Opened` : block.content.label || 'Continue',()=>{const visible=flow.visible().length;if(flow.continue(block.id)){this.message='More content is available.';this.persist();const next=flow.visible()[visible];this.render(next ? `block-${next.id}` : 'complete-lesson');}},`continue-${block.id}`,!enabled || released);button.setAttribute('aria-describedby',help.id);wrapper.append(help,button);
        }else{
          const rendered=renderBlock(block,this.project,undefined,id=>this.url(id),index=>{if(flow.visit(block.id,index)){this.persist();queueMicrotask(()=>this.refreshGates());}});
          if(isAssessment(block))rendered.replaceChildren(renderAssessment(block,flow,()=>this.persist(),focus=>this.render(focus)));
          wrapper.append(rendered);
          if(block.requiredInteraction){const status=node('p');status.dataset.interactionProgress=block.id;status.setAttribute('role','status');status.textContent=`Explored ${flow.explored(block.id)} of ${interactionCount(block)} items.`;wrapper.append(status);}
          if(required.has(block.id)){const reviewed=flow.reviewed.has(block.id);wrapper.append(this.action(reviewed ? 'Reviewed' : 'Mark as reviewed',()=>{flow.review(block.id);this.message='Content marked as reviewed.';this.persist();this.render(`review-${block.id}`);},`review-${block.id}`,false));const b=wrapper.querySelector<HTMLButtonElement>(`[data-focus="review-${block.id}"]`)!;b.setAttribute('aria-pressed',String(reviewed));b.setAttribute('aria-label',`${reviewed ? 'Reviewed' : 'Mark as reviewed'}: ${this.blockLabel(block.id)}`);}
        }
        content.append(wrapper);
      }main.append(content);
      const footer=node('div',undefined,'player-lesson-actions'),index=flow.lessons.findIndex(l=>l.id===flow.lessonId),done=flow.completed.has(flow.lessonId),next=flow.lessons[index+1];
      const pending=flow.visible().filter(isAssessment).filter(block=>{const record=flow.record(block.id);return ((block.assessment.required || this.gated(block.id)) && !record?.last) || !!record?.draft;});
      if(pending.length)footer.append(this.action('Submit all answers',()=>{
        const responses=pending.map(block=>({block,answer:flow.record(block.id)?.draft ?? emptyAnswer(block)}));
        const missing=responses.find(({block,answer})=>assessmentIssue(block)||!validAnswer(block,answer));
        if(missing){this.message=`Answer this question before submitting: ${missing.block.content.prompt}`;this.render(`question-${missing.block.id}`);return;}
        for(const {block,answer}of responses)flow.submit(block.id,answer);
        this.message='Answers submitted. Review your feedback, then finish the lesson.';this.persist();this.render('complete-lesson');
      },'submit-all'));
      if(!done || !next)footer.append(this.action(done ? 'Lesson complete' : next ? 'Complete lesson and continue' : 'Complete lesson',()=>{if(flow.finish()){
        this.message=flow.progress.done===flow.progress.total ? 'Course complete. You have completed every lesson.' : 'Lesson complete.';
        if(next){flow.enter(next.id);this.message='Previous lesson complete.';}this.persist();this.render(next ? 'lesson-title' : 'complete-lesson');
      }},'complete-lesson',done || !flow.canFinish()));
      if(index>0)footer.append(this.action('Previous lesson',()=>{flow.enter(flow.lessons[index-1]!.id);this.message='';this.persist();this.render('lesson-title');},'previous'));
      if(done && next)footer.append(this.action('Next lesson',()=>{flow.enter(next.id);this.message='';this.persist();this.render('lesson-title');},'next',!flow.canEnter(next.id)));
      const requirements=node('div');requirements.className='player-requirements';requirements.dataset.requirements='';footer.append(requirements);this.requirements(requirements);
      if(flow.progress.total>0 && flow.progress.done===flow.progress.total)footer.append(node('p','Course complete. All lessons are marked complete.','player-course-complete'));
      main.append(footer);
    }
    layout.append(nav,main);this.root.append(header,layout);if(focus){const target=[...this.root.querySelectorAll<HTMLElement>('[data-focus]')].find(el=>el.dataset.focus===focus);target?.focus();}
  }
  private refreshGates(){
    for(const block of this.flow.visible()){
      if(block.type==='continue' && !this.flow.released.has(block.id)){const button=this.root.querySelector<HTMLButtonElement>(`[data-focus="continue-${block.id}"]`);if(button)button.disabled=!this.flow.canContinue(block.id);const help=this.root.querySelector<HTMLElement>(`#gate-${block.id}`);if(help)help.textContent=this.flow.canContinue(block.id) ? 'Continue to reveal the next part of this lesson.' : 'Complete the required content above before continuing.';}
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
      return (isAssessment(block) && (block.assessment.required || this.gated(block.id)) || block.requiredInteraction || this.flow.required().has(block.id)) && !this.flow.isComplete(block);
    });
    if(!items.length)return;root.append(node('p','To finish this lesson:'));const list=node('ul');
    for(const block of items){
      const label=isAssessment(block)?`${this.flow.record(block.id)?.last?'Answer correctly':'Submit answer'}: ${block.content.prompt}`:block.requiredInteraction?`Explore all items: ${this.blockLabel(block.id)}`:block.type==='continue'?'Open the next section':'Review: '+this.blockLabel(block.id);
      const item=node('li');item.append(this.action(label,()=>{const target=this.root.querySelector<HTMLElement>(`[data-focus="${isAssessment(block)?'question-':'block-'}${block.id}"]`);target?.focus();target?.scrollIntoView({block:'center'});},'requirement-'+block.id));list.append(item);
    }root.append(list);
  }
  private blockLabel(id:string){const block=this.flow.lesson!.blocks.find(b=>b.id===id)!;const content=block.content as Record<string,unknown>;const text=String(content.prompt || content.heading || content.text || content.caption || (Array.isArray(content.items) ? typeof content.items[0]==='string' ? content.items[0] : (content.items[0] as {title?:string})?.title : '') || block.type);return text.slice(0,100);}
}
