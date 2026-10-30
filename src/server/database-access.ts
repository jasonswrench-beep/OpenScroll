import type pg from 'pg';
import {
  RUNTIME_ROLE, MIGRATOR_ROLE, RUNTIME_TABLE_GRANTS, RUNTIME_COLUMN_GRANTS,
  RUNTIME_SEQUENCE_GRANTS, APPLICATION_COLUMNS, APPLICATION_INDEXES, FORBIDDEN_RUNTIME_ROUTINES, FORBIDDEN_RUNTIME_FUNCTION_NAMES,
} from './database-policy.js';

const tablePrivileges=['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'];
const columnPrivileges=['SELECT','INSERT','UPDATE','REFERENCES'];
const sequencePrivileges=['SELECT','UPDATE','USAGE'];
function requirePolicy(condition:unknown,reason:string):asserts condition {
  if(!condition)throw new Error(`Database role policy rejected: ${reason}.`);
}
interface Relation {
  oid:number; relname:string; relkind:string; relowner:number; relpersistence:string;
  relrowsecurity:boolean; relforcerowsecurity:boolean; relispartition:boolean;
  indrelid:number|null; indisvalid:boolean|null; indisready:boolean|null;
  expression_index:boolean; partial_index:boolean;
}

/** These checks use effective privileges, including PUBLIC and column grants. */
async function assertIdentityAndConnection(client:pg.PoolClient,expectedRole:string,migrator:boolean){
  const identity=(await client.query(`
    SELECT SESSION_USER::pg_catalog.text AS session_name,CURRENT_USER::pg_catalog.text AS current_name,
      r.oid,r.rolcanlogin,r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolreplication,r.rolbypassrls,r.rolinherit
    FROM pg_catalog.pg_roles r WHERE r.rolname=CURRENT_USER`)).rows[0];
  requirePolicy(identity&&identity.session_name===expectedRole&&identity.current_name===expectedRole,'login identity');
  requirePolicy(identity.rolcanlogin&&!identity.rolsuper&&!identity.rolcreatedb&&!identity.rolcreaterole&&
    !identity.rolreplication&&!identity.rolbypassrls&&!identity.rolinherit,'role attributes');
  const roleId=identity.oid as number;
  const memberships=(await client.query(`SELECT EXISTS(
    SELECT 1 FROM pg_catalog.pg_auth_members WHERE member=$1::pg_catalog.oid OR roleid=$1::pg_catalog.oid
  ) AS present`,[roleId])).rows[0];
  requirePolicy(memberships?.present===false,'role memberships');
  const databaseOwnership=(await client.query(`SELECT EXISTS(
    SELECT 1 FROM pg_catalog.pg_database WHERE datdba=$1::pg_catalog.oid
  ) AS present`,[roleId])).rows[0];
  requirePolicy(databaseOwnership?.present===false,'database ownership');
  const connection=(await client.query(`
    SELECT pg_catalog.has_database_privilege($1::pg_catalog.oid,d.oid,'CONNECT') AS connect,
      pg_catalog.has_database_privilege($1::pg_catalog.oid,d.oid,'CREATE') AS create_database_objects,
      pg_catalog.has_database_privilege($1::pg_catalog.oid,d.oid,'TEMPORARY') AS temporary,
      pg_catalog.has_database_privilege($1::pg_catalog.oid,d.oid,'CONNECT WITH GRANT OPTION') AS connect_grant,
      pg_catalog.has_database_privilege($1::pg_catalog.oid,d.oid,'CREATE WITH GRANT OPTION') AS create_grant,
      pg_catalog.has_database_privilege($1::pg_catalog.oid,d.oid,'TEMPORARY WITH GRANT OPTION') AS temporary_grant,
      pg_catalog.current_schemas(false)::pg_catalog.text[] AS search_schemas
    FROM pg_catalog.pg_database d WHERE d.datname=pg_catalog.current_database()`,[roleId])).rows[0];
  requirePolicy(connection?.connect===true&&!connection.create_database_objects&&!connection.temporary&&
    !connection.connect_grant&&!connection.create_grant&&!connection.temporary_grant,'database privileges');
  requirePolicy(Array.isArray(connection.search_schemas)&&connection.search_schemas.length===1&&
    connection.search_schemas[0]==='public','schema search path');
  const schemas=(await client.query(`
    SELECT n.nspname::pg_catalog.text AS name,
      n.nspowner IN ((SELECT datdba FROM pg_catalog.pg_database WHERE datname=pg_catalog.current_database()),
        pg_catalog.to_regrole('pg_database_owner')::pg_catalog.oid) AS expected_owner,
      pg_catalog.has_schema_privilege($1::pg_catalog.oid,n.oid,'USAGE') AS usage,
      pg_catalog.has_schema_privilege($1::pg_catalog.oid,n.oid,'CREATE') AS create_objects,
      pg_catalog.has_schema_privilege($1::pg_catalog.oid,n.oid,'USAGE WITH GRANT OPTION') AS usage_grant,
      pg_catalog.has_schema_privilege($1::pg_catalog.oid,n.oid,'CREATE WITH GRANT OPTION') AS create_grant
    FROM pg_catalog.pg_namespace n`,[roleId])).rows;
  if(!migrator)requirePolicy(schemas.every(row=>['public','pg_catalog','information_schema','pg_toast'].includes(row.name)||
    /^pg_(?:toast_)?temp_[0-9]+$/.test(row.name)),'unexpected database schema');
  requirePolicy(schemas.some(row=>row.name==='public'&&row.expected_owner===true&&row.usage===true&&
    row.create_objects===migrator),'application schema access');
  requirePolicy(schemas.every(row=>!row.usage_grant&&!row.create_grant&&
    (row.name==='public'&&migrator?row.create_objects===true:!row.create_objects)),'schema privileges');
  const parameters=(await client.query(`SELECT EXISTS(
    SELECT 1 FROM pg_catalog.pg_parameter_acl p
    CROSS JOIN LATERAL pg_catalog.aclexplode(p.paracl) a
    WHERE a.grantee=0 OR a.grantee=$1::pg_catalog.oid
  ) AS present`,[roleId])).rows[0];
  requirePolicy(parameters?.present===false,'server parameter privileges');
  for(const signature of FORBIDDEN_RUNTIME_ROUTINES){
    const routine=(await client.query(`SELECT p.oid,
      pg_catalog.has_function_privilege($1::pg_catalog.oid,p.oid,'EXECUTE') AS execute,
      pg_catalog.has_function_privilege($1::pg_catalog.oid,p.oid,'EXECUTE WITH GRANT OPTION') AS grant_option
      FROM pg_catalog.pg_proc p WHERE p.oid=pg_catalog.to_regprocedure($2)`,[roleId,signature])).rows[0];
    requirePolicy(routine&&routine.execute===false&&routine.grant_option===false,'server object and file routines');
  }
  const privilegedRoutines=(await client.query(`SELECT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='pg_catalog' AND p.proname=ANY($2::pg_catalog.text[]) AND
      (pg_catalog.has_function_privilege($1::pg_catalog.oid,p.oid,'EXECUTE') OR
       pg_catalog.has_function_privilege($1::pg_catalog.oid,p.oid,'EXECUTE WITH GRANT OPTION'))
  ) AS present`,[roleId,FORBIDDEN_RUNTIME_FUNCTION_NAMES])).rows[0];
  requirePolicy(privilegedRoutines?.present===false,'server file and administrative routines');
  // Catch unexpected grants on any initdb-restricted builtin, beyond the named set.
  const initialPrivileges=(await client.query(`SELECT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    JOIN pg_catalog.pg_init_privs i ON i.classoid='pg_catalog.pg_proc'::pg_catalog.regclass
      AND i.objoid=p.oid AND i.objsubid=0 AND i.privtype='i'
    WHERE n.nspname='pg_catalog' AND NOT EXISTS(
      SELECT 1 FROM pg_catalog.aclexplode(i.initprivs) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE'
    ) AND (pg_catalog.has_function_privilege($1::pg_catalog.oid,p.oid,'EXECUTE') OR
      pg_catalog.has_function_privilege($1::pg_catalog.oid,p.oid,'EXECUTE WITH GRANT OPTION'))
  ) AS present`,[roleId])).rows[0];
  requirePolicy(initialPrivileges?.present===false,'restricted builtin privileges');
  return roleId;
}

