import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as pause } from 'node:timers/promises';
import pg from 'pg';
import { migrate as migrateSchema } from '../../src/server/migrations.js';
import { provisionDatabaseRoles, refreshRuntimeGrants } from '../../src/server/database-roles.js';
import { assertRuntimeDatabaseRole } from '../../src/server/database-access.js';

function databaseUrl(key: 'DATABASE_URL'|'ADMIN_DATABASE_URL'|'PROVISION_DATABASE_URL') {
  const value=process.env[key];
  assert.ok(value,`Integration fixtures require an explicit disposable ${key}.`);
  const url=new URL(value);
  assert.ok(['postgres:','postgresql:'].includes(url.protocol));
  return url;
}

/** Migrations and grant refresh run on the fixture's separate schema-owner connection. */
export async function migrate(pool:pg.Pool) {
  await migrateSchema(pool,refreshRuntimeGrants);
}

/** A unique database in the explicitly supplied disposable PostgreSQL cluster. */
export async function isolatedDatabase() {
  const runtimeUrl=databaseUrl('DATABASE_URL'),adminUrl=databaseUrl('ADMIN_DATABASE_URL'),provisionUrl=databaseUrl('PROVISION_DATABASE_URL');
  assert.equal(decodeURIComponent(runtimeUrl.username),'openscroll_app');
  assert.equal(decodeURIComponent(adminUrl.username),'openscroll_migrator');
  for(const url of [adminUrl,provisionUrl])assert.equal(url.host,runtimeUrl.host,'All test roles must use the same disposable cluster.');
  const name='openscroll_test_'+randomUUID().replaceAll('-','');
  const bootstrap=new pg.Pool({connectionString:provisionUrl.href,connectionTimeoutMillis:3000});
  try{await bootstrap.query(`CREATE DATABASE ${name}`);}catch(error){await bootstrap.end();throw error;}
  for(const url of [runtimeUrl,adminUrl,provisionUrl])url.pathname='/'+name;
  const provision=new pg.Pool({connectionString:provisionUrl.href,connectionTimeoutMillis:3000});
  const pool=new pg.Pool({connectionString:adminUrl.href,connectionTimeoutMillis:3000});
  const runtimePool=new pg.Pool({connectionString:runtimeUrl.href,connectionTimeoutMillis:3000});
  async function close(){
    await Promise.all([runtimePool.end(),pool.end(),provision.end()]);
    try{
      let clients=1;
      for(let attempt=0;attempt<80;attempt++){
        clients=(await bootstrap.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=$1 AND backend_type='client backend'",[name])).rows[0].n;
        if(clients===0)break;
        await pause(25);
      }
      assert.equal(clients,0,'Every fixture connection must close before its private database is removed.');
      await bootstrap.query(`DROP DATABASE ${name}`);
    }finally{await bootstrap.end();}
  }
  try {
    await provisionDatabaseRoles(provision,{runtimePassword:decodeURIComponent(runtimeUrl.password),migratorPassword:decodeURIComponent(adminUrl.password)});
    await migrate(pool);
    await assertRuntimeDatabaseRole(runtimePool);
    return {pool,runtimePool,provision,close,name,runtimeUrl:runtimeUrl.href,adminUrl:adminUrl.href,provisionUrl:provisionUrl.href};
  }catch(error){await close();throw error;}
}
