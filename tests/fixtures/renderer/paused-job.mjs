// Exercise the real renderer, delaying PDF output long enough to inspect its OS state.
import {chromium} from '/app/node_modules/playwright-core/index.mjs';
import {renderPdf} from '/app/dist/server/src/renderer/render.js';
import {chmod,readFile,readdir,writeFile} from 'node:fs/promises';
async function snapshot(browser){
  // Chrome can retain its zygote argv after forking a renderer. Identify roles
  // through CDP, then verify those exact OS PIDs below instead of trusting argv.
  const session=await browser.newBrowserCDPSession();let processInfo;
  try{({processInfo}=await session.send('SystemInfo.getProcessInfo'));}finally{await session.detach();}
  const roles=new Map(processInfo.filter(p=>Number.isInteger(p.id)&&p.id>1).map(p=>[p.id,p.type]));
  const list=[];for(const pid of await readdir('/proc'))if(/^\d+$/.test(pid))try{
    const status=await readFile('/proc/'+pid+'/status','utf8'),name=status.match(/^Name:\s+(.*)$/m)?.[1];
    if(!roles.has(Number(pid))&&!/chrom(e|ium)/i.test(name??''))continue;
    const fields=Object.fromEntries(['Uid','Gid','Groups','CapInh','CapPrm','CapEff','CapAmb','NoNewPrivs','Seccomp'].map(key=>[key,status.split('\n').find(line=>line.startsWith(key+':'))?.slice(key.length+1).trim()??'']));
    // Chromium may replace argv/environment storage with one process-title string.
    const args=(await readFile('/proc/'+pid+'/cmdline','utf8')).replaceAll('\0',' ').match(/--[a-z0-9-]+(?:=[^\s]+)?/gi)??[];
    let envKeys=[],envReadable=false,fontationsEnabled=false;try{const entries=(await readFile('/proc/'+pid+'/environ','utf8')).split('\0').filter(value=>/^[a-z_][a-z0-9_]*=/i.test(value));envKeys=entries.map(value=>value.split('=')[0]);fontationsEnabled=entries.includes('FC_FONTATIONS=1');envReadable=true;}catch{}
    list.push({pid:Number(pid),name,cdpType:roles.get(Number(pid)),...fields,args,envKeys,envReadable,fontationsEnabled});
  }catch{}
  // This generated fixture mount exists only in smoke tests; production has no writable parent mount.
  await writeFile('/run/renderer-test/renderer-os-probe.json',JSON.stringify(list));await chmod('/run/renderer-test/renderer-os-probe.json',0o644);
}
const launch=chromium.launch.bind(chromium);
chromium.launch=async(...args)=>{
  const browser=await launch(...args),newContext=browser.newContext.bind(browser);
  browser.newContext=async(...contextArgs)=>{
    const context=await newContext(...contextArgs),newPage=context.newPage.bind(context);
    context.newPage=async(...pageArgs)=>{
      const page=await newPage(...pageArgs),pdf=page.pdf.bind(page);
      page.pdf=async(...pdfArgs)=>{await snapshot(browser);await new Promise(resolve=>setTimeout(resolve,3500));return pdf(...pdfArgs);};
      return page;
    };
    return context;
  };
  return browser;
};
const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);
const input=Buffer.concat(chunks),request=JSON.parse(input.subarray(4).toString('utf8'));
try{process.stdout.write(await renderPdf(request));}catch(error){
  await writeFile('/run/renderer-test/renderer-probe-error.json',JSON.stringify({name:error.name,code:error.code,message:String(error.message).split('\n')[0]}));
  await chmod('/run/renderer-test/renderer-probe-error.json',0o644);throw error;
}
