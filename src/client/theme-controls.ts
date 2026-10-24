import type { PortableProject } from '../shared/course.js';
import { THEME_PRESETS } from '../shared/course-templates.js';
import { element } from './reusable-content.js';
import type { CourseTheme } from '../shared/reuse.js';
export class ThemeControls{
 private color=element('input');private font=element('select');private width=element('select');private preset=element('select');
 constructor(root:HTMLElement,private project:()=>PortableProject|undefined,private apply:(theme:CourseTheme)=>void){
  const fields=element('fieldset');fields.className='theme-controls';fields.append(element('legend','Course theme'));this.color.type='color';this.color.setAttribute('aria-label','Course accent color');
  this.preset.add(new Option('Custom',''));for(const p of THEME_PRESETS)this.preset.add(new Option(p.name,p.name));this.font.add(new Option('Sans serif','sans'));this.font.add(new Option('Serif','serif'));this.width.add(new Option('Standard','standard'));this.width.add(new Option('Wide','wide'));
  for(const [title,input]of [['Theme preset',this.preset],['Course accent color',this.color],['Course font',this.font],['Course width',this.width]] as const){const label=element('label',title);input.setAttribute('aria-label',title);label.append(input);fields.append(label);}
  this.preset.addEventListener('change',()=>{const preset=THEME_PRESETS.find(p=>p.name===this.preset.value);if(preset){this.apply(structuredClone(preset.theme));this.update();}});
  for(const input of [this.color,this.font,this.width])input.addEventListener('change',()=>{this.apply({accentColor:this.color.value,font:this.font.value as CourseTheme['font'],pageWidth:this.width.value as CourseTheme['pageWidth']});this.update();});root.append(fields);
 }
 update(){const theme=this.project()?.document.course.theme;if(!theme)return;this.color.value=theme.accentColor;this.font.value=theme.font;this.width.value=theme.pageWidth;this.preset.value=THEME_PRESETS.find(p=>JSON.stringify(p.theme)===JSON.stringify(theme))?.name??'';}
}
