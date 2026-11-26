import { SIZE_DEFAULTS, sizeLimits, type SizeLimits } from '../shared/limits.js';
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

/** The new workspace at /studio/ is on by default in development and off in production until an operator turns it on. */
export function studioEnabled(env:NodeJS.ProcessEnv=process.env){const value=env.OPENSCROLL_STUDIO;if(value===undefined||value==='')return env.NODE_ENV!=='production';if(value==='on')return true;if(value==='off')return false;throw new Error('OPENSCROLL_STUDIO must be on or off.');}
export function trustedProxyHops(env:NodeJS.ProcessEnv=process.env){if(env.TRUST_PROXY===undefined||env.TRUST_PROXY==='false')return false;if(env.TRUST_PROXY==='1')return 1;throw new Error('TRUST_PROXY must be false or 1 (one trusted reverse proxy).');}

/**
 * Embedded YouTube and Vimeo video. On unless the operator turns it off (owner decision of 2026-11-26): a course may
 * embed video that loads from those services only after the learner presses play, with a transcript, and Checks lists
 * every such video. Turned off, exports stay fully self-contained.
 */
export function externalVideoEnabled(env:NodeJS.ProcessEnv=process.env){
  const value=env.OPENSCROLL_EXTERNAL_VIDEO;
  if(value===undefined || value==='' || value==='on')return true;
  if(value==='off')return false;
  throw new Error('OPENSCROLL_EXTERNAL_VIDEO must be on or off.');
}

/**
 * Size limits for this instance: OPENSCROLL_MAX_FILE_MIB for one file and OPENSCROLL_MAX_COURSE_MIB for a whole course,
 * each a whole number of MiB within SIZE_RANGES. Unset means the defaults.
 */
export function instanceSizeLimits(env:NodeJS.ProcessEnv=process.env):SizeLimits{
  const read=(key:'OPENSCROLL_MAX_FILE_MIB'|'OPENSCROLL_MAX_COURSE_MIB',fallback:number)=>{const value=env[key];if(value===undefined||value==='')return fallback;if(!/^\d+$/.test(value))throw new Error(`${key} must be a whole number of MiB.`);return Number(value);};
  const file=read('OPENSCROLL_MAX_FILE_MIB',SIZE_DEFAULTS.fileMiB),course=read('OPENSCROLL_MAX_COURSE_MIB',SIZE_DEFAULTS.courseMiB);
  try{return sizeLimits(file,course);}catch(error){throw new Error(`OPENSCROLL_MAX_FILE_MIB and OPENSCROLL_MAX_COURSE_MIB: ${(error as Error).message}`);}
}
