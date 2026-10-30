import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,stat,chmod,symlink,copyFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {runtimeEnvironment} from '../tools/runtime-environment.mjs';

const configure=resolve('deploy/configure.py');
test('PostgreSQL policy preflight rejects unreadable, writable or symlinked public policy files',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'openscroll-hba-')),script=join(directory,'configure.py'),policy=join(directory,'pg_hba.conf');
 try{
  await copyFile(configure,script);await writeFile(policy,'host all all all reject\n',{mode:0o644});await chmod(policy,0o644);
  execFileSync('python3',[script,'--check-hba'],{stdio:'pipe'});
  for(const mode of [0o600,0o666]){
   await chmod(policy,mode);assert.throws(()=>execFileSync('python3',[script,'--check-hba'],{stdio:'pipe'}));
  }
  await rm(policy);const target=join(directory,'policy.txt');await writeFile(target,'host all all all reject\n',{mode:0o644});await symlink(target,policy);
  assert.throws(()=>execFileSync('python3',[script,'--check-hba'],{stdio:'pipe'}));
 }finally{await rm(directory,{recursive:true,force:true});}
});
test('runtime launcher preserves its runtime URL while excluding maintenance credentials',()=>{
 const input={DATABASE_URL:'postgresql://openscroll_app:runtime@db/openscroll',ADMIN_DATABASE_URL:'migration-sentinel',PROVISION_DATABASE_URL:'bootstrap-sentinel',POSTGRES_PASSWORD:'bootstrap-password-sentinel',MIGRATOR_DB_PASSWORD:'migration-password-sentinel',RUNTIME_DB_PASSWORD:'duplicate-runtime-password-sentinel',PGPASSWORD:'libpq-password-sentinel',PGPASSFILE:'/private/credentials',PGSERVICE:'maintenance',PGSERVICEFILE:'/private/services',PGUSER:'administrator',APP_ORIGIN:'https://example.invalid'};
 const clean=runtimeEnvironment(input);
 assert.deepEqual(clean,{DATABASE_URL:input.DATABASE_URL,APP_ORIGIN:input.APP_ORIGIN});
 assert.equal(input.ADMIN_DATABASE_URL,'migration-sentinel','The trusted launcher does not mutate its caller settings.');
});

test('fresh deployment configuration generates three independent private passwords without replacement',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'openscroll-config-')),file=join(directory,'production.env');
 const env={...process.env,OPENSCROLL_ENV_FILE:file};
 try{
  const output=execFileSync('python3',[configure],{env,encoding:'utf8'});
  const text=await readFile(file,'utf8');
  const secrets=['POSTGRES_PASSWORD','MIGRATOR_DB_PASSWORD','RUNTIME_DB_PASSWORD'].map(key=>text.match(new RegExp('^'+key+'=([a-f0-9]{64})$','m'))?.[1]);
  assert.ok(secrets.every(Boolean));assert.equal(new Set(secrets).size,3);
  assert.ok(secrets.every(value=>!output.includes(value!)));
  assert.equal((await stat(file)).mode&0o777,0o600);
  assert.throws(()=>execFileSync('python3',[configure],{env,stdio:'pipe'}));
  assert.equal(await readFile(file,'utf8'),text);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test('existing configuration gains missing role passwords atomically and repeatably without changing its settings',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'openscroll-config-')),file=join(directory,'production.env');
 const env={...process.env,OPENSCROLL_ENV_FILE:file},original="# existing installation\nPOSTGRES_PASSWORD='old-bootstrap-keep-exact'\nSMTP_PASSWORD='keep $ # spaces'\nOPENSCROLL_IMAGE=retained-old-image\n";
 try{
  await writeFile(file,original,{mode:0o600});
  const output=execFileSync('python3',[configure,'--add-database-roles'],{env,encoding:'utf8'});
  const changed=await readFile(file,'utf8');assert.ok(changed.startsWith(original));
  const secrets=['MIGRATOR_DB_PASSWORD','RUNTIME_DB_PASSWORD'].map(key=>changed.match(new RegExp('^'+key+'=([a-f0-9]{64})$','m'))?.[1]);
  assert.ok(secrets.every(Boolean));assert.notEqual(secrets[0],secrets[1]);assert.ok(secrets.every(value=>!output.includes(value!)));
  execFileSync('python3',[configure,'--add-database-roles'],{env,stdio:'pipe'});
  assert.equal(await readFile(file,'utf8'),changed);assert.equal((await stat(file)).mode&0o777,0o600);
  await chmod(file,0o644);assert.throws(()=>execFileSync('python3',[configure,'--add-database-roles'],{env,stdio:'pipe'}));assert.equal(await readFile(file,'utf8'),changed);
  await chmod(file,0o600);const link=join(directory,'link.env');await symlink(file,link);
  assert.throws(()=>execFileSync('python3',[configure,'--add-database-roles'],{env:{...env,OPENSCROLL_ENV_FILE:link},stdio:'pipe'}));assert.equal(await readFile(file,'utf8'),changed);
 }finally{await rm(directory,{recursive:true,force:true});}
});
