import pg from 'pg';
import { readDatabaseUrl } from './config.js';
import { provisionDatabaseRoles,validateRolePasswords } from './database-roles.js';

// Default interactive/operator mode accepts only a protected stdin JSON document.
// Compose must explicitly opt into its private one-shot service's environment mode.
let pool:pg.Pool|undefined;
try{
  const args=process.argv.slice(2);
  let input:unknown;
  if(args.length===1&&args[0]==='--from-env')input={runtimePassword:process.env.RUNTIME_DB_PASSWORD,migratorPassword:process.env.MIGRATOR_DB_PASSWORD};
  else if(args.length===0){
    const chunks:Buffer[]=[];let bytes=0;
    for await(const chunk of process.stdin){bytes+=chunk.length;if(bytes>4096)throw new Error('Provisioning input exceeds its size limit.');chunks.push(chunk);}
    input=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks)));
  }else throw new Error('Use protected standard input or the explicit --from-env service mode.');
  const passwords=validateRolePasswords(input);
  pool=new pg.Pool({connectionString:readDatabaseUrl('PROVISION_DATABASE_URL'),max:1,connectionTimeoutMillis:5000});
  await provisionDatabaseRoles(pool,passwords);
  console.log('OpenScroll database roles are provisioned. Run migrations with the dedicated migrator before starting the app.');
}catch{
  console.error('Database role provisioning failed. Check protected inputs, bootstrap access, and the dedicated database inventory. Existing data and accounts are preserved.');
  process.exitCode=1;
}finally{await pool?.end();}
