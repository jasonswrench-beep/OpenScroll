import pg from 'pg';
import { readDatabaseUrl } from './config.js';
import { migrate } from './migrations.js';
import { assertMigratorDatabaseRole } from './database-access.js';
import { refreshRuntimeGrants } from './database-roles.js';
const pool=new pg.Pool({connectionString:readDatabaseUrl('ADMIN_DATABASE_URL'),connectionTimeoutMillis:3000});
try { await assertMigratorDatabaseRole(pool);await migrate(pool,refreshRuntimeGrants); console.log('OpenScroll database migrations and runtime grants are current.'); }
catch { console.error('Migration failed. Check database connectivity and schema compatibility.'); process.exitCode=1; }
finally { await pool.end(); }
