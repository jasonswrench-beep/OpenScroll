import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { assertRuntimeEnvironment,readConfig } from './config.js';
import { accountConfig } from './accounts/config.js';
import { createMailer } from './accounts/mail.js';
import { checkMigrations } from './migrations.js';
import { buildApp } from './app.js';
import { assertRuntimeDatabaseRole } from './database-access.js';
import type { FastifyInstance } from 'fastify';
assertRuntimeEnvironment();
const config = readConfig();
const pool = new pg.Pool({ connectionString: config.databaseUrl, connectionTimeoutMillis: 3000, query_timeout: 3000, max: 10 });
pool.on('error', () => console.error('An idle database connection failed.'));
const staticRoot = process.env.NODE_ENV === 'development' ? undefined : fileURLToPath(new URL('../../../client/', import.meta.url));
const accounts = accountConfig();
let app:FastifyInstance|undefined;
try {
  // Validate before buildApp's account cleanup hooks or any network listener runs.
  // Development uses the same database boundary; there is no unsafe-role bypass.
  await assertRuntimeDatabaseRole(pool);
  await checkMigrations(pool);
  app = await buildApp(pool, staticRoot, {pool,config:accounts,mailer:createMailer(accounts)});
  app.addHook('onClose', async () => { await pool.end(); });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app?.close(); });
  await app.listen({ host: config.host, port: config.port });
  console.log(`OpenScroll service listening on port ${config.port}`);
} catch {
  console.error('OpenScroll could not start. Check the restricted runtime database role, completed migrations, and host and port.');
  if(app)await app.close();else await pool.end();
  process.exitCode = 1;
}
