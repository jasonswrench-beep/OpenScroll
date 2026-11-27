import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { FastifyInstance, HTTPMethods } from 'fastify';
import { buildApp } from '../../src/server/app.js';
import { accountConfig } from '../../src/server/accounts/config.js';
import type { Message } from '../../src/server/accounts/mail.js';
import { hashPassword, randomToken, tokenHash } from '../../src/server/accounts/passwords.js';
import { administer } from '../../src/server/admin-operations.js';
import { isolatedDatabase, migrate } from '../helpers/database.js';
import { sampleProject } from '../../src/project/sample.js';
import { assetPath } from '../../src/shared/course.js';
import { seedTestAuthor, type TestAuthor } from '../helpers/accounts.js';
import { processAccessRequestNotifications } from '../../src/server/accounts/notifications.js';

const password='Owner approval integration password 42';
type Session=Pick<TestAuthor,'id'|'cookie'|'csrf'>;
async function isolated(run:(pool:pg.Pool,runtimePool:pg.Pool)=>Promise<void>) {
  const database=await isolatedDatabase();
  try {await run(database.pool,database.runtimePool);}
  finally {await database.close();}
}

function requests(app:FastifyInstance,origin:string) {
  let ip=1;
  return (method:HTTPMethods,url:string,payload?:unknown,session?:Session,extra:Record<string,string>={})=>app.inject({
    method,url,remoteAddress:`127.3.${Math.floor(ip/250)}.${ip++%250+1}`,
    headers:{'x-openscroll-request':'1',origin,...(session?{cookie:session.cookie,'x-csrf-token':session.csrf}:{}),...extra},
    ...(payload===undefined?{}:{payload:payload as object}),
  });
}
function sessionOf(response:{json:()=>any;cookies:{value:string}[]}):Session {
  return {id:response.json().author.id,cookie:`openscroll_session=${response.cookies[0]!.value}`,csrf:response.json().csrf};
}

