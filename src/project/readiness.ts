import { assessmentIssue } from '../shared/assessment.js';
import { ProjectError } from '../shared/course.js';
import { validateProject } from './archive.js';
/** Shared publication checks; incomplete authoring drafts may still be saved. */
export function publicationProject(input:unknown){
 const project=validateProject(input);
 for(const block of project.document.course.sections.flatMap(s=>s.lessons).flatMap(l=>l.blocks)){
  if(block.type==='assessment'){const issue=assessmentIssue(block);if(issue)throw new ProjectError(`Assessment is not ready: ${issue}`);}
  if((block.type==='audio'||block.type==='video') && block.content.assetId && !block.content.transcript.trim())throw new ProjectError(`Add a transcript to the ${block.type} block before publishing.`);
  if(block.type==='video' && block.content.assetId && !block.content.captions.length)throw new ProjectError('Add timed captions to the video block before publishing.');
 }
 return project;
}
