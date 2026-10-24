import { chromium,type Browser } from 'playwright-core';
import { ProjectError } from '../shared/course.js';
import { LIMITS } from './archive.js';
import { pdfHtml } from './pdf-html.js';
/** Inert authored text/images only. Each job owns a fresh, network-isolated browser. */
export async function exportPdf(input:unknown,settings:unknown={}){
 const {html,options}=pdfHtml(input,settings);let browser:Browser|undefined,expired=false;
 const deadline=setTimeout(()=>{expired=true;void browser?.close().catch(()=>{});},45000);
 try{
  try{browser=await chromium.launch({executablePath:process.env.PDF_CHROMIUM_EXECUTABLE_PATH??'/usr/bin/chromium',headless:true,timeout:15000,args:['--disable-dev-shm-usage']});}catch{throw new ProjectError('PDF publishing is unavailable. The server needs Chromium; see the PDF installation guide.');}
  const context=await browser.newContext({javaScriptEnabled:false,serviceWorkers:'block',offline:true});
  await context.route('**/*',route=>route.abort());const page=await context.newPage();page.setDefaultTimeout(20000);
  await page.setContent(html,{waitUntil:'load',timeout:20000});await page.emulateMedia({media:'print'});
  const ready=await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>image.decode().catch(()=>{})));return [...document.images].every(image=>image.complete && image.naturalWidth>0);});
  if(!ready)throw new ProjectError('An image could not be decoded for PDF publishing. Replace the damaged image and try again.');
  const bytes=await page.pdf({format:options.paper,tagged:true,outline:true,printBackground:true,displayHeaderFooter:true,headerTemplate:'<span></span>',footerTemplate:'<div style="font:9px sans-serif;width:100%;text-align:center;color:#425e52">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>',margin:{top:'18mm',right:'18mm',bottom:'20mm',left:'18mm'}});
  if(bytes.length>LIMITS.archive)throw new ProjectError('The PDF exceeds 32 MiB. Reduce image sizes or split the course.');return bytes;
 }catch(error){if(expired)throw new ProjectError('PDF generation timed out. Reduce image sizes or split the course and try again.');if(error instanceof ProjectError)throw error;throw new ProjectError('The PDF could not be generated. Check course images and try again.');}
 finally{clearTimeout(deadline);await browser?.close().catch(()=>{});}
}
