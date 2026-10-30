import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { hashPassword } from './accounts/passwords.js';
import { assertCanRemoveOwner, lockOwnerState } from './accounts/access.js';
const uuid=z.string().uuid();
const email=z.string().trim().toLowerCase().email().max(254);
const commands='Use list | usage | review-accounts OWNER_UUID OWNER_EMAIL | create-author EMAIL NAME | bootstrap-owner UUID EMAIL | suspend UUID | enable UUID | revoke-sessions UUID|all.';
const accountColumns='id,email,display_name,verified,approval_status,role,disabled_at,access_notified_at,created_at';
export async function administer(pool:pg.Pool,command:string,args:string[],password?:string){
 if(command==='list'&&args.length===0)return (await pool.query(`SELECT ${accountColumns} FROM authors ORDER BY created_at,id`)).rows;
 if(command==='usage'&&args.length===0)return (await pool.query(`SELECT a.id,(SELECT count(*) FROM courses c WHERE c.owner_id=a.id) AS courses,COALESCE((SELECT sum(octet_length(b.data)) FROM course_assets b JOIN courses c ON c.id=b.course_id WHERE c.owner_id=a.id),0) AS asset_bytes,COALESCE((SELECT sum(stored_bytes) FROM reusable_items r WHERE r.owner_id=a.id),0)+COALESCE((SELECT sum(stored_bytes) FROM course_snapshots s WHERE s.owner_id=a.id),0) AS reusable_snapshot_bytes FROM authors a ORDER BY a.id`)).rows;
 if(command==='review-accounts'){
  if(args.length!==2||!uuid.safeParse(args[0]).success||!email.safeParse(args[1]).success)throw new Error(commands);
  // This report contains account identity details only when explicitly requested.
  // One statement gives a consistent, read-only view and never selects secrets or content.
  const rows=(await pool.query(`SELECT ${accountColumns} FROM authors ORDER BY created_at,id`)).rows;
  const owner=rows.find(row=>row.id===args[0]);
  if(!owner||owner.email.trim().toLowerCase()!==email.parse(args[1]))throw new Error('The designated account and email confirmation do not match.');
  const unexpectedAccounts=rows.filter(row=>row.id!==owner.id);
  return {designatedOwner:owner,unexpectedAccounts,otherAccountCount:unexpectedAccounts.length};
 }
 const create=command==='create-author';
 const bootstrap=command==='bootstrap-owner';
 if(create){if(args.length!==2||!email.safeParse(args[0]).success||!args[1]?.trim()||args[1].length>100||!password||password.length<15||password.length>128)throw new Error('create-author EMAIL NAME requires a 15–128 character password on standard input. The operator must verify the email owner before provisioning. New authors still require instance-owner approval.');}
 else if(bootstrap){if(args.length!==2||!uuid.safeParse(args[0]).success||!email.safeParse(args[1]).success)throw new Error(commands);}
 else if(!['suspend','enable','revoke-sessions'].includes(command)||args.length!==1||(args[0]!=='all'||command!=='revoke-sessions')&&!uuid.safeParse(args[0]).success)throw new Error(commands);
 const hashed=create?await hashPassword(password!):undefined,client=await pool.connect();
 try{await client.query('BEGIN');await lockOwnerState(client);const id=create?randomUUID():args[0]!;
  if(create)await client.query("INSERT INTO authors(id,email,display_name,password_hash,verified,approval_status,role) VALUES($1,$2,$3,$4,true,'pending','author')",[id,email.parse(args[0]),args[1]!.trim(),hashed]);
  else if(id!=='all'){
   const row=(await client.query('SELECT id,email,verified,disabled_at FROM authors WHERE id=$1 FOR UPDATE',[id])).rows[0];
   if(!row)throw new Error('Author not found.');
   if(bootstrap){
    if(row.email.trim().toLowerCase()!==email.parse(args[1]))throw new Error('The account and email confirmation do not match.');
    if(!row.verified||row.disabled_at)throw new Error('Owner bootstrap requires an email-verified, enabled account.');
    await client.query("UPDATE authors SET approval_status='approved',role='owner' WHERE id=$1",[id]);
   }
   if(command==='suspend')await assertCanRemoveOwner(client,id);
  }
  if(command==='suspend'||command==='enable')await client.query(`UPDATE authors SET disabled_at=${command==='suspend'?'now()':'NULL'} WHERE id=$1`,[id]);
  if(!create){if(id==='all'){await client.query('DELETE FROM author_sessions');await client.query('DELETE FROM account_tokens');}else{await client.query('DELETE FROM author_sessions WHERE author_id=$1',[id]);await client.query('DELETE FROM account_tokens WHERE author_id=$1',[id]);}}
  await client.query("INSERT INTO admin_events(operation,author_id,actor_author_id,actor_kind) VALUES($1,$2,NULL,'operator')",[command,id==='all'?null:id]);await client.query('COMMIT');return {operation:command,author:id};
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
