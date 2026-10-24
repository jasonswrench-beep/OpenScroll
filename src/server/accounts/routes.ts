import { reuseRoutes } from '../reuse-routes.js';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { hashPassword, verifyPassword, randomToken, tokenHash } from './passwords.js';
import type { AccountConfig } from './config.js';
import type { Mailer } from './mail.js';
import { libraryRoutes } from '../library-routes.js';
const email=z.string().trim().toLowerCase().email().max(254);
const password=z.string().min(15).max(128);
const token=z.string().regex(/^[a-f0-9]{64}$/);
interface Author { id:string; email:string; display_name:string; password_hash:string; verified:boolean; disabled_at:string|null; }
export class HttpError extends Error { constructor(public statusCode:number,message:string) { super(message); } }
function body<T>(schema:z.ZodType<T>,input:unknown):T {
  const parsed=schema.safeParse(input);
  if (!parsed.success) throw new HttpError(400,'Check the form fields. Passwords must contain 15–128 characters.');
  return parsed.data;
}
export interface Principal { id:string; email:string; name:string; csrf:string; }
export interface AccountServices { pool:pg.Pool; config:AccountConfig; mailer:Mailer; }
export async function accountRoutes(app:FastifyInstance,services:AccountServices) {
  const {pool,config,mailer}=services;
  const cookieName=config.secureCookie ? '__Host-openscroll_session' : 'openscroll_session';
  let cleanup:ReturnType<typeof setInterval>|undefined;
  const expire=async () => {await pool.query('DELETE FROM author_sessions WHERE expires_at<=now()');await pool.query('DELETE FROM account_tokens WHERE expires_at<=now()');};
  app.addHook('onReady',async () => {await expire();cleanup=setInterval(() => {void expire().catch(() => console.error('Expired account records could not be cleaned up.'));},3600000);cleanup.unref();});
  app.addHook('onClose',async () => {if(cleanup)clearInterval(cleanup);});
  const dummy=await hashPassword(randomToken());
  app.decorateRequest('author',null);
  const clear=(reply:FastifyReply) => reply.clearCookie(cookieName,{path:'/',httpOnly:true,sameSite:'lax',secure:config.secureCookie});
  app.addHook('onRequest',async (request,reply) => {
    reply.header('Cache-Control','no-store');
    if (['POST','PUT','PATCH','DELETE'].includes(request.method)) {
      if (request.headers['x-openscroll-request'] !== '1' || (request.headers.origin !== undefined && request.headers.origin !== config.origin)) throw new HttpError(403,'The request could not be verified. Reload the page and try again.');
    }
    const raw=request.cookies[cookieName];
    if (raw && /^[a-f0-9]{64}$/.test(raw)) {
      const result=await pool.query('SELECT a.id,a.email,a.display_name,s.csrf_token FROM author_sessions s JOIN authors a ON a.id=s.author_id WHERE s.token_hash=$1 AND s.expires_at>now() AND a.disabled_at IS NULL',[tokenHash(raw)]);
      const row=result.rows[0];
      if (row) request.author={id:row.id,email:row.email,name:row.display_name,csrf:row.csrf_token};
      else clear(reply);
    }
  });
  app.setErrorHandler((error,_request,reply) => {
    if (error instanceof HttpError) return reply.code(error.statusCode).send({error:error.message});
    if (error instanceof Error && error.message === 'PASSWORD_BUSY') return reply.code(503).send({error:'Account service is busy. Please try again shortly.'});
    const code=typeof error === 'object' && error !== null && 'statusCode' in error ? error.statusCode : undefined;
    if (code === 429) return reply.code(429).send({error:'Too many requests. Please wait and try again.'});
    if (code === 413) return reply.code(413).send({error:'This upload exceeds the size limit.'});
    if (code === 400 || code === 415) return reply.code(code).send({error:'The request body is invalid.'});
    return reply.code(500).send({error:'The request could not be completed. Please try again.'});
  });
  const issueToken=async (author:Author,purpose:'reset'|'verify') => {
    const raw=randomToken();
    await pool.query('INSERT INTO account_tokens(token_hash,author_id,purpose,expires_at) VALUES ($1,$2,$3,now()+interval \'30 minutes\')',[tokenHash(raw),author.id,purpose]);
    try {
      await mailer({to:author.email,subject:purpose === 'reset' ? 'Reset your OpenScroll password' : 'Verify your OpenScroll email',text:`Open this link within 30 minutes:\n${config.origin}/#${purpose}=${raw}\nIf you did not request this, ignore this email.`});
    } catch {
      await pool.query('DELETE FROM account_tokens WHERE token_hash=$1',[tokenHash(raw)]);
      // Do not reveal whether an address exists through the HTTP response.
      console.error('An account email could not be delivered. Check mail configuration.');
    }
  };
  const authRate={config:{rateLimit:{max:10,timeWindow:'15 minutes',groupId:'account-auth'}}};
  app.get('/account/session',async request => ({author:request.author ? {id:request.author.id,email:request.author.email,name:request.author.name} : null,csrf:request.author?.csrf ?? null,registrationEnabled:config.registration,verificationRequired:config.requireVerification}));
  app.post('/account/register',authRate,async request => {
    if (!config.registration) throw new HttpError(403,'Registration is disabled on this instance.');
    const data=body(z.strictObject({email,password,name:z.string().trim().min(1).max(100)}),request.body);
    const hashed=await hashPassword(data.password);
    const result=await pool.query<Author>('INSERT INTO authors(id,email,display_name,password_hash,verified) VALUES ($1,$2,$3,$4,$5) ON CONFLICT(email) DO NOTHING RETURNING *',[randomUUID(),data.email,data.name,hashed,!config.requireVerification]);
    if (result.rows[0] && config.requireVerification) await issueToken(result.rows[0],'verify');
    return {message:config.requireVerification ? 'If registration can be completed, a verification email will arrive shortly.' : 'You can now try signing in with these details.'};
  });
  app.post('/account/login',authRate,async (request,reply) => {
    const data=body(z.strictObject({email,password:z.string().min(1).max(128)}),request.body);
    const result=await pool.query<Author>('SELECT * FROM authors WHERE email=$1',[data.email]); const author=result.rows[0];
    const valid=await verifyPassword(data.password,author?.password_hash ?? dummy);
    if (!valid || !author || !author.verified || author.disabled_at) throw new HttpError(401,'Sign-in failed. Check your details and verify your email if required.');
    const raw=randomToken(); const csrf=randomToken();
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      // Lock against simultaneous password reset/session invalidation.
      const current=await client.query('SELECT password_hash FROM authors WHERE id=$1 FOR UPDATE',[author.id]);
      if (current.rows[0]?.password_hash !== author.password_hash) throw new HttpError(401,'Your account changed. Please sign in again.');
      if (request.cookies[cookieName]) await client.query('DELETE FROM author_sessions WHERE token_hash=$1',[tokenHash(request.cookies[cookieName]!)]);
      await client.query('INSERT INTO author_sessions(token_hash,author_id,csrf_token,expires_at) VALUES ($1,$2,$3,now()+interval \'7 days\')',[tokenHash(raw),author.id,csrf]);
      await client.query('COMMIT');
    } catch(error) { await client.query('ROLLBACK'); throw error; } finally {client.release();}
    reply.setCookie(cookieName,raw,{path:'/',httpOnly:true,sameSite:'lax',secure:config.secureCookie,maxAge:7*86400});
    return {author:{id:author.id,email:author.email,name:author.display_name},csrf};
  });
  app.post('/account/logout',async (request,reply) => {
    requireAuthor(request);
    await pool.query('DELETE FROM author_sessions WHERE token_hash=$1',[tokenHash(request.cookies[cookieName]!)]);
    clear(reply); return {message:'Signed out.'};
  });
  const recoveryRate={config:{rateLimit:{max:5,timeWindow:'15 minutes',groupId:'account-recovery'}}};
  app.post('/account/request-reset',recoveryRate,async request => {
    const data=body(z.strictObject({email}),request.body);
    const result=await pool.query<Author>('SELECT * FROM authors WHERE email=$1',[data.email]);
    if (result.rows[0]) await issueToken(result.rows[0],'reset');
    return {message:'If an account matches, a password reset email will arrive shortly.'};
  });
  app.post('/account/resend-verification',recoveryRate,async request => {
    const data=body(z.strictObject({email}),request.body);
    const result=await pool.query<Author>('SELECT * FROM authors WHERE email=$1 AND NOT verified',[data.email]);
    if (result.rows[0]) await issueToken(result.rows[0],'verify');
    return {message:'If verification is needed, an email will arrive shortly.'};
  });
  app.post('/account/reset',recoveryRate,async (request,reply) => {
    const data=body(z.strictObject({token,password}),request.body);
    const hashed=await hashPassword(data.password);
    const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const result=await client.query("DELETE FROM account_tokens WHERE token_hash=$1 AND purpose='reset' AND expires_at>now() RETURNING author_id",[tokenHash(data.token)]);
      const id=result.rows[0]?.author_id;
      if (!id) throw new HttpError(400,'This reset link is invalid or expired. Request another email.');
      await client.query('UPDATE authors SET password_hash=$1 WHERE id=$2',[hashed,id]);
      await client.query('DELETE FROM author_sessions WHERE author_id=$1',[id]);
      await client.query('DELETE FROM account_tokens WHERE author_id=$1 AND purpose=\'reset\'',[id]);
      await client.query('COMMIT');
    } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
    clear(reply); return {message:'Password changed. Sign in with your new password.'};
  });
  app.post('/account/verify',recoveryRate,async request => {
    const data=body(z.strictObject({token}),request.body); const client=await pool.connect();
    try {
      await client.query('BEGIN');
      const result=await client.query("DELETE FROM account_tokens WHERE token_hash=$1 AND purpose='verify' AND expires_at>now() RETURNING author_id",[tokenHash(data.token)]);
      const id=result.rows[0]?.author_id;
      if (!id) throw new HttpError(400,'This verification link is invalid or expired. Request another email.');
      await client.query('UPDATE authors SET verified=true WHERE id=$1',[id]);
      await client.query('DELETE FROM account_tokens WHERE author_id=$1 AND purpose=\'verify\'',[id]);
      await client.query('COMMIT');
    } catch(error) {await client.query('ROLLBACK');throw error;} finally {client.release();}
    return {message:'Email verified. You can now sign in.'};
  });
  await app.register(libraryRoutes,{prefix:'/library',pool,assetLimitBytes:config.assetLimitBytes});
  await app.register(reuseRoutes,{prefix:'/library',pool});
}
export function requireAuthor(request:FastifyRequest):Principal {
  if (!request.author) throw new HttpError(401,'Sign in to access your course library.');
  if (['POST','PUT','PATCH','DELETE'].includes(request.method) && request.headers['x-csrf-token'] !== request.author.csrf) throw new HttpError(403,'Your session could not be verified. Reload and try again.');
  return request.author;
}
declare module 'fastify' { interface FastifyRequest { author:Principal|null; } }
