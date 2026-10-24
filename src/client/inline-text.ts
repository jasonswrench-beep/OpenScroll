import type { TextField } from '../shared/block-renderer.js';
export function caretAtEnd(element:HTMLElement){
  const selection=window.getSelection();const range=document.createRange();range.selectNodeContents(element);range.collapse(false);selection?.removeAllRanges();selection?.addRange(range);
}
/** Plain text only: pasted markup never becomes course markup or executable DOM. */
export function bindInline(element:HTMLElement,field:TextField,commit:(text:string)=>void,selected:()=>void){
  element.contentEditable='plaintext-only';element.setAttribute('role','textbox');element.setAttribute('aria-label',field.label);element.setAttribute('aria-multiline',String(field.multiline));element.setAttribute('aria-placeholder',field.label);element.dataset.placeholder=field.label;element.spellcheck=true;
  let composing=false;
  const update=()=>{
    if(composing)return;
    let text=element.innerText.replace(/\r\n?/g,'\n');if(!field.multiline)text=text.replace(/\n/g,' ');
    if(text.length>field.max){text=text.slice(0,field.max);element.textContent=text;caretAtEnd(element);}
    commit(text);
  };
  element.addEventListener('focus',selected);
  element.addEventListener('compositionstart',()=>{composing=true;});element.addEventListener('compositionend',()=>{composing=false;update();});
  element.addEventListener('input',update);
  element.addEventListener('keydown',event=>{if(event.key==='Enter' && !field.multiline)event.preventDefault();});
  element.addEventListener('paste',event=>{
    event.preventDefault();let text=event.clipboardData?.getData('text/plain') ?? '';if(!field.multiline)text=text.replace(/[\r\n]+/g,' ');
    const selection=window.getSelection();let range=selection?.rangeCount ? selection.getRangeAt(0) : undefined;
    if(!range || !element.contains(range.commonAncestorContainer)){range=document.createRange();range.selectNodeContents(element);range.collapse(false);}
    range.deleteContents();const node=document.createTextNode(text);range.insertNode(node);range.setStartAfter(node);range.collapse(true);selection?.removeAllRanges();selection?.addRange(range);update();
  });
  element.addEventListener('drop',event=>{event.preventDefault();});
}
