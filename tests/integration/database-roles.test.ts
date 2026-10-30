import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { isolatedDatabase, migrate } from '../helpers/database.js';
import { seedTestAuthor } from '../helpers/accounts.js';
import { assertRuntimeDatabaseRole, assertMigratorDatabaseRole } from '../../src/server/database-access.js';
import { provisionDatabaseRoles } from '../../src/server/database-roles.js';
import { APPLICATION_TABLES } from '../../src/server/database-policy.js';

test('application database role permits real DML but denies database, schema, role and audit administration',async t=>{
  const database=await isolatedDatabase(),{pool,runtimePool,provision}=database;
  const role='denied_'+randomUUID().replaceAll('-','');
  try {
    await t.test('runtime and migrator have distinct identities, ownership and exact effective privileges',async()=>{
      await assertRuntimeDatabaseRole(runtimePool);await assertMigratorDatabaseRole(pool);
      const attributes=(await runtimePool.query("SELECT current_user AS name,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_roles WHERE rolname=current_user")).rows[0];
      assert.deepEqual(attributes,{name:'openscroll_app',rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolreplication:false,rolbypassrls:false});
      assert.equal((await runtimePool.query('SELECT count(*)::int AS n FROM pg_auth_members WHERE member=(SELECT oid FROM pg_roles WHERE rolname=current_user)')).rows[0].n,0);
      assert.deepEqual((await runtimePool.query("SELECT has_database_privilege(current_user,current_database(),'CREATE') AS create,has_database_privilege(current_user,current_database(),'TEMP') AS temp,has_schema_privilege(current_user,'public','CREATE') AS schema_create")).rows[0],{create:false,temp:false,schema_create:false});
      const owners=(await pool.query("SELECT DISTINCT pg_get_userbyid(relowner) AS owner FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','S')")).rows;
      assert.deepEqual(owners,[{owner:'openscroll_migrator'}]);
      const owner=(await pool.query('SELECT pg_get_userbyid(datdba) AS owner FROM pg_database WHERE datname=current_database()')).rows[0].owner;
      assert.ok(!['openscroll_app','openscroll_migrator'].includes(owner));
      const wrongUrl=new URL(database.runtimeUrl);wrongUrl.password='wrong-synthetic-password-'+randomUUID();
      const wrongPool=new pg.Pool({connectionString:wrongUrl.href,connectionTimeoutMillis:3000});
      try{await assert.rejects(wrongPool.query('SELECT 1'),{code:'28P01'});}finally{await wrongPool.end();}
    });
    await t.test('DDL, role switching, server-file access, owner promotion and history changes fail at PostgreSQL',async()=>{
      const denied=[
        'CREATE TABLE public.denied_table(id integer)',
        'CREATE TEMP TABLE denied_temporary(id integer)',
        'CREATE SCHEMA denied_schema',
        'ALTER TABLE public.courses ADD COLUMN denied_column text',
        'DROP TABLE public.courses',
        'TRUNCATE public.courses',
        `CREATE ROLE ${role}`,
        "SELECT pg_read_file('/dev/null',0,0)",
        'SELECT lo_create(0)',
        'SELECT lo_creat(-1)',
        "SELECT lo_from_bytea(0,''::bytea)",
        "INSERT INTO authors(id,email,display_name,password_hash,verified,role) VALUES('00000000-0000-0000-0000-000000000001','denied@example.invalid','Denied','unused',true,'owner')",
        "UPDATE authors SET role='owner' WHERE false",
        'UPDATE authors SET disabled_at=now() WHERE false',
        'DELETE FROM authors WHERE false',
        'DELETE FROM schema_migrations WHERE false',
        'UPDATE schema_migrations SET version=99 WHERE false',
        'UPDATE admin_events SET operation=\'altered\' WHERE false',
        'DELETE FROM admin_events WHERE false',
        'TRUNCATE admin_events',
        "SELECT nextval('admin_events_id_seq')",
      ];
      for(const sql of denied)await assert.rejects(runtimePool.query(sql),(error:unknown)=>!!error&&typeof error==='object'&&'code' in error&&error.code==='42501',sql);
      const client=await runtimePool.connect();
      try{await assert.rejects(client.query('SET ROLE openscroll_migrator'),{code:'42501'});await assert.rejects(client.query('SET ROLE openscroll'),{code:'42501'});}
      finally{await client.query('RESET ROLE');client.release();}
    });
    await t.test('repeat provisioning and migrations preserve authors, document bytes and audit IDs',async()=>{
      const account=await seedTestAuthor(pool),id=randomUUID(),document={synthetic:'preserved',nested:['Café','中文']};
      await runtimePool.query('INSERT INTO courses(id,owner_id,document,revision) VALUES($1,$2,$3,7)',[id,account.id,document]);
      await runtimePool.query("INSERT INTO admin_events(operation,author_id,actor_kind,actor_author_id) VALUES('approve',$1,'owner',$1)",[account.id]);
      const before=(await runtimePool.query('SELECT * FROM admin_events ORDER BY id')).rows;
      const passwords={runtimePassword:decodeURIComponent(new URL(database.runtimeUrl).password),migratorPassword:decodeURIComponent(new URL(database.adminUrl).password)};
      // Recreate the former bootstrap-owned installation without changing any rows.
      const bootstrap=(await provision.query('SELECT session_user AS name')).rows[0].name as string;
      for(const table of APPLICATION_TABLES)await provision.query(`ALTER TABLE public."${table}" OWNER TO "${bootstrap.replaceAll('"','""')}"`);
      await assert.rejects(assertRuntimeDatabaseRole(runtimePool));
      for(let n=0;n<2;n++){await provisionDatabaseRoles(provision,passwords);await migrate(pool);}
      await assertRuntimeDatabaseRole(runtimePool);
      assert.deepEqual((await runtimePool.query('SELECT document,revision FROM courses WHERE id=$1',[id])).rows[0],{document,revision:7});
      assert.deepEqual((await runtimePool.query('SELECT * FROM admin_events ORDER BY id')).rows,before);
      assert.equal((await runtimePool.query('SELECT role FROM authors WHERE id=$1',[account.id])).rows[0].role,'author');
    });
    await t.test('provisioning refuses unknown database objects without adopting or deleting their contents',async()=>{
      await pool.query('CREATE TABLE public.unexpected_fixture(value text)');
      await pool.query("INSERT INTO public.unexpected_fixture VALUES('preserved synthetic data')");
      try{
        await assert.rejects(provisionDatabaseRoles(provision,{runtimePassword:decodeURIComponent(new URL(database.runtimeUrl).password),migratorPassword:decodeURIComponent(new URL(database.adminUrl).password)}));
        assert.equal((await pool.query('SELECT value FROM public.unexpected_fixture')).rows[0].value,'preserved synthetic data');
        await assert.rejects(assertRuntimeDatabaseRole(runtimePool));
      }finally{await pool.query('DROP TABLE public.unexpected_fixture');}
      await assertRuntimeDatabaseRole(runtimePool);
      await pool.query('ALTER TABLE public.courses ADD COLUMN unreviewed_fixture text');
      try{
        await assert.rejects(provisionDatabaseRoles(provision,{runtimePassword:decodeURIComponent(new URL(database.runtimeUrl).password),migratorPassword:decodeURIComponent(new URL(database.adminUrl).password)}));
        await assert.rejects(assertRuntimeDatabaseRole(runtimePool));
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM courses')).rows[0].n,1);
      }finally{await pool.query('ALTER TABLE public.courses DROP COLUMN unreviewed_fixture');}
      await assertRuntimeDatabaseRole(runtimePool);
    });
    await t.test('startup rejects elevated effective grants and privileged connection identities',async()=>{
      await assert.rejects(assertRuntimeDatabaseRole(pool));await assert.rejects(assertRuntimeDatabaseRole(provision));
      for(const [grant,revoke] of [
        ['GRANT CREATE ON SCHEMA public TO openscroll_app','REVOKE CREATE ON SCHEMA public FROM openscroll_app'],
        ['GRANT CREATE ON SCHEMA public TO PUBLIC','REVOKE CREATE ON SCHEMA public FROM PUBLIC'],
        ['GRANT TEMP ON DATABASE '+database.name+' TO openscroll_app','REVOKE TEMP ON DATABASE '+database.name+' FROM openscroll_app'],
        ['GRANT UPDATE ON admin_events TO openscroll_app','REVOKE UPDATE ON admin_events FROM openscroll_app'],
      ]){
        await provision.query(grant!);
        try{await assert.rejects(assertRuntimeDatabaseRole(runtimePool));}finally{await provision.query(revoke!);}
        await assertRuntimeDatabaseRole(runtimePool);
      }
    });
    await t.test('the real app process refuses unsafe roles before account cleanup or listening',async()=>{
      const account=await seedTestAuthor(pool);
      await pool.query("UPDATE author_sessions SET expires_at=now()-interval '1 hour' WHERE author_id=$1",[account.id]);
      for(const url of [database.adminUrl,database.provisionUrl]){
        const result=await new Promise<{code:number|string|null;stdout:string;stderr:string}>((resolve,reject)=>{
          execFile(process.execPath,['--import','tsx','src/server/index.ts'],{
            cwd:fileURLToPath(new URL('../../',import.meta.url)),timeout:15000,maxBuffer:16384,
            env:{PATH:process.env.PATH,NODE_ENV:'development',DATABASE_URL:url,APP_ORIGIN:'http://127.0.0.1:3000',MAIL_MODE:'outbox',HOST:'127.0.0.1',PORT:'3000'},
          },(error,stdout,stderr)=>{
            if(error?.killed)return reject(new Error('Unsafe database startup did not exit within its deadline.'));
            resolve({code:error?.code??0,stdout,stderr});
          });
        });
        assert.equal(result.code,1);assert.doesNotMatch(result.stdout,/service listening/);
        assert.match(result.stderr,/restricted runtime database role/);
        assert.equal((await pool.query('SELECT count(*)::int AS n FROM author_sessions WHERE author_id=$1',[account.id])).rows[0].n,1,'Rejected startup must not run account cleanup hooks.');
      }
    });
  }finally{
    await provision.query(`DROP ROLE IF EXISTS ${role}`);
    await database.close();
  }
});
