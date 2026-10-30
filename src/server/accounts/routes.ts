import { reuseRoutes } from '../reuse-routes.js';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { hashPassword, verifyPassword, randomToken, tokenHash } from './passwords.js';
import { libraryRoutes } from '../library-routes.js';
import { accountCookieName,accountView,HttpError,requireAccount,requireOwner,lockOwnerState,assertCanRemoveOwner,type AccountServices,type ApprovalStatus } from './access.js';
import { enqueueAccessRequestNotification,processAccessRequestNotifications } from './notifications.js';
export {HttpError,requireAccount,requireAuthor,requireOwner,type Principal,type AccountServices} from './access.js';

const email=z.string().trim().toLowerCase().email().max(254);
const password=z.string().min(15).max(128);
const token=z.string().regex(/^[a-f0-9]{64}$/);
interface Author {id:string;email:string;display_name:string;password_hash:string;verified:boolean;disabled_at:string|null;role:'owner'|'author';approval_status:ApprovalStatus;}
function body<T>(schema:z.ZodType<T>,input:unknown):T{
  const parsed=schema.safeParse(input);
  if(!parsed.success)throw new HttpError(400,'Check the request fields. Passwords must contain 15–128 characters.');
  return parsed.data;
}
export async function accountRoutes(app:FastifyInstance,services:AccountServices){
  const {pool,config,mailer}=services,cookieName=accountCookieName(config);
  let cleanup:ReturnType<typeof setInterval>|undefined,notificationRetry:ReturnType<typeof setInterval>|undefined,retrying:Promise<void>|undefined;
  const expire=async()=>{await pool.query('DELETE FROM author_sessions WHERE expires_at<=now()');await pool.query('DELETE FROM account_tokens WHERE expires_at<=now()');};
  app.addHook('onReady',async()=>{
    await expire();
    cleanup=setInterval(()=>{void expire().catch(()=>console.error('Expired account records could not be cleaned up.'));},3600000);cleanup.unref();
    if(config.accessRequestNotifyEmail){
      notificationRetry=setInterval(()=>{if(!retrying)retrying=processAccessRequestNotifications(services).catch(()=>console.error('Access request notifications could not be processed. Review pending accounts.')).finally(()=>{retrying=undefined;});},60000);notificationRetry.unref();
    }
  });
  app.addHook('onClose',async()=>{if(cleanup)clearInterval(cleanup);if(notificationRetry)clearInterval(notificationRetry);await retrying;});
  const dummy=await hashPassword(randomToken());
  const clear=(reply:FastifyReply)=>reply.clearCookie(cookieName,{path:'/',httpOnly:true,sameSite:'lax',secure:config.secureCookie});
  const notify=async(id:string)=>{try{await enqueueAccessRequestNotification(services,id);}catch{console.error('An access request notification could not be queued. Review pending accounts.');}};
  const issueToken=async(author:Author,purpose:'reset'|'verify')=>{
    const raw=randomToken();
    await pool.query("INSERT INTO account_tokens(token_hash,author_id,purpose,expires_at) VALUES ($1,$2,$3,now()+interval '30 minutes')",[tokenHash(raw),author.id,purpose]);
    try{await mailer({to:author.email,subject:purpose==='reset'?'Reset your OpenScroll password':'Verify your OpenScroll email',text:`Open this link within 30 minutes:\n${config.origin}/account/#${purpose}=${raw}\nIf you did not request this, ignore this email.`});}
    catch{await pool.query('DELETE FROM account_tokens WHERE token_hash=$1',[tokenHash(raw)]);console.error('An account email could not be delivered. Check mail configuration.');}
  };
  const authRate={config:{rateLimit:{max:10,timeWindow:'15 minutes',groupId:'account-auth'}}};
  app.get('/account/session',async request=>({author:request.author?accountView(request.author):null,csrf:request.author?.csrf??null,registrationEnabled:config.registration,verificationRequired:config.requireVerification}));
  app.post('/account/register',authRate,async request=>{
    if(!config.registration)throw new HttpError(403,'Access requests are closed on this instance.');
    const data=body(z.strictObject({email,password,name:z.string().trim().min(1).max(100)}),request.body),hashed=await hashPassword(data.password);
    const result=await pool.query<Author>('INSERT INTO authors(id,email,display_name,password_hash,verified) VALUES ($1,$2,$3,$4,$5) ON CONFLICT(email) DO NOTHING RETURNING *',[randomUUID(),data.email,data.name,hashed,!config.requireVerification]);
    const author=result.rows[0];
    if(author){if(config.requireVerification)await issueToken(author,'verify');else await notify(author.id);}
    return {message:config.requireVerification?'If the access request can be completed, a verification email will arrive shortly. Verified requests still need this instance owner’s approval.':'If the access request can be completed, it will await this instance owner’s approval.'};
  });
  app.post('/account/login',authRate,async(request,reply)=>{
    const data=body(z.strictObject({email,password:z.string().min(1).max(128)}),request.body);
    const author=(await pool.query<Author>('SELECT * FROM authors WHERE email=$1',[data.email])).rows[0];
    const valid=await verifyPassword(data.password,author?.password_hash??dummy);
    if(!valid||!author||!author.verified||author.disabled_at||author.approval_status==='revoked')throw new HttpError(401,'Sign-in failed. Check your details, verify your email, and contact this instance owner if access was revoked.');
    const raw=randomToken(),csrf=randomToken(),client=await pool.connect();let current:Author;
    try{
      await client.query('BEGIN');
      const row=(await client.query<Author>('SELECT * FROM authors WHERE id=$1 FOR UPDATE',[author.id])).rows[0];
      if(!row||row.password_hash!==author.password_hash||!row.verified||row.disabled_at||row.approval_status==='revoked')throw new HttpError(401,'Your account changed. Please sign in again.');
      current=row;
      if(request.cookies[cookieName])await client.query('DELETE FROM author_sessions WHERE token_hash=$1',[tokenHash(request.cookies[cookieName]!)]);
      await client.query("INSERT INTO author_sessions(token_hash,author_id,csrf_token,expires_at) VALUES ($1,$2,$3,now()+interval '7 days')",[tokenHash(raw),row.id,csrf]);
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    reply.setCookie(cookieName,raw,{path:'/',httpOnly:true,sameSite:'lax',secure:config.secureCookie,maxAge:7*86400});
    if(current.approval_status==='pending')await notify(current.id);
    return {author:{id:current.id,email:current.email,name:current.display_name,role:current.role,approvalStatus:current.approval_status,verified:current.verified},csrf};
  });
  app.post('/account/logout',async(request,reply)=>{
    requireAccount(request);
    await pool.query('DELETE FROM author_sessions WHERE token_hash=$1',[tokenHash(request.cookies[cookieName]!)]);
    clear(reply);return {message:'Signed out.'};
  });
  const recoveryRate={config:{rateLimit:{max:5,timeWindow:'15 minutes',groupId:'account-recovery'}}};
  app.post('/account/request-reset',recoveryRate,async request=>{
    const data=body(z.strictObject({email}),request.body),author=(await pool.query<Author>('SELECT * FROM authors WHERE email=$1',[data.email])).rows[0];
    if(author)await issueToken(author,'reset');
    return {message:'If an account matches, a password reset email will arrive shortly.'};
  });
  app.post('/account/resend-verification',recoveryRate,async request=>{
    const data=body(z.strictObject({email}),request.body),author=(await pool.query<Author>('SELECT * FROM authors WHERE email=$1 AND NOT verified',[data.email])).rows[0];
    if(author)await issueToken(author,'verify');
    return {message:'If verification is needed, an email will arrive shortly.'};
  });
  app.post('/account/reset',recoveryRate,async(request,reply)=>{
    const data=body(z.strictObject({token,password}),request.body),hashed=await hashPassword(data.password),client=await pool.connect();
    try{
      await client.query('BEGIN');
      const found=(await client.query("SELECT author_id FROM account_tokens WHERE token_hash=$1 AND purpose='reset' AND expires_at>now()",[tokenHash(data.token)])).rows[0];
      if(!found)throw new HttpError(400,'This reset link is invalid or expired. Request another email.');
      await client.query('SELECT id FROM authors WHERE id=$1 FOR UPDATE',[found.author_id]);
      const consumed=await client.query("DELETE FROM account_tokens WHERE token_hash=$1 AND purpose='reset' AND expires_at>now() RETURNING author_id",[tokenHash(data.token)]);
      if(!consumed.rowCount)throw new HttpError(400,'This reset link is invalid or expired. Request another email.');
      await client.query('UPDATE authors SET password_hash=$1 WHERE id=$2',[hashed,found.author_id]);
      await client.query('DELETE FROM author_sessions WHERE author_id=$1',[found.author_id]);
      await client.query("DELETE FROM account_tokens WHERE author_id=$1 AND purpose='reset'",[found.author_id]);
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    clear(reply);return {message:'Password changed. Sign in with your new password. Approval and email verification are unchanged.'};
  });
  app.post('/account/verify',recoveryRate,async request=>{
    const data=body(z.strictObject({token}),request.body),client=await pool.connect();let id:string;
    try{
      await client.query('BEGIN');
      const found=(await client.query("SELECT author_id FROM account_tokens WHERE token_hash=$1 AND purpose='verify' AND expires_at>now()",[tokenHash(data.token)])).rows[0];
      if(!found)throw new HttpError(400,'This verification link is invalid or expired. Request another email.');
      await client.query('SELECT id FROM authors WHERE id=$1 FOR UPDATE',[found.author_id]);
      const consumed=await client.query("DELETE FROM account_tokens WHERE token_hash=$1 AND purpose='verify' AND expires_at>now() RETURNING author_id",[tokenHash(data.token)]);
      if(!consumed.rowCount)throw new HttpError(400,'This verification link is invalid or expired. Request another email.');
      id=found.author_id;
      await client.query('UPDATE authors SET verified=true WHERE id=$1',[id]);
      await client.query("DELETE FROM account_tokens WHERE author_id=$1 AND purpose='verify'",[id]);
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    await notify(id);
    return {message:'Email verified. Sign in to view your access status; authoring still requires this instance owner’s approval.'};
  });
  app.get('/owner/accounts',{config:{rateLimit:{max:60,timeWindow:'1 minute',groupId:'owner-review'}}},async request=>{
    requireOwner(request);
    const query=body(z.strictObject({cursor:z.uuid().optional(),limit:z.coerce.number().int().min(1).max(100).default(50)}),request.query);
    const result=await pool.query('SELECT a.id,a.email,a.display_name,a.verified,a.approval_status,a.disabled_at,a.role,a.created_at,n.status AS notification_status FROM authors a LEFT JOIN access_request_notifications n ON n.author_id=a.id WHERE ($1::uuid IS NULL OR a.id>$1) ORDER BY a.id LIMIT $2',[query.cursor??null,query.limit+1]);
    const more=result.rows.length>query.limit,rows=result.rows.slice(0,query.limit);
    return {accounts:rows.map(a=>({id:a.id,email:a.email,name:a.display_name,verified:a.verified,approvalStatus:a.approval_status,disabled:a.disabled_at!==null,role:a.role,createdAt:new Date(a.created_at).toISOString(),notificationStatus:a.notification_status})),...(more?{nextCursor:rows.at(-1)!.id}:{})};
  });
  for(const action of ['approve','revoke'] as const)app.post('/owner/accounts/:id/'+action,{config:{rateLimit:{max:30,timeWindow:'1 minute',groupId:'owner-access-change'}}},async request=>{
    const owner=requireOwner(request),{id}=body(z.strictObject({id:z.uuid()}),request.params);body(z.strictObject({}),request.body);
    const client=await pool.connect();
    try{
      await client.query('BEGIN');await lockOwnerState(client);
      const actor=(await client.query<Author>('SELECT * FROM authors WHERE id=$1 FOR UPDATE',[owner.id])).rows[0];
      if(!actor||actor.role!=='owner'||actor.approval_status!=='approved'||!actor.verified||actor.disabled_at)throw new HttpError(403,'Only an active instance owner can manage access.');
      const target=(await client.query<Author>('SELECT * FROM authors WHERE id=$1 FOR UPDATE',[id])).rows[0];
      if(!target)throw new HttpError(404,'Account not found.');
      if(action==='approve'&&(!target.verified||target.disabled_at))throw new HttpError(409,'Verify the email and enable this account before approving access.');
      const next=action==='approve'?'approved':'revoked';
      if(target.approval_status!==next){
        if(action==='revoke')await assertCanRemoveOwner(client,id);
        await client.query('UPDATE authors SET approval_status=$1 WHERE id=$2',[next,id]);
        await client.query('DELETE FROM author_sessions WHERE author_id=$1',[id]);
        await client.query('DELETE FROM account_tokens WHERE author_id=$1',[id]);
        await client.query("INSERT INTO admin_events(operation,author_id,actor_author_id,actor_kind) VALUES($1,$2,$3,'owner')",[action==='approve'?'approve-access':'revoke-access',id,owner.id]);
      }
      await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
    return {message:action==='approve'?'Access approved. The author must sign in again.':'Access revoked. Existing sessions were invalidated.'};
  });
  await app.register(libraryRoutes,{prefix:'/library',pool,assetLimitBytes:config.assetLimitBytes});
  await app.register(reuseRoutes,{prefix:'/library',pool});
}
