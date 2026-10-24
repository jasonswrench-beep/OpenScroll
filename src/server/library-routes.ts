import type { FastifyInstance, FastifyRequest } from 'fastify';
import type pg from 'pg';
import { isDeepStrictEqual } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { assetPath, parseCourse, ProjectError, type CourseDocument, type PortableProject } from '../shared/course.js';
import { validateProject, exportProject } from '../project/archive.js';
import { HttpError, requireAuthor } from './accounts/routes.js';
const idSchema=z.string().uuid();
function courseId(request:FastifyRequest) {
  const result=idSchema.safeParse((request.params as {id?:string}).id);
  if (!result.success) throw new HttpError(404,'Course not found.');
  return result.data;
}
function parse<T>(schema:z.ZodType<T>,input:unknown):T {
  const result=schema.safeParse(input);
  if (!result.success) throw new HttpError(400,'Check the course details. Titles must contain 1–300 characters.');
  return result.data;
}
function freshProject(title:string,author:string):PortableProject {
  const time=new Date().toISOString();
  return {document:parseCourse({format:'openscroll',schemaVersion:3,course:{id:`course-${randomUUID()}`,title,description:'',author,language:'en',createdAt:time,updatedAt:time,cover:null,theme:{accentColor:'#193c35',font:'sans',pageWidth:'standard'},settings:{navigation:'free',completion:'all-lessons',passingScore:80},sections:[]},assets:[]}),files:{}};
}
export function duplicateProject(source:PortableProject):PortableProject {
  const document=structuredClone(source.document); const ids=new Map<string,string>();
  const replace=(id:string) => {const next=`item-${randomUUID()}`;ids.set(id,next);return next;};
  document.course.id=replace(document.course.id);
  const files:Record<string,string>={};
  for (const asset of document.assets) {const old=assetPath(asset);asset.id=replace(asset.id);files[assetPath(asset)]=source.files[old]!;}
  if (document.course.cover) document.course.cover.assetId=ids.get(document.course.cover.assetId)!;
  for (const section of document.course.sections) {
    section.id=replace(section.id);
    for (const lesson of section.lessons) {
      lesson.id=replace(lesson.id);
      for (const block of lesson.blocks) {
        block.id=replace(block.id);
        if (block.type === 'image' || block.type === 'image-text' || block.type==='labeled-graphic') block.content.assetId=ids.get(block.content.assetId)!;
        if(block.type==='gallery')for(const image of block.content.items)image.assetId=ids.get(image.assetId)!;
        if((block.type==='audio' || block.type==='video' || block.type==='attachment') && block.content.assetId)block.content.assetId=ids.get(block.content.assetId)!;
      }
    }
  }
  document.course.title=`Copy of ${document.course.title}`.slice(0,300);
  document.course.createdAt=document.course.updatedAt=new Date().toISOString();
  return validateProject({document,files});
}
export async function readSnapshot(pool:pg.Pool,id:string,owner:string) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const row=(await client.query('SELECT document,revision,last_save_id FROM courses WHERE id=$1 AND owner_id=$2',[id,owner])).rows[0];
    if (!row) throw new HttpError(404,'Course not found.');
    const document=parseCourse(row.document); const files:Record<string,string>={};
    const assets=await client.query('SELECT a.asset_id,a.data FROM course_assets a JOIN courses c ON c.id=a.course_id WHERE c.id=$1 AND c.owner_id=$2',[id,owner]);
    for (const asset of document.assets) {
      const data=assets.rows.find(row => row.asset_id === asset.id)?.data as Buffer|undefined;
      if (!data) throw new Error('Stored asset missing');
      files[assetPath(asset)]=data.toString('base64');
    }
    await client.query('COMMIT'); return {project:{document,files},revision:row.revision as number,lastMutationId:row.last_save_id as string|null};
  } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
}
async function readProject(pool:pg.Pool,id:string,owner:string):Promise<PortableProject> {return (await readSnapshot(pool,id,owner)).project;}
export async function ensureAssetBudget(client:pg.PoolClient,owner:string,bytes:number,limit:number,exclude:string|null=null){
  const result=await client.query('SELECT COALESCE(sum(octet_length(a.data)),0) AS bytes FROM course_assets a JOIN courses c ON c.id=a.course_id WHERE c.owner_id=$1 AND ($2::uuid IS NULL OR c.id<>$2)',[owner,exclude]);
  if(Number(result.rows[0].bytes)+bytes>limit)throw new HttpError(409,'This account has reached its course asset storage limit. Download and remove unneeded courses or assets, or contact the instance administrator.');
}
async function saveNew(pool:pg.Pool,owner:string,project:PortableProject,assetLimitBytes:number) {
  const id=randomUUID(); const client=await pool.connect();
  try {
    await client.query('BEGIN');
    // Serialize creation per author so limits cannot be bypassed by parallel uploads.
    await client.query('SELECT id FROM authors WHERE id=$1 FOR UPDATE',[owner]);
    const count=await client.query('SELECT count(*)::int AS total FROM courses WHERE owner_id=$1',[owner]);
    if (count.rows[0].total >= 100) throw new HttpError(409,'This instance currently supports up to 100 courses per author.');
    await ensureAssetBudget(client,owner,project.document.assets.reduce((n,a)=>n+a.byteLength,0),assetLimitBytes);
    await client.query('INSERT INTO courses(id,owner_id,document) VALUES ($1,$2,$3)',[id,owner,project.document]);
    for (const asset of project.document.assets) await client.query('INSERT INTO course_assets(course_id,asset_id,data) VALUES ($1,$2,$3)',[id,asset.id,Buffer.from(project.files[assetPath(asset)]!,'base64')]);
    await client.query('COMMIT'); return {id,title:project.document.course.title};
  } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
}
export async function libraryRoutes(app:FastifyInstance,{pool,assetLimitBytes=1024*1024*1024}:{pool:pg.Pool;assetLimitBytes?:number}) {
  app.addHook('onRequest',async request => {requireAuthor(request);});
  app.get('/courses',async request => {
    const query=parse(z.strictObject({search:z.string().max(200).default(''),sort:z.enum(['updated','created','title']).default('updated'),offset:z.coerce.number().int().min(0).max(10000).default(0)}),request.query);
    const ordering={updated:'updated_at DESC, id',created:'created_at DESC, id',title:"lower(document->'course'->>'title'), id"}[query.sort];
    const result=await pool.query(`SELECT id,revision,document->'course'->>'title' AS title,created_at,updated_at,jsonb_array_length(document->'course'->'sections') AS sections FROM courses WHERE owner_id=$1 AND strpos(lower(document->'course'->>'title'),lower($2))>0 ORDER BY ${ordering} LIMIT 100 OFFSET $3`,[request.author!.id,query.search,query.offset]);
    return {courses:result.rows};
  });
  app.post('/courses',async request => {
    const data=parse(z.strictObject({title:z.string().trim().min(1).max(300)}),request.body);
    return saveNew(pool,request.author!.id,freshProject(data.title,request.author!.name),assetLimitBytes);
  });
  app.post('/courses/import',{bodyLimit:90*1024*1024,config:{rateLimit:{max:10,timeWindow:'1 minute',groupId:'course-import'}}},async request => {
    try {return await saveNew(pool,request.author!.id,validateProject(request.body),assetLimitBytes);}
    catch(error) {if(error instanceof ProjectError) throw new HttpError(422,error.message);throw error;}
  });
  app.get('/courses/:id/edit',async request => readSnapshot(pool,courseId(request),request.author!.id));
  app.put('/courses/:id/document',{bodyLimit:90*1024*1024},async request => {
    const id=courseId(request);
    const input=parse(z.strictObject({revision:z.number().int().positive(),mutationId:z.string().uuid(),document:z.unknown(),files:z.record(z.string(),z.string()).optional()}),request.body);
    let document:CourseDocument;
    try {document=parseCourse(input.document);if(input.files!==undefined)validateProject({document,files:input.files});}
    catch(error){if(error instanceof ProjectError)throw new HttpError(422,error.message);throw error;}
    const documentBytes=Buffer.byteLength(JSON.stringify(document,null,2)+'\n');
    if(documentBytes>2*1024*1024)throw new HttpError(422,'The course document exceeds 2 MiB.');
    if(documentBytes+document.assets.reduce((size,asset)=>size+asset.byteLength,0)>64*1024*1024)throw new HttpError(422,'The expanded project exceeds 64 MiB.');
    const sortedFiles=input.files===undefined ? null : Object.entries(input.files).sort(([a],[b])=>a<b ? -1 : a>b ? 1 : 0);
    const digestOf=(document:unknown)=>createHash('sha256').update(JSON.stringify({document,files:sortedFiles})).digest('hex');
    const digest=digestOf(document);
    // Preserve acknowledgements for exact v1 requests retained before the portable-v2 upgrade.
    const legacyDigest=[1,2].includes((input.document as {schemaVersion:number}).schemaVersion) ? digestOf({...document,schemaVersion:(input.document as {schemaVersion:number}).schemaVersion}) : undefined;
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT id FROM authors WHERE id=$1 FOR UPDATE',[request.author!.id]);
      const row=(await client.query('SELECT document,revision,last_save_id,last_save_hash FROM courses WHERE id=$1 AND owner_id=$2 FOR UPDATE',[id,request.author!.id])).rows[0];
      if(!row)throw new HttpError(404,'Course not found.');
      if(row.last_save_id===input.mutationId && row.revision===input.revision+1 && (row.last_save_hash===digest || row.last_save_hash===legacyDigest)){
        await client.query('COMMIT');return {revision:row.revision,updatedAt:row.document.course.updatedAt};
      }
      if(row.revision!==input.revision || row.last_save_id===input.mutationId)throw new HttpError(409,'This course changed elsewhere. Your edits are preserved here. Download a copy or reload the saved course.');
      if(document.course.id!==row.document.course.id || document.course.createdAt!==row.document.course.createdAt)throw new HttpError(422,'The saved course identity and creation date cannot be changed.');
      if(input.files===undefined && !isDeepStrictEqual(document.assets,row.document.assets))throw new HttpError(422,'Asset changes require the complete validated asset files.');
      document.course.updatedAt=new Date().toISOString();
      await ensureAssetBudget(client,request.author!.id,document.assets.reduce((n,a)=>n+a.byteLength,0),assetLimitBytes,id);
      if(input.files!==undefined){
        await client.query('DELETE FROM course_assets WHERE course_id=$1',[id]);
        for(const asset of document.assets)await client.query('INSERT INTO course_assets(course_id,asset_id,data) VALUES ($1,$2,$3)',[id,asset.id,Buffer.from(input.files[assetPath(asset)]!,'base64')]);
      }
      const result=await client.query('UPDATE courses SET document=$1,revision=revision+1,last_save_id=$2,last_save_hash=$3,updated_at=now() WHERE id=$4 RETURNING revision',[document,input.mutationId,digest,id]);
      await client.query('COMMIT');return {revision:result.rows[0].revision,updatedAt:document.course.updatedAt};
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  });
  app.get('/courses/:id',async request => readProject(pool,courseId(request),request.author!.id));
  app.get('/courses/:id/download',async (request,reply) => reply.type('application/x-openscroll-project').header('Content-Disposition','attachment; filename="course.openscroll"').send(await exportProject(await readProject(pool,courseId(request),request.author!.id))));
  app.patch('/courses/:id',async request => {
    const id=courseId(request); const data=parse(z.strictObject({title:z.string().trim().min(1).max(300),revision:z.number().int().positive()}),request.body);
    const result=await pool.query("UPDATE courses SET document=jsonb_set(jsonb_set(document,'{course,title}',to_jsonb($1::text)),'{course,updatedAt}',to_jsonb(to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'))),updated_at=now(),revision=revision+1,last_save_id=NULL,last_save_hash=NULL WHERE id=$2 AND owner_id=$3 AND revision=$4 RETURNING id,revision",[data.title,id,request.author!.id,data.revision]);
    if (!result.rowCount) {
      const own=await pool.query('SELECT 1 FROM courses WHERE id=$1 AND owner_id=$2',[id,request.author!.id]);
      throw new HttpError(own.rowCount ? 409 : 404,own.rowCount ? 'This course changed. Refresh the library and try again.' : 'Course not found.');
    }
    return {id,title:data.title,revision:result.rows[0].revision};
  });
  app.post('/courses/:id/duplicate',async request => saveNew(pool,request.author!.id,duplicateProject(await readProject(pool,courseId(request),request.author!.id)),assetLimitBytes));
  app.delete('/courses/:id',async request => {
    const input=parse(z.strictObject({revision:z.number().int().positive()}),request.body);
    const id=courseId(request);
    const result=await pool.query('DELETE FROM courses WHERE id=$1 AND owner_id=$2 AND revision=$3',[id,request.author!.id,input.revision]);
    if (!result.rowCount) {
      const own=await pool.query('SELECT 1 FROM courses WHERE id=$1 AND owner_id=$2',[id,request.author!.id]);
      throw new HttpError(own.rowCount ? 409 : 404,own.rowCount ? 'This course changed. Refresh before deleting it.' : 'Course not found.');
    }
    return {message:'Course and its stored assets permanently deleted.'};
  });
  app.get('/courses/:id/assets/:assetId',async (request,reply) => {
    const id=courseId(request); const assetId=(request.params as {assetId:string}).assetId;
    const result=await pool.query('SELECT a.data,c.document FROM course_assets a JOIN courses c ON c.id=a.course_id WHERE c.id=$1 AND c.owner_id=$2 AND a.asset_id=$3',[id,request.author!.id,assetId]);
    const row=result.rows[0];
    if (!row) throw new HttpError(404,'Asset not found.');
    const asset=(row.document as CourseDocument).assets.find(asset => asset.id === assetId);
    if (!asset) throw new HttpError(404,'Asset not found.');
    return reply.type('application/octet-stream').header('Content-Disposition',`attachment; filename="${asset.id}.${assetPath(asset).split('.').at(-1)}"`).header('X-Content-Type-Options','nosniff').send(row.data);
  });
}
