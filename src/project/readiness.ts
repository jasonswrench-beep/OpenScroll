import { assessmentIssue } from '../shared/assessment.js';
import { ProjectError,eachBlock } from '../shared/course.js';
import { richIsEmpty } from '../shared/rich-text.js';
import { validateProject } from './archive.js';
/** Shared publication checks; incomplete authoring drafts may still be saved. */
export function publicationProject(input:unknown){
 const project=validateProject(input);
 for(const block of eachBlock(project.document.course.sections.flatMap(s=>s.lessons).flatMap(l=>l.blocks))){
  if(block.type==='assessment'){const issue=assessmentIssue(block);if(issue)throw new ProjectError(`Assessment is not ready: ${issue}`);}
  if((block.type==='audio'||block.type==='video') && block.content.assetId && !block.content.transcript.trim())throw new ProjectError(`Add a transcript to the ${block.type} block before publishing.`);
  if(block.type==='objectives' && block.content.items.some(item=>!item.text.trim()))throw new ProjectError('Fill in or remove the empty learning objective before publishing.');
  if(block.type==='reflection' && richIsEmpty(block.content.prompt))throw new ProjectError('Add a prompt to the reflection block before publishing.');
  if(block.type==='activity' && block.content.steps.every(step=>richIsEmpty(step)))throw new ProjectError('Add at least one step to the activity block before publishing.');
  if(block.type==='checklist' && block.content.items.some(item=>!item.trim()))throw new ProjectError('Fill in or remove the empty checklist item before publishing.');
  if(block.type==='self-assessment' && (block.content.items.some(item=>!item.trim()) || block.content.scale.some(label=>!label.trim())))throw new ProjectError('Fill in every statement and rating label in the self-assessment before publishing.');
  if(block.type==='video' && block.content.assetId && !block.content.captions.length)throw new ProjectError('Add timed captions to the video block before publishing.');
 }
 return project;
}
