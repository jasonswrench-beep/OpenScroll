import type pg from 'pg';
import { createHash,createHmac,pbkdf2,randomBytes,timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { APPLICATION_COLUMNS,APPLICATION_INDEXES,APPLICATION_SEQUENCES,APPLICATION_TABLES,FORBIDDEN_RUNTIME_FUNCTION_NAMES,FORBIDDEN_RUNTIME_ROUTINES,MIGRATOR_ROLE,RUNTIME_COLUMN_GRANTS,RUNTIME_ROLE,RUNTIME_SEQUENCE_GRANTS,RUNTIME_TABLE_GRANTS } from './database-policy.js';

type Client=pg.PoolClient;
interface Relation {oid:number;relname:string;relkind:string;owner:string;relrowsecurity:boolean;relforcerowsecurity:boolean;relpersistence:string;relispartition:boolean;relhasrules:boolean;}
const fail=()=>{throw new Error('Database provisioning requires a dedicated OpenScroll database with only the reviewed application objects and safe roles. No data was changed.');};
const identifier=(value:string)=>'"'+value.replaceAll('"','""')+'"';
const literal=(value:string)=>"'"+value.replaceAll("'","''")+"'";

/** Passwords are never command arguments, connection errors or application log fields. */
export function validateRolePasswords(input:unknown):{runtimePassword:string;migratorPassword:string}{
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('Provide exactly runtimePassword and migratorPassword through protected input.');
  const fields=Object.keys(input),value=input as Record<string,unknown>;
  if(fields.length!==2||!fields.includes('runtimePassword')||!fields.includes('migratorPassword')||typeof value.runtimePassword!=='string'||typeof value.migratorPassword!=='string')throw new Error('Provide exactly runtimePassword and migratorPassword through protected input.');
  const runtimePassword=value.runtimePassword as string,migratorPassword=value.migratorPassword as string;
  if(!/^[\x20-\x7e]{32,256}$/.test(runtimePassword)||!/^[\x20-\x7e]{32,256}$/.test(migratorPassword)||runtimePassword===migratorPassword)throw new Error('Use two different generated ASCII database passwords, each 32–256 characters.');
  return {runtimePassword,migratorPassword};
}

// Send SCRAM verifiers rather than plaintext passwords in SQL statements. Only generated
// ASCII passwords are accepted, avoiding differences in SCRAM/SASLprep normalization.
async function scramVerifier(password:string){
  const salt=randomBytes(16),iterations=4096,salted=await promisify(pbkdf2)(password,salt,iterations,32,'sha256');
  const clientKey=createHmac('sha256',salted).update('Client Key').digest();
  const storedKey=createHash('sha256').update(clientKey).digest('base64');
  const serverKey=createHmac('sha256',salted).update('Server Key').digest('base64');
  salted.fill(0);clientKey.fill(0);
  return `SCRAM-SHA-256$${iterations}:${salt.toString('base64')}$${storedKey}:${serverKey}`;
}
async function matchesScramVerifier(password:string,verifier:string|null){
  const match=verifier?.match(/^SCRAM-SHA-256\$(\d+):([A-Za-z0-9+/=]+)\$([A-Za-z0-9+/=]+):([A-Za-z0-9+/=]+)$/);
  if(!match)return false;
  const iterations=Number(match[1]);
  if(!Number.isInteger(iterations)||iterations<4096||iterations>1000000)return false;
  const expected=Buffer.from(match[3]!,'base64'),expectedServer=Buffer.from(match[4]!,'base64');
  if(expected.length!==32||expectedServer.length!==32)return false;
  const salted=await promisify(pbkdf2)(password,Buffer.from(match[2]!,'base64'),iterations,32,'sha256');
  const clientKey=createHmac('sha256',salted).update('Client Key').digest(),actual=createHash('sha256').update(clientKey).digest();
  const actualServer=createHmac('sha256',salted).update('Server Key').digest();
  const matches=timingSafeEqual(expected,actual)&&timingSafeEqual(expectedServer,actualServer);
  salted.fill(0);clientKey.fill(0);actual.fill(0);expected.fill(0);actualServer.fill(0);expectedServer.fill(0);
  return matches;
}

/** Refuse to adopt other applications' objects or executable schema customizations. */
async function reviewedInventory(client:Client,owners:readonly string[]){
  const schemas=await client.query("SELECT nspname FROM pg_catalog.pg_namespace WHERE nspname NOT IN('pg_catalog','pg_toast','information_schema') AND nspname !~ '^pg_(toast_)?temp_[0-9]+$'");
  if(schemas.rows.some(row=>row.nspname!=='public'))fail();
  const extensions=await client.query("SELECT extname FROM pg_catalog.pg_extension WHERE extname<>'plpgsql'");
  if(extensions.rowCount)fail();
  const routines=await client.query("SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema'");
  if(routines.rowCount)fail();
  const catalogRoutines=await client.query(`SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='pg_catalog' AND p.oid>=16384
    AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_depend d JOIN pg_catalog.pg_extension e ON e.oid=d.refobjid
      WHERE d.classid='pg_catalog.pg_proc'::pg_catalog.regclass AND d.objid=p.oid AND d.deptype='e' AND e.extname='plpgsql')`);
  if(catalogRoutines.rowCount)fail();
  const foreign=await client.query('SELECT 1 FROM pg_catalog.pg_foreign_server UNION ALL SELECT 1 FROM pg_catalog.pg_foreign_data_wrapper');
  if(foreign.rowCount)fail();
  const largeObjects=await client.query('SELECT 1 FROM pg_catalog.pg_largeobject_metadata LIMIT 1');
  if(largeObjects.rowCount)fail();
  const eventTriggers=await client.query('SELECT 1 FROM pg_catalog.pg_event_trigger LIMIT 1');
  if(eventTriggers.rowCount)fail();
  const relations=await client.query<Relation>(`SELECT c.oid,c.relname,c.relkind,pg_catalog.pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity,c.relforcerowsecurity,c.relpersistence,c.relispartition,c.relhasrules
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'`);
  const tables=relations.rows.filter(row=>row.relkind==='r'),sequences=relations.rows.filter(row=>row.relkind==='S');
  for(const relation of relations.rows){
    if(!owners.includes(relation.owner))fail();
    if(relation.relkind==='r'){
      if(!APPLICATION_TABLES.includes(relation.relname)||relation.relrowsecurity||relation.relforcerowsecurity||relation.relpersistence!=='p'||relation.relispartition||relation.relhasrules)fail();
    }else if(relation.relkind==='S'){
      if(!APPLICATION_SEQUENCES.includes(relation.relname))fail();
    }else if(relation.relkind!=='i'||!APPLICATION_INDEXES.includes(relation.relname))fail();
  }
  const indexes=await client.query(`SELECT 1 FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class x ON x.oid=i.indexrelid JOIN pg_catalog.pg_namespace n ON n.oid=x.relnamespace
    LEFT JOIN pg_catalog.pg_class t ON t.oid=i.indrelid WHERE n.nspname='public' AND (NOT(t.relnamespace=n.oid AND t.relname=ANY($1::text[]) AND t.relkind='r') OR NOT i.indisvalid OR NOT i.indisready OR i.indexprs IS NOT NULL OR i.indpred IS NOT NULL)`,[APPLICATION_TABLES]);
  if(indexes.rowCount)fail();
  const columns=await client.query("SELECT c.relname,a.attname FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid=a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped");
  if(columns.rows.some(row=>!APPLICATION_COLUMNS[row.relname]?.includes(row.attname)))fail();
  const triggers=await client.query("SELECT 1 FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal");
  if(triggers.rowCount)fail();
  const policies=await client.query("SELECT 1 FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'");
  if(policies.rowCount)fail();
  const inheritance=await client.query("SELECT 1 FROM pg_catalog.pg_inherits i JOIN pg_catalog.pg_class c ON c.oid=i.inhrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'");
  if(inheritance.rowCount)fail();
  const customTypes=await client.query(`SELECT 1 FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND NOT(t.typtype='c' AND t.typrelid=ANY($1::oid[]))
      AND NOT(t.typtype='b' AND t.typelem IN(SELECT oid FROM pg_catalog.pg_type WHERE typrelid=ANY($1::oid[])))`,[tables.map(row=>row.oid)]);
  if(customTypes.rowCount)fail();
  const customObjects=await client.query(`SELECT 1 FROM pg_catalog.pg_collation c JOIN pg_catalog.pg_namespace n ON n.oid=c.collnamespace WHERE n.nspname='public'
    UNION ALL SELECT 1 FROM pg_catalog.pg_conversion c JOIN pg_catalog.pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public'
    UNION ALL SELECT 1 FROM pg_catalog.pg_operator c JOIN pg_catalog.pg_namespace n ON n.oid=c.oprnamespace WHERE n.nspname='public'
    UNION ALL SELECT 1 FROM pg_catalog.pg_opclass c JOIN pg_catalog.pg_namespace n ON n.oid=c.opcnamespace WHERE n.nspname='public'
    UNION ALL SELECT 1 FROM pg_catalog.pg_opfamily c JOIN pg_catalog.pg_namespace n ON n.oid=c.opfnamespace WHERE n.nspname='public'
    UNION ALL SELECT 1 FROM pg_catalog.pg_ts_config c JOIN pg_catalog.pg_namespace n ON n.oid=c.cfgnamespace WHERE n.nspname='public'
    UNION ALL SELECT 1 FROM pg_catalog.pg_ts_dict c JOIN pg_catalog.pg_namespace n ON n.oid=c.dictnamespace WHERE n.nspname='public'`);
  if(customObjects.rowCount)fail();
  for(const sequence of sequences){
    const dependency=await client.query(`SELECT 1 FROM pg_catalog.pg_depend d JOIN pg_catalog.pg_class t ON t.oid=d.refobjid JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
      JOIN pg_catalog.pg_attribute a ON a.attrelid=t.oid AND a.attnum=d.refobjsubid
      WHERE d.classid='pg_catalog.pg_class'::pg_catalog.regclass AND d.objid=$1 AND d.refclassid='pg_catalog.pg_class'::pg_catalog.regclass
        AND d.deptype='i' AND n.nspname='public' AND t.relname='admin_events' AND a.attname='id' AND a.attidentity='a'`,[sequence.oid]);
    if(dependency.rowCount!==1)fail();
  }
  return {tables,sequences};
}

async function validateExistingRoles(client:Client){
  const roles=await client.query(`SELECT oid,rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls FROM pg_catalog.pg_roles WHERE rolname=ANY($1::text[])`,[[RUNTIME_ROLE,MIGRATOR_ROLE]]);
  for(const role of roles.rows){
    if(role.rolsuper||role.rolinherit||role.rolcreaterole||role.rolcreatedb||!role.rolcanlogin||role.rolreplication||role.rolbypassrls)fail();
    const memberships=await client.query('SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=$1 OR roleid=$1',[role.oid]);
    if(memberships.rowCount)fail();
    const ownedDatabases=await client.query('SELECT 1 FROM pg_catalog.pg_database WHERE datdba=$1',[role.oid]);
    if(ownedDatabases.rowCount)fail();
    if(role.rolname===RUNTIME_ROLE){
      const owned=await client.query("SELECT 1 FROM pg_catalog.pg_shdepend WHERE refclassid='pg_catalog.pg_authid'::pg_catalog.regclass AND refobjid=$1 AND deptype='o'",[role.oid]);
      if(owned.rowCount)fail();
    }
  }
}

async function validateProvisioningAcls(client:Client,bootstrap:string){
  const principals=(await client.query('SELECT oid FROM pg_catalog.pg_roles WHERE rolname=ANY($1::text[])',[[bootstrap,MIGRATOR_ROLE,RUNTIME_ROLE,'pg_database_owner']])).rows.map(row=>row.oid as number);
  const allowed=[0,...principals];
  const schema=(await client.query("SELECT n.oid,pg_catalog.pg_get_userbyid(n.nspowner) AS owner FROM pg_catalog.pg_namespace n WHERE n.nspname='public'")).rows[0];
  if(!schema||![bootstrap,'pg_database_owner'].includes(schema.owner))fail();
  const acl=await client.query(`SELECT a.grantee FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL pg_catalog.aclexplode(c.relacl) a WHERE n.nspname='public' AND NOT(a.grantee=ANY($1::oid[]))
    UNION ALL SELECT a.grantee FROM pg_catalog.pg_attribute c JOIN pg_catalog.pg_class t ON t.oid=c.attrelid JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace CROSS JOIN LATERAL pg_catalog.aclexplode(c.attacl) a WHERE n.nspname='public' AND NOT(a.grantee=ANY($1::oid[]))
    UNION ALL SELECT a.grantee FROM pg_catalog.pg_namespace n CROSS JOIN LATERAL pg_catalog.aclexplode(n.nspacl) a WHERE n.nspname='public' AND NOT(a.grantee=ANY($1::oid[]))
    UNION ALL SELECT a.grantee FROM pg_catalog.pg_database d CROSS JOIN LATERAL pg_catalog.aclexplode(d.datacl) a WHERE d.datname=pg_catalog.current_database() AND NOT(a.grantee=ANY($1::oid[]))`,[allowed]);
  if(acl.rowCount)fail();
  const defaults=await client.query(`SELECT 1 FROM pg_catalog.pg_default_acl d CROSS JOIN LATERAL pg_catalog.aclexplode(d.defaclacl) a
    WHERE NOT(d.defaclrole=ANY($1::oid[])) OR NOT(d.defaclnamespace IN(0,$2)) OR NOT(a.grantee=ANY($3::oid[]))`,[principals,schema.oid,allowed]);
  if(defaults.rowCount)fail();
  const parameters=await client.query(`SELECT 1 FROM pg_catalog.pg_parameter_acl p CROSS JOIN LATERAL pg_catalog.aclexplode(p.paracl) a WHERE a.grantee=ANY($1::oid[])`,[[0,...(await client.query('SELECT oid FROM pg_catalog.pg_roles WHERE rolname=ANY($1::text[])',[[MIGRATOR_ROLE,RUNTIME_ROLE]])).rows.map(row=>row.oid)]]);
  if(parameters.rowCount)fail();
}

/** Bootstrap-only setup. No application data, account roles or existing bootstrap password is changed. */
export async function provisionDatabaseRoles(pool:pg.Pool,input:{runtimePassword:string;migratorPassword:string}){
  const passwords=validateRolePasswords(input);
  const connection=pool.options.connectionString;
  const bootstrapPassword=connection?decodeURIComponent(new URL(connection).password):typeof pool.options.password==='string'?pool.options.password:undefined;
  if(bootstrapPassword&&(passwords.runtimePassword===bootstrapPassword||passwords.migratorPassword===bootstrapPassword))throw new Error('Database maintenance and runtime credentials must be different.');
  const runtimeVerifier=await scramVerifier(passwords.runtimePassword),migratorVerifier=await scramVerifier(passwords.migratorPassword),client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query("SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('openscroll:database-provision'))");
    const session=(await client.query('SELECT session_user AS login,current_user AS role,pg_catalog.current_database() AS database,(SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname=current_user) AS superuser')).rows[0];
    if(!session||session.login!==session.role||!session.superuser||[RUNTIME_ROLE,MIGRATOR_ROLE].includes(session.role))fail();
    const inventory=await reviewedInventory(client,[session.role,MIGRATOR_ROLE]);
    await validateExistingRoles(client);
    await validateProvisioningAcls(client,session.role);
    for(const [role,verifier,password] of [[RUNTIME_ROLE,runtimeVerifier,passwords.runtimePassword],[MIGRATOR_ROLE,migratorVerifier,passwords.migratorPassword]] as const){
      const existing=await client.query('SELECT rolpassword FROM pg_catalog.pg_authid WHERE rolname=$1',[role]);
      if(!existing.rowCount)await client.query(`CREATE ROLE ${identifier(role)} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
      if(!existing.rowCount||!await matchesScramVerifier(password,existing.rows[0].rolpassword))await client.query(`ALTER ROLE ${identifier(role)} PASSWORD ${literal(verifier)}`);
      await client.query(`ALTER ROLE ${identifier(role)} IN DATABASE ${identifier(session.database)} SET search_path=public`);
    }
    await client.query(`REVOKE ALL ON DATABASE ${identifier(session.database)} FROM PUBLIC,${identifier(RUNTIME_ROLE)},${identifier(MIGRATOR_ROLE)}`);
    await client.query(`GRANT CONNECT ON DATABASE ${identifier(session.database)} TO ${identifier(RUNTIME_ROLE)},${identifier(MIGRATOR_ROLE)}`);
    await client.query(`REVOKE ALL ON SCHEMA public FROM PUBLIC,${identifier(RUNTIME_ROLE)},${identifier(MIGRATOR_ROLE)}`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${identifier(RUNTIME_ROLE)}`);
    await client.query(`GRANT USAGE,CREATE ON SCHEMA public TO ${identifier(MIGRATOR_ROLE)}`);
    for(const routine of FORBIDDEN_RUNTIME_ROUTINES)await client.query(`REVOKE ALL ON FUNCTION ${routine} FROM PUBLIC,${identifier(RUNTIME_ROLE)},${identifier(MIGRATOR_ROLE)}`);
    const privilegedFunctions=await client.query("SELECT pg_catalog.format('%I.%I(%s)',n.nspname,p.proname,pg_catalog.oidvectortypes(p.proargtypes)) AS signature FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='pg_catalog' AND p.proname=ANY($1::text[])",[FORBIDDEN_RUNTIME_FUNCTION_NAMES]);
    for(const routine of privilegedFunctions.rows)await client.query(`REVOKE ALL ON FUNCTION ${routine.signature} FROM PUBLIC,${identifier(RUNTIME_ROLE)},${identifier(MIGRATOR_ROLE)}`);
    for(const table of inventory.tables)await client.query(`ALTER TABLE public.${identifier(table.relname)} OWNER TO ${identifier(MIGRATOR_ROLE)}`);
    // ALTER TABLE also changes its owned identity sequence; independently verify that fact.
    const sequenceOwners=await client.query("SELECT c.relname,pg_catalog.pg_get_userbyid(c.relowner) AS owner FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='S'");
    if(sequenceOwners.rows.some(row=>row.owner!==MIGRATOR_ROLE))fail();
    // Defaults are global: schema-local revokes cannot undo PostgreSQL's PUBLIC function default.
    for(const object of ['TABLES','SEQUENCES','FUNCTIONS','TYPES'])for(const scope of ['', ' IN SCHEMA public'])await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${identifier(MIGRATOR_ROLE)}${scope} REVOKE ALL ON ${object} FROM PUBLIC,${identifier(RUNTIME_ROLE)}`);
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}

/** Call inside the same public-schema migration transaction, never as the runtime. */
export async function refreshRuntimeGrants(client:Client){
  const current=(await client.query('SELECT current_user AS role,session_user AS login')).rows[0];
  if(current?.role!==MIGRATOR_ROLE||current.login!==MIGRATOR_ROLE)throw new Error('Runtime grants must be refreshed by the dedicated migrator role.');
  const inventory=await reviewedInventory(client,[MIGRATOR_ROLE]);
  const databaseOwner=(await client.query('SELECT pg_catalog.pg_get_userbyid(datdba) AS owner FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database()')).rows[0]?.owner;
  if(!databaseOwner)fail();
  await validateProvisioningAcls(client,databaseOwner);
  if(inventory.tables.length!==APPLICATION_TABLES.length||inventory.sequences.length!==APPLICATION_SEQUENCES.length)throw new Error('The reviewed application schema is incomplete.');
  for(const table of inventory.tables){
    const object=`public.${identifier(table.relname)}`;
    // Table revocation does not remove separately granted column privileges.
    const columns=await client.query('SELECT attname FROM pg_catalog.pg_attribute WHERE attrelid=$1 AND attnum>0 AND NOT attisdropped',[table.oid]);
    await client.query(`REVOKE ALL ON TABLE ${object} FROM PUBLIC,${identifier(RUNTIME_ROLE)}`);
    for(const privilege of ['SELECT','INSERT','UPDATE','REFERENCES'])await client.query(`REVOKE ${privilege} (${columns.rows.map(row=>identifier(row.attname)).join(',')}) ON TABLE ${object} FROM PUBLIC,${identifier(RUNTIME_ROLE)}`);
    const grants=RUNTIME_TABLE_GRANTS[table.relname]!;
    if(grants.length)await client.query(`GRANT ${grants.join(',')} ON TABLE ${object} TO ${identifier(RUNTIME_ROLE)}`);
    for(const [privilege,names] of Object.entries(RUNTIME_COLUMN_GRANTS[table.relname]??{}))await client.query(`GRANT ${privilege} (${names.map(identifier).join(',')}) ON TABLE ${object} TO ${identifier(RUNTIME_ROLE)}`);
  }
  for(const sequence of inventory.sequences){
    const object=`public.${identifier(sequence.relname)}`,grants=RUNTIME_SEQUENCE_GRANTS[sequence.relname]!;
    await client.query(`REVOKE ALL ON SEQUENCE ${object} FROM PUBLIC,${identifier(RUNTIME_ROLE)}`);
    if(grants.length)await client.query(`GRANT ${grants.join(',')} ON SEQUENCE ${object} TO ${identifier(RUNTIME_ROLE)}`);
  }
}
