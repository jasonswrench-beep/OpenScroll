import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertRuntimeEnvironment,readConfig,readDatabaseUrl } from '../src/server/config.js';
import { provisionDatabaseRoles,validateRolePasswords } from '../src/server/database-roles.js';
import type pg from 'pg';

test('database credential tiers require their own explicit URL and never fall back',()=>{
  const runtime='postgresql://openscroll_app:runtime-secret@localhost/openscroll';
  const admin='postgresql://openscroll_migrator:admin-secret@localhost/openscroll';
  const provision='postgresql://bootstrap:bootstrap-secret@localhost/openscroll';
  assert.equal(readConfig({DATABASE_URL:runtime}).databaseUrl,runtime);
  assert.equal(readDatabaseUrl('ADMIN_DATABASE_URL',{ADMIN_DATABASE_URL:admin}),admin);
  assert.equal(readDatabaseUrl('PROVISION_DATABASE_URL',{PROVISION_DATABASE_URL:provision}),provision);
  assert.throws(()=>readDatabaseUrl('ADMIN_DATABASE_URL',{DATABASE_URL:runtime,PROVISION_DATABASE_URL:provision}),/ADMIN_DATABASE_URL is required/);
  assert.throws(()=>readDatabaseUrl('PROVISION_DATABASE_URL',{DATABASE_URL:runtime,ADMIN_DATABASE_URL:admin}),/PROVISION_DATABASE_URL is required/);
  for(const value of ['http://name:password@localhost/db','postgresql://localhost/db','postgresql://name@localhost/db','postgresql://name:password@localhost/','postgresql://name:password@localhost/db#secret']){
    assert.throws(()=>readDatabaseUrl('DATABASE_URL',{DATABASE_URL:value}),error=>error instanceof Error&&!error.message.includes(value));
  }
});

test('the web process rejects maintenance credential inheritance in every environment',()=>{
  for(const NODE_ENV of ['development','production','test']){
    assert.doesNotThrow(()=>assertRuntimeEnvironment({NODE_ENV,DATABASE_URL:'runtime-only',ADMIN_DATABASE_URL:''}));
    for(const key of ['ADMIN_DATABASE_URL','PROVISION_DATABASE_URL','POSTGRES_PASSWORD','MIGRATOR_DB_PASSWORD','RUNTIME_DB_PASSWORD','PGPASSWORD','PGPASSFILE','PGSERVICE','PGSERVICEFILE','PGUSER']){
      assert.throws(()=>assertRuntimeEnvironment({NODE_ENV,[key]:'never-print-this-secret'}),error=>error instanceof Error&&!error.message.includes('never-print-this-secret'));
    }
  }
});

test('provisioning password input is exact, bounded and rejects shared credentials without echoing them',()=>{
  const runtimePassword='r'.repeat(64),migratorPassword='m'.repeat(64),valid={runtimePassword,migratorPassword};
  assert.deepEqual(validateRolePasswords(valid),valid);
  for(const input of [undefined,null,[],{}, {...valid,extra:'secret'}, {...valid,runtimePassword:migratorPassword}, {...valid,runtimePassword:'short'}, {...valid,migratorPassword:'m'.repeat(257)}, {...valid,runtimePassword:'r'.repeat(40)+'\n'}, {...valid,runtimePassword:'é'.repeat(40)}, {...valid,runtimePassword:17}]){
    assert.throws(()=>validateRolePasswords(input),error=>error instanceof Error&&!error.message.includes(runtimePassword)&&!error.message.includes(migratorPassword));
  }
});

test('provisioning rejects reuse of the decoded bootstrap password before opening a database connection',async()=>{
  const bootstrapPassword='bootstrap/'.repeat(5),otherPassword='other-runtime-'.repeat(5);
  let connections=0;
  const pool={options:{connectionString:`postgresql://bootstrap:${encodeURIComponent(bootstrapPassword)}@127.0.0.1/disposable`},connect:async()=>{connections++;throw new Error('A connection must not be attempted.');}} as unknown as pg.Pool;
  for(const input of [{runtimePassword:bootstrapPassword,migratorPassword:otherPassword},{runtimePassword:otherPassword,migratorPassword:bootstrapPassword}]){
    await assert.rejects(provisionDatabaseRoles(pool,input),error=>error instanceof Error&&error.message==='Database maintenance and runtime credentials must be different.');
  }
  assert.equal(connections,0);
});
