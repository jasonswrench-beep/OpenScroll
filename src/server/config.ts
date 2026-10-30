export function readDatabaseUrl(key:'DATABASE_URL'|'ADMIN_DATABASE_URL'|'PROVISION_DATABASE_URL',env:NodeJS.ProcessEnv=process.env){
  const databaseUrl=env[key];
  if(!databaseUrl)throw new Error(`${key} is required. See .env.example.`);
  let url: URL;
  try { url=new URL(databaseUrl); }catch{throw new Error(`${key} must be a PostgreSQL URL.`);}
  if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname||!url.username||!url.password||url.pathname.length<2||url.hash)throw new Error(`${key} must be a PostgreSQL URL with explicit database credentials.`);
  return databaseUrl;
}
export function assertRuntimeEnvironment(env:NodeJS.ProcessEnv=process.env){
  const privileged=['ADMIN_DATABASE_URL','PROVISION_DATABASE_URL','POSTGRES_PASSWORD','MIGRATOR_DB_PASSWORD','RUNTIME_DB_PASSWORD','PGPASSWORD','PGPASSFILE','PGSERVICE','PGSERVICEFILE','PGUSER'];
  if(privileged.some(key=>Boolean(env[key])))throw new Error('The application process must receive only its runtime database URL, never maintenance database credentials.');
}
export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const databaseUrl=readDatabaseUrl('DATABASE_URL',env);
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
  return { databaseUrl, port, host: env.HOST ?? '127.0.0.1' };
}

export function trustedProxyHops(env:NodeJS.ProcessEnv=process.env){if(env.TRUST_PROXY===undefined||env.TRUST_PROXY==='false')return false;if(env.TRUST_PROXY==='1')return 1;throw new Error('TRUST_PROXY must be false or 1 (one trusted reverse proxy).');}
