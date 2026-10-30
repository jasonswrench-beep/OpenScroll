/** Built-image checks; every service and fixture is disposable and receives no app configuration. */
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {chmod,copyFile,mkdtemp,readFile,rm,stat,writeFile} from 'node:fs/promises';
import {createConnection} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

let image=process.argv[2];const limit=32*1024*1024;
let helperImage=process.argv[3]??image;
for(const value of [image,helperImage])assert.ok(value&&/^[a-zA-Z0-9][a-zA-Z0-9./:@_-]*$/.test(value),'Usage: node tools/renderer-isolation-smoke.mjs <built-renderer-image> [built-node-helper-image]');
const directory=await mkdtemp(join(tmpdir(),'openscroll-renderer-test-'));
await chmod(directory,0o1777);
const prefix='openscroll-renderer-test-'+randomBytes(6).toString('hex'),network=prefix+'-canary';
const containers=new Set(),results=[],dockerEnv={...process.env};
for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete dockerEnv[key];
const fixtures=fileURLToPath(new URL('../tests/fixtures/renderer/',import.meta.url));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function command(file,args,{input,timeout=20000,maxBuffer=1024*1024,env=process.env,includeStderr=false}={}){
  return new Promise((accept,reject)=>{
    const child=execFile(file,args,{env,timeout,maxBuffer},(error,stdout,stderr)=>error?reject(new Error(`${file} ${args[0]} failed: ${(stderr||error.message).slice(-1500)}`)):accept(stdout+(includeStderr?stderr:'')));
    child.stdin.on('error',()=>{});child.stdin.end(input);
  });
}
const proxyKeys=['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy'];
const emptyProxies=proxyKeys.flatMap(key=>['--env',key+'=']);
const docker=(args,options={})=>command('docker',['--host=unix:///var/run/docker.sock',...(args[0]==='run'?['run',...emptyProxies,...args.slice(1)]:args)],{...options,env:dockerEnv});
async function removeContainer(name){await docker(['rm','--force',name]);containers.delete(name);}
function pass(name,evidence){results.push({name,...evidence});console.log('PASS: '+name+(evidence?' '+JSON.stringify(evidence):''));}
function frame(request){const body=Buffer.from(JSON.stringify(request)),out=Buffer.alloc(body.length+4);out.writeUInt32BE(body.length);body.copy(out,4);return out;}
function exchange(path,bytes,{end=true,timeout=5000}={}){
  let socket;
  const result=new Promise((accept,reject)=>{
    let done=false,total=0;const chunks=[];
    const finish=(error)=>{if(done)return;done=true;clearTimeout(timer);socket.destroy();error?reject(error):accept(Buffer.concat(chunks,total));};
    const timer=setTimeout(()=>finish(new Error('Fixture socket deadline exceeded')),timeout);
    socket=createConnection({path,allowHalfOpen:true});socket.once('connect',()=>{socket.write(bytes);if(end)socket.end();});
    socket.on('data',chunk=>{total+=chunk.length;if(total>limit+8)return finish(new Error('Unbounded renderer response'));chunks.push(chunk);});
    socket.once('end',()=>finish());socket.once('error',error=>finish(error));socket.once('close',()=>finish());
  });
  result.catch(()=>{});return {result,destroy:()=>socket?.destroy()};
}
function response(bytes){assert.ok(bytes.length>=5,'Missing bounded response');const size=bytes.readUInt32BE();assert.equal(bytes.length,size+4,'Response must have one exact frame');assert.ok(size>=1&&size<=limit+1);const status=bytes[4],body=bytes.subarray(5);assert.ok([0,1,2].includes(status));if(status===0)assert.equal(body.subarray(0,5).toString(),'%PDF-');if(status===1)assert.ok(body.length<=1024);if(status===2)assert.equal(body.length,0);return {status,body};}
async function rejected(path,bytes,timeout=5000){const reply=await exchange(path,bytes,{timeout}).result.catch(error=>{if(!['ECONNRESET','EPIPE'].includes(error.code))throw error;return Buffer.alloc(0);});if(reply.length)assert.equal(response(reply).status,1);}
async function inspect(name){return JSON.parse(await docker(['inspect',name]))[0];}
async function waitSocket(name,path){
  for(let i=0;i<100;i++){
    try{assert.ok((await stat(path)).isSocket());const value=response(await exchange(path,frame({html:'<p>readiness</p>',paper:'invalid'}),{timeout:1000}).result);if(value.status===1)return;}catch{}
    if(i%20===19){const state=(await inspect(name)).State;if(!state.Running)throw new Error('Renderer stopped before readiness '+JSON.stringify({exit:state.ExitCode,oom:state.OOMKilled})+': '+await docker(['logs','--tail','20',name],{includeStderr:true}));}
    await pause(100);
  }throw new Error('Renderer socket did not become ready');
}
async function worker(label,fixture,withoutInit=false){
  const name=prefix+'-'+label,root=join(directory,label);await command('mkdir',['-m','1777',root]);containers.add(name);
  const args=['run','--pull=never','--detach','--init','--restart=on-failure:3','--name',name,'--network=none','--ipc=private','--read-only','--user=0:'+process.getgid(),
    '--cap-drop=ALL','--cap-add=SETUID','--cap-add=SETGID','--cap-add=KILL','--security-opt=no-new-privileges:true',
    '--tmpfs=/tmp:rw,nosuid,noexec,size=256m,mode=1777','--shm-size=256m','--memory=1g','--memory-swap=1g','--cpus=1','--pids-limit=256',
    '--mount',`type=bind,src=${root},dst=/run/renderer-test`,'--env=PDF_RENDERER_SOCKET=/run/renderer-test/worker/renderer.sock','--env=PDF_RENDERER_CLIENT_GID='+process.getgid()];
  if(withoutInit){args.splice(args.indexOf('--init'),1);args.splice(args.indexOf('--restart=on-failure:3'),1);}
  if(fixture){const copy=join(directory,'fixture-'+label+'.mjs');await copyFile(join(fixtures,fixture),copy);await chmod(copy,0o644);args.push('--mount',`type=bind,src=${copy},dst=/app/dist/server/src/renderer/job.js,readonly`);}
  args.push(image);await docker(args);rootCleanupNeeded=true;const path=join(root,'worker','renderer.sock');
  if(withoutInit){
    let info;for(let i=0;i<50;i++){info=await inspect(name);if(!info.State.Running)break;await pause(100);}
    assert.equal(info.State.Running,false,'Worker without init must stop before serving');assert.equal(info.State.ExitCode,1);assert.ok(!info.HostConfig.Init);assert.equal(info.HostConfig.PidMode,'');
    await assert.rejects(stat(path),{code:'ENOENT'});await removeContainer(name);return;
  }
  await waitSocket(name,path);return {name,path,root};
}
async function execNode(name,source,user='65532:65532'){
  return JSON.parse(await docker(['exec','--interactive','--user',user,name,'node','--input-type=module','-'],{input:source}));
}
async function waitDetached(worker,marker){
  for(let i=0;i<100;i++){
    try{const value=JSON.parse(await readFile(join(worker.root,'fixture-grandchild.json'),'utf8'));if(value.marker===marker&&Number.isInteger(value.pid)&&value.pid>1){assert.equal(value.pid,value.session);assert.equal(value.pid,value.processGroup);return value;}}catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error;}
    await pause(50);
  }throw new Error('Disposable detached-child fixture did not start');
}
let networkCreated=false,imageAvailable=false,rootCleanupNeeded=false,primaryFailure;
try{
  const imageInfo=JSON.parse(await docker(['image','inspect',image]))[0];
  image=imageInfo.Id;imageAvailable=true;
  assert.ok(!(imageInfo.Config.Env??[]).some(value=>/^(DATABASE_URL|SMTP_|SESSION_|MAIL_|APP_ORIGIN|ACCESS_REQUEST_NOTIFY_EMAIL|COOKIE_SECRET)/.test(value)),'Renderer image must not contain app credential/config keys');
  const helperInfo=JSON.parse(await docker(['image','inspect',helperImage]))[0];helperImage=helperInfo.Id;
  assert.ok(!(helperInfo.Config.Env??[]).some(value=>/^(DATABASE_URL|SMTP_|SESSION_|MAIL_|APP_ORIGIN|ACCESS_REQUEST_NOTIFY_EMAIL|COOKIE_SECRET|NODE_OPTIONS)/.test(value)),'The controlled Node helper image must contain no credential or startup-hook keys');
  await worker('without-init',undefined,true);pass('startup fails closed without Docker init in a private PID namespace');
  const normal=await worker('normal');const info=await inspect(normal.name),host=info.HostConfig;
  const actualEnv=Object.fromEntries(info.Config.Env.map(value=>[value.slice(0,value.indexOf('=')),value.slice(value.indexOf('=')+1)]));
  for(const key of proxyKeys)assert.equal(actualEnv[key],'','Renderer proxies must be explicitly empty: '+key);
  assert.equal(host.NetworkMode,'none');assert.equal(host.ReadonlyRootfs,true);assert.equal(host.Privileged,false);assert.equal(host.Init,true);
  assert.deepEqual(host.CapAdd.map(value=>value.replace(/^CAP_/, '')).sort(),['KILL','SETGID','SETUID']);assert.ok(host.CapDrop.includes('ALL'));assert.ok(host.SecurityOpt.some(value=>value.includes('no-new-privileges')));
  assert.equal(host.Memory,1024**3);assert.equal(host.MemorySwap,1024**3);assert.equal(host.NanoCpus,1e9);assert.equal(host.PidsLimit,256);assert.equal(host.ShmSize,256*1024**2);assert.equal(host.IpcMode,'private');
  assert.equal(info.Config.User,'0:'+process.getgid());assert.equal(host.PortBindings&&Object.keys(host.PortBindings).length||0,0);
  assert.equal(info.Mounts.filter(m=>m.Type==='bind').length,1);
  // Host user namespaces may project container UID 0 as overflow UID 65534.
  const {socketStat,dirStat}=await execNode(normal.name,"import {statSync} from 'node:fs';const pick=s=>({uid:s.uid,gid:s.gid,mode:s.mode});console.log(JSON.stringify({socketStat:pick(statSync('/run/renderer-test/worker/renderer.sock')),dirStat:pick(statSync('/run/renderer-test/worker'))}));",'0:'+process.getgid());
  assert.equal(socketStat.uid,0);assert.equal(socketStat.gid,process.getgid());assert.equal(socketStat.mode&0o777,0o660);
  assert.equal(dirStat.uid,0);assert.equal(dirStat.gid,process.getgid());assert.equal(dirStat.mode&0o777,0o750);
  pass('image and actual container controls',{imageId:imageInfo.Id,nodeHelperImageId:helperImage,socketMode:'0660',directoryMode:'0750'});

  await docker(['network','create','--internal',network]);networkCreated=true;
  const canary=prefix+'-canary';containers.add(canary);
  await docker(['run','--pull=never','--detach','--name',canary,'--network',network,'--read-only','--cap-drop=ALL','--security-opt=no-new-privileges:true','--user=65532:65532','--workdir=/','--entrypoint=/usr/bin/env',helperImage,'-i','PATH=/usr/local/bin:/usr/bin:/bin','HOME=/tmp','LANG=C.UTF-8','node','--input-type=module','-e',
    "import net from 'node:net';import dgram from 'node:dgram';let tcp=0,dns=0;net.createServer(s=>{tcp++;s.end('LOCAL-CANARY')}).listen(43123,'0.0.0.0');net.createServer(s=>s.end(JSON.stringify({tcp,dns}))).listen(43124,'0.0.0.0');const udp=dgram.createSocket('udp4');udp.on('message',(m,r)=>{dns++;const reply=Buffer.from(m.subarray(0,m.indexOf(0,12)+5));reply.writeUInt16BE(0x8183,2);reply.fill(0,6,12);udp.send(reply,r.port,r.address)});udp.bind(5353,'0.0.0.0');"]);
  const canaryInfo=await inspect(canary),canaryIp=canaryInfo.NetworkSettings.Networks[network].IPAddress;
  const canaryStats=async()=>JSON.parse(await docker(['exec','--interactive','--user=65532:65532',canary,'/usr/bin/env','-i','PATH=/usr/local/bin:/usr/bin:/bin','node','--input-type=module','-'],{input:"import net from 'node:net';const s=net.connect(43124,'127.0.0.1');s.on('data',data=>process.stdout.write(data));"}));
  let canaryReady=false;for(let i=0;i<20;i++){try{await canaryStats();canaryReady=true;break;}catch{await pause(50);}}assert.ok(canaryReady,'Local TCP/DNS canary failed to start');
  const control=prefix+'-control';containers.add(control);
  const controlText=await docker(['run','--pull=never','--name',control,'--network',network,'--read-only','--cap-drop=ALL','--security-opt=no-new-privileges:true','--user=65532:65532','--workdir=/','--entrypoint=/usr/bin/env',helperImage,'-i','PATH=/usr/local/bin:/usr/bin:/bin','HOME=/tmp','LANG=C.UTF-8','node','--input-type=module','-e',
    `import assert from 'node:assert/strict';import net from 'node:net';import {Resolver} from 'node:dns/promises';const tcp=await new Promise((resolve,reject)=>{const s=net.connect(43123,${JSON.stringify(canaryIp)});s.setTimeout(3000,()=>reject(new Error('Local canary timeout')));s.once('data',d=>{s.destroy();resolve(d.toString())});s.once('error',reject)});assert.equal(tcp,'LOCAL-CANARY');const r=new Resolver({timeout:300,tries:1});r.setServers([${JSON.stringify(canaryIp+':5353')}]);let dns;try{await r.resolve4('renderer-fixture.invalid')}catch(e){dns=e.code}assert.equal(dns,'ENOTFOUND');console.log(JSON.stringify({tcp,dns}));`]);
  assert.equal(JSON.parse(controlText).dns,'ENOTFOUND');
  await removeContainer(control);
  const beforeCanary=await canaryStats();assert.equal(beforeCanary.dns,1);assert.equal(beforeCanary.tcp,1);
  const boundary=await execNode(normal.name,String.raw`
    import assert from 'node:assert/strict';import {readFile,readdir,stat,writeFile} from 'node:fs/promises';import net from 'node:net';import {Resolver} from 'node:dns/promises';
    const status=await readFile('/proc/self/status','utf8'),get=k=>status.match(new RegExp('^'+k+':\\s*(.*)$','m'))?.[1]?.trim();
    assert.equal(process.getuid(),65532);assert.equal(process.getgid(),65532);assert.deepEqual(process.getgroups().filter(g=>g!==65532),[]);
    for(const key of ['CapInh','CapPrm','CapEff','CapAmb'])assert.match(get(key),/^0+$/);assert.equal(get('NoNewPrivs'),'1');assert.equal(get('Seccomp'),'2');
    let supervisor;for(const pid of await readdir('/proc'))if(/^\d+$/.test(pid))try{if((await readFile('/proc/'+pid+'/cmdline','utf8')).includes('/renderer/server.js')){const value=await readFile('/proc/'+pid+'/status','utf8');assert.match(value,/^Uid:\s+0\s+0\s+0\s+0$/m);assert.match(value,/^CapEff:\s+0*e0$/mi);assert.throws(()=>process.kill(Number(pid),0),{code:'EPERM'});supervisor={pid:Number(pid),uid:0,effectiveCaps:'SETUID SETGID KILL',signalDenied:true};}}catch(error){if(error.code!=='ENOENT')throw error}assert.ok(supervisor);
    for(const path of ['/app/.env','/app/dist/server/src/server/index.js','/app/dist/client','/app/local-mail','/app/node_modules/pg','/app/node_modules/nodemailer','/var/run/docker.sock'])await assert.rejects(stat(path),{code:'ENOENT'});
    await assert.rejects(writeFile('/app/renderer-smoke-write','x'),{code:'EROFS'});
    await assert.rejects(writeFile('/run/renderer-test/worker/renderer-smoke-write','x'),{code:'EACCES'});
    async function connect(options){return new Promise(resolve=>{const s=net.connect(options);let done=false;const finish=code=>{if(done)return;done=true;s.destroy();resolve(code)};s.once('connect',()=>finish('CONNECTED'));s.once('error',e=>finish(e.code));s.setTimeout(1000,()=>finish('TIMEOUT'));});}
    const uds=await connect({path:'/run/renderer-test/worker/renderer.sock'});assert.equal(uds,'EACCES');
    const tcp=await connect({host:CANARY_IP,port:43123});assert.equal(tcp,'ENETUNREACH');
    const interfaces=(await readFile('/proc/net/dev','utf8')).trim().split('\n').slice(2).map(line=>line.split(':')[0].trim());assert.deepEqual(interfaces,['lo']);
    const routes=(await readFile('/proc/net/route','utf8')).trim().split('\n').slice(1);assert.equal(routes.length,0);
    let memory,swap;try{memory=(await readFile('/sys/fs/cgroup/memory.max','utf8')).trim();swap=(await readFile('/sys/fs/cgroup/memory.swap.max','utf8')).trim();assert.equal(Number(memory),1024**3);assert.equal(swap,'0');}catch(error){if(error.code!=='ENOENT')throw error;memory=(await readFile('/sys/fs/cgroup/memory/memory.limit_in_bytes','utf8')).trim();const total=(await readFile('/sys/fs/cgroup/memory/memory.memsw.limit_in_bytes','utf8')).trim();assert.equal(Number(memory),1024**3);assert.equal(total,memory);swap='0';}
    const resolver=new Resolver({timeout:150,tries:1});resolver.setServers([CANARY_IP+':5353']);let dns;try{await resolver.resolve4('renderer-fixture.invalid');dns='RESOLVED'}catch(error){dns=error.code}assert.notEqual(dns,'RESOLVED');
    console.log(JSON.stringify({uid:process.getuid(),gid:process.getgid(),groups:process.getgroups(),caps:get('CapEff'),noNewPrivs:get('NoNewPrivs'),seccomp:get('Seccomp'),supervisor,uds,tcp,dns,interfaces,routes:routes.length,cgroupMemory:memory,cgroupSwap:swap,appFiles:'absent'}));`.replaceAll('CANARY_IP',JSON.stringify(canaryIp)));
  assert.deepEqual(await canaryStats(),beforeCanary,'The isolated worker must send no TCP or DNS packets to the local canary');
  pass('browser-identity boundary and kernel network denial',{...boundary,canaryPositiveControl:'TCP and DNS reachable from isolated test network; worker sends neither'});
  await removeContainer(canary);await docker(['network','rm',network]);networkCreated=false;

  const html='<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src \'none\';style-src \'unsafe-inline\';img-src data:"><style>body{font-family:"Noto Sans","Noto Sans CJK SC",sans-serif}</style><h1>RENDERER-LATIN Café 中文学习</h1><p>Benign isolated publication.</p></html>';
  const pdf=response(await exchange(normal.path,frame({html,paper:'A4'}),{timeout:47000}).result);assert.equal(pdf.status,0);assert.equal(pdf.body.subarray(0,5).toString(),'%PDF-');assert.ok(pdf.body.length>1000);
  const pdfPath=join(directory,'renderer.pdf');await writeFile(pdfPath,pdf.body);const text=await command('pdftotext',[pdfPath,'-']);assert.ok(text.includes('RENDERER-LATIN Café'));for(const char of '中文学习')assert.ok(text.includes(char));
  pass('actual final-image PDF with Latin and CJK',{bytes:pdf.body.length});
  for(const bytes of [Buffer.alloc(4),Buffer.from([2,0,0,1]),Buffer.from([0,0,0,5,123]),Buffer.from([0,0,0,1,123]),frame({html:'x',paper:'A4',unexpected:true}),Buffer.concat([frame({html:'x',paper:'A4'}),Buffer.from('trailer')])])await rejected(normal.path,bytes);
  await waitSocket(normal.name,normal.path);pass('zero, oversized, truncated, malformed and trailing request frames');await removeContainer(normal.name);

  const paused=await worker('paused','paused-job.mjs'),pending=exchange(paused.path,frame({html,paper:'Letter'}),{timeout:47000});
  let processes=[];for(let i=0;i<200;i++){
    try{processes=JSON.parse(await readFile(join(paused.root,'renderer-os-probe.json'),'utf8'));if(processes.some(p=>p.cdpType==='renderer'))break;}catch{}
    let diagnostic;try{diagnostic=await readFile(join(paused.root,'renderer-probe-error.json'),'utf8');}catch{}if(diagnostic)throw new Error('Disposable paused fixture: '+diagnostic);
    await pause(100);
  }
  if(!processes.some(p=>p.cdpType==='renderer'))console.error('Observed browser process metadata:',JSON.stringify(processes));
  assert.ok(processes.some(p=>p.cdpType==='renderer'),'Actual browser renderer PID was not observed through CDP and /proc');
  // Debian's Chromium wrapper adds its own Google-build and D-Bus variable names.
  const browserEnvKeys=new Set(['HOME','PATH','TMPDIR','LANG','LC_ALL','XDG_CACHE_HOME','XDG_CONFIG_HOME','PWD','CHROME_DESKTOP','CHROME_WRAPPER','CHROME_VERSION_EXTRA','CHROMIUM_FLAGS','GOOGLE_API_KEY','GOOGLE_DEFAULT_CLIENT_ID','GOOGLE_DEFAULT_CLIENT_SECRET','DBUS_SESSION_BUS_ADDRESS','FC_FONTATIONS']);
  for(const processInfo of processes){assert.ok(processInfo.Uid.split(/\s+/).every(v=>v==='65532'));assert.ok(processInfo.Gid.split(/\s+/).every(v=>v==='65532'));assert.equal(processInfo.Groups,'');for(const key of ['CapInh','CapPrm','CapEff','CapAmb'])assert.match(processInfo[key],/^0+$/);assert.equal(processInfo.NoNewPrivs,'1');assert.equal(processInfo.Seccomp,'2');for(const key of processInfo.envKeys)assert.ok(browserEnvKeys.has(key),'Unexpected browser environment key: '+key);if(processInfo.envKeys.includes('FC_FONTATIONS'))assert.equal(processInfo.fontationsEnabled,true,'Chrome may add only its fixed public Fontations flag.');}
  assert.ok(processes.some(p=>p.args.includes('--no-sandbox')),'Explicit Chromium sandbox fallback should be recorded');
  assert.ok(processes.some(p=>p.envReadable&&p.envKeys.includes('PATH')),'Actual Chromium environment keys must be observed, not inferred');
  assert.equal(response(await pending.result).status,0);pass('actual production Chromium process boundary',{processes});await removeContainer(paused.name);

  const fixture=await worker('controller','controller-job.mjs');
  const marker=response(await exchange(fixture.path,frame({html:'FIXTURE_MARKERS',paper:'A4'})).result);assert.equal(marker.status,0);
  const ipcEvidence=JSON.parse(marker.body.toString().split('\n')[1]);assert.equal(response(await exchange(fixture.path,frame({html:'FIXTURE_OK',paper:'A4'})).result).status,0);
  pass('temporary files, shared memory and available IPC fixtures are cleared between jobs',ipcEvidence);
  for(const marker of ['FIXTURE_CRASH','FIXTURE_OVERFLOW']){
    await rejected(fixture.path,frame({html:marker,paper:'A4'}));await waitSocket(fixture.name,fixture.path);
    assert.equal(response(await exchange(fixture.path,frame({html:'FIXTURE_OK',paper:'A4'})).result).status,0);
  }pass('crash and output overflow fail closed and recover');
  const oomBegan=new Date().toISOString();await rejected(fixture.path,frame({html:'FIXTURE_OOM',paper:'A4'}),15000);await waitSocket(fixture.name,fixture.path);
  const oomEvents=await docker(['events','--since',oomBegan,'--until',new Date().toISOString(),'--filter','container='+fixture.name,'--filter','event=oom','--format','{{.Action}}']);
  assert.match(oomEvents,/oom/,'The bounded-memory fixture must cause an actual cgroup OOM event');
  assert.equal(response(await exchange(fixture.path,frame({html:'FIXTURE_OK',paper:'A4'})).result).status,0);pass('1 GiB cgroup OOM fails closed and recovers');
  // After request EOF a closed peer need not be detectable before a write. The
  // documented contract permits this started job to finish, with cleanup afterward.
  const hanging=exchange(fixture.path,frame({html:'FIXTURE_DELAY',paper:'A4'}),{timeout:47000});hanging.result.catch(()=>{});await waitDetached(fixture,'FIXTURE_DELAY');
  assert.equal(response(await exchange(fixture.path,frame({html:'FIXTURE_OK',paper:'A4'})).result).status,2);hanging.destroy();await waitSocket(fixture.name,fixture.path);
  assert.equal(response(await exchange(fixture.path,frame({html:'FIXTURE_OK',paper:'A4'})).result).status,0);pass('one-job concurrency and disconnect descendant cleanup');

  const partial=await worker('partial'),partialBefore=await inspect(partial.name),partialBegan=Date.now();
  const partialRequest=exchange(partial.path,Buffer.from([0,0]),{end:false,timeout:49000});
  const before=await inspect(fixture.name),began=Date.now();console.log('Checking the unmodified 45-second deadlines for a detached setsid grandchild and an incomplete request.');
  const deadline=exchange(fixture.path,frame({html:'FIXTURE_HANG',paper:'A4'}),{timeout:49000});
  const escaped=await waitDetached(fixture,'FIXTURE_HANG');
  const deadlineReply=await deadline.result.catch(error=>{if(/deadline exceeded|Unbounded/.test(error.message))throw error;return Buffer.alloc(0);});if(deadlineReply.length)assert.equal(response(deadlineReply).status,1);
  const elapsed=Date.now()-began;assert.ok(elapsed>=43000&&elapsed<48500,'Controller deadline outside expected wall budget: '+elapsed);
  await waitSocket(fixture.name,fixture.path);const after=await inspect(fixture.name);assert.ok(after.RestartCount>before.RestartCount||after.State.Pid!==before.State.Pid,'Deadline must end the old PID namespace');
  assert.equal(response(await exchange(fixture.path,frame({html:'FIXTURE_OK',paper:'A4'})).result).status,0);pass('45-second external deadline ends detached descendants and recovers',{elapsedMs:elapsed,detachedSession:escaped.session,containerRestarted:true});
  const partialReply=await partialRequest.result.catch(error=>{if(/deadline exceeded|Unbounded/.test(error.message))throw error;return Buffer.alloc(0);});if(partialReply.length)assert.equal(response(partialReply).status,1);
  const partialElapsed=Date.now()-partialBegan;assert.ok(partialElapsed>=43000&&partialElapsed<49000);await waitSocket(partial.name,partial.path);
  const partialAfter=await inspect(partial.name);assert.ok(partialAfter.RestartCount>partialBefore.RestartCount||partialAfter.State.Pid!==partialBefore.State.Pid);
  pass('incomplete request is bounded by the same external deadline',{elapsedMs:partialElapsed,containerRestarted:true});
  console.log(JSON.stringify({result:'pass',checks:results}));
}catch(error){
  primaryFailure=error;
  for(const name of containers)try{const value=await inspect(name);console.error('Disposable fixture state:',JSON.stringify({name,running:value.State.Running,exit:value.State.ExitCode,oom:value.State.OOMKilled,restarts:value.RestartCount}));console.error((await docker(['logs','--tail','20',name],{includeStderr:true})).slice(-4000));}catch{}
  throw error;
}finally{
  const errors=[];for(const name of [...containers].reverse())await docker(['rm','--force',name]).catch(error=>{if(!error.message.includes('No such container'))errors.push(error.message);});
  if(networkCreated)await docker(['network','rm',network]).catch(error=>errors.push(error.message));
  // Root-created socket directories are group-readable, so the host can remove only the outer sticky directory after Docker is gone.
  if(imageAvailable&&rootCleanupNeeded)await docker(['run','--pull=never','--rm','--network=none','--read-only','--cap-drop=ALL','--user=0:'+process.getgid(),'--mount',`type=bind,src=${directory},dst=/cleanup`,'--entrypoint=node',image,'-e',"const f=require('fs');for(const entry of f.readdirSync('/cleanup')){const p='/cleanup/'+entry;if(f.lstatSync(p).isDirectory()){const worker=p+'/worker';try{f.unlinkSync(worker+'/renderer.sock');f.rmdirSync(worker)}catch(e){if(e.code!=='ENOENT')throw e}}}"]).catch(error=>errors.push(error.message));
  await rm(directory,{recursive:true,force:true}).catch(error=>errors.push(error.message));if(errors.length){if(primaryFailure)console.error('Additional cleanup failures:',errors);else throw new AggregateError(errors.map(message=>new Error(message)),'Disposable renderer cleanup failed');}
}