async function assertRuntimeInventory(client:pg.PoolClient,roleId:number){
  // Shared dependencies include ownership in other databases and large objects.
  const ownership=(await client.query(`SELECT EXISTS(
    SELECT 1 FROM pg_catalog.pg_shdepend
    WHERE refclassid='pg_catalog.pg_authid'::pg_catalog.regclass
      AND refobjid=$1::pg_catalog.oid AND deptype='o'
  ) AS present`,[roleId])).rows[0];
  requirePolicy(ownership?.present===false,'runtime object ownership');
  const extras=(await client.query(`SELECT
    EXISTS(SELECT 1 FROM pg_catalog.pg_extension WHERE extname<>'plpgsql') AS extensions,
    EXISTS(SELECT 1 FROM pg_catalog.pg_foreign_server) AS foreign_servers,
    EXISTS(SELECT 1 FROM pg_catalog.pg_event_trigger) AS event_triggers,
    EXISTS(SELECT 1 FROM pg_catalog.pg_largeobject_metadata) AS large_objects,
    EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' OR ((p.prosecdef OR n.nspname NOT IN ('pg_catalog','information_schema') OR
        (p.oid>=16384 AND NOT EXISTS(SELECT 1 FROM pg_catalog.pg_depend d JOIN pg_catalog.pg_extension e ON e.oid=d.refobjid
          WHERE d.classid='pg_catalog.pg_proc'::pg_catalog.regclass AND d.objid=p.oid AND d.deptype='e' AND e.extname='plpgsql'))) AND
        (pg_catalog.has_function_privilege($1::pg_catalog.oid,p.oid,'EXECUTE') OR
         pg_catalog.has_function_privilege($1::pg_catalog.oid,p.oid,'EXECUTE WITH GRANT OPTION')))) AS routines`,[roleId])).rows[0];
  requirePolicy(extras&&!extras.extensions&&!extras.foreign_servers&&!extras.event_triggers&&
    !extras.large_objects&&!extras.routines,'unexpected database objects');
  const owner=(await client.query('SELECT oid FROM pg_catalog.pg_roles WHERE rolname=$1',[MIGRATOR_ROLE])).rows[0];
  requirePolicy(owner,'migration object owner');
  const tables=Object.keys(RUNTIME_TABLE_GRANTS),sequences=Object.keys(RUNTIME_SEQUENCE_GRANTS);
  const relations=(await client.query<Relation>(`
    SELECT c.oid,c.relname,c.relkind,c.relowner,c.relpersistence,c.relrowsecurity,c.relforcerowsecurity,c.relispartition,
      i.indrelid,i.indisvalid,i.indisready,i.indexprs IS NOT NULL AS expression_index,i.indpred IS NOT NULL AS partial_index
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_catalog.pg_index i ON i.indexrelid=c.oid WHERE n.nspname='public'`)).rows;
  const tableRows=relations.filter(row=>row.relkind==='r'&&tables.includes(row.relname));
  requirePolicy(tableRows.length===tables.length,'application table inventory');
  requirePolicy(relations.filter(row=>row.relkind==='S'&&sequences.includes(row.relname)).length===sequences.length,'application sequence inventory');
  requirePolicy(relations.filter(row=>row.relkind==='i'&&APPLICATION_INDEXES.includes(row.relname)).length===APPLICATION_INDEXES.length,'application index inventory');
  for(const row of relations){
    requirePolicy(row.relowner===owner.oid&&row.relpersistence==='p'&&!row.relrowsecurity&&
      !row.relforcerowsecurity&&!row.relispartition,'application object ownership and type');
    if(row.relkind==='r')requirePolicy(tables.includes(row.relname),'unexpected application table');
    else if(row.relkind==='S')requirePolicy(sequences.includes(row.relname),'unexpected application sequence');
    else if(row.relkind==='i')requirePolicy(APPLICATION_INDEXES.includes(row.relname)&&row.indisvalid&&row.indisready&&
      !row.expression_index&&!row.partial_index&&tableRows.some(table=>table.oid===row.indrelid),'application index definition');
    else requirePolicy(false,'unexpected application relation');
  }
  const tableIds=tableRows.map(row=>row.oid);
  const columnInventory=(await client.query(`SELECT c.relname,a.attname
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
    WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped`)).rows;
  for(const table of tables){
    const expected=APPLICATION_COLUMNS[table];
    const actual=columnInventory.filter(row=>row.relname===table).map(row=>row.attname as string);
    requirePolicy(expected&&actual.length===expected.length&&actual.every(column=>expected.includes(column)),
      'application column inventory');
  }
  const dependentObjects=(await client.query(`SELECT
    EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid=ANY($1::pg_catalog.oid[]) AND NOT tgisinternal) AS triggers,
    EXISTS(SELECT 1 FROM pg_catalog.pg_rewrite WHERE ev_class=ANY($1::pg_catalog.oid[])) AS rules,
    EXISTS(SELECT 1 FROM pg_catalog.pg_inherits WHERE inhrelid=ANY($1::pg_catalog.oid[]) OR inhparent=ANY($1::pg_catalog.oid[])) AS inheritance,
    EXISTS(SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid=ANY($1::pg_catalog.oid[]) AND
      (NOT convalidated OR (confrelid<>0 AND NOT(confrelid=ANY($1::pg_catalog.oid[]))))) AS constraints,
    EXISTS(SELECT 1 FROM pg_catalog.pg_depend WHERE classid='pg_catalog.pg_class'::pg_catalog.regclass
      AND objid=ANY($1::pg_catalog.oid[]) AND deptype='e') AS extension_members`,[tableIds])).rows[0];
  requirePolicy(dependentObjects&&!dependentObjects.triggers&&!dependentObjects.rules&&!dependentObjects.inheritance&&
    !dependentObjects.constraints&&!dependentObjects.extension_members,'application object dependencies');
  const types=(await client.query(`SELECT EXISTS(
    SELECT 1 FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND NOT (
      (t.typtype='c' AND t.typrelid=ANY($1::pg_catalog.oid[])) OR
      EXISTS(SELECT 1 FROM pg_catalog.pg_class c WHERE c.oid=ANY($1::pg_catalog.oid[]) AND c.reltype=t.typelem AND
        EXISTS(SELECT 1 FROM pg_catalog.pg_type base WHERE base.oid=c.reltype AND base.typarray=t.oid))
    )
  ) AS present`,[tableIds])).rows[0];
  requirePolicy(types?.present===false,'application type inventory');
  const namedObjects=(await client.query(`SELECT
    EXISTS(SELECT 1 FROM pg_catalog.pg_operator x JOIN pg_catalog.pg_namespace n ON n.oid=x.oprnamespace WHERE n.nspname='public') OR
    EXISTS(SELECT 1 FROM pg_catalog.pg_opclass x JOIN pg_catalog.pg_namespace n ON n.oid=x.opcnamespace WHERE n.nspname='public') OR
    EXISTS(SELECT 1 FROM pg_catalog.pg_opfamily x JOIN pg_catalog.pg_namespace n ON n.oid=x.opfnamespace WHERE n.nspname='public') OR
    EXISTS(SELECT 1 FROM pg_catalog.pg_conversion x JOIN pg_catalog.pg_namespace n ON n.oid=x.connamespace WHERE n.nspname='public') OR
    EXISTS(SELECT 1 FROM pg_catalog.pg_collation x JOIN pg_catalog.pg_namespace n ON n.oid=x.collnamespace WHERE n.nspname='public') OR
    EXISTS(SELECT 1 FROM pg_catalog.pg_statistic_ext x JOIN pg_catalog.pg_namespace n ON n.oid=x.stxnamespace WHERE n.nspname='public')
    AS present`)).rows[0];
  requirePolicy(namedObjects?.present===false,'unexpected application schema objects');
  for(const sequence of sequences){
    const identity=(await client.query(`SELECT c.oid FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_catalog.pg_depend d ON d.classid='pg_catalog.pg_class'::pg_catalog.regclass AND d.objid=c.oid AND d.deptype='i'
      JOIN pg_catalog.pg_attribute a ON a.attrelid=d.refobjid AND a.attnum=d.refobjsubid
      JOIN pg_catalog.pg_class t ON t.oid=a.attrelid JOIN pg_catalog.pg_namespace tn ON tn.oid=t.relnamespace
      WHERE n.nspname='public' AND c.relname=$1 AND tn.nspname='public' AND t.relname='admin_events' AND a.attname='id' AND a.attidentity='a'`,[sequence])).rows;
    requirePolicy(identity.length===1,'audit identity sequence ownership');
  }
  await assertRuntimePrivileges(client,roleId);
}

