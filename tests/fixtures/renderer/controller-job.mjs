// Disposable smoke fixture only: mounted over job.js, never copied into an image.
import {execFileSync,spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {chmod,lstat,readFile,readdir,writeFile} from 'node:fs/promises';
const chunks=[];for await(const chunk of process.stdin)chunks.push(chunk);
const input=Buffer.concat(chunks),request=JSON.parse(input.subarray(4).toString('utf8'));
// A subsequent job must not inherit writable files or IPC objects from any earlier job.
for(const root of ['/tmp','/dev/shm','/dev/mqueue'])for(const name of await readdir(root))if((await lstat(root+'/'+name)).uid===65532)throw new Error('Residual browser-owned file.');
for(const kind of ['shm','sem','msg']){
  const [header,...rows]=(await readFile('/proc/sysvipc/'+kind,'utf8')).trim().split('\n'),columns=header.trim().split(/\s+/);
  for(const row of rows){const fields=row.trim().split(/\s+/);if(['uid','cuid'].some(key=>fields[columns.indexOf(key)]==='65532'))throw new Error('Residual browser-owned IPC object.');}
}
let ipc='not requested',posixQueue='not requested';
if(request.html!=='FIXTURE_OK'){
  await writeFile('/tmp/renderer-fixture-state','benign temporary marker');
  await writeFile('/dev/shm/renderer-fixture-state','benign shared-memory marker');
  if(existsSync('/usr/bin/ipcmk')){execFileSync('/usr/bin/ipcmk',['-M','4096','-S','1','-Q']);ipc='tiny SysV shared memory, semaphore and message queue created';}else ipc='skipped: ipcmk unavailable';
  if(existsSync('/usr/bin/python3')){
    execFileSync('/usr/bin/python3',['-c',"import ctypes,os;lib=ctypes.CDLL(None,use_errno=True);fd=lib.mq_open(b'/openscroll-renderer-fixture',os.O_CREAT|os.O_RDWR|os.O_EXCL,0o600,None);assert fd>=0,ctypes.get_errno();lib.mq_close(fd)"]);
    posixQueue='one empty POSIX message queue created';
  }else posixQueue='skipped: Python ctypes unavailable';
}
if(request.html==='FIXTURE_CRASH')process.exit(2);
if(request.html==='FIXTURE_OOM'){
  // A disposable 1 GiB cgroup bounds this deliberate allocation; no shared app is attached.
  const held=[];for(let i=0;i<24;i++){held.push(Buffer.alloc(64*1024*1024,1));await new Promise(resolve=>setImmediate(resolve));}
  process.exit(3);
}else if(request.html==='FIXTURE_OVERFLOW'){
  process.stdout.write('%PDF-');
  for(let i=0;i<34;i++)if(!process.stdout.write(Buffer.alloc(1024*1024,120)))await new Promise(resolve=>process.stdout.once('drain',resolve));
}else if(['FIXTURE_HANG','FIXTURE_DELAY'].includes(request.html)){
  const child=spawn(process.execPath,['--input-type=module','-e','setInterval(()=>{},1000)'],{detached:true,stdio:'ignore',env:{PATH:'/usr/local/bin:/usr/bin:/bin'}});
  child.unref();
  await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
  await writeFile('/tmp/renderer-fixture-grandchild.pid',String(child.pid));
  const value=await readFile('/proc/'+child.pid+'/stat','utf8'),parts=value.slice(value.lastIndexOf(')')+2).split(' ');
  await writeFile('/run/renderer-test/fixture-grandchild.json',JSON.stringify({marker:request.html,pid:child.pid,session:Number(parts[3]),processGroup:Number(parts[2])}));
  await chmod('/run/renderer-test/fixture-grandchild.json',0o644);
  if(request.html==='FIXTURE_HANG')setInterval(()=>{},1000);
  else{await new Promise(resolve=>setTimeout(resolve,2500));process.stdout.write('%PDF-1.7\nDisconnected disposable fixture\n%%EOF\n');}
}else process.stdout.write('%PDF-1.7\n'+JSON.stringify({ipc,posixQueue,priorWritableState:'empty'})+'\n%%EOF\n');
