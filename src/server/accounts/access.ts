import type { FastifyInstance, FastifyRequest } from 'fastify';
import type pg from 'pg';
import type { AccountConfig } from './config.js';
import type { Mailer } from './mail.js';
import { tokenHash } from './passwords.js';

export type ApprovalStatus = 'pending' | 'approved' | 'revoked';
export interface Principal {
  id:string; email:string; name:string; csrf:string;
  role:'owner'|'author'; approvalStatus:ApprovalStatus; verified:boolean;
}
export interface AccountServices {pool:pg.Pool;config:AccountConfig;mailer:Mailer;}
export class HttpError extends Error {
  constructor(public statusCode:number,message:string){super(message);}
}
export const accountCookieName=(config:AccountConfig)=>config.secureCookie?'__Host-openscroll_session':'openscroll_session';
export const accountView=(author:Principal)=>({id:author.id,email:author.email,name:author.name,role:author.role,approvalStatus:author.approvalStatus,verified:author.verified});

/** Install once on the root instance, after cookies and before any protected plugin. */
export async function installAccountAccess(app:FastifyInstance,services?:AccountServices){
  app.decorateRequest('author',null);
  app.setErrorHandler((error,_request,reply)=>{
    if(error instanceof HttpError)return reply.code(error.statusCode).send({error:error.message});
    if(error instanceof Error&&error.message==='PASSWORD_BUSY')return reply.code(503).send({error:'Account service is busy. Please try again shortly.'});
    const code=typeof error==='object'&&error!==null&&'statusCode'in error?error.statusCode:undefined;
    if(code===429)return reply.code(429).send({error:'Too many requests. Please wait and try again.'});
    if(code===413)return reply.code(413).send({error:'This upload exceeds the size limit.'});
    if(code===400||code===415)return reply.code(code).send({error:'The request body is invalid.'});
    return reply.code(500).send({error:'The request could not be completed. Please try again.'});
  });
  app.addHook('onRequest',async(request,reply)=>{
    let path:string;
    try{path=decodeURIComponent(request.url.split('?')[0]!);}catch{throw new HttpError(400,'The request path is invalid.');}
    if(path.startsWith('/api/'))reply.header('Cache-Control','no-store');
    if(!services)return;
    const {pool,config}=services;
    if(path.startsWith('/api/')&&['POST','PUT','PATCH','DELETE'].includes(request.method)){
      if(request.headers['x-openscroll-request']!=='1'||(request.headers.origin!==undefined&&request.headers.origin!==config.origin))throw new HttpError(403,'The request could not be verified. Reload the page and try again.');
    }
    const cookie=accountCookieName(config),raw=request.cookies[cookie];
    if(!raw)return;
    const clear=()=>reply.clearCookie(cookie,{path:'/',httpOnly:true,sameSite:'lax',secure:config.secureCookie});
    if(!/^[a-f0-9]{64}$/.test(raw)){clear();return;}
    const result=await pool.query('SELECT a.id,a.email,a.display_name,a.role,a.approval_status,a.verified,s.csrf_token FROM author_sessions s JOIN authors a ON a.id=s.author_id WHERE s.token_hash=$1 AND s.expires_at>now() AND a.disabled_at IS NULL',[tokenHash(raw)]);
    const row=result.rows[0];
    if(!row){clear();return;}
    request.author={id:row.id,email:row.email,name:row.display_name,csrf:row.csrf_token,role:row.role,approvalStatus:row.approval_status,verified:row.verified};
  });
}
export function requireAccount(request:FastifyRequest):Principal{
  if(!request.author)throw new HttpError(401,'Sign in to access this instance.');
  if(['POST','PUT','PATCH','DELETE'].includes(request.method)&&request.headers['x-csrf-token']!==request.author.csrf)throw new HttpError(403,'Your session could not be verified. Reload and try again.');
  return request.author;
}
export function requireAuthor(request:FastifyRequest):Principal{
  const author=requireAccount(request);
  if(!author.verified||author.approvalStatus!=='approved')throw new HttpError(403,'Authoring access requires verified email and approval from this instance owner.');
  return author;
}
export function requireOwner(request:FastifyRequest):Principal{
  const author=requireAuthor(request);
  if(author.role!=='owner')throw new HttpError(403,'Only an instance owner can manage access.');
  return author;
}
/** All approval/role/suspension writes take this lock before locking author rows. */
export async function lockOwnerState(client:pg.PoolClient){
  await client.query("SELECT pg_advisory_xact_lock(hashtext('openscroll:owner-state'))");
}
export async function assertCanRemoveOwner(client:pg.PoolClient,targetId:string){
  const owner=await client.query("SELECT id FROM authors WHERE id=$1 AND role='owner' AND approval_status='approved' AND verified AND disabled_at IS NULL",[targetId]);
  if(!owner.rowCount)return;
  const remaining=await client.query("SELECT count(*)::int AS count FROM authors WHERE id<>$1 AND role='owner' AND approval_status='approved' AND verified AND disabled_at IS NULL",[targetId]);
  if(remaining.rows[0].count===0)throw new HttpError(409,'The last active instance owner cannot be removed. Provision another owner first.');
}
declare module 'fastify' {interface FastifyRequest {author:Principal|null;}}
