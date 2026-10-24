export function readConfig(env: NodeJS.ProcessEnv = process.env) {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required. See .env.example.');
  let url: URL;
  try { url = new URL(databaseUrl); } catch { throw new Error('DATABASE_URL must be a PostgreSQL URL.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('DATABASE_URL must be a PostgreSQL URL.');
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535.');
  return { databaseUrl, port, host: env.HOST ?? '127.0.0.1' };
}

export function trustedProxyHops(env:NodeJS.ProcessEnv=process.env){if(env.TRUST_PROXY===undefined||env.TRUST_PROXY==='false')return false;if(env.TRUST_PROXY==='1')return 1;throw new Error('TRUST_PROXY must be false or 1 (one trusted reverse proxy).');}
