import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { hashPassword } from './accounts/passwords.js';
export async function administer(pool:pg.Pool,command:string,args:string[],password?:string){
 if(command==='list'&&args.length===0)return (await pool.query('SELECT id,email,display_name,verified,disabled_at,created_at FROM authors ORDER BY created_at,id')).rows;
 if(command==='usage'&&args.length===0)return (await pool.query(`SELECT a.id,(SELECT count(*) FROM courses c WHERE c.owner_id=a.id) AS courses,COALESCE((SELECT sum(octet_length(b.data)) FROM course_assets b JOIN courses c ON c.id=b.course_id WHERE c.owner_id=a.id),0) AS asset_bytes,COALESCE((SELECT sum(stored_bytes) FROM reusable_items r WHERE r.owner_id=a.id),0)+COALESCE((SELECT sum(stored_bytes) FROM course_snapshots s WHERE s.owner_id=a.id),0) AS reusable_snapshot_bytes FROM authors a ORDER BY a.id`)).rows;
 const create=command==='create-author';
 if(create){if(args.length!==2||!z.email().max(254).safeParse(args[0]).success||!args[1]?.trim()||args[1].length>100||!password||password.length<15||password.length>128)throw new Error('create-author EMAIL NAME requires a 15–128 character password on standard input. The operator must verify the email owner before provisioning.');}
 else if(!['suspend','enable','revoke-sessions'].includes(command)||args.length!==1||(args[0]!=='all'||command!=='revoke-sessions')&&!z.uuid().safeParse(args[0]).success)throw new Error('Use list | usage | create-author EMAIL NAME | suspend UUID | enable UUID | revoke-sessions UUID|all.');
 const hashed=create?await hashPassword(password!):undefined,client=await pool.connect();
 try{await client.query('BEGIN');let id=create?randomUUID():args[0]!;
  if(create)await client.query('INSERT INTO authors(id,email,display_name,password_hash,verified) VALUES($1,$2,$3,$4,true)',[id,args[0]!.trim().toLowerCase(),args[1]!.trim(),hashed]);
  else if(id!=='all'){const row=await client.query('SELECT id FROM authors WHERE id=$1 FOR UPDATE',[id]);if(!row.rowCount)throw new Error('Author not found.');}
  if(command==='suspend'||command==='enable')await client.query(`UPDATE authors SET disabled_at=${command==='suspend'?'now()':'NULL'} WHERE id=$1`,[id]);
  if(!create){if(id==='all'){await client.query('DELETE FROM author_sessions');await client.query('DELETE FROM account_tokens');}else{await client.query('DELETE FROM author_sessions WHERE author_id=$1',[id]);await client.query('DELETE FROM account_tokens WHERE author_id=$1',[id]);}}
  await client.query('INSERT INTO admin_events(operation,author_id) VALUES($1,$2)',[command,id==='all'?null:id]);await client.query('COMMIT');return {operation:command,author:id};
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}
