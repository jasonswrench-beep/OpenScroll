/** Start/stop one disposable, network-denied renderer for local and CI checks. */
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {chmod,mkdir,readFile,rm,stat,writeFile,appendFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const statePath=resolve('.local/renderer-test-state.json'),envPath=resolve('.local/renderer-test.env');
const dockerEnv={...process.env};
for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete dockerEnv[key];
const docker=(args)=>new Promise((accept,reject)=>execFile('docker',['--host=unix:///var/run/docker.sock',...args],{env:dockerEnv,timeout:120000,maxBuffer:1024*1024},(error,out,err)=>error?reject(new Error(`Disposable renderer ${args[0]} failed: ${err.slice(-1500)}`)):accept(out)));
const pause=()=>new Promise(r=>setTimeout(r,200));
async function cleanup(state){
 assert.match(state.name,/^openscroll-renderer-check-[a-f0-9]{12}$/);
 assert.equal(state.label,state.name.slice('openscroll-renderer-check-'.length));
 const owned=await docker(['inspect','--format','{{index .Config.Labels "openscroll.renderer-test"}}',state.name]).catch(()=>undefined);
 if(owned!==undefined){assert.equal(owned.trim(),state.label,'Refusing to remove an unrelated container');await docker(['rm','--force',state.name]);}
 // Only this helper's own bind fixture is removed. The browser cannot access its parent.
 assert.equal(state.directory,join(tmpdir(),`openscroll-renderer-check-${state.label}`));
 await docker(['run','--rm','--network=none','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges:true','--user',`0:${state.gid}`,'--mount',`type=bind,src=${state.directory},dst=/run/renderer-test`,state.image,'node','-e',"require('fs').rmSync('/run/renderer-test/worker',{recursive:true,force:true})"]);
 await rm(state.directory,{recursive:true,force:true});await rm(statePath,{force:true});await rm(envPath,{force:true});
}
const [action,image]=process.argv.slice(2);
if(action==='stop'){
 try{await cleanup(JSON.parse(await readFile(statePath,'utf8')));console.log('Removed the disposable renderer and its socket fixture.');}
 catch(error){if(error.code!=='ENOENT')throw error;}
}else if(action==='start'){
 assert.match(image??'',/^[a-zA-Z0-9][a-zA-Z0-9./:@_-]*$/,'Usage: node tools/renderer-test-service.mjs start IMAGE | stop');
 await mkdir('.local',{recursive:true});
 try{await stat(statePath);throw new Error('A renderer fixture is already recorded; stop it before starting another.');}catch(error){if(error.code!=='ENOENT')throw error;}
 const gid=process.getgid();assert.ok(Number.isInteger(gid)&&gid>=0&&gid<65532,'The test client requires a group distinct from the browser group.');
 const label=randomBytes(6).toString('hex'),name=`openscroll-renderer-check-${label}`,directory=join(tmpdir(),name);
 await mkdir(directory,{mode:0o1777});await chmod(directory,0o1777);
 const state={name,label,directory,gid,image},socket=join(directory,'worker','renderer.sock');
 await writeFile(statePath,JSON.stringify(state),{mode:0o600});
 try{
  const proxies=['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy'].flatMap(key=>['--env',`${key}=`]);
  await docker(['run','--detach','--init','--name',name,'--label',`openscroll.renderer-test=${label}`,'--network=none','--ipc=private','--user',`0:${gid}`,'--read-only','--cap-drop=ALL','--cap-add=SETUID','--cap-add=SETGID','--cap-add=KILL','--security-opt=no-new-privileges:true','--tmpfs','/tmp:rw,nosuid,noexec,size=256m,mode=1777','--shm-size=256m','--memory=1g','--memory-swap=1g','--cpus=1','--pids-limit=256','--mount',`type=bind,src=${directory},dst=/run/renderer-test`,'--env','PDF_RENDERER_SOCKET=/run/renderer-test/worker/renderer.sock',...proxies,image]);
  let ready=false;
  for(let attempt=0;attempt<150;attempt++){try{const info=await stat(socket);if(info.isSocket()&&(info.mode&0o777)===0o660){ready=true;break;}}catch{}await pause();}
  if(!ready)throw new Error('The isolated renderer did not create its private socket. '+(await docker(['logs',name])).slice(-1200));
  const quote=value=>"'"+value.replaceAll("'","'\\''")+"'";
  await writeFile(envPath,`export PDF_RENDERER_SOCKET=${quote(socket)}\n`,{mode:0o600});
  if(process.env.GITHUB_ENV)await appendFile(process.env.GITHUB_ENV,`PDF_RENDERER_SOCKET=${socket}\n`);
  console.log('Started a disposable credential-free renderer with no network. Source .local/renderer-test.env for local tests.');
 }catch(error){await cleanup(state).catch(()=>{});throw error;}
}else throw new Error('Usage: node tools/renderer-test-service.mjs start IMAGE | stop');