test('an empty instance never treats its first registrant as an approved author or owner',async()=>isolated(async (pool,runtimePool)=>{
  const messages:Message[]=[],config=accountConfig({APP_ORIGIN:'http://empty.test',REQUIRE_EMAIL_VERIFICATION:'true'});
  const app=await buildApp(runtimePool,undefined,{pool:runtimePool,config,mailer:async message=>{messages.push(message);}}),send=requests(app,config.origin);
  try {
    for(const path of ['/api/projects/sample','/api/library/courses','/api/owner/accounts','/api/unknown-route'])assert.equal((await send('GET',path)).statusCode,401,path);
    assert.equal((await send('GET','/api/account/session')).json().author,null);
    assert.equal((await send('POST','/api/account/register',{email:'first@example.invalid',name:'First registrant',password})).statusCode,200);
    const account=(await pool.query('SELECT role,approval_status FROM authors')).rows[0];
    assert.deepEqual(account,{role:'author',approval_status:'pending'});
    const token=messages[0]!.text.match(/#verify=([a-f0-9]{64})/)![1]!;
    assert.equal((await send('POST','/api/account/verify',{token,password})).statusCode,200);
    const login=await send('POST','/api/account/login',{email:'first@example.invalid',password});assert.equal(login.statusCode,200);
    assert.equal((await send('GET','/api/projects/sample',undefined,sessionOf(login))).statusCode,403);
    assert.equal((await send('GET','/api/owner/accounts',undefined,sessionOf(login))).statusCode,403);
  } finally {await app.close();}
}));

test('approval gates every author API and owner decisions revoke stale credentials',async t=>isolated(async (pool,runtimePool)=>{
  const messages:Message[]=[],config=accountConfig({APP_ORIGIN:'http://approval.test',REQUIRE_EMAIL_VERIFICATION:'true',ACCESS_REQUEST_NOTIFY_EMAIL:'owner-notices@example.invalid'});
  const app=await buildApp(runtimePool,undefined,{pool:runtimePool,config,mailer:async message=>{messages.push(message);}});
  const send=requests(app,config.origin),owner=await seedTestAuthor(pool,{role:'owner',email:'owner@example.invalid'});
  let pending:Session;
  const applicant='applicant@example.invalid';
  try {
    await t.test('anonymous API access fails closed while health and account recovery remain public',async()=>{
      assert.equal((await send('GET','/api/health')).statusCode,200);
      for(const path of ['/api/projects/sample','/api/projects/questions/template.csv','/api/library/courses','/api/library/reusable','/api/owner/accounts','/api/unknown-route','/api/account/unknown-route'])
        assert.equal((await send('GET',path)).statusCode,401,path);
      assert.equal((await send('POST','/api/projects/export',sampleProject())).statusCode,401);
      assert.equal((await send('POST','/api/account/request-reset',{email:'unknown@example.invalid'})).statusCode,200);
    });
    await t.test('registration and email verification never confer approval or owner privileges',async()=>{
      assert.equal((await send('POST','/api/account/register',{email:applicant,name:'Applicant',password})).statusCode,200);
      const registered=(await pool.query('SELECT id,role,approval_status,verified FROM authors WHERE email=$1',[applicant])).rows[0];
      assert.equal(registered.role,'author');assert.equal(registered.approval_status,'pending');assert.equal(registered.verified,false);
      assert.equal(messages.filter(message=>message.to===config.accessRequestNotifyEmail).length,0);
      assert.equal((await send('POST','/api/account/login',{email:applicant,password})).statusCode,401);
      const verification=messages.find(message=>message.to===applicant)!.text.match(/#verify=([a-f0-9]{64})/)![1]!;
      assert.equal((await send('POST','/api/account/verify',{token:verification,password})).statusCode,200);
      assert.equal((await send('POST','/api/account/verify',{token:verification,password})).statusCode,400);
      const logins=await Promise.all([0,1].map(()=>send('POST','/api/account/login',{email:applicant,password})));
      for(const response of logins){assert.equal(response.statusCode,200);assert.equal(response.json().author.approvalStatus,'pending');assert.equal(response.json().author.role,'author');assert.equal(response.json().author.verified,true);}
      pending=sessionOf(logins[0]!);
      const current=await send('GET','/api/account/session',undefined,pending);
      assert.equal(current.json().author.approvalStatus,'pending');assert.ok(current.json().csrf);
      for(const path of ['/api/library/courses','/api/library/reusable','/api/projects/sample','/api/projects/questions/template.xlsx','/api/owner/accounts'])
        assert.equal((await send('GET',path,undefined,pending)).statusCode,403,path);
      assert.equal((await send('POST','/api/projects/export',sampleProject(),pending)).statusCode,403);
      const notices=messages.filter(message=>message.to===config.accessRequestNotifyEmail);
      assert.equal(notices.length,1,'verification and concurrent logins must produce only one owner notice');
      assert.ok(notices[0]!.text.includes(applicant));assert.ok(notices[0]!.text.includes(config.origin));
      assert.ok(!notices[0]!.text.includes(password));assert.ok(!notices[0]!.text.includes(verification));
      assert.ok((await pool.query('SELECT access_notified_at FROM authors WHERE id=$1',[pending.id])).rows[0].access_notified_at);
      assert.equal((await send('POST','/api/account/register',{email:'forged@example.invalid',name:'Forged',password,role:'owner',approvalStatus:'approved'})).statusCode,400);
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM authors WHERE email='forged@example.invalid'")).rows[0].n,0);
    });
    await t.test('pending accounts can sign out and reset passwords without obtaining author access',async()=>{
      assert.equal((await send('POST','/api/account/logout',undefined,pending,{'x-csrf-token':'wrong'})).statusCode,403);
      assert.equal((await send('POST','/api/account/request-reset',{email:applicant})).statusCode,200);
      const token=messages.findLast(message=>message.to===applicant)!.text.match(/#reset=([a-f0-9]{64})/)![1]!;
      assert.equal((await send('POST','/api/account/reset',{token,password})).statusCode,200);
      assert.equal((await send('GET','/api/account/session',undefined,pending)).json().author,null);
      const login=await send('POST','/api/account/login',{email:applicant,password});assert.equal(login.statusCode,200);pending=sessionOf(login);
      assert.equal(login.json().author.approvalStatus,'pending');
      assert.equal((await send('POST','/api/account/logout',undefined,pending)).statusCode,200);
      assert.equal((await send('GET','/api/account/session',undefined,pending)).json().author,null);
      pending=sessionOf(await send('POST','/api/account/login',{email:applicant,password}));
      assert.equal((await send('GET','/api/library/courses',undefined,pending)).statusCode,403);
    });
    await t.test('every project endpoint denies pending, unverified and revoked principals before parsing or file-processing admission',async()=>{
      const unverified=await seedTestAuthor(pool,{verified:false}),revoked=await seedTestAuthor(pool,{approvalStatus:'revoked'}),approved=await seedTestAuthor(pool);
      const endpoints:[HTTPMethods,string,Record<string,string>?][]=[
        ['GET','/api/projects/sample'],['GET','/api/projects/questions/template.csv'],['GET','/api/projects/questions/template.xlsx'],
        ['POST','/api/projects/import'],['POST','/api/projects/export'],['POST','/api/projects/html'],['POST','/api/projects/pdf'],
        ['POST','/api/projects/scorm-12'],['POST','/api/projects/scorm-2004'],
        ['POST','/api/projects/questions/import',{'content-type':'text/csv'}],
        ['POST','/api/projects/questions/import',{'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}],
      ];
      for(const principal of [pending,unverified,revoked]) {
        for(const [method,path,headers] of endpoints) {
          const response=await send(method,path,method==='POST'?'malformed file input':undefined,principal,headers??{'content-type':'application/json'});
          assert.equal(response.statusCode,403,`${method} ${path} must reject the principal before processing the body`);
        }
        const invalidBodies:Record<string,string>[]=[
          {'content-type':'application/json'},
          {'content-type':'application/x-unsupported-fixture'},
          {'content-type':'application/json','content-length':String(100*1024*1024)},
        ];
        for(const headers of invalidBodies)assert.equal((await send('POST','/api/projects/export','{',principal,headers)).statusCode,403,'authorization must precede parser/MIME/body-length errors');
      }
      const [denied,allowed]=await Promise.all([
        send('POST','/api/projects/pdf','{',pending,{'content-type':'application/json'}),
        send('GET','/api/projects/sample',undefined,approved),
      ]);
      assert.equal(denied.statusCode,403);assert.equal(allowed.statusCode,200,'a denied request must not consume the file-processing slot');
    });
    await t.test('only an owner with a valid CSRF session can approve a verified enabled applicant',async()=>{
      const author=await seedTestAuthor(pool),unverified=await seedTestAuthor(pool,{verified:false,approvalStatus:'pending'});
      const disabled=await seedTestAuthor(pool,{approvalStatus:'pending'});
      await pool.query('UPDATE authors SET disabled_at=now() WHERE id=$1',[disabled.id]);
      assert.equal((await send('POST',`/api/owner/accounts/${pending.id}/approve`,{},author)).statusCode,403);
      assert.equal((await send('POST',`/api/owner/accounts/${pending.id}/approve`,{},owner,{'x-csrf-token':'wrong'})).statusCode,403);
      assert.equal((await send('POST',`/api/owner/accounts/${pending.id}/approve`,{},owner,{origin:'https://foreign.invalid'})).statusCode,403);
      assert.equal((await send('POST',`/api/owner/accounts/${pending.id}/approve`,{role:'owner'},owner)).statusCode,400);
      assert.equal((await send('POST',`/api/owner/accounts/${unverified.id}/approve`,{},owner)).statusCode,409);
      assert.equal((await send('POST',`/api/owner/accounts/${disabled.id}/approve`,{},owner)).statusCode,409);
      assert.equal((await send('POST',`/api/owner/accounts/${randomUUID()}/approve`,{},owner)).statusCode,404);
      await pool.query("INSERT INTO account_tokens(token_hash,author_id,purpose,expires_at) VALUES($1,$2,'reset',now()+interval '1 hour')",[tokenHash(randomToken()),pending.id]);
      assert.equal((await send('POST',`/api/owner/accounts/${pending.id}/approve`,{},owner)).statusCode,200);
      assert.equal((await send('GET','/api/library/courses',undefined,pending)).statusCode,401,'approval requires a fresh login');
      assert.equal((await pool.query('SELECT count(*)::int AS n FROM account_tokens WHERE author_id=$1',[pending.id])).rows[0].n,0);
      const signed=await send('POST','/api/account/login',{email:applicant,password});assert.equal(signed.statusCode,200);
      assert.equal(signed.json().author.role,'author');assert.equal(signed.json().author.approvalStatus,'approved');pending=sessionOf(signed);
      assert.equal((await send('GET','/api/library/courses',undefined,pending)).statusCode,200);
      assert.equal((await send('GET','/api/owner/accounts',undefined,pending)).statusCode,403);
      const audit=(await pool.query("SELECT actor_author_id FROM admin_events WHERE author_id=$1 AND actor_kind='owner'",[pending.id])).rows;
      assert.ok(audit.some(row=>row.actor_author_id===owner.id));
    });
    await t.test('owner queue pagination is bounded and never exposes credentials or course content',async()=>{
      const expected=(await pool.query('SELECT id FROM authors ORDER BY id')).rows.map(row=>row.id),seen:string[]=[];
      let cursor:string|undefined;
      do {
        const response=await send('GET',`/api/owner/accounts?limit=1${cursor?`&cursor=${cursor}`:''}`,undefined,owner);
        assert.equal(response.statusCode,200);assert.ok(response.json().accounts.length<=1);
        seen.push(...response.json().accounts.map((account:{id:string})=>account.id));
        assert.doesNotMatch(response.body,/password_hash|csrf_token|token_hash|"document"/);
        cursor=response.json().nextCursor??undefined;
        assert.ok(seen.length<=expected.length,'pagination must advance without cycling');
      } while(cursor);
      assert.deepEqual(seen,expected);
      for(const query of ['limit=0','limit=101','cursor=not-a-uuid'])assert.equal((await send('GET',`/api/owner/accounts?${query}`,undefined,owner)).statusCode,400);
    });
    await t.test('revocation blocks old sessions and reset-based reentry while retaining authored data',async()=>{
      const project=sampleProject(),created=await send('POST','/api/library/courses/import',project,pending);assert.equal(created.statusCode,200);
      const course=created.json().id;
      assert.equal((await send('POST',`/api/owner/accounts/${pending.id}/revoke`,{},owner)).statusCode,200);
      assert.equal((await send('GET','/api/library/courses',undefined,pending)).statusCode,401);
      assert.equal((await send('POST','/api/account/login',{email:applicant,password})).statusCode,401);
      assert.deepEqual((await pool.query('SELECT document FROM courses WHERE id=$1',[course])).rows[0].document,project.document);
      assert.equal((await send('POST','/api/account/request-reset',{email:applicant})).statusCode,200);
      const reset=messages.findLast(message=>message.to===applicant)!.text.match(/#reset=([a-f0-9]{64})/)![1]!;
      const changed='A new revoked account password 43';
      assert.equal((await send('POST','/api/account/reset',{token:reset,password:changed})).statusCode,200);
      assert.equal((await pool.query('SELECT approval_status FROM authors WHERE id=$1',[pending.id])).rows[0].approval_status,'revoked');
      assert.equal((await send('POST','/api/account/login',{email:applicant,password:changed})).statusCode,401);
      assert.equal((await send('POST',`/api/owner/accounts/${pending.id}/approve`,{},owner)).statusCode,200);
      const signed=await send('POST','/api/account/login',{email:applicant,password:changed});assert.equal(signed.statusCode,200);
      assert.deepEqual((await send('GET',`/api/library/courses/${course}`,undefined,sessionOf(signed))).json(),project);
    });
    await t.test('the last active owner cannot revoke itself and concurrent owner removal preserves one owner',async()=>{
      assert.equal((await send('POST',`/api/owner/accounts/${owner.id}/revoke`,{},owner)).statusCode,409);
      const second=await seedTestAuthor(pool,{role:'owner'});
      const responses=await Promise.all([
        send('POST',`/api/owner/accounts/${second.id}/revoke`,{},owner),
        send('POST',`/api/owner/accounts/${owner.id}/revoke`,{},second),
      ]);
      assert.equal(responses.filter(response=>response.statusCode===200).length,1);
      assert.ok(responses.every(response=>[200,403,409].includes(response.statusCode)));
      assert.equal((await pool.query("SELECT count(*)::int AS n FROM authors WHERE role='owner' AND approval_status='approved' AND verified AND disabled_at IS NULL")).rows[0].n,1);
    });
  } finally {await app.close();}
}));

test('migration 5 quarantines every legacy account while preserving private content and explicit owner bootstrap',async()=>isolated(async (pool,runtimePool)=>{
  // Recreate the actual pre-approval schema boundary only in this disposable schema.
  await pool.query('DROP TABLE access_request_notifications');
  await pool.query('ALTER TABLE admin_events DROP COLUMN actor_author_id, DROP COLUMN actor_kind');
  await pool.query('ALTER TABLE authors DROP COLUMN approval_status, DROP COLUMN role, DROP COLUMN access_notified_at');
  await pool.query('DELETE FROM schema_migrations WHERE version=5');
  const ids=[randomUUID(),randomUUID(),randomUUID()],hash=await hashPassword(password),project=sampleProject(),course=randomUUID();
  for(const [index,id] of ids.entries()) {
    await pool.query('INSERT INTO authors(id,email,display_name,password_hash,verified,disabled_at) VALUES($1,$2,$3,$4,$5,$6)',[id,`legacy-${index}@example.invalid`,`Legacy ${index}`,hash,index!==1,index===2?new Date('2025-01-01T00:00:00Z'):null]);
    await pool.query("INSERT INTO author_sessions(token_hash,author_id,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[tokenHash(randomToken()),id,randomToken()]);
    await pool.query("INSERT INTO account_tokens(token_hash,author_id,purpose,expires_at) VALUES($1,$2,'reset',now()+interval '1 hour')",[tokenHash(randomToken()),id]);
  }
  await pool.query('INSERT INTO courses(id,owner_id,document,revision) VALUES($1,$2,$3,9)',[course,ids[0],project.document]);
  const asset=project.document.assets[0]!;
  await pool.query('INSERT INTO course_assets(course_id,asset_id,data) VALUES($1,$2,$3)',[course,asset.id,Buffer.from(project.files[assetPath(asset)]!,'base64')]);
  await pool.query("INSERT INTO reusable_items(id,owner_id,kind,title,project,stored_bytes,request_hash) VALUES($1,$2,'group','Legacy reusable',$3,1,'legacy')",[randomUUID(),ids[0],project]);
  await pool.query("INSERT INTO course_snapshots(id,course_id,owner_id,title,source_revision,project,stored_bytes,request_hash) VALUES($1,$2,$3,'Legacy snapshot',9,$4,1,'legacy')",[randomUUID(),course,ids[0],project]);
  await pool.query("INSERT INTO admin_events(operation,author_id) VALUES('suspend',$1)",[ids[2]]);
  await migrate(pool);await migrate(pool);
  const accounts=(await pool.query('SELECT * FROM authors ORDER BY email')).rows;
  assert.equal(accounts.length,3);
  for(const account of accounts){assert.equal(account.role,'author');assert.equal(account.approval_status,'pending');assert.equal(account.access_notified_at,null);assert.equal(account.password_hash,hash);}
  assert.equal(accounts[1].verified,false);assert.ok(accounts[2].disabled_at);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM author_sessions')).rows[0].n,0);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM account_tokens')).rows[0].n,0);
  const retained=(await pool.query('SELECT document,revision FROM courses WHERE id=$1',[course])).rows[0];
  assert.deepEqual(retained.document,project.document);assert.equal(retained.revision,9);
  assert.equal((await pool.query('SELECT data FROM course_assets WHERE course_id=$1',[course])).rows[0].data.toString('base64'),project.files[assetPath(asset)]);
  assert.deepEqual((await pool.query('SELECT project FROM reusable_items')).rows[0].project,project);
  assert.deepEqual((await pool.query('SELECT project FROM course_snapshots')).rows[0].project,project);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM schema_migrations WHERE version=5')).rows[0].n,1);
  await assert.rejects(administer(pool,'bootstrap-owner',[ids[0]!,'wrong@example.invalid']));
  await assert.rejects(administer(pool,'bootstrap-owner',[ids[1]!,'legacy-1@example.invalid']));
  await assert.rejects(administer(pool,'bootstrap-owner',[ids[2]!,'legacy-2@example.invalid']));
  await administer(pool,'bootstrap-owner',[ids[0]!,'LEGACY-0@example.invalid']);
  assert.equal((await pool.query("SELECT count(*)::int AS n FROM authors WHERE role='owner' AND approval_status='approved'")).rows[0].n,1);
  await assert.rejects(administer(pool,'suspend',[ids[0]!]));
  const report=await administer(pool,'review-accounts',[ids[0]!,'legacy-0@example.invalid']) as {otherAccountCount:number;unexpectedAccounts:unknown[]};
  assert.equal(report.otherAccountCount,2);assert.equal(report.unexpectedAccounts.length,2);
  assert.doesNotMatch(JSON.stringify(report),/password_hash|token_hash|csrf_token|"document"/);
  const created=await administer(pool,'create-author',['operator-created@example.invalid','Operator created'],password) as {author:string};
  const provisioned=(await pool.query('SELECT verified,role,approval_status FROM authors WHERE id=$1',[created.author])).rows[0];
  assert.deepEqual(provisioned,{verified:true,role:'author',approval_status:'pending'});
  await pool.query("UPDATE authors SET approval_status='revoked',disabled_at=now() WHERE id=$1",[created.author]);
  await administer(pool,'enable',[created.author]);
  assert.equal((await pool.query('SELECT approval_status FROM authors WHERE id=$1',[created.author])).rows[0].approval_status,'revoked');
}));

test('owner notices retry failed delivery and mark success only after delivery without duplicate successful sends',async()=>isolated(async (pool,runtimePool)=>{
  const messages:Message[]=[],config=accountConfig({APP_ORIGIN:'http://notice.test',REQUIRE_EMAIL_VERIFICATION:'true',ACCESS_REQUEST_NOTIFY_EMAIL:'notice-owner@example.invalid'});
  let attempts=0;
  const app=await buildApp(runtimePool,undefined,{pool:runtimePool,config,mailer:async message=>{
    if(message.to===config.accessRequestNotifyEmail){attempts++;if(attempts===1)throw new Error('Synthetic mail delivery failure');}
    messages.push(message);
  }}),send=requests(app,config.origin),email='notice-applicant@example.invalid';
  try {
    assert.equal((await send('POST','/api/account/register',{email,name:'Notice applicant',password})).statusCode,200);
    const raw=messages[0]!.text.match(/#verify=([a-f0-9]{64})/)![1]!;
    assert.equal((await send('POST','/api/account/verify',{token:raw,password})).statusCode,200);
    for(let n=0;n<2;n++)assert.equal((await send('POST','/api/account/login',{email,password})).statusCode,200);
    assert.equal(attempts,1);
    const account=(await pool.query('SELECT id,approval_status,role,access_notified_at FROM authors WHERE email=$1',[email])).rows[0];
    assert.equal(account.approval_status,'pending');assert.equal(account.role,'author');assert.equal(account.access_notified_at,null);
    const failed=(await pool.query('SELECT attempts,sent_at FROM access_request_notifications WHERE author_id=$1',[account.id])).rows[0];
    assert.equal(failed.attempts,1);assert.equal(failed.sent_at,null);
    await pool.query("UPDATE access_request_notifications SET available_at=now()-interval '1 second' WHERE author_id=$1",[account.id]);
    const services={pool:runtimePool,config,mailer:async(message:Message)=>{if(message.to===config.accessRequestNotifyEmail)attempts++;messages.push(message);}};
    await Promise.all([processAccessRequestNotifications(services,account.id),processAccessRequestNotifications(services,account.id)]);
    assert.equal(attempts,2);assert.equal(messages.filter(message=>message.to===config.accessRequestNotifyEmail).length,1);
    const delivered=(await pool.query('SELECT status,attempts,sent_at FROM access_request_notifications WHERE author_id=$1',[account.id])).rows[0];
    assert.equal(delivered.status,'sent');assert.equal(delivered.attempts,2);assert.ok(delivered.sent_at);
    assert.ok((await pool.query('SELECT access_notified_at FROM authors WHERE id=$1',[account.id])).rows[0].access_notified_at);
    await processAccessRequestNotifications(services,account.id);
    assert.equal((await send('POST','/api/account/login',{email,password})).statusCode,200);assert.equal(attempts,2);
  } finally {await app.close();}
}));

test('notification retry caps and leases retain a failed applicant in the authoritative owner queue',async()=>isolated(async (pool,runtimePool)=>{
  const config=accountConfig({APP_ORIGIN:'http://retry-cap.test',ACCESS_REQUEST_NOTIFY_EMAIL:'queue-owner@example.invalid'});
  let attempts=0;
  const services={pool:runtimePool,config,mailer:async()=>{attempts++;throw new Error('Synthetic unavailable notification transport');}};
  const app=await buildApp(runtimePool,undefined,services),send=requests(app,config.origin);
  const owner=await seedTestAuthor(pool,{role:'owner'}),applicant=await seedTestAuthor(pool,{approvalStatus:'pending'});
  try {
    assert.equal((await send('POST','/api/account/login',{email:applicant.email,password:applicant.password})).statusCode,200);
    assert.equal(attempts,1);
    await processAccessRequestNotifications(services,applicant.id);assert.equal(attempts,1,'retry delay must prevent an immediate retry');
    for(const count of [2,3]) {
      await pool.query("UPDATE access_request_notifications SET available_at=now()-interval '1 second' WHERE author_id=$1",[applicant.id]);
      await processAccessRequestNotifications(services,applicant.id);assert.equal(attempts,count);
    }
    const exhausted=(await pool.query('SELECT status,attempts,sent_at FROM access_request_notifications WHERE author_id=$1',[applicant.id])).rows[0];
    assert.equal(exhausted.status,'failed');assert.equal(exhausted.attempts,3);assert.equal(exhausted.sent_at,null);
    await pool.query("UPDATE access_request_notifications SET available_at=now()-interval '1 second' WHERE author_id=$1",[applicant.id]);
    await processAccessRequestNotifications(services,applicant.id);assert.equal(attempts,3,'the bounded retry cap must hold');
    assert.equal((await pool.query('SELECT access_notified_at FROM authors WHERE id=$1',[applicant.id])).rows[0].access_notified_at,null);
    const listed=await send('GET','/api/owner/accounts',undefined,owner);assert.equal(listed.statusCode,200);
    assert.ok(listed.json().accounts.some((account:{id:string})=>account.id===applicant.id),'failed email must never hide the access request');

    const leased=await seedTestAuthor(pool,{approvalStatus:'pending'});
    assert.equal((await send('POST','/api/account/login',{email:leased.email,password:leased.password})).statusCode,200);
    const before=attempts;
    await pool.query("UPDATE access_request_notifications SET status='sending',claimed_at=now(),available_at=now()-interval '1 second' WHERE author_id=$1",[leased.id]);
    await processAccessRequestNotifications(services,leased.id);assert.equal(attempts,before,'an active worker lease must prevent duplicate claims');
    await pool.query("UPDATE access_request_notifications SET claimed_at=now()-interval '3 minutes' WHERE author_id=$1",[leased.id]);
    await processAccessRequestNotifications(services,leased.id);assert.equal(attempts,before+1,'an abandoned lease must be retryable');
    assert.equal((await pool.query('SELECT attempts FROM access_request_notifications WHERE author_id=$1',[leased.id])).rows[0].attempts,2);
    const beforeTerminalRecovery=attempts;
    await pool.query("UPDATE access_request_notifications SET status='sending',attempts=3,claimed_at=now()-interval '3 minutes' WHERE author_id=$1",[leased.id]);
    await processAccessRequestNotifications(services,leased.id);
    const terminal=(await pool.query('SELECT status,attempts,sent_at FROM access_request_notifications WHERE author_id=$1',[leased.id])).rows[0];
    assert.equal(terminal.status,'failed');assert.equal(terminal.attempts,3);assert.equal(terminal.sent_at,null);
    assert.equal(attempts,beforeTerminalRecovery,'an expired final-attempt lease must not cause a fourth send');
    assert.equal((await pool.query('SELECT access_notified_at FROM authors WHERE id=$1',[leased.id])).rows[0].access_notified_at,null,'uncertain delivery must not be marked successful');
  } finally {await app.close();}
}));
