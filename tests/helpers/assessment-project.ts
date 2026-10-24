import { sampleProject } from '../../src/project/sample.js';
import { prepareBlock } from '../../src/shared/block-catalog.js';
import { isAssessment } from '../../src/shared/assessment.js';
export function assessmentProject(){
 const project=sampleProject(),lesson=project.document.course.sections[0]!.lessons[0]!;lesson.blocks=[];project.document.course.settings.passingScore=80;
 for(const key of ['single-choice','multiple-response','fill-blank','matching','sorting']){const block=prepareBlock(key,project).block;if(!isAssessment(block))throw new Error();block.assessment={graded:true,points:1,required:true,completion:'submitted',maxAttempts:2};block.content.prompt=({'single-choice':'Choose a useful action.','multiple-response':'Choose both useful actions.','fill-blank':'Learning grows through ____.','matching':'Match each action to its meaning.','sorting':'Order the steps from noticing to reflection.'} as Record<string,string>)[key]!;if(key==='multiple-response')block.content.correct=[0,2];lesson.blocks.push(block);}
 const gate=prepareBlock('continue',project).block;if(gate.type==='continue')gate.completion='all-previous';lesson.blocks.push(gate);project.document.course.sections[0]!.lessons=[lesson];return project;
}
