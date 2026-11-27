import { ProjectError } from '../shared/course.js';
import { validateProject } from './archive.js';
import { courseChecks } from './checks.js';
import { externalVideoEnabled } from '../server/config.js';
/** Shared publication gate: the first check that blocks export stops it. Incomplete drafts may still be saved. */
export function publicationProject(input:unknown){
 const project=validateProject(input);
 const blocking=courseChecks(project,{externalVideo:externalVideoEnabled()}).find(issue=>issue.effect==='blocks');
 if(blocking)throw new ProjectError(blocking.message);
 return project;
}
