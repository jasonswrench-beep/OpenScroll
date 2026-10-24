import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp,readFile,readdir,stat,rm } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import { buildApp } from '../../src/server/app.js';
import { readConfig } from '../../src/server/config.js';
import { migrate } from '../../src/server/migrations.js';
import { accountConfig } from '../../src/server/accounts/config.js';
import { createMailer, type Message } from '../../src/server/accounts/mail.js';
import { sampleProject } from '../../src/project/sample.js';
import { importProject } from '../../src/project/archive.js';
import { tokenHash } from '../../src/server/accounts/passwords.js';
const password='A long testing password 42';

test('accounts and private library against isolated PostgreSQL schema',async t => {
  const admin=new pg.Pool({connectionString:readConfig().databaseUrl});
  const schema=`test_${randomUUID().replaceAll('-','')}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool=new pg.Pool({connectionString:readConfig().databaseUrl,options:`-c search_path=${schema}`});
  const messages:Message[]=[];
  const config=accountConfig({APP_ORIGIN:'http://test.local',MAIL_MODE:'outbox'});
  await migrate(pool);await migrate(pool);
  const app=await buildApp(pool,undefined,{pool,config,mailer:async message => {messages.push(message);}});
  let ip=1;
  type Session={cookie:string;csrf:string;id:string};
  async function request(method:'GET'|'POST'|'PATCH'|'DELETE',url:string,payload?:unknown,session?:Session,headers:Record<string,string>={}) {
    return app.inject({method,url,...(payload === undefined ? {} : {payload:payload as object}),remoteAddress:`127.0.1.${ip++}`,headers:{'x-openscroll-request':'1',origin:config.origin,...(session ? {cookie:session.cookie,'x-csrf-token':session.csrf} : {}),...headers}});
  }
  async function register(email:string,name:string) {assert.equal((await request('POST','/api/account/register',{email,name,password})).statusCode,200);}
  async function login(email:string,pass=password):Promise<Session> {
    const result=await request('POST','/api/account/login',{email,password:pass});assert.equal(result.statusCode,200);
    assert.match(result.headers['set-cookie']!.toString(),/HttpOnly/);assert.match(result.headers['set-cookie']!.toString(),/SameSite=Lax/);
    return {cookie:`openscroll_session=${result.cookies[0]!.value}`,csrf:result.json().csrf,id:result.json().author.id};
  }
  try {
    await register('alice@example.invalid','Alice');await register('bob@example.invalid','Bob');
    let alice=await login(' ALICE@example.invalid ');const bob=await login('bob@example.invalid');
    await t.test('passwords and session tokens are never stored in plaintext',async () => {
      const author=(await pool.query('SELECT password_hash FROM authors WHERE id=$1',[alice.id])).rows[0];
      assert.match(author.password_hash,/^scrypt\$32768\$8\$3\$/);assert.notEqual(author.password_hash,password);
      assert.equal((await pool.query('SELECT token_hash FROM author_sessions WHERE author_id=$1',[alice.id])).rows[0].token_hash,tokenHash(alice.cookie.split('=')[1]!));
      const no=await request('POST','/api/account/login',{email:'alice@example.invalid',password:'wrong'});assert.equal(no.statusCode,401);
      const other=await request('POST','/api/account/login',{email:'nobody@example.invalid',password:'wrong'});assert.deepEqual(other.json(),no.json());
    });
    await t.test('mutations reject missing CSRF headers and foreign origins',async () => {
      assert.equal((await request('POST','/api/library/courses',{title:'Blocked'},alice,{'x-csrf-token':''})).statusCode,403);
      assert.equal((await request('POST','/api/library/courses',{title:'Blocked'},alice,{origin:'https://foreign.example'})).statusCode,403);
      assert.equal((await request('POST','/api/account/login',{email:'alice@example.invalid',password},undefined,{'x-openscroll-request':''})).statusCode,403);
      assert.equal((await request('GET','/api/library/courses')).statusCode,401);
    });
    await t.test('private course and asset routes isolate two authors',async () => {
      const imported=await request('POST','/api/library/courses/import',sampleProject(),alice);assert.equal(imported.statusCode,200);const id=imported.json().id;
      const blank=await request('POST','/api/library/courses',{title:'Bob private'},bob);assert.equal(blank.statusCode,200);
      const list=await request('GET','/api/library/courses',undefined,alice);assert.deepEqual(list.json().courses.map((c:{id:string}) => c.id),[id]);
      assert.deepEqual((await request('GET',`/api/library/courses/${id}`,undefined,alice)).json(),sampleProject());
      for (const [method,path,payload] of [
        ['GET',`/api/library/courses/${id}`,undefined],['GET',`/api/library/courses/${id}/download`,undefined],
        ['GET',`/api/library/courses/${id}/assets/sample-image`,undefined],['PATCH',`/api/library/courses/${id}`,{title:'Stolen',revision:1}],
        ['POST',`/api/library/courses/${id}/duplicate`,undefined],['DELETE',`/api/library/courses/${id}`,{revision:1}],
      ] as const) assert.equal((await request(method,path,payload,bob)).statusCode,404,`${method} must not expose another author's data`);
      assert.equal((await request('GET',`/api/library/courses/${id}/assets/sample-image`)).statusCode,401);
      const ownAsset=await request('GET',`/api/library/courses/${id}/assets/sample-image`,undefined,alice);assert.equal(ownAsset.statusCode,200);assert.equal(ownAsset.headers['x-content-type-options'],'nosniff');
      const download=await request('GET',`/api/library/courses/${id}/download`,undefined,alice);assert.deepEqual(await importProject(download.rawPayload),sampleProject());
      const duplicate=await request('POST',`/api/library/courses/${id}/duplicate`,undefined,alice);assert.equal(duplicate.statusCode,200);const copyId=duplicate.json().id;
      const copied=(await request('GET',`/api/library/courses/${copyId}`,undefined,alice)).json();
      assert.notEqual(copied.document.course.id,sampleProject().document.course.id);assert.notEqual(copied.document.assets[0].id,'sample-image');
      assert.equal(Object.values(copied.files)[0],sampleProject().files['assets/sample-image.png']);
      assert.equal((await request('PATCH',`/api/library/courses/${copyId}`,{title:'100% original',revision:1},alice)).statusCode,200);
      const searched=await request('GET','/api/library/courses?search=%25&sort=title',undefined,alice);assert.equal(searched.json().courses.length,1);
      assert.equal((await request('DELETE',`/api/library/courses/${id}`,{revision:1},alice)).statusCode,200);
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM course_assets WHERE course_id=$1',[id])).rows[0].n,0);
      assert.equal((await request('GET',`/api/library/courses/${id}`,undefined,alice)).statusCode,404);
      assert.equal((await request('GET',`/api/library/courses/${copyId}`,undefined,alice)).statusCode,200,'duplicate assets survive deletion of the source');
    });
    await t.test('reset emails are generic, tokens are single-use, and sessions are revoked',async () => {
      const known=await request('POST','/api/account/request-reset',{email:'alice@example.invalid'});
      const unknown=await request('POST','/api/account/request-reset',{email:'unknown@example.invalid'});assert.deepEqual(known.json(),unknown.json());
      const mail=messages.findLast(message => message.to === 'alice@example.invalid')!;const raw=mail.text.match(/#reset=([a-f0-9]{64})/)![1]!;
      const saved=(await pool.query('SELECT token_hash FROM account_tokens WHERE author_id=$1 AND purpose=\'reset\'',[alice.id])).rows[0].token_hash;
      assert.equal(saved,tokenHash(raw));assert.notEqual(saved,raw);
      const changed=await request('POST','/api/account/reset',{token:raw,password:'A different testing password 43'});assert.equal(changed.statusCode,200);
      assert.equal((await request('GET','/api/library/courses',undefined,alice)).statusCode,401);
      assert.equal((await request('POST','/api/account/reset',{token:raw,password})).statusCode,400);
      assert.equal((await request('POST','/api/account/login',{email:'alice@example.invalid',password})).statusCode,401);
      alice=await login('alice@example.invalid','A different testing password 43');
      await request('POST','/api/account/request-reset',{email:'alice@example.invalid'});
      const expired=messages.at(-1)!.text.match(/#reset=([a-f0-9]{64})/)![1]!;
      await pool.query("UPDATE account_tokens SET expires_at=now()-interval '1 second' WHERE token_hash=$1",[tokenHash(expired)]);
      assert.equal((await request('POST','/api/account/reset',{token:expired,password})).statusCode,400);
    });
    await t.test('course imports retain the ten-per-minute limit and rejected requests create no records',async()=>{
      const before=Number((await pool.query('SELECT count(*) AS n FROM courses WHERE owner_id=$1',[alice.id])).rows[0].n);
      for(let n=0;n<11;n++){
        const response=await app.inject({method:'POST',url:'/api/library/courses/import',remoteAddress:'127.0.9.88',headers:{'x-openscroll-request':'1',origin:config.origin,cookie:alice.cookie,'x-csrf-token':alice.csrf},payload:sampleProject()});
        assert.equal(response.statusCode,n<10?200:429);
      }
      const after=Number((await pool.query('SELECT count(*) AS n FROM courses WHERE owner_id=$1',[alice.id])).rows[0].n);
      assert.equal(after,before+10);
    });
    await t.test('logout revokes the current session and expiry invalidates old cookies',async () => {
      assert.equal((await request('POST','/api/account/logout',undefined,alice)).statusCode,200);
      assert.equal((await request('GET','/api/library/courses',undefined,alice)).statusCode,401);
      await pool.query("UPDATE author_sessions SET expires_at=now()-interval '1 second' WHERE author_id=$1",[bob.id]);
      assert.equal((await request('GET','/api/account/session',undefined,bob)).json().author,null);
    });
    await t.test('closed registration is enforced and verification gates sign-in',async () => {
      const verifiedApp=await buildApp(pool,undefined,{pool,config:{...config,requireVerification:true},mailer:async message => {messages.push(message);}});
      try {
        const headers={'x-openscroll-request':'1',origin:config.origin};
        const send=(url:string,payload:object) => verifiedApp.inject({method:'POST',url,headers,payload});
        assert.equal((await send('/api/account/register',{email:'verify@example.invalid',name:'Verify',password})).statusCode,200);
        assert.equal((await send('/api/account/login',{email:'verify@example.invalid',password})).statusCode,401);
        const raw=messages.at(-1)!.text.match(/#verify=([a-f0-9]{64})/)![1]!;
        assert.equal((await send('/api/account/verify',{token:raw})).statusCode,200);
        assert.equal((await send('/api/account/verify',{token:raw})).statusCode,400);
        assert.equal((await send('/api/account/login',{email:'verify@example.invalid',password})).statusCode,200);
      }finally{await verifiedApp.close();}
      const closed=await buildApp(pool,undefined,{pool,config:{...config,registration:false},mailer:async () => {}});
      try {assert.equal((await closed.inject({method:'POST',url:'/api/account/register',headers:{'x-openscroll-request':'1'},payload:{email:'closed@example.invalid',name:'Closed',password}})).statusCode,403);}
      finally{await closed.close();}
    });
    await t.test('HTTPS deployments issue host-only secure cookies',async () => {
      const secure=await buildApp(pool,undefined,{pool,config:{...config,origin:'https://secure.example',secureCookie:true},mailer:async () => {}});
      try {
        const response=await secure.inject({method:'POST',url:'/api/account/login',headers:{'x-openscroll-request':'1',origin:'https://secure.example'},payload:{email:'verify@example.invalid',password}});
        assert.equal(response.statusCode,200);
        const cookie=response.headers['set-cookie']!.toString();
        assert.match(cookie,/__Host-openscroll_session=/);assert.match(cookie,/; Secure/);assert.match(cookie,/; HttpOnly/);assert.doesNotMatch(cookie,/Domain=/);
      }finally{await secure.close();}
    });
    await t.test('account endpoint rate limits reject repeated requests',async () => {
      let last=0;
      for(let n=0;n<6;n++) last=(await app.inject({method:'POST',url:'/api/account/request-reset',remoteAddress:'127.0.9.99',headers:{'x-openscroll-request':'1'},payload:{email:'unknown@example.invalid'}})).statusCode;
      assert.equal(last,429);
    });
    await t.test('development email outbox writes private messages without logging tokens',async () => {
      const path=await mkdtemp('/tmp/openscroll-mail-test-');
      try {
        await createMailer({...config,outbox:path})({to:'test@example.invalid',subject:'Test mail',text:'Development delivery fixture'});
        const files=await readdir(path);assert.equal(files.length,1);
        assert.equal(JSON.parse(await readFile(join(path,files[0]!),'utf8')).text,'Development delivery fixture');
        assert.equal((await stat(join(path,files[0]!))).mode & 0o777,0o600);
      }finally{await rm(path,{recursive:true});}
    });
  }finally {await app.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
