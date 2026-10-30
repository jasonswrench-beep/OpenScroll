import {get as httpsGet} from 'node:https';
/** Destructive only to unique test projects created here; never targets a live installation. */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp,writeFile,readFile,readdir,stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve,join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import { sampleProject } from '../src/project/sample.js';
import { groupPacket } from '../src/shared/reuse.js';
const exec=promisify(execFile),root=resolve('.'),dir=await mkdtemp(join(tmpdir(),'openscroll-deploy-')),suffix=randomBytes(4).toString('hex'),origin='https://openscroll-test.invalid',password=randomBytes(20).toString('hex');
async function port(){const server=createServer();await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const value=(server.address() as {port:number}).port;await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));return value;}
const sourcePort=await port(),targetPort=await port(),tlsPort=await port();
const common:NodeJS.ProcessEnv={...process.env};
// Shell deployment settings must never override these unique disposable fixtures.
for(const key of Object.keys(common))if(/^(APP_|SMTP_|MAIL_|OPENSCROLL_|COMPOSE_)/.test(key)||['DATABASE_URL','POSTGRES_PASSWORD','ACME_EMAIL','REGISTRATION_ENABLED','AUTHOR_ASSET_LIMIT_MIB','REQUIRE_EMAIL_VERIFICATION','ACCESS_REQUEST_NOTIFY_EMAIL','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH','PDF_RENDERER_SOCKET'].includes(key))delete common[key];
common.DOCKER_HOST='unix:///var/run/docker.sock';
common.OPENSCROLL_BACKUP_DIR=join(dir,'backups');
const configs=await Promise.all([['source',sourcePort],['restore',targetPort]].map(async([kind,appPort])=>{const file=join(dir,`${kind}.env`);await writeFile(file,`POSTGRES_PASSWORD=${randomBytes(32).toString('hex')}\nOPENSCROLL_IMAGE=${process.env.OPENSCROLL_TEST_IMAGE??'openscroll:production'}\nOPENSCROLL_RENDERER_IMAGE=${process.env.OPENSCROLL_TEST_RENDERER_IMAGE??'openscroll:renderer'}\nOPENSCROLL_HOST=openscroll-test.invalid\nAPP_ORIGIN=${origin}\nAPP_PORT=${appPort}\nACME_EMAIL=test@example.invalid\nMAIL_FROM=OpenScroll <no-reply@example.invalid>\nSMTP_HOST=smtp.example.invalid\nSMTP_PORT=465\nREGISTRATION_ENABLED=false\n`,{mode:0o600});return {env:{...common,OPENSCROLL_ENV_FILE:file,COMPOSE_PROJECT_NAME:`openscroll-smoke-${suffix}-${kind}`},port:Number(appPort)};}));
function run(index:number,args:string[],input?:string){return new Promise<string>((accept,reject)=>{const child=execFile(resolve('deploy/ops.sh'),args,{cwd:root,env:configs[index]!.env,maxBuffer:2*1024*1024},(error,out,err)=>{if(error)reject(new Error(`ops ${args[0]} failed: ${err.slice(-1200)}`));else accept(out);});child.stdin!.end(input);});}
async function compose(index:number,args:string[]){return exec('docker',['compose','--env-file',configs[index]!.env.OPENSCROLL_ENV_FILE,'-f',resolve('deploy/compose.yaml'),...args],{env:configs[index]!.env});}
async function api(index:number,path:string,method='GET',payload?:unknown,auth?:{cookie:string;csrf:string}){return fetch(`http://127.0.0.1:${configs[index]!.port}${path}`,{method,headers:{'Content-Type':'application/json','x-openscroll-request':'1',origin,...(auth?{cookie:auth.cookie,'x-csrf-token':auth.csrf}:{})},...(payload===undefined?{}:{body:JSON.stringify(payload)})});}
async function login(index:number){const response=await api(index,'/api/account/login','POST',{email:'smoke@example.invalid',password});assert.equal(response.status,200);assert.match(response.headers.get('set-cookie')!,/Secure/);assert.match(response.headers.get('set-cookie')!,/__Host-openscroll_session/);const data=await response.json();return {cookie:response.headers.get('set-cookie')!.split(';')[0]!,csrf:data.csrf};}
try{
 for(const index of [0,1])await run(index,['config']);
 console.log('Starting independent fresh installation.');await run(0,['start']);
 const owner=JSON.parse(await run(0,['admin','create-author','smoke@example.invalid','Recovery fixture'],password+'\n'));
 await run(0,['admin','bootstrap-owner',owner.author,'smoke@example.invalid']);const auth=await login(0),project=sampleProject();
 const created=await api(0,'/api/library/courses/import','POST',project,auth);assert.equal(created.status,200);const {id}=await created.json();
 const current=await (await api(0,`/api/library/courses/${id}/edit`,'GET',undefined,auth)).json();
 assert.equal((await api(0,`/api/library/courses/${id}/snapshots`,'POST',{id:crypto.randomUUID(),title:'Recovery fixture',revision:current.revision},auth)).status,200);
 assert.equal((await api(0,'/api/library/reusable','POST',{id:crypto.randomUUID(),kind:'group',title:'Recovery group',project:groupPacket(project,[project.document.course.sections[0]!.lessons[0]!.blocks[0]!.id])},auth)).status,200);
 await run(0,['upgrade']);console.log('Backup-first upgrade and migration rerun succeeded.');const file=join(dir,'backups',(await readdir(join(dir,'backups'))).find(f=>f.endsWith('.dump'))!);assert.equal((await stat(file)).mode&0o777,0o600);
 await compose(0,['restart','app']);for(let i=0;i<60;i++){try{if((await api(0,'/api/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,250));}assert.equal((await api(0,'/api/health')).status,200);assert.deepEqual(await (await api(0,`/api/library/courses/${id}/edit`,'GET',undefined,auth)).json(),current);
 await assert.rejects(run(0,['restore',file]));
 console.log('Restart preserved data; restoring backup into a separate empty database.');const sidecar=await readFile(file+'.sha256','utf8');await writeFile(file+'.sha256','0'.repeat(64)+'  fixture.dump\n');await assert.rejects(run(1,['restore',file]),/checksum mismatch/);await writeFile(file+'.sha256',sidecar);await run(1,['restore',file]);await run(1,['start']);
 assert.equal((await api(1,'/api/library/courses','GET',undefined,auth)).status,401);const restoredAuth=await login(1);
 assert.deepEqual(await (await api(1,`/api/library/courses/${id}/edit`,'GET',undefined,restoredAuth)).json(),current);
 assert.equal((await (await api(1,`/api/library/courses/${id}/snapshots`,'GET',undefined,restoredAuth)).json()).snapshots.length,1);
 assert.equal((await (await api(1,'/api/library/reusable','GET',undefined,restoredAuth)).json()).items.length,1);
 const pdf=await api(1,'/api/projects/pdf','POST',{project,options:{paper:'A4',includeAnswers:false}},restoredAuth);assert.equal(pdf.status,200);assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,4).toString(),'%PDF');
 await run(1,['stop']);await assert.rejects(run(1,['restore',file]),/not empty/);
 const tlsConfig=join(dir,'Caddyfile'),overlay=join(dir,'tls.yaml'),caFile=join(dir,'root.crt');
 await writeFile(tlsConfig,'{\n admin off\n}\nlocalhost {\n tls internal\n reverse_proxy app:3000\n}\n');
 await writeFile(overlay,`services:\n  edge:\n    ports: !override ["127.0.0.1:${tlsPort}:443"]\n    volumes: !override\n      - "${tlsConfig}:/etc/caddy/Caddyfile:ro"\n      - certificates:/data\n      - caddy_config:/config\n`);
 const tlsCompose=async(args:string[])=>exec('docker',['compose','--env-file',configs[0]!.env.OPENSCROLL_ENV_FILE,'-f',resolve('deploy/compose.yaml'),'-f',overlay,'--profile','edge',...args],{env:configs[0]!.env});
 await tlsCompose(['up','-d','--no-build','--wait','edge']);
 for(let i=0;i<30;i++){try{await tlsCompose(['cp','edge:/data/caddy/pki/authorities/local/root.crt',caFile]);break;}catch{await new Promise(r=>setTimeout(r,250));}}
 const ca=await readFile(caFile);const tlsHealth=await new Promise<string>((accept,reject)=>{const request=httpsGet({hostname:'localhost',family:4,port:tlsPort,path:'/api/health',ca,rejectUnauthorized:true},response=>{let data='';response.on('data',chunk=>data+=chunk);response.on('end',()=>{if(response.statusCode===200)accept(data);else reject(new Error('TLS health check failed: '+response.statusCode+' '+data.slice(0,200)));});});request.setTimeout(10000,()=>request.destroy(new Error('TLS health timeout')));request.on('error',reject);});assert.equal(JSON.parse(tlsHealth).status,'ready');
 const logs=(await compose(0,['logs','--no-color','app'])).stdout;assert.equal(logs.includes(password),false);assert.equal(logs.includes(auth.csrf),false);assert.equal(logs.includes('smoke@example.invalid'),false);
 console.log(JSON.stringify({trustedLocalHttpsProxy:'pass',freshInstall:'pass',backupFirstUpgrade:'pass',restartPersistence:'pass',backupRestore:'pass',assetsAndRevisions:'pass',snapshotsAndReusableItems:'pass',oldSessionsRevoked:'pass',checksumMismatchRefused:'pass',nonemptyRestoreRefused:'pass',containerPdf:'pass',privateLogs:'pass',evidenceDirectory:dir}));
}finally{for(const index of [1,0])await compose(index,['--profile','edge','down','--volumes','--remove-orphans']).catch(()=>{});}
