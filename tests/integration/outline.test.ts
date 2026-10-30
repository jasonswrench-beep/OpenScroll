import { test } from 'node:test';
import { approveFixtureAuthor } from '../helpers/accounts.js';
import assert from 'node:assert/strict';
import { randomUUID,createHash } from 'node:crypto';
import pg from 'pg';
import { readConfig } from '../../src/server/config.js';
import { buildApp } from '../../src/server/app.js';
import { migrate } from '../../src/server/migrations.js';
import { accountConfig } from '../../src/server/accounts/config.js';
import { sampleProject } from '../../src/project/sample.js';
import { importProject } from '../../src/project/archive.js';
import { assetPath } from '../../src/shared/course.js';
import { prepareBlock } from '../../src/shared/block-catalog.js';
import { assessmentProject } from '../helpers/assessment-project.js';
import { mediaProject } from '../helpers/media-project.js';
import { copySection } from '../../src/shared/outline.js';
test('outline persistence and concurrency against isolated PostgreSQL',async t=>{
  const admin=new pg.Pool({connectionString:readConfig().databaseUrl});const schema=`outline_${randomUUID().replaceAll('-','')}`;
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool=new pg.Pool({connectionString:readConfig().databaseUrl,options:`-c search_path=${schema}`});
  await migrate(pool);await migrate(pool);
  const config=accountConfig({APP_ORIGIN:'http://outline.test'});
  const app=await buildApp(pool,undefined,{pool,config,mailer:async ()=>{}});
  const password='An outline testing password 42';
  const base={'x-openscroll-request':'1',origin:config.origin};
  const register=async(email:string)=>{
    await app.inject({method:'POST',url:'/api/account/register',headers:base,payload:{email,name:'Outline author',password}});
    await approveFixtureAuthor(pool,email);
    const login=await app.inject({method:'POST',url:'/api/account/login',headers:base,payload:{email,password}});
    assert.equal(login.statusCode,200);return {...base,cookie:`openscroll_session=${login.cookies[0]!.value}`,'x-csrf-token':login.json().csrf};
  };
  try {
    const a=await register('outline-a@example.invalid');const b=await register('outline-b@example.invalid');
    const inserted=await app.inject({method:'POST',url:'/api/library/courses/import',headers:a,payload:sampleProject()});assert.equal(inserted.statusCode,200);const id=inserted.json().id;
    const snapshot=async()=>{const r=await app.inject({url:`/api/library/courses/${id}/edit`,headers:a});assert.equal(r.statusCode,200);return r.json();};
    const save=(payload:object,headers=a)=>app.inject({method:'PUT',url:`/api/library/courses/${id}/document`,headers,payload});
    await t.test('migration upgrades existing version 1 course data without changing content or assets',async()=>{
      // Recreate the prior schema boundary only inside this disposable test schema.
      await pool.query('ALTER TABLE courses DROP COLUMN revision, DROP COLUMN last_save_id, DROP COLUMN last_save_hash');
      await pool.query('DELETE FROM schema_migrations WHERE version=2');
      await migrate(pool);await migrate(pool);
      const upgraded=await snapshot();assert.equal(upgraded.revision,1);assert.deepEqual(upgraded.project,sampleProject());
    });
    await t.test('outline metadata and hierarchy persist while assets remain unchanged',async()=>{
      const opened=await snapshot();assert.equal(opened.revision,1);
      const doc=structuredClone(opened.project.document);doc.course.title='Organized course';doc.course.author='Displayed author';doc.course.description='A description that survives reopening';
      doc.course.sections.push(copySection(doc.course.sections[0]));doc.course.cover={assetId:'sample-image',altText:'Cover example',decorative:false};
      const result=await save({document:doc,revision:1,mutationId:randomUUID()});assert.equal(result.statusCode,200);assert.equal(result.json().revision,2);
      const reopened=await snapshot();assert.equal(reopened.project.document.course.title,'Organized course');assert.equal(reopened.project.document.course.sections.length,2);assert.deepEqual(reopened.project.files,sampleProject().files);
      const downloaded=await app.inject({url:`/api/library/courses/${id}/download`,headers:a});const portable=await importProject(downloaded.rawPayload);assert.equal(portable.document.course.author,'Displayed author');assert.equal(portable.document.course.cover?.altText,'Cover example');
    });
    await t.test('two tabs cannot both commit against the same revision',async()=>{
      const opened=await snapshot();const one=structuredClone(opened.project.document);const two=structuredClone(opened.project.document);one.course.title='First contender';two.course.title='Second contender';
      const results=await Promise.all([save({revision:opened.revision,mutationId:randomUUID(),document:one}),save({revision:opened.revision,mutationId:randomUUID(),document:two})]);
      assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,409]);const after=await snapshot();assert.equal(after.revision,opened.revision+1);assert.ok(['First contender','Second contender'].includes(after.project.document.course.title));
      const staleRename=await app.inject({method:'PATCH',url:`/api/library/courses/${id}`,headers:a,payload:{title:'Stale library rename',revision:opened.revision}});assert.equal(staleRename.statusCode,409);
      const staleDelete=await app.inject({method:'DELETE',url:`/api/library/courses/${id}`,headers:a,payload:{revision:opened.revision}});assert.equal(staleDelete.statusCode,409);
    });
    await t.test('retry after a lost acknowledgement is idempotent and rejects reused IDs with different content',async()=>{
      const opened=await snapshot();const request={revision:opened.revision,mutationId:randomUUID(),document:opened.project.document};request.document.course.description='Saved once despite retries';
      const first=await save(request);const again=await save(request);assert.equal(first.statusCode,200);assert.equal(again.statusCode,200);assert.deepEqual(first.json(),again.json());assert.equal((await snapshot()).revision,opened.revision+1);
      request.document.course.description='Same key but different content';assert.equal((await save(request)).statusCode,409);
    });
    await t.test('cover bytes and their metadata commit atomically and failed saves preserve prior data',async()=>{
      const opened=await snapshot();const project=opened.project;const original=sampleProject().document.assets[0]!;
      const asset={...original,id:'new-cover',fileName:'new-cover.png'};project.document.assets.push(asset);project.files[assetPath(asset)]=sampleProject().files['assets/sample-image.png'];project.document.course.cover={assetId:asset.id,altText:'New cover',decorative:false};
      const noFiles=await save({revision:opened.revision,mutationId:randomUUID(),document:project.document});assert.equal(noFiles.statusCode,422);
      const valid=await save({revision:opened.revision,mutationId:randomUUID(),document:project.document,files:project.files});assert.equal(valid.statusCode,200);
      const saved=await snapshot();assert.equal(saved.project.document.course.cover.assetId,'new-cover');assert.equal(saved.project.files['assets/new-cover.png'],project.files['assets/new-cover.png']);
      const corrupt=structuredClone(saved.project);corrupt.files['assets/new-cover.png']=Buffer.from('bad').toString('base64');corrupt.document.assets.find((a:{id:string})=>a.id==='new-cover').sha256=createHash('sha256').update('bad').digest('hex');corrupt.document.assets.find((a:{id:string})=>a.id==='new-cover').byteLength=3;
      assert.equal((await save({revision:saved.revision,mutationId:randomUUID(),document:corrupt.document,files:corrupt.files})).statusCode,422);
      assert.deepEqual((await snapshot()).project,saved.project);
    });
    await t.test('authored block content, image bytes, appearance and narration survive save and download',async()=>{
      const opened=await snapshot();const project=opened.project;const image=prepareBlock('image-text',project);
      assert.ok(image.asset);project.document.assets.push(image.asset);project.files[assetPath(image.asset)]=image.data;
      image.block.appearance={width:'wide',padding:'large',background:'accent'};
      image.block.narration={script:'Original narration for this lesson.',language:'en',speed:1.2};
      project.document.course.sections[0].lessons[0].blocks.push(image.block);
      assert.equal((await save({revision:opened.revision,mutationId:randomUUID(),document:project.document,files:project.files})).statusCode,200);
      const persisted=await snapshot();assert.deepEqual(persisted.project.document.course.sections[0].lessons[0].blocks.at(-1),image.block);
      const downloaded=await app.inject({url:`/api/library/courses/${id}/download`,headers:a});const portable=await importProject(downloaded.rawPayload);
      assert.deepEqual(portable.document.course.sections[0]!.lessons[0]!.blocks.at(-1),image.block);assert.equal(portable.files[assetPath(image.asset)],image.data);
    });
    await t.test('portable v1 stored rows upgrade in memory and commit v2 only on an explicit versioned save',async()=>{
      const opened=await snapshot();const legacy={...structuredClone(opened.project.document),schemaVersion:1};const mutationId=randomUUID();const digest=createHash('sha256').update(JSON.stringify({document:legacy,files:null})).digest('hex');
      await pool.query('UPDATE courses SET document=$1,revision=revision+1,last_save_id=$2,last_save_hash=$3 WHERE id=$4',[legacy,mutationId,digest,id]);
      const retry=await save({revision:opened.revision,mutationId,document:legacy});assert.equal(retry.statusCode,200);assert.equal(retry.json().revision,opened.revision+1);
      const changed=structuredClone(legacy);changed.course.description='A different v1 request';assert.equal((await save({revision:opened.revision,mutationId,document:changed})).statusCode,409);
      const upgraded=await snapshot();assert.equal(upgraded.project.document.schemaVersion,3);assert.equal((await pool.query('SELECT document FROM courses WHERE id=$1',[id])).rows[0].document.schemaVersion,1);assert.deepEqual(upgraded.project.files,opened.project.files);
      assert.equal((await save({revision:upgraded.revision,mutationId:randomUUID(),document:upgraded.project.document})).statusCode,200);assert.equal((await pool.query('SELECT document FROM courses WHERE id=$1',[id])).rows[0].document.schemaVersion,3);
    });
    await t.test('all media and interaction content persists atomically and copied courses retain private independent media',async()=>{
      const opened=await snapshot();const project=await mediaProject();project.document.course.id=opened.project.document.course.id;project.document.course.createdAt=opened.project.document.course.createdAt;
      assert.equal((await save({revision:opened.revision,mutationId:randomUUID(),document:project.document,files:project.files})).statusCode,200);
      const persisted=await snapshot();assert.deepEqual(persisted.project.document.course.sections,project.document.course.sections);assert.deepEqual(persisted.project.files,project.files);
      const copied=await app.inject({method:'POST',url:`/api/library/courses/${id}/duplicate`,headers:a});assert.equal(copied.statusCode,200);const copyId=copied.json().id;
      const copy=await app.inject({url:`/api/library/courses/${copyId}/edit`,headers:a});assert.equal(copy.statusCode,200);const document=copy.json().project.document;assert.equal(document.assets.some((asset:{id:string})=>project.document.assets.some(original=>original.id===asset.id)),false);
      assert.equal((await app.inject({url:`/api/library/courses/${copyId}/edit`,headers:b})).statusCode,404);
      const downloaded=await app.inject({url:`/api/library/courses/${id}/download`,headers:a});assert.deepEqual((await importProject(downloaded.rawPayload)).files,project.files);
    });
    await t.test('legacy v2 acknowledgements replay unchanged after the v3 upgrade',async()=>{
      const opened=await snapshot(),legacy={...structuredClone(opened.project.document),schemaVersion:2},mutationId=randomUUID();const hash=createHash('sha256').update(JSON.stringify({document:legacy,files:null})).digest('hex');await pool.query('UPDATE courses SET document=$1,revision=revision+1,last_save_id=$2,last_save_hash=$3 WHERE id=$4',[legacy,mutationId,hash,id]);
      const result=await save({revision:opened.revision,mutationId,document:legacy});assert.equal(result.statusCode,200);assert.equal(result.json().revision,opened.revision+1);assert.equal((await snapshot()).project.document.schemaVersion,3);assert.equal((await pool.query('SELECT document FROM courses WHERE id=$1',[id])).rows[0].document.schemaVersion,2);
    });
    await t.test('assessment answer keys, scoring rules and private duplicates persist without learner state',async()=>{
      const opened=await snapshot(),project=assessmentProject();project.document.course.id=opened.project.document.course.id;project.document.course.createdAt=opened.project.document.course.createdAt;
      assert.equal((await save({revision:opened.revision,mutationId:randomUUID(),document:project.document,files:project.files})).statusCode,200);const after=await snapshot();assert.deepEqual(after.project.document.course.sections,project.document.course.sections);assert.equal('assessments' in after.project.document,false);
      const invalid=structuredClone(after.project.document);invalid.course.sections[0].lessons[0].blocks[0].content.correct=[19];assert.equal((await save({revision:after.revision,mutationId:randomUUID(),document:invalid})).statusCode,422);assert.equal((await snapshot()).revision,after.revision);
      const copied=await app.inject({method:'POST',url:`/api/library/courses/${id}/duplicate`,headers:a});assert.equal(copied.statusCode,200);const copy=await app.inject({url:`/api/library/courses/${copied.json().id}/edit`,headers:a});assert.equal(copy.statusCode,200);const first=project.document.course.sections[0]!.lessons[0]!.blocks[0]!;assert.notEqual(copy.json().project.document.course.sections[0].lessons[0].blocks[0].id,first.id);assert.deepEqual(copy.json().project.document.course.sections[0].lessons[0].blocks[0].assessment,first.type==='assessment' ? first.assessment : undefined);
    });
    await t.test('identity, ownership, and CSRF protections cover outline endpoints',async()=>{
      const opened=await snapshot();const changed=structuredClone(opened.project.document);changed.course.id='replacement-identity';
      assert.equal((await save({revision:opened.revision,mutationId:randomUUID(),document:changed})).statusCode,422);
      const payload={revision:opened.revision,mutationId:randomUUID(),document:opened.project.document};
      assert.equal((await save(payload,b)).statusCode,404);
      assert.equal((await app.inject({url:`/api/library/courses/${id}/edit`,headers:b})).statusCode,404);
      assert.equal((await save(payload,{...a,'x-csrf-token':'invalid'})).statusCode,403);
      assert.equal((await snapshot()).revision,opened.revision);
    });
  }finally{await app.close();await pool.end();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();}
});
