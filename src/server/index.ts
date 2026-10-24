import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { readConfig } from './config.js';
import { accountConfig } from './accounts/config.js';
import { createMailer } from './accounts/mail.js';
import { checkMigrations } from './migrations.js';
import { buildApp } from './app.js';
const config = readConfig();
const pool = new pg.Pool({ connectionString: config.databaseUrl, connectionTimeoutMillis: 3000, query_timeout: 3000, max: 10 });
pool.on('error', () => console.error('An idle database connection failed.'));
const staticRoot = process.env.NODE_ENV === 'development' ? undefined : fileURLToPath(new URL('../../../client/', import.meta.url));
const accounts = accountConfig();
const app = await buildApp(pool, staticRoot, {pool,config:accounts,mailer:createMailer(accounts)});
app.addHook('onClose', async () => { await pool.end(); });
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close(); });
try {
  await pool.query('SELECT 1');
  await checkMigrations(pool);
  await app.listen({ host: config.host, port: config.port });
  console.log(`OpenScroll service listening on port ${config.port}`);
} catch {
  console.error('OpenScroll could not start. Check database connectivity, run npm run db:migrate, and check host and port.');
  await app.close();
  process.exitCode = 1;
}
