import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { hashPassword, randomToken, tokenHash } from '../../src/server/accounts/passwords.js';

type FixtureOptions = {
  role?: 'owner'|'author';
  approvalStatus?: 'pending'|'approved'|'revoked';
  verified?: boolean;
  email?: string;
  name?: string;
};
export interface TestAuthor {
  id:string; email:string; password:string; token:string; csrf:string; cookie:string;
}
function syntheticEmail(value:string) {
  assert.match(value,/^[^\s@]+@example\.invalid$/,'Account fixtures must use synthetic example.invalid addresses.');
  return value.toLowerCase();
}

/** Trusted fixture setup only: callers supply their disposable migrator connection, never the application pool. */
export async function seedTestAuthor(pool:pg.Pool,options:FixtureOptions={}):Promise<TestAuthor> {
  const id=randomUUID(),email=syntheticEmail(options.email??`fixture-${id}@example.invalid`);
  const password=`Synthetic account fixture ${randomUUID()}`,token=randomToken(),csrf=randomToken();
  await pool.query(`INSERT INTO authors(id,email,display_name,password_hash,verified,role,approval_status)
    VALUES($1,$2,$3,$4,$5,$6,$7)`,[id,email,options.name??'Synthetic author',await hashPassword(password),options.verified??true,options.role??'author',options.approvalStatus??'approved']);
  try {
    await pool.query(`INSERT INTO author_sessions(token_hash,author_id,csrf_token,expires_at)
      VALUES($1,$2,$3,now()+interval '1 hour')`,[tokenHash(token),id,csrf]);
  } catch(error) {await pool.query('DELETE FROM authors WHERE id=$1 AND email=$2',[id,email]);throw error;}
  return {id,email,password,token,csrf,cookie:`openscroll_session=${token}`};
}

/** Approve an already registered synthetic fixture without exercising the owner UI. */
export async function approveFixtureAuthor(pool:pg.Pool,email:string):Promise<string> {
  const result=await pool.query("UPDATE authors SET verified=true,approval_status='approved' WHERE email=$1 RETURNING id",[syntheticEmail(email)]);
  assert.equal(result.rowCount,1,'Expected exactly one synthetic author to approve.');
  return result.rows[0].id as string;
}
export const approveTestAuthorByEmail=approveFixtureAuthor;

export async function cleanupTestAuthor(pool:pg.Pool,fixture:Pick<TestAuthor,'id'|'email'>) {
  await pool.query('DELETE FROM authors WHERE id=$1 AND email=$2',[fixture.id,syntheticEmail(fixture.email)]);
}
