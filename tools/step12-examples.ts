import { mkdir,writeFile } from 'node:fs/promises';
import { COURSE_TEMPLATES,courseTemplate,THEME_PRESETS } from '../src/shared/course-templates.js';
import { exportProject } from '../src/project/archive.js';
import { exportPdf } from '../src/project/pdf-export.js';
await mkdir('artifacts/step12',{recursive:true});
for(const template of COURSE_TEMPLATES){const project=courseTemplate(template.key);if(template.key==='workshop')project.document.course.theme=structuredClone(THEME_PRESETS[2]!.theme);await writeFile(`artifacts/step12/${template.key}.openscroll`,await exportProject(project));if(template.key==='workshop')await writeFile('artifacts/step12/guided-workshop-plum.pdf',await exportPdf(project,{paper:'A4',includeAnswers:false}));}
console.log('Created three portable templates and a themed PDF.');