async function assertRuntimePrivileges(client:pg.PoolClient,roleId:number){
  const effective=(await client.query(`SELECT c.relname,p.privilege,
    pg_catalog.has_table_privilege($1::pg_catalog.oid,c.oid,p.privilege) AS allowed,
    pg_catalog.has_table_privilege($1::pg_catalog.oid,c.oid,p.privilege||' WITH GRANT OPTION') AS grant_option
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN pg_catalog.unnest($2::pg_catalog.text[]) p(privilege)
    WHERE n.nspname='public' AND c.relkind='r'`,[roleId,tablePrivileges])).rows;
  for(const row of effective)requirePolicy(row.allowed===RUNTIME_TABLE_GRANTS[row.relname]?.includes(row.privilege)&&
    row.grant_option===false,'effective table privileges');
  const columns=(await client.query(`SELECT c.relname,a.attname,p.privilege,
    pg_catalog.has_column_privilege($1::pg_catalog.oid,c.oid,a.attnum,p.privilege) AS allowed,
    pg_catalog.has_column_privilege($1::pg_catalog.oid,c.oid,a.attnum,p.privilege||' WITH GRANT OPTION') AS grant_option
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
    CROSS JOIN pg_catalog.unnest($2::pg_catalog.text[]) p(privilege)
    WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped`,[roleId,columnPrivileges])).rows;
  for(const row of columns){
    const expected=!!(RUNTIME_TABLE_GRANTS[row.relname]?.includes(row.privilege)||
      RUNTIME_COLUMN_GRANTS[row.relname]?.[row.privilege]?.includes(row.attname));
    requirePolicy(row.allowed===expected&&row.grant_option===false,'effective column privileges');
  }
  const sequences=(await client.query(`SELECT c.relname,p.privilege,
    pg_catalog.has_sequence_privilege($1::pg_catalog.oid,c.oid,p.privilege) AS allowed,
    pg_catalog.has_sequence_privilege($1::pg_catalog.oid,c.oid,p.privilege||' WITH GRANT OPTION') AS grant_option
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN pg_catalog.unnest($2::pg_catalog.text[]) p(privilege)
    WHERE n.nspname='public' AND c.relkind='S'`,[roleId,sequencePrivileges])).rows;
  for(const row of sequences)requirePolicy(row.allowed===RUNTIME_SEQUENCE_GRANTS[row.relname]?.includes(row.privilege)&&
    row.grant_option===false,'effective sequence privileges');
  const unknown=(await client.query(`SELECT EXISTS(
    SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema','public') AND n.nspname NOT LIKE 'pg_toast%'
      AND ((c.relkind IN ('r','p','v','m','f') AND (
        pg_catalog.has_table_privilege($1::pg_catalog.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') OR
        pg_catalog.has_any_column_privilege($1::pg_catalog.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))) OR
        (c.relkind='S' AND pg_catalog.has_sequence_privilege($1::pg_catalog.oid,c.oid,'SELECT,UPDATE,USAGE')))
  ) AS present`,[roleId])).rows[0];
  requirePolicy(unknown?.present===false,'unknown user object privileges');
}

async function assertDatabaseRole(pool:pg.Pool,migrator:boolean){
  let client:pg.PoolClient|undefined,transaction=false;
  try{
    client=await pool.connect();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');transaction=true;
    const roleId=await assertIdentityAndConnection(client,migrator?MIGRATOR_ROLE:RUNTIME_ROLE,migrator);
    if(!migrator)await assertRuntimeInventory(client,roleId);
    await client.query('COMMIT');transaction=false;
  }catch(error){
    if(client&&transaction)await client.query('ROLLBACK').catch(()=>{});
    if(error instanceof Error&&error.message.startsWith('Database role policy rejected:'))throw error;
    throw new Error('Database role policy validation failed. Check the dedicated database setup.');
  }finally{client?.release();}
}

/** No environment switch can relax startup's credential or effective-ACL checks. */
export async function assertRuntimeDatabaseRole(pool:pg.Pool){await assertDatabaseRole(pool,false);}
export async function assertMigratorDatabaseRole(pool:pg.Pool){await assertDatabaseRole(pool,true);}
