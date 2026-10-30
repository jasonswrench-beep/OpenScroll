import pg from 'pg';
import { administer } from './admin-operations.js';
import { readDatabaseUrl } from './config.js';
import { checkMigrations } from './migrations.js';
import { assertMigratorDatabaseRole } from './database-access.js';
const [command,...args]=process.argv.slice(2),pool=new pg.Pool({connectionString:readDatabaseUrl('ADMIN_DATABASE_URL'),max:1,connectionTimeoutMillis:5000});
try{await assertMigratorDatabaseRole(pool);await checkMigrations(pool);let password:string|undefined;if(command==='create-author'){const chunks:Buffer[]=[];let size=0;for await(const part of process.stdin){size+=part.length;if(size>1024)throw new Error('Password input is too long.');chunks.push(part);}password=Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/,'');}console.log(JSON.stringify(await administer(pool,command??'',args,password),null,2));}catch(error){console.error(error instanceof Error&& !('code' in error)?error.message:'Administrator operation failed; check inputs, migrations and database access.');process.exitCode=1;}finally{await pool.end();}
